import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { llmResponseSchema, type LlmResponse } from "./ops";
import {
  buildTurnContext,
  LlmRateLimitError,
  SYSTEM_PROMPT,
  type ChatTurn,
} from "./shared";

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

export async function parseWithGemini(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
): Promise<LlmResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents = [
    ...history.slice(-12).map((t) => ({
      role: t.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: t.content }],
    })),
    {
      role: "user" as const,
      parts: [{ text: buildTurnContext(userMessage, stateSnapshot) }],
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
