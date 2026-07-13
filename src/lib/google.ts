import { google, type calendar_v3 } from "googleapis";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "./db";
import { blocks, fixedEvents, googleAuth, goals } from "./db/schema";
import { replan } from "./plan";

const PUSH_WINDOW_DAYS = 14; // only mirror the near future to Google
const PULL_WINDOW_DAYS = 60;

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/api/google/callback",
  );
}

export function getAuthUrl(): string | null {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
}

export async function handleCallback(code: string): Promise<void> {
  const client = getOAuthClient();
  if (!client) throw new Error("Google OAuth env vars not configured");
  const { tokens } = await client.getToken(code);
  const existing = db.select().from(googleAuth).get();
  if (existing) {
    db.update(googleAuth)
      .set({ tokens, updatedAt: new Date().toISOString() })
      .where(eq(googleAuth.id, existing.id))
      .run();
  } else {
    db.insert(googleAuth).values({ tokens }).run();
  }
}

export function isConnected(): boolean {
  return !!db.select().from(googleAuth).get();
}

function getCalendarClient(): {
  cal: calendar_v3.Calendar;
  authRow: typeof googleAuth.$inferSelect;
} | null {
  const client = getOAuthClient();
  const authRow = db.select().from(googleAuth).get();
  if (!client || !authRow) return null;
  client.setCredentials(authRow.tokens as object);
  // Persist refreshed tokens so the connection survives access-token expiry.
  client.on("tokens", (t) => {
    const merged = { ...(authRow.tokens as object), ...t };
    db.update(googleAuth)
      .set({ tokens: merged, updatedAt: new Date().toISOString() })
      .where(eq(googleAuth.id, authRow.id))
      .run();
  });
  return { cal: google.calendar({ version: "v3", auth: client }), authRow };
}

async function ensurePlanrCalendar(
  cal: calendar_v3.Calendar,
  authRow: typeof googleAuth.$inferSelect,
): Promise<string> {
  if (authRow.planrCalendarId) return authRow.planrCalendarId;
  const list = await cal.calendarList.list();
  const found = list.data.items?.find((c) => c.summary === "Planr");
  const id =
    found?.id ??
    (await cal.calendars.insert({ requestBody: { summary: "Planr" } })).data.id!;
  db.update(googleAuth)
    .set({ planrCalendarId: id })
    .where(eq(googleAuth.id, authRow.id))
    .run();
  return id;
}

/** Import the user's real Google events (primary calendar) as fixed events. */
async function pullGoogleEvents(cal: calendar_v3.Calendar): Promise<boolean> {
  const now = new Date();
  const timeMax = new Date(now.getTime() + PULL_WINDOW_DAYS * 86400000);
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    maxResults: 250,
  });
  const items = (res.data.items ?? []).filter(
    (e) => e.start?.dateTime && e.end?.dateTime && e.status !== "cancelled",
  );

  const existing = db
    .select()
    .from(fixedEvents)
    .where(eq(fixedEvents.source, "google"))
    .all();
  const byGid = new Map(existing.map((e) => [e.googleEventId, e]));
  let changed = false;

  const seen = new Set<string>();
  for (const e of items) {
    seen.add(e.id!);
    const prev = byGid.get(e.id!);
    const start = new Date(e.start!.dateTime!).toISOString();
    const end = new Date(e.end!.dateTime!).toISOString();
    if (!prev) {
      db.insert(fixedEvents)
        .values({
          title: e.summary ?? "Busy",
          start,
          end,
          source: "google",
          googleEventId: e.id!,
        })
        .run();
      changed = true;
    } else if (prev.start !== start || prev.end !== end || prev.title !== (e.summary ?? "Busy")) {
      db.update(fixedEvents)
        .set({ title: e.summary ?? "Busy", start, end })
        .where(eq(fixedEvents.id, prev.id))
        .run();
      changed = true;
    }
  }
  // Drop google-sourced events that disappeared upstream (future ones only).
  for (const prev of existing) {
    if (!seen.has(prev.googleEventId!) && prev.start > now.toISOString()) {
      db.delete(fixedEvents).where(eq(fixedEvents.id, prev.id)).run();
      changed = true;
    }
  }
  return changed;
}

/** Push near-future planned blocks to the dedicated Planr calendar. */
async function pushBlocks(cal: calendar_v3.Calendar, calendarId: string): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + PUSH_WINDOW_DAYS * 86400000).toISOString();
  const goalColors = new Map(db.select().from(goals).all().map((g) => [g.id, g.color]));

  const toPush = db
    .select()
    .from(blocks)
    .where(and(gte(blocks.end, now.toISOString()), isNull(blocks.googleEventId)))
    .all()
    .filter((b) => b.start < windowEnd && b.status === "planned");

  for (const b of toPush) {
    const res = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: b.title,
        start: { dateTime: b.start },
        end: { dateTime: b.end },
        description: `Planr block (goal color ${goalColors.get(b.goalId) ?? ""})`,
      },
    });
    db.update(blocks).set({ googleEventId: res.data.id }).where(eq(blocks.id, b.id)).run();
  }
}

/**
 * Remove Planr-calendar events whose blocks were deleted by a re-plan.
 * Blocks table is the source of truth; any event on the Planr calendar
 * without a matching block gets deleted.
 */
async function pruneOrphanedEvents(cal: calendar_v3.Calendar, calendarId: string): Promise<void> {
  const now = new Date();
  const res = await cal.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + PUSH_WINDOW_DAYS * 86400000).toISOString(),
    singleEvents: true,
    maxResults: 500,
  });
  const liveIds = new Set(
    db
      .select()
      .from(blocks)
      .all()
      .map((b) => b.googleEventId)
      .filter(Boolean),
  );
  for (const e of res.data.items ?? []) {
    if (e.id && !liveIds.has(e.id)) {
      await cal.events.delete({ calendarId, eventId: e.id });
    }
  }
}

/**
 * Full sync: pull real events in (re-planning around them if new ones showed
 * up), then mirror the near-future plan out. No-op when Google isn't connected.
 */
export async function syncToGoogle(): Promise<void> {
  const ctx = getCalendarClient();
  if (!ctx) return;
  const { cal, authRow } = ctx;

  const pulledChanges = await pullGoogleEvents(cal);
  if (pulledChanges) replan();

  const calendarId = await ensurePlanrCalendar(cal, authRow);
  await pruneOrphanedEvents(cal, calendarId);
  await pushBlocks(cal, calendarId);
}
