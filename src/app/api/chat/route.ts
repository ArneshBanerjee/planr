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
import { extractDocumentText } from "@/lib/extractDoc";

export async function POST(req: Request) {
  let message: string | undefined;
  let model: string | undefined;
  let docName: string | null = null;
  let docText: string | null = null;

  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const fd = await req.formData();
    message = (fd.get("message") as string | null) ?? undefined;
    model = (fd.get("model") as string | null) ?? undefined;
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      docName = file.name;
      try {
        docText = await extractDocumentText(file);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Couldn't read that file." },
          { status: 400 },
        );
      }
    }
  } else {
    ({ message, model } = (await req.json()) as { message?: string; model?: string });
  }

  if (!message?.trim() && !docText) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  message = message?.trim() || "Here's a document — use it to plan.";
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

  // History/DB stores a compact marker, not the full document text.
  db.insert(messages)
    .values({ role: "user", content: docName ? `${message}\n📎 ${docName}` : message })
    .run();

  // The LLM sees the extracted document inline with this turn only.
  const llmMessage = docText
    ? `${message}\n\n--- Attached document: "${docName}" ---\n${docText}\n--- end of document ---`
    : message;

  try {
    const parsed = await parseMessage(history, llmMessage, buildStateSnapshot(), {
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

    // Honest feedback: the LLM's reply is written before the scheduler runs,
    // so verify its claims against what actually happened.
    const notes = [...result.applied, ...result.skipped.map((s) => `⚠️ ${s}`)];
    let reply = parsed.reply;
    if (result.mutated && summary && summary.created === 0 && summary.removed === 0) {
      reply +=
        "\n\n⚠️ Heads-up: despite the above, the scheduler didn't actually place or move any blocks. Usual causes: a deadline that's already passed, or a day window/sleep setup that leaves no free time. Tell me what looks wrong and I'll fix it.";
    } else if (!result.mutated && parsed.ops.length > 0) {
      reply +=
        "\n\n⚠️ Heads-up: none of those changes could be applied — see the notes below.";
    }

    db.insert(messages)
      .values({
        role: "assistant",
        content: reply,
        opsApplied: parsed.ops,
      })
      .run();

    return NextResponse.json({
      reply,
      applied: notes,
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
