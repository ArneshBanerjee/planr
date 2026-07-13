import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import {
  CLAUDE_CODE_MODELS,
  LlmNotConfiguredError,
  LlmRateLimitError,
  parseMessage,
  type ChatTurn,
  type ClaudeCodeModel,
} from "@/lib/llm";
import { applyOps, buildStateSnapshot, replan } from "@/lib/plan";
import { syncToGoogle } from "@/lib/google";

export async function POST(req: Request) {
  const { message, model } = (await req.json()) as {
    message?: string;
    model?: string;
  };
  if (!message?.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  const claudeModel = CLAUDE_CODE_MODELS.includes(model as ClaudeCodeModel)
    ? (model as ClaudeCodeModel)
    : undefined;

  const history: ChatTurn[] = db
    .select()
    .from(messages)
    .orderBy(desc(messages.id))
    .limit(12)
    .all()
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));

  db.insert(messages).values({ role: "user", content: message }).run();

  try {
    const parsed = await parseMessage(history, message, buildStateSnapshot(), {
      model: claudeModel,
    });
    const result = applyOps(parsed.ops);

    let summary = null;
    if (result.mutated) {
      summary = replan();
      // Google sync is best-effort; a sync failure must not fail the chat.
      try {
        await syncToGoogle();
      } catch (err) {
        console.error("Google sync failed:", err);
      }
    }

    db.insert(messages)
      .values({
        role: "assistant",
        content: parsed.reply,
        opsApplied: parsed.ops,
      })
      .run();

    return NextResponse.json({
      reply: parsed.reply,
      applied: result.applied,
      summary,
    });
  } catch (err) {
    const status =
      err instanceof LlmRateLimitError ? 429 : err instanceof LlmNotConfiguredError ? 503 : 500;
    const msg =
      err instanceof LlmRateLimitError || err instanceof LlmNotConfiguredError
        ? err.message
        : "Something went wrong talking to the planner. Check the server logs.";
    console.error("chat error:", err);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET() {
  const all = db.select().from(messages).orderBy(messages.id).all();
  return NextResponse.json({ messages: all });
}
