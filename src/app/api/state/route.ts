import { NextResponse } from "next/server";
import { getActiveGoals, getAllBlocks, getFixedEvents } from "@/lib/plan";
import { isConnected } from "@/lib/google";
import { activeProvider } from "@/lib/llm";

export async function GET() {
  return NextResponse.json({
    goals: getActiveGoals(),
    blocks: getAllBlocks(),
    fixedEvents: getFixedEvents(),
    googleConnected: isConnected(),
    llmProvider: activeProvider(), // "gemini" | "claude-code" | null
  });
}
