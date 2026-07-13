import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blocks } from "@/lib/db/schema";
import { replan } from "@/lib/plan";
import { syncToGoogle } from "@/lib/google";

// PATCH /api/blocks/:id — mark done/skipped, lock, or move (moving locks it).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    status?: "planned" | "done" | "skipped";
    locked?: boolean;
    start?: string;
    end?: string;
  };

  const block = db.select().from(blocks).where(eq(blocks.id, Number(id))).get();
  if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const moved = body.start !== undefined || body.end !== undefined;
  db.update(blocks)
    .set({
      status: body.status ?? block.status,
      // A user-moved block is pinned so the scheduler won't move it back.
      locked: body.locked ?? (moved ? true : block.locked),
      start: body.start ?? block.start,
      end: body.end ?? block.end,
    })
    .where(eq(blocks.id, Number(id)))
    .run();

  // Skipping or moving frees/occupies time — re-flow the rest of the plan.
  if (moved || body.status === "skipped") {
    replan();
    try {
      await syncToGoogle();
    } catch (err) {
      console.error("Google sync failed:", err);
    }
  }
  return NextResponse.json({ ok: true });
}
