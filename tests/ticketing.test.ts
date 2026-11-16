import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../lib/database";
import { LegacyTicketingAdapter, LegacyUnavailableError } from "../lib/services/legacy-ticketing";
import { TicketingError, SqliteTicketingService } from "../lib/services/ticketing";

describe("SqliteTicketingService", () => {
  let database: Database.Database;
  let service: SqliteTicketingService;

  beforeEach(() => {
    database = createDatabase(":memory:");
    database.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "user-ana", "ana.silva@nexo.com", "Ana Silva", "employee", "2026-11-01T08:00:00.000Z",
    );
    database.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "user-bruno", "bruno.costa@nexo.com", "Bruno Costa", "employee", "2026-11-01T08:00:00.000Z",
    );
    service = new SqliteTicketingService(database);
  });

  afterEach(() => database.close());

  const draft = {
    title: "VPN indisponível",
    description: "Não consigo conectar à VPN desde hoje.",
    type: "INC" as const,
    category: "Rede e VPN" as const,
    priority: "Alta" as const,
    affectedPeople: 1,
  };

  it("creates a ticket with a deadline calculated in code", () => {
    const ticket = service.createTicket("user-ana", draft, new Date("2026-11-16T08:00:00.000Z"));

    expect(ticket.number).toBe("INC-00001");
    expect(ticket.firstResponseDueAt).toBe("2026-11-16T12:00:00.000Z");
  });

  it("blocks a duplicate open ticket", () => {
    service.createTicket("user-ana", draft, new Date("2026-11-16T08:00:00.000Z"));

    expect(() => service.createTicket("user-ana", draft)).toThrowError(
      new TicketingError("DUPLICATE"),
    );
  });

  it("does not expose another employee's ticket", () => {
    const ticket = service.createTicket("user-ana", draft);

    expect(() => service.getMyTicket("user-bruno", ticket.number)).toThrowError(
      new TicketingError("NOT_FOUND"),
    );
    expect(service.listMyTickets("user-bruno")).toHaveLength(0);
  });

  it("reopens a recently resolved ticket and rejects an old one", () => {
    const ticket = service.createTicket("user-ana", draft, new Date("2026-11-02T08:00:00.000Z"));
    database.prepare("UPDATE tickets SET status = 'Resolvido', resolved_at = ? WHERE number = ?").run(
      "2026-11-10T12:00:00.000Z", ticket.number,
    );

    const reopened = service.reopenTicket("user-ana", ticket.number, new Date("2026-11-16T08:00:00.000Z"));
    expect(reopened.status).toBe("Aberto");
    expect(reopened.resolvedAt).toBeNull();

    database.prepare("UPDATE tickets SET status = 'Resolvido', resolved_at = ? WHERE number = ?").run(
      "2026-11-01T12:00:00.000Z", ticket.number,
    );
    expect(() => service.reopenTicket("user-ana", ticket.number, new Date("2026-11-16T08:00:00.000Z"))).toThrowError(
      new TicketingError("REOPEN_WINDOW"),
    );
  });

  it("retries legacy failures and returns a clear availability error", async () => {
    const adapter = new LegacyTicketingAdapter(service, {
      failureRate: 1,
      failureDelayMs: 1,
      maxAttempts: 2,
      timeoutMs: 20,
      backoffMs: 1,
      random: () => 0,
      sleep: async () => undefined,
    });

    await expect(adapter.listMyTickets("user-ana")).rejects.toBeInstanceOf(LegacyUnavailableError);
  });
});