export interface GoalSpec {
  id: number;
  name: string;
  color: string;
  priority: number; // 1..5
  deadline: string | null; // ISO date
  hoursPerWeek: number;
  phases: { name: string; until: string }[] | null;
  subjects: string[] | null;
}

export interface ConstraintsSpec {
  sleepTargetMinutes: number;
  sleepFloorMinutes: number;
  sleepStart: string; // HH:mm
  dayStart: string; // HH:mm
  dayEnd: string; // HH:mm
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface FixedEventSpec extends Interval {
  id: number;
  title: string;
}

export interface ExistingBlock extends Interval {
  id: number;
  goalId: number;
  title: string;
  subject: string | null;
  status: "planned" | "done" | "skipped";
  locked: boolean;
  googleEventId: string | null;
}

export interface PlannedBlock {
  goalId: number;
  title: string;
  subject: string | null;
  start: Date;
  end: Date;
}

export interface SchedulerInput {
  goals: GoalSpec[];
  constraints: ConstraintsSpec;
  fixedEvents: FixedEventSpec[];
  existingBlocks: ExistingBlock[];
  now: Date;
  horizonDays?: number; // default derived from latest deadline, capped
}

export interface BlockDiff {
  keep: ExistingBlock[]; // untouched (locked/done/past or identical match)
  create: PlannedBlock[];
  remove: ExistingBlock[]; // future planned blocks no longer in the plan
}
