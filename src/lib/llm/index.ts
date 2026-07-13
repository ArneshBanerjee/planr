import type { LlmResponse } from "./ops";
import { getSetting } from "../settings";
import { claudeCodeAvailable, parseWithClaudeCode } from "./claudeCode";
import { DEFAULT_ANTHROPIC_MODEL, parseWithAnthropic } from "./anthropic";
import { DEFAULT_GEMINI_MODEL, parseWithGemini } from "./gemini";
import { DEFAULT_OPENAI_MODEL, parseWithOpenAI } from "./openai";
import {
  LlmNotConfiguredError,
  LlmRateLimitError,
  type ChatTurn,
} from "./shared";

export { LlmNotConfiguredError, LlmRateLimitError };
export type { ChatTurn };

export const LLM_PROVIDERS = ["openai", "gemini", "anthropic", "claude-code"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const CLAUDE_CODE_MODELS = ["haiku", "sonnet", "opus"] as const;
export type ClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number];

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: DEFAULT_OPENAI_MODEL,
  gemini: DEFAULT_GEMINI_MODEL,
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  "claude-code": "sonnet",
};

const ENV_KEYS: Record<Exclude<LlmProvider, "claude-code">, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

/**
 * The user picks a provider explicitly (Settings UI → DB, or LLM_PROVIDER env).
 * There is deliberately no auto-default — until a choice is made the app
 * prompts for setup instead of silently spending anyone's quota.
 */
export function chosenProvider(): LlmProvider | null {
  const stored = getSetting("llm_provider") ?? process.env.LLM_PROVIDER;
  return LLM_PROVIDERS.includes(stored as LlmProvider) ? (stored as LlmProvider) : null;
}

export function apiKeyFor(provider: LlmProvider): string | null {
  if (provider === "claude-code") return null;
  return getSetting(`${provider}_api_key`) ?? ENV_KEYS[provider] ?? null;
}

export function modelFor(provider: LlmProvider): string {
  return getSetting(`llm_model_${provider}`) ?? DEFAULT_MODELS[provider];
}

/** Is the chosen provider actually usable right now? */
export function providerReady(provider: LlmProvider | null): boolean {
  if (provider === null) return false;
  if (provider === "claude-code") return claudeCodeAvailable();
  return !!apiKeyFor(provider);
}

export function providerStatus() {
  const provider = chosenProvider();
  return {
    provider,
    ready: providerReady(provider),
    claudeCodeAvailable: claudeCodeAvailable(),
    keysSet: {
      openai: !!apiKeyFor("openai"),
      gemini: !!apiKeyFor("gemini"),
      anthropic: !!apiKeyFor("anthropic"),
    },
    models: {
      openai: modelFor("openai"),
      gemini: modelFor("gemini"),
      anthropic: modelFor("anthropic"),
      "claude-code": modelFor("claude-code"),
    },
    defaults: DEFAULT_MODELS,
  };
}

export async function parseMessage(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
  opts?: { model?: ClaudeCodeModel },
): Promise<LlmResponse> {
  const provider = chosenProvider();
  if (provider === null) {
    throw new LlmNotConfiguredError(
      "No AI provider selected yet — open Settings (⚙️, top right) and pick ChatGPT, Gemini, Claude API, or Claude Code.",
    );
  }

  if (provider === "claude-code") {
    if (!claudeCodeAvailable()) {
      throw new LlmNotConfiguredError(
        "Claude Code CLI not found on this machine — install it, or pick an API provider in Settings (⚙️).",
      );
    }
    return parseWithClaudeCode(
      history,
      userMessage,
      stateSnapshot,
      opts?.model ?? modelFor("claude-code"),
    );
  }

  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    const names = { openai: "OpenAI", gemini: "Gemini", anthropic: "Claude API" };
    throw new LlmNotConfiguredError(
      `${names[provider]} is selected but no API key is saved — add one in Settings (⚙️).`,
    );
  }

  const model = modelFor(provider);
  switch (provider) {
    case "openai":
      return parseWithOpenAI(history, userMessage, stateSnapshot, apiKey, model);
    case "gemini":
      return parseWithGemini(history, userMessage, stateSnapshot, apiKey, model);
    case "anthropic":
      return parseWithAnthropic(history, userMessage, stateSnapshot, apiKey, model);
  }
}
