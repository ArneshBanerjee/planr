import { NextResponse } from "next/server";
import { getActiveGoals, getAllBlocks, getFixedEvents } from "@/lib/plan";
import { isConnected } from "@/lib/google";

export async function GET() {
  return NextResponse.json({
    goals: getActiveGoals(),
    blocks: getAllBlocks(),
    fixedEvents: getFixedEvents(),
    googleConnected: isConnected(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
}
