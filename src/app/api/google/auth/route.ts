import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google";

export async function GET() {
  const url = getAuthUrl();
  if (!url) {
    return NextResponse.json(
      { error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first." },
      { status: 503 },
    );
  }
  return NextResponse.redirect(url);
}
