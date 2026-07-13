import { spawn, spawnSync } from "node:child_process";
import { llmResponseSchema, type LlmResponse } from "./ops";
import {
  buildTurnContext,
  extractJsonObject,
  JSON_OUTPUT_INSTRUCTIONS,
  LlmRateLimitError,
  SYSTEM_PROMPT,
  type ChatTurn,
} from "./shared";

const TIMEOUT_MS = 120_000;

function claudeBinary(): string {
  return process.env.CLAUDE_CODE_PATH || "claude";
}

let available: boolean | null = null;
/** Is the Claude Code CLI installed and on PATH? Cached per server process. */
export function claudeCodeAvailable(): boolean {
  if (available === null) {
    try {
      available =
        spawnSync(claudeBinary(), ["--version"], { timeout: 15_000 }).status === 0;
    } catch {
      available = false;
    }
  }
  return available;
}

function runClaude(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBinary(), args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Claude Code timed out after 120s"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude exited with ${code}: ${err || out}`.slice(0, 500)));
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/**
 * Parse a chat turn using the local Claude Code CLI in headless mode
 * (`claude -p --output-format json`). Uses the user's existing Claude
 * subscription — no API key involved.
 */
export async function parseWithClaudeCode(
  history: ChatTurn[],
  userMessage: string,
  stateSnapshot: string,
  modelOverride?: string,
): Promise<LlmResponse> {
  const historyText =
    history.length === 0
      ? ""
      : "Recent conversation:\n" +
        history
          .slice(-12)
          .map((t) => `${t.role === "user" ? "User" : "Planr"}: ${t.content}`)
          .join("\n") +
        "\n\n";

  const prompt = [
    SYSTEM_PROMPT,
    JSON_OUTPUT_INSTRUCTIONS,
    historyText + buildTurnContext(userMessage, stateSnapshot),
  ].join("\n\n");

  const model = modelOverride || process.env.CLAUDE_CODE_MODEL || "sonnet";
  let raw: string;
  try {
    raw = await runClaude(
      ["-p", "--output-format", "json", "--model", model],
      prompt,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rate.?limit|overloaded|429|usage limit/i.test(msg)) {
      throw new LlmRateLimitError(
        "Claude Code hit a usage limit — wait a bit and send that again.",
      );
    }
    throw err;
  }

  // --output-format json wraps the answer: { type:"result", result:"...", is_error, ... }
  const envelope = JSON.parse(raw) as {
    result?: string;
    is_error?: boolean;
    subtype?: string;
  };
  if (envelope.is_error || typeof envelope.result !== "string") {
    throw new Error(`Claude Code returned an error result (${envelope.subtype ?? "unknown"})`);
  }
  return llmResponseSchema.parse(extractJsonObject(envelope.result));
}
