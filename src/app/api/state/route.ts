import { NextResponse } from "next/server";
import { getActiveGoals, getAllBlocks, getFixedEvents } from "@/lib/plan";
import { connectedEmail, isConfigured, isConnected } from "@/lib/google";
import { chosenProvider, providerReady } from "@/lib/llm";

export async function GET() {
  const provider = chosenProvider();
  return NextResponse.json({
    goals: getActiveGoals(),
    blocks: getAllBlocks(),
    fixedEvents: getFixedEvents(),
    googleConnected: isConnected(),
    googleConfigured: isConfigured(),
    googleEmail: connectedEmail(),
    llmProvider: provider,
    llmReady: providerReady(provider),
  });
}
