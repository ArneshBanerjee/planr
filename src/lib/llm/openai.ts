import OpenAI from "openai";
import { llmResponseSchema, type LlmResponse } from "./ops";
import {
  buildTurnContext,
  extractJsonObject,
  JSON_OUTPUT_INSTRUCTIONS,
  LlmRateLimitError,
  SYSTEM_PROMPT,
  type ChatTurn,
} from "./shared";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export async function parseWithOpenAI(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
  apiKey: string,
  model?: string,
): Promise<LlmResponse> {
  const client = new OpenAI({ apiKey });

  try {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${JSON_OUTPUT_INSTRUCTIONS}` },
        ...history.slice(-12).map((t) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        })),
        { role: "user", content: buildTurnContext(userMessage, stateSnapshot) },
      ],
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Empty response from OpenAI");
    return llmResponseSchema.parse(extractJsonObject(text));
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      throw new LlmRateLimitError(
        "OpenAI rate limit hit — wait a bit and send that again.",
      );
    }
    if (err instanceof OpenAI.AuthenticationError) {
      throw new Error("OpenAI API key rejected — check it in Settings (⚙️).");
    }
    throw err;
  }
}
