import { NextResponse } from "next/server";
import { handleCallback, syncToGoogle } from "@/lib/google";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });
  }
  await handleCallback(code);
  try {
    await syncToGoogle();
  } catch (err) {
    console.error("Initial Google sync failed:", err);
  }
  return NextResponse.redirect(new URL("/", req.url));
}
