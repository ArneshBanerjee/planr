import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { llmResponseSchema, type LlmResponse } from "./ops";

export class LlmRateLimitError extends Error {}
export class LlmNotConfiguredError extends Error {}

// Gemini-side schema mirroring src/lib/llm/ops.ts (flat op objects).
const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        "Short friendly reply to the user summarizing what you understood and changed.",
    },
    ops: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [
              "add_goal",
              "update_goal",
              "remove_goal",
              "set_constraints",
              "add_fixed_events",
              "remove_fixed_events",
              "mark_blocks",
              "replan",
            ],
          },
          name: { type: Type.STRING, nullable: true },
          newName: { type: Type.STRING, nullable: true },
          priority: { type: Type.INTEGER, nullable: true },
          deadline: { type: Type.STRING, nullable: true },
          hoursPerWeek: { type: Type.NUMBER, nullable: true },
          subjects: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
          phases: {
            type: Type.ARRAY,
            nullable: true,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                until: { type: Type.STRING },
              },
              required: ["name", "until"],
            },
          },
          color: { type: Type.STRING, nullable: true },
          sleepTargetMinutes: { type: Type.INTEGER, nullable: true },
          sleepFloorMinutes: { type: Type.INTEGER, nullable: true },
          sleepStart: { type: Type.STRING, nullable: true },
          dayStart: { type: Type.STRING, nullable: true },
          dayEnd: { type: Type.STRING, nullable: true },
          title: { type: Type.STRING, nullable: true },
          events: {
            type: Type.ARRAY,
            nullable: true,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.STRING },
                end: { type: Type.STRING },
              },
              required: ["start", "end"],
            },
          },
          titleMatch: { type: Type.STRING, nullable: true },
          date: { type: Type.STRING, nullable: true },
          status: { type: Type.STRING, nullable: true },
        },
        required: ["type"],
      },
    },
  },
  required: ["reply", "ops"],
};

const SYSTEM_PROMPT = `You are the planning brain of "Planr", a personal time-blocking calendar app. The user tells you in natural language about their goals (exam prep, projects, study targets), constraints (sleep, waking hours) and life events (birthdays, exams, appointments). You translate each message into structured operations; a deterministic scheduler then places actual time blocks on the calendar — you never place blocks yourself.

Rules:
- Emit only ops needed for THIS message. The current state snapshot tells you what already exists — update rather than duplicate.
- Goals: things needing recurring time (GATE prep, DSA, research, final-year project). Estimate hoursPerWeek from the user's ambition and deadline; priority 1-5 (5 = most critical). For exam prep with a "learn first, then practice questions" arc, emit phases (e.g. learn until ~60-70% of the runway, then questions/revision until the exam date). For multi-subject exams like GATE, include a subjects list (use standard syllabus subjects for the user's stream if they don't enumerate them; ask in your reply if the stream is unclear but still make a sensible default).
- Fixed events: one-off or dated commitments (birthday dinner 17:30-21:30, exams 13:00-15:00 on listed dates, classes). Use add_fixed_events with full ISO datetimes in the user's timezone. "3-4 hrs with her from 5:30" => 17:30 to ~21:30 today unless another date is implied.
- Sleep/day-shape statements ("7-8h sleep, can drop to 6 on heavy days", "I wake at 9") => set_constraints (sleepTargetMinutes = midpoint of range, sleepFloorMinutes = the floor).
- Dates: resolve all relative dates ("today", "first week of February 2027", "next Tuesday") against the current datetime given below. Never emit a relative date.
- If the user is just chatting or asking a question, return ops: [] and answer in reply.
- reply: 1-3 sentences, warm and concrete, telling the user what you set up or changed. Mention anything you assumed (e.g. estimated hours, default subjects) so they can correct you.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function parseMessage(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
): Promise<LlmResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LlmNotConfiguredError(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and put it in .env.local",
    );
  }
  const ai = new GoogleGenAI({ apiKey });
  const tz = process.env.PLANR_TIMEZONE || "Asia/Kolkata";
  const nowStr = new Date().toLocaleString("en-IN", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  });

  const contents = [
    ...history.slice(-12).map((t) => ({
      role: t.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: t.content }],
    })),
    {
      role: "user" as const,
      parts: [
        {
          text: `Current datetime: ${nowStr} (${tz})\n\nCurrent state:\n${stateSnapshot}\n\nUser message:\n${userMessage}`,
        },
      ],
    },
  ];

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema,
        },
      });
      const text = res.text;
      if (!text) throw new Error("Empty response from Gemini");
      return llmResponseSchema.parse(JSON.parse(text));
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        throw new LlmRateLimitError(
          "Gemini free-tier rate limit hit — wait ~30 seconds and send that again.",
        );
      }
      // Model unavailable (404) → try the fallback model; other errors rethrow.
      if (!/404|not found/i.test(msg)) throw err;
    }
  }
  throw lastErr;
}
