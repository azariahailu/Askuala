import { NextResponse } from "next/server";
import { tickAllMail } from "@/lib/mail-loop";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = req.headers.get("authorization") || "";
  const urlKey = new URL(req.url).searchParams.get("secret") || "";
  const ok = secret && (auth === `Bearer ${secret}` || urlKey === secret);
  if (!ok && process.env.VERCEL === "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await tickAllMail();
  return NextResponse.json({ ok: true });
}
