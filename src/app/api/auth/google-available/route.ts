import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/google";
import { ensureGoogleAppLoaded } from "@/lib/google-app";

export async function GET() {
  await ensureGoogleAppLoaded();
  return NextResponse.json({ google: googleConfigured() });
}
