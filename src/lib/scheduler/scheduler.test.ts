import { describe, expect, it } from "vitest";
import { diffBlocks, planSchedule } from "./index";
import type { ConstraintsSpec, ExistingBlock, FixedEventSpec, GoalSpec } from "./types";

const constraints: ConstraintsSpec = {
  sleepTargetMinutes: 450, // 7.5h
  sleepFloorMinutes: 360, // 6h
  sleepStart: "23:30",
  dayStart: "08:00",
  dayEnd: "23:00",
};

const gateGoal: GoalSpec = {
  id: 1,
  name: "GATE prep",
  color: "#ef4444",
  priority: 5,
  deadline: "2027-02-07",
  hoursPerWeek: 28,
  phases: [
    { name: "learn", until: "2026-11-30" },
    { name: "questions", until: "2027-02-07" },
  ],
  subjects: ["Engineering Math", "Digital Logic", "OS", "DBMS", "Networks"],
};

const dsaGoal: GoalSpec = {
  id: 2,
  name: "DSA",
  color: "#3b82f6",
  priority: 3,
  deadline: null,
  hoursPerWeek: 7,
  phases: null,
  subjects: null,
};

const fypGoal: GoalSpec = {
  id: 3,
  name: "Final year project",
  color: "#22c55e",
  priority: 4,
  deadline: "2027-04-30",
  hoursPerWeek: 10,
  phases: null,
  subjects: null,
};

const now = new Date(2026, 6, 13, 9, 0); // Mon 13 Jul 2026, 09:00 local

describe("scenario 1: initial GATE plan", () => {
  const plan = planSchedule({
    goals: [gateGoal, dsaGoal, fypGoal],
    constraints,
    fixedEvents: [],
    existingBlocks: [],
    now,
  });

  it("fills every day up to the GATE deadline horizon", () => {
    const days = new Set(plan.map((b) => b.start.toDateString()));
    expect(days.size).toBeGreaterThan(200); // Jul 2026 → Feb 2027
  });

  it("never plans outside the waking window", () => {
    for (const b of plan) {
      const startMin = b.start.getHours() * 60 + b.start.getMinutes();
      expect(startMin).toBeGreaterThanOrEqual(8 * 60);
      // dayEnd 23:00 plus max 90min sleep-borrow
      expect(b.end.getHours() * 60 + b.end.getMinutes() || 24 * 60).toBeLessThanOrEqual(
        24 * 60 + 30,
      );
    }
  });

  it("gives GATE (priority 5, 28h/wk) the largest share", () => {
    const minutesByGoal = new Map<number, number>();
    for (const b of plan) {
      minutesByGoal.set(
        b.goalId,
        (minutesByGoal.get(b.goalId) ?? 0) + (b.end.getTime() - b.start.getTime()) / 60000,
      );
    }
    expect(minutesByGoal.get(1)!).toBeGreaterThan(minutesByGoal.get(2)!);
    expect(minutesByGoal.get(1)!).toBeGreaterThan(minutesByGoal.get(3)!);
  });

  it("labels GATE blocks with the active phase: learn now, questions near the exam", () => {
    const july = plan.filter((b) => b.goalId === 1 && b.start < new Date(2026, 7, 1));
    const january = plan.filter(
      (b) => b.goalId === 1 && b.start >= new Date(2027, 0, 1) && b.start < new Date(2027, 1, 1),
    );
    expect(july.length).toBeGreaterThan(0);
    expect(january.length).toBeGreaterThan(0);
    expect(july.every((b) => b.title.includes("(learn)"))).toBe(true);
    expect(january.every((b) => b.title.includes("(questions)"))).toBe(true);
  });

  it("rotates GATE subjects", () => {
    const subjects = new Set(plan.filter((b) => b.goalId === 1).map((b) => b.subject));
    expect(subjects.size).toBe(5);
  });

  it("stops scheduling a goal after its deadline", () => {
    const afterExam = plan.filter((b) => b.goalId === 1 && b.start > new Date(2027, 1, 8));
    expect(afterExam.length).toBe(0);
  });

  it("keeps blocks between 45 and 120 minutes with no overlaps", () => {
    const byDay = new Map<string, typeof plan>();
    for (const b of plan) {
      const mins = (b.end.getTime() - b.start.getTime()) / 60000;
      expect(mins).toBeGreaterThanOrEqual(45);
      expect(mins).toBeLessThanOrEqual(120);
      const k = b.start.toDateString();
      byDay.set(k, [...(byDay.get(k) ?? []), b]);
    }
    for (const dayBlocks of byDay.values()) {
      const sorted = [...dayBlocks].sort((a, b) => a.start.getTime() - b.start.getTime());
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start.getTime()).toBeGreaterThanOrEqual(sorted[i - 1].end.getTime());
      }
    }
  });

  it("is deterministic", () => {
    const again = planSchedule({
      goals: [gateGoal, dsaGoal, fypGoal],
      constraints,
      fixedEvents: [],
      existingBlocks: [],
      now,
    });
    expect(again).toEqual(plan);
  });
});

describe("scenario 2: girlfriend's birthday today, out 17:30 for ~4h", () => {
  const birthday: FixedEventSpec = {
    id: 1,
    title: "GF's birthday 🎂",
    start: new Date(2026, 6, 13, 17, 30),
    end: new Date(2026, 6, 13, 21, 30),
  };

  it("plans nothing overlapping the date and re-flows around it", () => {
    const plan = planSchedule({
      goals: [gateGoal, dsaGoal, fypGoal],
      constraints,
      fixedEvents: [birthday],
      existingBlocks: [],
      now,
    });
    const todays = plan.filter((b) => b.start.toDateString() === now.toDateString());
    expect(todays.length).toBeGreaterThan(0);
    for (const b of todays) {
      expect(b.start >= birthday.end || b.end <= birthday.start).toBe(true);
    }
  });

  it("diff only replaces future unlocked planned blocks", () => {
    const initial = planSchedule({
      goals: [gateGoal, dsaGoal, fypGoal],
      constraints,
      fixedEvents: [],
      existingBlocks: [],
      now,
    });
    const existing: ExistingBlock[] = initial.map((p, i) => ({
      ...p,
      id: i + 1,
      status: "planned" as const,
      locked: false,
      googleEventId: null,
    }));
    // Mark this morning's first block done — it must survive the re-plan.
    existing[0].status = "done";

    const later = new Date(2026, 6, 13, 12, 0);
    const fresh = planSchedule({
      goals: [gateGoal, dsaGoal, fypGoal],
      constraints,
      fixedEvents: [birthday],
      existingBlocks: existing,
      now: later,
    });
    const diff = diffBlocks(existing, fresh, later);

    expect(diff.keep).toContainEqual(existing[0]); // done block kept
    for (const r of diff.remove) {
      expect(r.locked).toBe(false);
      expect(r.status).toBe("planned");
      expect(r.end > later).toBe(true);
    }
    // Unchanged far-future days should be kept, not churned.
    expect(diff.keep.length).toBeGreaterThan(diff.create.length);
  });
});

describe("scenario 3: exams on specific dates 13:00–15:00", () => {
  const examDates = [15, 17, 20]; // July 2026
  const exams: FixedEventSpec[] = examDates.map((d, i) => ({
    id: 10 + i,
    title: "Semester exam",
    start: new Date(2026, 6, d, 13, 0),
    end: new Date(2026, 6, d, 15, 0),
  }));

  it("keeps 13:00–15:00 free on exam days", () => {
    const plan = planSchedule({
      goals: [gateGoal, dsaGoal, fypGoal],
      constraints,
      fixedEvents: exams,
      existingBlocks: [],
      now,
    });
    for (const exam of exams) {
      const sameDay = plan.filter((b) => b.start.toDateString() === exam.start.toDateString());
      expect(sameDay.length).toBeGreaterThan(0); // still studies around the exam
      for (const b of sameDay) {
        expect(b.start >= exam.end || b.end <= exam.start).toBe(true);
      }
    }
  });
});

describe("sleep borrowing", () => {
  it("extends the day toward the 6h sleep floor only when demand exceeds capacity", () => {
    const heavyGoals: GoalSpec[] = [
      { ...gateGoal, hoursPerWeek: 60 },
      { ...fypGoal, hoursPerWeek: 40 },
    ];
    const busyDay: FixedEventSpec = {
      id: 99,
      title: "College",
      start: new Date(2026, 6, 14, 9, 0),
      end: new Date(2026, 6, 14, 17, 0),
    };
    const plan = planSchedule({
      goals: heavyGoals,
      constraints,
      fixedEvents: [busyDay],
      existingBlocks: [],
      now,
      horizonDays: 3,
    });
    const busyDayBlocks = plan.filter(
      (b) => b.start.toDateString() === busyDay.start.toDateString(),
    );
    const midnight = new Date(2026, 6, 14).getTime();
    const latestEnd = Math.max(
      ...busyDayBlocks.map((b) => (b.end.getTime() - midnight) / 60000),
    );
    expect(latestEnd).toBeGreaterThan(23 * 60); // borrowed evening time past 23:00

    // A light schedule must NOT extend past dayEnd.
    const lightPlan = planSchedule({
      goals: [dsaGoal],
      constraints,
      fixedEvents: [],
      existingBlocks: [],
      now,
      horizonDays: 3,
    });
    for (const b of lightPlan) {
      expect(b.end.getHours() * 60 + b.end.getMinutes()).toBeLessThanOrEqual(23 * 60);
    }
  });
});
