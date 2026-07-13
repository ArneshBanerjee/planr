import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "planr.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Idempotent bootstrap so the app runs without a separate migrate step.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  priority INTEGER NOT NULL DEFAULT 3,
  deadline TEXT,
  hours_per_week INTEGER NOT NULL DEFAULT 7,
  phases TEXT,
  subjects TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sleep_target_minutes INTEGER NOT NULL DEFAULT 450,
  sleep_floor_minutes INTEGER NOT NULL DEFAULT 360,
  sleep_start TEXT NOT NULL DEFAULT '23:30',
  day_start TEXT NOT NULL DEFAULT '08:00',
  day_end TEXT NOT NULL DEFAULT '23:00',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fixed_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  google_event_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  locked INTEGER NOT NULL DEFAULT 0,
  google_event_id TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ops_applied TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_auth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tokens TEXT NOT NULL,
  planr_calendar_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_start ON blocks(start);
CREATE INDEX IF NOT EXISTS idx_fixed_events_start ON fixed_events(start);
`);
