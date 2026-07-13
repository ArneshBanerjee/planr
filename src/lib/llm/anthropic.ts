import Anthropic from "@anthropic-ai/sdk";
import { llmResponseSchema, type LlmResponse } from "./ops";
import {
  buildTurnContext,
  extractJsonObject,
  JSON_OUTPUT_INSTRUCTIONS,
  LlmRateLimitError,
  SYSTEM_PROMPT,
  type ChatTurn,
} from "./shared";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

export async function parseWithAnthropic(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
  apiKey: string,
  model?: string,
): Promise<LlmResponse> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-12).map((t) => ({
      role: t.role,
      content: t.content,
    })),
    { role: "user" as const, content: buildTurnContext(userMessage, stateSnapshot) },
  ];

  try {
    const response = await client.messages.create({
      model: model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 8192,
      // No `thinking` param: works across the whole model range users may
      // type into the model override field (older models reject adaptive).
      system: `${SYSTEM_PROMPT}\n\n${JSON_OUTPUT_INSTRUCTIONS}`,
      messages,
    });
    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined this request — try rephrasing.");
    }
    const text = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    )?.text;
    if (!text) throw new Error("Empty response from Claude");
    return llmResponseSchema.parse(extractJsonObject(text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new LlmRateLimitError(
        "Claude API rate limit hit — wait a bit and send that again.",
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error("Claude API key rejected — check it in Settings (⚙️).");
    }
    throw err;
  }
}
