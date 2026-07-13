import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Phases let a goal shift character over time, e.g. GATE: learn -> practice.
// Stored as JSON: [{ name: "learn", until: "2026-11-30" }, { name: "practice", until: "2027-02-07" }]
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  priority: integer("priority").notNull().default(3), // 1 (low) .. 5 (critical)
  deadline: text("deadline"), // ISO date, optional
  hoursPerWeek: integer("hours_per_week").notNull().default(7),
  phases: text("phases", { mode: "json" }).$type<
    { name: string; until: string }[]
  >(),
  subjects: text("subjects", { mode: "json" }).$type<string[]>(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Single-row table holding global scheduling constraints.
export const constraints = sqliteTable("constraints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sleepTargetMinutes: integer("sleep_target_minutes").notNull().default(450), // 7.5h midpoint of 7-8h
  sleepFloorMinutes: integer("sleep_floor_minutes").notNull().default(360), // 6h on heavy days
  sleepStart: text("sleep_start").notNull().default("23:30"), // preferred bedtime HH:mm
  dayStart: text("day_start").notNull().default("08:00"), // earliest work block
  dayEnd: text("day_end").notNull().default("23:00"), // latest work block
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const fixedEvents = sqliteTable("fixed_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  start: text("start").notNull(), // ISO datetime
  end: text("end").notNull(), // ISO datetime
  source: text("source", { enum: ["user", "google"] })
    .notNull()
    .default("user"),
  googleEventId: text("google_event_id"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const blocks = sqliteTable("blocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(), // e.g. "GATE – Thermodynamics (questions)"
  subject: text("subject"),
  start: text("start").notNull(),
  end: text("end").notNull(),
  status: text("status", { enum: ["planned", "done", "skipped"] })
    .notNull()
    .default("planned"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  googleEventId: text("google_event_id"),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  opsApplied: text("ops_applied", { mode: "json" }),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Free-form app settings (LLM provider choice, API keys — local single-user app).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Google OAuth tokens (single user, single row).
export const googleAuth = sqliteTable("google_auth", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokens: text("tokens", { mode: "json" }).notNull(),
  planrCalendarId: text("planr_calendar_id"),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Goal = typeof goals.$inferSelect;
export type Constraints = typeof constraints.$inferSelect;
export type FixedEvent = typeof fixedEvents.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type Message = typeof messages.$inferSelect;
