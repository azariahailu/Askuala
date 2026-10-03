import { NextResponse } from "next/server";
import { persistReadJson } from "@/lib/persist";
import { blobSuspendedMessage, isBlobSuspended } from "@/lib/blob-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await persistReadJson("users.json");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = isBlobSuspended(err) || /Hobby plan hit its monthly cap|file store \(Vercel Blob\) is paused/i.test(err instanceof Error ? err.message : "")
      ? blobSuspendedMessage()
      : err instanceof Error
        ? err.message
        : "Storage unavailable";
    return NextResponse.json({ ok: false, error }, { status: 503 });
  }
}
