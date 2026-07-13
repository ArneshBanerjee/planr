import { NextResponse } from "next/server";
import { LLM_PROVIDERS, providerStatus, type LlmProvider } from "@/lib/llm";
import { setSetting } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(providerStatus());
}

// POST { provider, apiKey?, model? }
// apiKey/model semantics: undefined = leave unchanged, "" = clear.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    provider?: string;
    apiKey?: string;
    model?: string;
  };

  if (!LLM_PROVIDERS.includes(body.provider as LlmProvider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  const provider = body.provider as LlmProvider;

  setSetting("llm_provider", provider);
  if (body.apiKey !== undefined && provider !== "claude-code") {
    setSetting(`${provider}_api_key`, body.apiKey.trim() || null);
  }
  if (body.model !== undefined) {
    setSetting(`llm_model_${provider}`, body.model.trim() || null);
  }

  return NextResponse.json(providerStatus());
}
