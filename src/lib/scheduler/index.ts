import type {
  BlockDiff,
  ConstraintsSpec,
  ExistingBlock,
  GoalSpec,
  Interval,
  PlannedBlock,
  SchedulerInput,
} from "./types";

const MIN_BLOCK = 45; // minutes — anything shorter isn't worth a context switch
const MAX_BLOCK = 120;
const BREAK_MIN = 15;
const VARIETY_CAP = 0.5; // one goal may take at most half a day's work minutes
const DEFAULT_HORIZON_CAP = 240; // days

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function dayAt(base: Date, dayOffset: number, minuteOfDay: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  d.setMinutes(minuteOfDay);
  return d;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** Subtract busy intervals from a window, returning free sub-windows (sorted). */
function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  let free: Interval[] = [window];
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const b of sorted) {
    const next: Interval[] = [];
    for (const f of free) {
      if (!overlaps(f, b)) {
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: b.start });
      if (b.end < f.end) next.push({ start: b.end, end: f.end });
    }
    free = next;
  }
  return free.filter((f) => (f.end.getTime() - f.start.getTime()) / 60000 >= MIN_BLOCK);
}

function activePhase(goal: GoalSpec, date: Date): string | null {
  if (!goal.phases || goal.phases.length === 0) return null;
  for (const p of goal.phases) {
    if (date <= new Date(p.until + "T23:59:59")) return p.name;
  }
  // Past all phases — stick with the last one until the deadline passes.
  return goal.phases[goal.phases.length - 1].name;
}

/** Deadline pressure multiplier: ramps up as the deadline approaches. */
function urgency(goal: GoalSpec, date: Date): number {
  if (!goal.deadline) return 1;
  const daysLeft = (new Date(goal.deadline + "T00:00:00").getTime() - date.getTime()) / 86400000;
  if (daysLeft < 0) return 0; // deadline passed — stop scheduling it
  if (daysLeft <= 14) return 2;
  if (daysLeft <= 45) return 1.5;
  if (daysLeft <= 90) return 1.2;
  return 1;
}

interface DayAllocation {
  goal: GoalSpec;
  minutes: number;
}

/**
 * Split a day's work capacity across goals proportionally to
 * priority × urgency, respecting weekly-hours intent and a variety cap.
 */
function allocateDay(goals: GoalSpec[], date: Date, capacityMin: number): DayAllocation[] {
  const active = goals.filter((g) => urgency(g, date) > 0);
  if (active.length === 0 || capacityMin < MIN_BLOCK) return [];

  const weights = active.map((g) => ({
    goal: g,
    weight: g.priority * urgency(g, date),
    dailyIntent: (g.hoursPerWeek * 60) / 7,
  }));
  const totalIntent = weights.reduce((s, w) => s + w.dailyIntent, 0);
  // If total intent exceeds capacity, scale down proportionally by weight share;
  // if under capacity, don't inflate — leave slack as genuine free time.
  const budget = Math.min(capacityMin, totalIntent);
  const totalWeight = weights.reduce((s, w) => s + w.weight * w.dailyIntent, 0);

  const cap = capacityMin * VARIETY_CAP;
  const allocs: DayAllocation[] = [];
  let leftover = 0;
  for (const w of weights) {
    let mins = (budget * (w.weight * w.dailyIntent)) / totalWeight;
    if (mins > cap && weights.length > 1) {
      leftover += mins - cap;
      mins = cap;
    }
    allocs.push({ goal: w.goal, minutes: mins });
  }
  // Redistribute capped leftover to uncapped goals by weight.
  if (leftover > 1) {
    const uncapped = allocs.filter((a) => a.minutes < cap - 1);
    const uw = uncapped.reduce((s, a) => s + a.goal.priority, 0);
    for (const a of uncapped) a.minutes += (leftover * a.goal.priority) / uw;
  }
  return allocs
    .map((a) => ({ ...a, minutes: Math.round(a.minutes / 15) * 15 }))
    .filter((a) => a.minutes >= MIN_BLOCK);
}

/** Chunk a goal's minutes into 45–120 min pieces. */
function chunk(minutes: number): number[] {
  const chunks: number[] = [];
  let rest = minutes;
  while (rest >= MIN_BLOCK) {
    const size = Math.min(MAX_BLOCK, rest);
    // Avoid leaving an unusable tail (< MIN_BLOCK)
    if (rest - size > 0 && rest - size < MIN_BLOCK && size > MIN_BLOCK) {
      chunks.push(rest >= MAX_BLOCK ? Math.round((rest / 2) / 15) * 15 : rest);
      rest -= chunks[chunks.length - 1];
    } else {
      chunks.push(size);
      rest -= size;
    }
  }
  return chunks;
}

function blockTitle(goal: GoalSpec, subject: string | null, phase: string | null): string {
  let t = goal.name;
  if (subject) t += ` – ${subject}`;
  if (phase) t += ` (${phase})`;
  return t;
}

/**
 * Plan blocks from `now` to the horizon. Pure and deterministic:
 * same inputs always produce the same plan.
 */
export function planSchedule(input: SchedulerInput): PlannedBlock[] {
  const { goals, constraints, fixedEvents, existingBlocks, now } = input;
  const horizonDays = input.horizonDays ?? defaultHorizon(goals);
  const dayStartMin = hmToMinutes(constraints.dayStart);
  const dayEndMin = hmToMinutes(constraints.dayEnd);
  const sleepSlack = Math.max(0, constraints.sleepTargetMinutes - constraints.sleepFloorMinutes);

  const planned: PlannedBlock[] = [];

  for (let day = 0; day < horizonDays; day++) {
    const windowStart = dayAt(now, day, dayStartMin);
    const windowEnd = dayAt(now, day, dayEndMin);
    const date = dayAt(now, day, 12 * 60);

    // Never plan into the past: today's window starts no earlier than now (+buffer).
    const effectiveStart =
      day === 0 ? new Date(Math.max(windowStart.getTime(), now.getTime() + 10 * 60000)) : windowStart;
    if (effectiveStart >= windowEnd) continue;

    const dayInterval: Interval = { start: effectiveStart, end: windowEnd };
    const busy: Interval[] = [
      ...fixedEvents.filter((e) => overlaps(e, dayInterval)),
      ...existingBlocks.filter(
        (b) => (b.locked || b.status !== "planned") && overlaps(b, dayInterval),
      ),
    ];

    let free = subtractBusy(dayInterval, busy);
    let capacity = free.reduce((s, f) => s + (f.end.getTime() - f.start.getTime()) / 60000, 0);

    // Demand check: if goals want more than the day offers, borrow from sleep
    // (down to the floor) by extending the evening window.
    const intent = goals
      .filter((g) => urgency(g, date) > 0)
      .reduce((s, g) => s + (g.hoursPerWeek * 60) / 7, 0);
    if (intent > capacity && sleepSlack > 0) {
      const extension = Math.min(sleepSlack, intent - capacity);
      const extendedEnd = dayAt(now, day, dayEndMin + extension);
      free = subtractBusy({ start: effectiveStart, end: extendedEnd }, busy);
      capacity = free.reduce((s, f) => s + (f.end.getTime() - f.start.getTime()) / 60000, 0);
    }

    const allocs = allocateDay(goals, date, capacity);
    if (allocs.length === 0) continue;

    // Build an interleaved queue of chunks (round-robin across goals for variety).
    const perGoal = allocs.map((a) => ({
      goal: a.goal,
      chunks: chunk(a.minutes),
    }));
    const queue: { goal: GoalSpec; minutes: number }[] = [];
    let added = true;
    let round = 0;
    while (added) {
      added = false;
      for (const pg of perGoal) {
        if (round < pg.chunks.length) {
          queue.push({ goal: pg.goal, minutes: pg.chunks[round] });
          added = true;
        }
      }
      round++;
    }

    // Subject rotation is keyed to the calendar date (not a running cursor)
    // so a mid-week re-plan leaves untouched days byte-identical → minimal diff.
    const dayNum = Math.floor(dayAt(now, day, 12 * 60).getTime() / 86400000);
    const perDaySubjectIdx = new Map<number, number>();

    // Place chunks into free windows in order, with breaks between blocks.
    let wi = 0;
    let cursor = free.length > 0 ? free[0].start : null;
    for (const item of queue) {
      while (wi < free.length) {
        const w = free[wi];
        const start = cursor && cursor > w.start ? cursor : w.start;
        const end = new Date(start.getTime() + item.minutes * 60000);
        if (end <= w.end) {
          const phase = activePhase(item.goal, date);
          let subject: string | null = null;
          if (item.goal.subjects && item.goal.subjects.length > 0) {
            const within = perDaySubjectIdx.get(item.goal.id) ?? 0;
            subject =
              item.goal.subjects[(dayNum + within) % item.goal.subjects.length];
            perDaySubjectIdx.set(item.goal.id, within + 1);
          }
          planned.push({
            goalId: item.goal.id,
            title: blockTitle(item.goal, subject, phase),
            subject,
            start,
            end,
          });
          cursor = new Date(end.getTime() + BREAK_MIN * 60000);
          break;
        }
        wi++;
        cursor = wi < free.length ? free[wi].start : null;
      }
      if (wi >= free.length) break; // day is full
    }
  }

  return planned;
}

function defaultHorizon(goals: GoalSpec[]): number {
  const deadlines = goals
    .map((g) => g.deadline)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d + "T00:00:00").getTime());
  if (deadlines.length === 0) return 14;
  const days = Math.ceil((Math.max(...deadlines) - Date.now()) / 86400000) + 7;
  return Math.max(14, Math.min(days, DEFAULT_HORIZON_CAP));
}

/**
 * Diff a fresh plan against existing blocks. Past, locked, and done/skipped
 * blocks are always kept. Future planned blocks that exactly match a new
 * block are kept (preserving Google event IDs); the rest are replaced.
 */
export function diffBlocks(
  existing: ExistingBlock[],
  fresh: PlannedBlock[],
  now: Date,
): BlockDiff {
  const keep: ExistingBlock[] = [];
  const replaceable: ExistingBlock[] = [];
  for (const b of existing) {
    if (b.locked || b.status !== "planned" || b.end <= now) keep.push(b);
    else replaceable.push(b);
  }

  const key = (goalId: number, title: string, start: Date, end: Date) =>
    `${goalId}|${title}|${start.getTime()}|${end.getTime()}`;
  const existingByKey = new Map(replaceable.map((b) => [key(b.goalId, b.title, b.start, b.end), b]));

  const create: PlannedBlock[] = [];
  for (const p of fresh) {
    const k = key(p.goalId, p.title, p.start, p.end);
    const match = existingByKey.get(k);
    if (match) {
      keep.push(match);
      existingByKey.delete(k);
    } else {
      create.push(p);
    }
  }
  return { keep, create, remove: [...existingByKey.values()] };
}
