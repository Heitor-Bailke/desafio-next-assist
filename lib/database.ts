import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const initializeDatabase = (database: Database.Database): void => {
  database.pragma("foreign_keys = ON");
  database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('employee', 'analyst')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (status IN ('agent', 'waiting_analyst', 'with_analyst', 'closed')),
    analyst_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    author TEXT NOT NULL CHECK (author IN ('employee', 'agent', 'analyst')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    session_message_number INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decision_traces (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE REFERENCES messages(id),
    intent TEXT NOT NULL,
    action TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    rationale TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL REFERENCES decision_traces(id),
    tool_name TEXT NOT NULL,
    input_summary TEXT NOT NULL,
    output_summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    requester_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('INC', 'REQ')),
    category TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('Crítica', 'Alta', 'Média', 'Baixa')),
    affected_people INTEGER NOT NULL CHECK (affected_people >= 1),
    status TEXT NOT NULL,
    first_response_due_at TEXT NOT NULL,
    next_update_due_at TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS help_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    keywords TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `);
};

export const createDatabase = (filename: string): Database.Database => {
  const instance = new Database(filename);
  initializeDatabase(instance);
  return instance;
};

const databasePath = process.env.DATABASE_PATH ?? "./data/nexo-assist.db";
const absoluteDatabasePath = path.resolve(databasePath);
fs.mkdirSync(path.dirname(absoluteDatabasePath), { recursive: true });

export const database = createDatabase(absoluteDatabasePath);