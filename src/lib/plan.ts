import { and, eq, gte, like } from "drizzle-orm";
import { db } from "./db";
import {
  blocks,
  constraints,
  fixedEvents,
  goals,
  type Block,
  type Constraints,
  type FixedEvent,
  type Goal,
} from "./db/schema";
import type { Op } from "./llm/ops";
import { diffBlocks, planSchedule } from "./scheduler";
import type { ExistingBlock } from "./scheduler/types";

const GOAL_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899"];

export function getConstraints(): Constraints {
  const row = db.select().from(constraints).get();
  if (row) return row;
  return db.insert(constraints).values({}).returning().get();
}

export function getActiveGoals(): Goal[] {
  return db.select().from(goals).where(eq(goals.archived, false)).all();
}

export function getFixedEvents(): FixedEvent[] {
  return db.select().from(fixedEvents).all();
}

export function getAllBlocks(): Block[] {
  return db.select().from(blocks).all();
}

/** Compact human-readable snapshot fed to the LLM as context. */
export function buildStateSnapshot(): string {
  const gs = getActiveGoals();
  const c = getConstraints();
  const upcoming = db
    .select()
    .from(fixedEvents)
    .where(gte(fixedEvents.end, new Date().toISOString()))
    .all()
    .slice(0, 30);

  const lines: string[] = [];
  lines.push(gs.length === 0 ? "Goals: (none yet)" : "Goals:");
  for (const g of gs) {
    lines.push(
      `- "${g.name}" priority ${g.priority}, ${g.hoursPerWeek}h/week` +
        (g.deadline ? `, deadline ${g.deadline}` : "") +
        (g.subjects?.length ? `, subjects: ${g.subjects.join(", ")}` : "") +
        (g.phases?.length
          ? `, phases: ${g.phases.map((p) => `${p.name} until ${p.until}`).join("; ")}`
          : ""),
    );
  }
  lines.push(
    `Sleep: target ${c.sleepTargetMinutes / 60}h (floor ${c.sleepFloorMinutes / 60}h on heavy days), bedtime ~${c.sleepStart}; work window ${c.dayStart}-${c.dayEnd}`,
  );
  lines.push(upcoming.length === 0 ? "Upcoming fixed events: (none)" : "Upcoming fixed events:");
  for (const e of upcoming) {
    lines.push(`- "${e.title}" ${e.start} → ${e.end} [${e.source}]`);
  }
  return lines.join("\n");
}

function findGoalByName(name: string): Goal | undefined {
  const all = getActiveGoals();
  const lower = name.toLowerCase();
  return (
    all.find((g) => g.name.toLowerCase() === lower) ??
    all.find((g) => g.name.toLowerCase().includes(lower) || lower.includes(g.name.toLowerCase()))
  );
}

export interface ApplyResult {
  applied: string[]; // human-readable descriptions of what changed
  skipped: string[]; // ops that could not be applied, with reasons
  mutated: boolean;
}

export function applyOps(ops: Op[]): ApplyResult {
  const applied: string[] = [];
  const skipped: string[] = [];
  let mutated = false;

  for (const op of ops) {
    switch (op.type) {
      case "add_goal": {
        if (!op.name) {
          skipped.push("An add_goal instruction was missing the goal name");
          break;
        }
        const existing = findGoalByName(op.name);
        if (existing) {
          // LLM tried to re-add — treat as update.
          ops.push({ ...op, type: "update_goal" });
          break;
        }
        const count = getActiveGoals().length;
        db.insert(goals)
          .values({
            name: op.name,
            color: op.color ?? GOAL_COLORS[count % GOAL_COLORS.length],
            priority: op.priority ?? 3,
            deadline: op.deadline ?? null,
            hoursPerWeek: op.hoursPerWeek ?? 7,
            phases: op.phases ?? null,
            subjects: op.subjects ?? null,
          })
          .run();
        applied.push(`Added goal "${op.name}"`);
        mutated = true;
        break;
      }
      case "update_goal": {
        if (!op.name) {
          skipped.push("An update_goal instruction was missing the goal name");
          break;
        }
        const g = findGoalByName(op.name);
        if (!g) {
          skipped.push(`No existing goal matches "${op.name}" — nothing updated`);
          break;
        }
        db.update(goals)
          .set({
            name: op.newName ?? g.name,
            priority: op.priority ?? g.priority,
            deadline: op.deadline === undefined ? g.deadline : op.deadline,
            hoursPerWeek: op.hoursPerWeek ?? g.hoursPerWeek,
            phases: op.phases ?? g.phases,
            subjects: op.subjects ?? g.subjects,
            color: op.color ?? g.color,
          })
          .where(eq(goals.id, g.id))
          .run();
        applied.push(`Updated goal "${g.name}"`);
        mutated = true;
        break;
      }
      case "remove_goal": {
        if (!op.name) {
          skipped.push("A remove_goal instruction was missing the goal name");
          break;
        }
        const g = findGoalByName(op.name);
        if (!g) {
          skipped.push(`No existing goal matches "${op.name}" — nothing removed`);
          break;
        }
        db.update(goals).set({ archived: true }).where(eq(goals.id, g.id)).run();
        db.delete(blocks)
          .where(and(eq(blocks.goalId, g.id), eq(blocks.status, "planned")))
          .run();
        applied.push(`Removed goal "${g.name}"`);
        mutated = true;
        break;
      }
      case "set_constraints": {
        const c = getConstraints();
        db.update(constraints)
          .set({
            sleepTargetMinutes: op.sleepTargetMinutes ?? c.sleepTargetMinutes,
            sleepFloorMinutes: op.sleepFloorMinutes ?? c.sleepFloorMinutes,
            sleepStart: op.sleepStart ?? c.sleepStart,
            dayStart: op.dayStart ?? c.dayStart,
            dayEnd: op.dayEnd ?? c.dayEnd,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(constraints.id, c.id))
          .run();
        applied.push("Updated sleep/day constraints");
        mutated = true;
        break;
      }
      case "add_fixed_events": {
        if (!op.title || !op.events?.length) {
          skipped.push("A fixed-event instruction was missing its title or times");
          break;
        }
        for (const e of op.events) {
          db.insert(fixedEvents).values({ title: op.title, start: e.start, end: e.end }).run();
        }
        applied.push(`Added ${op.events.length} fixed event(s): "${op.title}"`);
        mutated = true;
        break;
      }
      case "remove_fixed_events": {
        if (!op.titleMatch) {
          skipped.push("A remove-event instruction was missing what to match");
          break;
        }
        const removed = db
          .delete(fixedEvents)
          .where(like(fixedEvents.title, `%${op.titleMatch}%`))
          .returning()
          .all();
        if (removed.length > 0) {
          applied.push(`Removed ${removed.length} fixed event(s) matching "${op.titleMatch}"`);
          mutated = true;
        } else {
          skipped.push(`No fixed events match "${op.titleMatch}"`);
        }
        break;
      }
      case "mark_blocks": {
        if (!op.titleMatch || !op.date || !op.status) {
          skipped.push("A mark-blocks instruction was missing title/date/status");
          break;
        }
        const updated = db
          .update(blocks)
          .set({ status: op.status })
          .where(and(like(blocks.title, `%${op.titleMatch}%`), like(blocks.start, `${op.date}%`)))
          .returning()
          .all();
        if (updated.length > 0) {
          applied.push(`Marked ${updated.length} block(s) as ${op.status}`);
          mutated = true;
        } else {
          skipped.push(`No blocks on ${op.date} match "${op.titleMatch}"`);
        }
        break;
      }
      case "replan":
        mutated = true;
        applied.push("Re-planned the schedule");
        break;
    }
  }
  return { applied, skipped, mutated };
}

export interface ReplanSummary {
  created: number;
  removed: number;
  kept: number;
}

/** Run the scheduler against current DB state and persist the diff. */
export function replan(now = new Date()): ReplanSummary {
  const gs = getActiveGoals();
  const c = getConstraints();
  const fes = getFixedEvents().map((e) => ({
    id: e.id,
    title: e.title,
    start: new Date(e.start),
    end: new Date(e.end),
  }));
  const existing: ExistingBlock[] = getAllBlocks().map((b) => ({
    id: b.id,
    goalId: b.goalId,
    title: b.title,
    subject: b.subject,
    start: new Date(b.start),
    end: new Date(b.end),
    status: b.status,
    locked: b.locked,
    googleEventId: b.googleEventId,
  }));

  const fresh = planSchedule({
    goals: gs.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      priority: g.priority,
      deadline: g.deadline,
      hoursPerWeek: g.hoursPerWeek,
      phases: g.phases,
      subjects: g.subjects,
    })),
    constraints: c,
    fixedEvents: fes,
    existingBlocks: existing,
    now,
  });

  const diff = diffBlocks(existing, fresh, now);
  for (const r of diff.remove) {
    db.delete(blocks).where(eq(blocks.id, r.id)).run();
  }
  for (const p of diff.create) {
    db.insert(blocks)
      .values({
        goalId: p.goalId,
        title: p.title,
        subject: p.subject,
        start: p.start.toISOString(),
        end: p.end.toISOString(),
      })
      .run();
  }
  return { created: diff.create.length, removed: diff.remove.length, kept: diff.keep.length };
}
