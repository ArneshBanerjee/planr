/**
 * Integration test: exercises the real DB + op application + replan path
 * end-to-end (everything except the Gemini call), using the ops Gemini
 * would emit for the user's three scenario prompts.
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyOps, getAllBlocks, replan, buildStateSnapshot } from "./plan";
import type { Op } from "./llm/ops";

afterAll(() => {
  // Don't leave test data in the app's real database.
  fs.rmSync(path.join(process.cwd(), "data"), { recursive: true, force: true });
});

describe("full pipeline (ops → DB → scheduler → blocks)", () => {
  it("scenario 1: GATE + sleep prompt populates the calendar", () => {
    const ops: Op[] = [
      {
        type: "set_constraints",
        sleepTargetMinutes: 450,
        sleepFloorMinutes: 360,
      },
      {
        type: "add_goal",
        name: "GATE prep",
        priority: 5,
        deadline: "2027-02-07",
        hoursPerWeek: 28,
        subjects: ["Engineering Math", "Digital Logic", "OS", "DBMS", "Networks"],
        phases: [
          { name: "learn", until: "2026-11-30" },
          { name: "questions", until: "2027-02-07" },
        ],
      },
      { type: "add_goal", name: "DSA", priority: 3, hoursPerWeek: 7 },
      { type: "add_goal", name: "Research work", priority: 3, hoursPerWeek: 6 },
      { type: "add_goal", name: "Final year project", priority: 4, hoursPerWeek: 10 },
    ];
    const result = applyOps(ops);
    expect(result.mutated).toBe(true);
    const summary = replan();
    expect(summary.created).toBeGreaterThan(500); // months of daily blocks

    const snapshot = buildStateSnapshot();
    expect(snapshot).toContain("GATE prep");
    expect(snapshot).toContain("deadline 2027-02-07");
  });

  it("scenario 2: birthday event re-flows today without touching most of the plan", () => {
    const before = getAllBlocks().length;
    const today = new Date();
    const at = (h: number, m: number) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).toISOString();

    applyOps([
      {
        type: "add_fixed_events",
        title: "GF's birthday",
        events: [{ start: at(17, 30), end: at(21, 30) }],
      },
    ]);
    const summary = replan();
    // Only a handful of blocks should churn, not the whole plan.
    expect(summary.removed).toBeLessThan(30);
    expect(summary.kept).toBeGreaterThan(before - 30);

    const blocks = getAllBlocks();
    const evStart = at(17, 30);
    const evEnd = at(21, 30);
    for (const b of blocks) {
      const overlapsBirthday = b.start < evEnd && b.end > evStart;
      expect(overlapsBirthday).toBe(false);
    }
  });

  it("scenario 3: exam dates 13:00-15:00 are kept free", () => {
    const d1 = new Date();
    d1.setDate(d1.getDate() + 5);
    const d2 = new Date();
    d2.setDate(d2.getDate() + 8);
    const iso = (d: Date, h: number) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0).toISOString();

    applyOps([
      {
        type: "add_fixed_events",
        title: "Semester exam",
        events: [
          { start: iso(d1, 13), end: iso(d1, 15) },
          { start: iso(d2, 13), end: iso(d2, 15) },
        ],
      },
    ]);
    replan();

    for (const d of [d1, d2]) {
      const s = iso(d, 13);
      const e = iso(d, 15);
      for (const b of getAllBlocks()) {
        expect(b.start < e && b.end > s).toBe(false);
      }
    }
  });
});
