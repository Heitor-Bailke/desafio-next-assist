import type Database from "better-sqlite3";
import { z } from "zod";
import {
  ticketDraftSchema,
  ticketPrioritySchema,
  ticketStatusSchema,
  type TicketDraft,
  type TicketPriority,
  type TicketStatus,
} from "../domain";
import { addBusinessHours, businessHoursForPriority, isOverdue } from "./business-hours";

const userIdSchema = z.string().trim().min(1);
const ticketNumberSchema = z.string().regex(/^(INC|REQ)-\d+$/);
const updateTicketSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  priority: ticketPrioritySchema.optional(),
  affectedPeople: z.number().int().min(1).optional(),
  status: ticketStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export type TicketRecord = {
  id: string;
  number: string;
  requesterId: string;
  title: string;
  description: string;
  type: "INC" | "REQ";
  category: "Acesso" | "Rede e VPN" | "Hardware" | "Software" | "E-mail" | "Outros";
  priority: TicketPriority;
  affectedPeople: number;
  status: TicketStatus;
  firstResponseDueAt: string;
  nextUpdateDueAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketingService = {
  listMyTickets(requesterId: string): TicketRecord[];
  getMyTicket(requesterId: string, ticketNumber: string): TicketRecord;
  findOpenDuplicate(requesterId: string, draft: TicketDraft): TicketRecord | null;
  createTicket(requesterId: string, draft: TicketDraft, now?: Date): TicketRecord;
  updateTicket(requesterId: string, ticketNumber: string, input: unknown, now?: Date): TicketRecord;
  reopenTicket(requesterId: string, ticketNumber: string, now?: Date): TicketRecord;
  isTicketOverdue(ticket: TicketRecord, now?: Date): boolean;
};

export class TicketingError extends Error {
  public constructor(public readonly code: "NOT_FOUND" | "INVALID" | "DUPLICATE" | "REOPEN_WINDOW") {
    super(code);
    this.name = "TicketingError";
  }
}

type TicketRow = {
  id: string;
  number: string;
  requester_id: string;
  title: string;
  description: string;
  type: "INC" | "REQ";
  category: TicketRecord["category"];
  priority: TicketPriority;
  affected_people: number;
  status: TicketStatus;
  first_response_due_at: string;
  next_update_due_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const normalize = (value: string): string => value.trim().toLocaleLowerCase("pt-BR");
const toRecord = (row: TicketRow): TicketRecord => ({
  id: row.id,
  number: row.number,
  requesterId: row.requester_id,
  title: row.title,
  description: row.description,
  type: row.type,
  category: row.category,
  priority: row.priority,
  affectedPeople: row.affected_people,
  status: row.status,
  firstResponseDueAt: row.first_response_due_at,
  nextUpdateDueAt: row.next_update_due_at,
  resolvedAt: row.resolved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const openStatuses: TicketStatus[] = ["Aberto", "Aguardando analista", "Em atendimento", "Aprovado"];

export class SqliteTicketingService implements TicketingService {
  public constructor(private readonly database: Database.Database) {}

  public listMyTickets(requesterId: string): TicketRecord[] {
    const requester = userIdSchema.parse(requesterId);
    const rows = this.database.prepare("SELECT * FROM tickets WHERE requester_id = ? ORDER BY created_at DESC").all(requester) as TicketRow[];
    return rows.map(toRecord);
  }

  public getMyTicket(requesterId: string, ticketNumber: string): TicketRecord {
    const requester = userIdSchema.parse(requesterId);
    const number = ticketNumberSchema.parse(ticketNumber);
    const row = this.database.prepare("SELECT * FROM tickets WHERE requester_id = ? AND number = ?").get(requester, number) as TicketRow | undefined;
    if (!row) {
      throw new TicketingError("NOT_FOUND");
    }
    return toRecord(row);
  }

  public findOpenDuplicate(requesterId: string, draft: TicketDraft): TicketRecord | null {
    const requester = userIdSchema.parse(requesterId);
    const parsedDraft = ticketDraftSchema.parse(draft);
    const rows = this.database.prepare(
      "SELECT * FROM tickets WHERE requester_id = ? AND status IN (?, ?, ?, ?)",
    ).all(requester, ...openStatuses) as TicketRow[];
    const duplicate = rows.find((row) => {
      const sameTitle = normalize(row.title) === normalize(parsedDraft.title);
      const sameType = row.type === parsedDraft.type;
      return sameTitle && sameType;
    });
    return duplicate ? toRecord(duplicate) : null;
  }

  public createTicket(requesterId: string, draft: TicketDraft, now = new Date()): TicketRecord {
    const requester = userIdSchema.parse(requesterId);
    const parsedDraft = ticketDraftSchema.parse(draft);
    const duplicate = this.findOpenDuplicate(requester, parsedDraft);
    if (duplicate) {
      throw new TicketingError("DUPLICATE");
    }

    const createdAt = now.toISOString();
    const dueAt = addBusinessHours(now, businessHoursForPriority(parsedDraft.priority)).toISOString();
    const number = this.nextNumber(parsedDraft.type);
    const id = `${parsedDraft.type.toLowerCase()}-${number.split("-")[1]}`;
    this.database.prepare(`
      INSERT INTO tickets (
        id, number, requester_id, title, description, type, category, priority,
        affected_people, status, first_response_due_at, next_update_due_at,
        resolved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      id, number, requester, parsedDraft.title, parsedDraft.description, parsedDraft.type,
      parsedDraft.category, parsedDraft.priority, parsedDraft.affectedPeople, "Aberto",
      dueAt, dueAt, createdAt, createdAt,
    );
    return this.getMyTicket(requester, number);
  }

  public updateTicket(requesterId: string, ticketNumber: string, input: unknown, now = new Date()): TicketRecord {
    const requester = userIdSchema.parse(requesterId);
    const number = ticketNumberSchema.parse(ticketNumber);
    const existing = this.getMyTicket(requester, number);
    const parsed = updateTicketSchema.parse(input);
    const updatedAt = now.toISOString();
    const priority = parsed.priority ?? existing.priority;
    const nextUpdateDueAt = addBusinessHours(now, businessHoursForPriority(priority)).toISOString();
    const updated = {
      title: parsed.title ?? existing.title,
      description: parsed.description ?? existing.description,
      priority,
      affectedPeople: parsed.affectedPeople ?? existing.affectedPeople,
      status: parsed.status ?? existing.status,
    };
    this.database.prepare(`
      UPDATE tickets
      SET title = ?, description = ?, priority = ?, affected_people = ?, status = ?,
          next_update_due_at = ?, updated_at = ?
      WHERE requester_id = ? AND number = ?
    `).run(
      updated.title, updated.description, updated.priority, updated.affectedPeople,
      updated.status, nextUpdateDueAt, updatedAt, requester, number,
    );
    return this.getMyTicket(requester, number);
  }

  public reopenTicket(requesterId: string, ticketNumber: string, now = new Date()): TicketRecord {
    const requester = userIdSchema.parse(requesterId);
    const number = ticketNumberSchema.parse(ticketNumber);
    const existing = this.getMyTicket(requester, number);
    if (existing.status !== "Resolvido" || !existing.resolvedAt) {
      throw new TicketingError("REOPEN_WINDOW");
    }
    const ageInDays = (now.getTime() - new Date(existing.resolvedAt).getTime()) / 86400000;
    if (ageInDays > 7 || ageInDays < 0) {
      throw new TicketingError("REOPEN_WINDOW");
    }
    const updatedAt = now.toISOString();
    const dueAt = addBusinessHours(now, businessHoursForPriority(existing.priority)).toISOString();
    this.database.prepare(`
      UPDATE tickets
      SET status = 'Aberto', resolved_at = NULL, first_response_due_at = ?,
          next_update_due_at = ?, updated_at = ?
      WHERE requester_id = ? AND number = ?
    `).run(dueAt, dueAt, updatedAt, requester, number);
    return this.getMyTicket(requester, number);
  }

  public isTicketOverdue(ticket: TicketRecord, now = new Date()): boolean {
    return isOverdue(new Date(ticket.nextUpdateDueAt), now);
  }

  private nextNumber(type: "INC" | "REQ"): string {
    const rows = this.database.prepare("SELECT number FROM tickets WHERE type = ?").all(type) as Array<{ number: string }>;
    const highest = rows.reduce((max, row) => Math.max(max, Number(row.number.split("-")[1]) || 0), 0);
    return `${type}-${String(highest + 1).padStart(5, "0")}`;
  }
}