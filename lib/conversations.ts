import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type ConversationStatus = "agent" | "waiting_analyst" | "with_analyst" | "closed";

export type ConversationAction = "take" | "return" | "close" | "reply";

export const transitionConversation = (status: ConversationStatus, action: ConversationAction): ConversationStatus => {
  if (action === "take" && status === "waiting_analyst") return "with_analyst";
  if (action === "return" && status === "with_analyst") return "agent";
  if (action === "close" && status === "with_analyst") return "closed";
  if (action === "reply" && status === "with_analyst") return "with_analyst";
  throw new Error(`Transição inválida: ${status} -> ${action}`);
};

export const getOrCreateConversation = (database: Database.Database, userId: string): string => {
  const existing = database.prepare("SELECT id FROM conversations WHERE user_id = ? AND status != 'closed' ORDER BY updated_at DESC LIMIT 1").get(userId) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }
  const id = `conversation-${randomUUID()}`;
  const now = new Date().toISOString();
  database.prepare("INSERT INTO conversations (id, user_id, status, created_at, updated_at) VALUES (?, ?, 'agent', ?, ?)").run(id, userId, now, now);
  return id;
};