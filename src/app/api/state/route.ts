import { NextResponse } from "next/server";
import { fail, withUserState, clientJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, state } = await withUserState();
    return clientJson(user, state);
  } catch (err) {
    return fail(err);
  }
}

export async function POST() {
  return NextResponse.json({ ok: true, unlimited: true, credits: "none" });
}
