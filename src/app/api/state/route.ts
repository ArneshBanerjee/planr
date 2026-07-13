import { NextResponse } from "next/server";
import { getActiveGoals, getAllBlocks, getFixedEvents } from "@/lib/plan";
import { isConnected } from "@/lib/google";
import { chosenProvider, providerReady } from "@/lib/llm";

export async function GET() {
  const provider = chosenProvider();
  return NextResponse.json({
    goals: getActiveGoals(),
    blocks: getAllBlocks(),
    fixedEvents: getFixedEvents(),
    googleConnected: isConnected(),
    llmProvider: provider,
    llmReady: providerReady(provider),
  });
}
