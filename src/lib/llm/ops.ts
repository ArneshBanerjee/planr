import { z } from "zod";

// Flat op shape (Gemini's responseSchema handles flat objects with an enum
// discriminator much more reliably than nested unions). Zod re-validates and
// the per-type field requirements are enforced in applyOps.
export const opSchema = z.object({
  type: z.enum([
    "add_goal",
    "update_goal",
    "remove_goal",
    "set_constraints",
    "add_fixed_events",
    "remove_fixed_events",
    "mark_blocks",
    "replan",
  ]),
  // goal ops
  name: z.string().optional(),
  newName: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  deadline: z.string().nullable().optional(), // YYYY-MM-DD
  hoursPerWeek: z.number().min(1).max(80).optional(),
  subjects: z.array(z.string()).optional(),
  phases: z
    .array(z.object({ name: z.string(), until: z.string() }))
    .optional(),
  color: z.string().optional(),
  // constraint ops (minutes / HH:mm)
  sleepTargetMinutes: z.number().int().min(240).max(720).optional(),
  sleepFloorMinutes: z.number().int().min(240).max(720).optional(),
  sleepStart: z.string().optional(),
  dayStart: z.string().optional(),
  dayEnd: z.string().optional(),
  // fixed event ops
  title: z.string().optional(),
  events: z
    .array(z.object({ start: z.string(), end: z.string() })) // ISO datetimes
    .optional(),
  titleMatch: z.string().optional(),
  // mark_blocks
  date: z.string().optional(), // YYYY-MM-DD
  status: z.enum(["done", "skipped", "planned"]).optional(),
});

export type Op = z.infer<typeof opSchema>;

export const llmResponseSchema = z.object({
  reply: z.string(),
  ops: z.array(opSchema),
});

export type LlmResponse = z.infer<typeof llmResponseSchema>;
