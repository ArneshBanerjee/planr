import { NextResponse } from "next/server";
import {
  connectedEmail,
  disconnect,
  isConfigured,
  isConnected,
  setCredentials,
} from "@/lib/google";

export async function GET() {
  return NextResponse.json({
    configured: isConfigured(),
    connected: isConnected(),
    email: connectedEmail(),
  });
}

// POST { clientId, clientSecret } — save OAuth client credentials
// POST { disconnect: true }      — sign out of Google
export async function POST(req: Request) {
  const body = (await req.json()) as {
    clientId?: string;
    clientSecret?: string;
    disconnect?: boolean;
  };

  if (body.disconnect) {
    disconnect();
  } else if (body.clientId !== undefined || body.clientSecret !== undefined) {
    setCredentials(body.clientId ?? "", body.clientSecret ?? "");
  }

  return NextResponse.json({
    configured: isConfigured(),
    connected: isConnected(),
    email: connectedEmail(),
  });
}
