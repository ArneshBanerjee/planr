import type { LlmResponse } from "./ops";
import { claudeCodeAvailable, parseWithClaudeCode } from "./claudeCode";
import { parseWithGemini } from "./gemini";
import {
  LlmNotConfiguredError,
  LlmRateLimitError,
  type ChatTurn,
} from "./shared";

export { LlmNotConfiguredError, LlmRateLimitError };
export type { ChatTurn };

export type LlmProvider = "gemini" | "claude-code";

/**
 * Provider selection:
 * 1. LLM_PROVIDER env var ("gemini" | "claude-code") if set
 * 2. Gemini if GEMINI_API_KEY is set
 * 3. Claude Code CLI if installed (uses your Claude subscription, no key)
 */
export function activeProvider(): LlmProvider | null {
  const forced = process.env.LLM_PROVIDER;
  if (forced === "gemini" || forced === "claude-code") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (claudeCodeAvailable()) return "claude-code";
  return null;
}

export const CLAUDE_CODE_MODELS = ["haiku", "sonnet", "opus"] as const;
export type ClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number];

export async function parseMessage(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
  opts?: { model?: ClaudeCodeModel },
): Promise<LlmResponse> {
  const provider = activeProvider();
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new LlmNotConfiguredError(
        "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey",
      );
    }
    return parseWithGemini(history, userMessage, stateSnapshot);
  }
  if (provider === "claude-code") {
    return parseWithClaudeCode(history, userMessage, stateSnapshot, opts?.model);
  }
  throw new LlmNotConfiguredError(
    "No LLM configured. Either install Claude Code (uses your subscription — no key needed) or set GEMINI_API_KEY in .env.local (free key: https://aistudio.google.com/apikey).",
  );
}
