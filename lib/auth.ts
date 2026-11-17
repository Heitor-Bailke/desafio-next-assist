import { randomUUID } from "node:crypto";
import { database } from "./database";

export const SESSION_COOKIE = "nexo_session";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: "employee" | "analyst";
};

export const findUserByEmail = (email: string): AuthenticatedUser | null => {
  const row = database.prepare("SELECT id, email, name, role FROM users WHERE lower(email) = lower(?)").get(email) as AuthenticatedUser | undefined;
  return row ?? null;
};

export const createSession = (userId: string): string => {
  const sessionId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
  database.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    sessionId,
    userId,
    expiresAt,
    now.toISOString(),
  );
  return sessionId;
};

export const getUserFromRequest = (request: Request): AuthenticatedUser | null => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionId = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.split("=")[1];
  if (!sessionId) {
    return null;
  }
  const row = database.prepare(`
    SELECT users.id, users.email, users.name, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ?
  `).get(sessionId, new Date().toISOString()) as AuthenticatedUser | undefined;
  return row ?? null;
};