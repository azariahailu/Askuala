import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { issuePhonePass, phoneLinkStatus, startPhoneLink, stopPhoneLink } from "@/lib/phone-link";

export const runtime = "nodejs";

export async function GET() {
  // The status carries a one-click login token, so only the signed-in student may read it.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ url: null });
  return NextResponse.json(phoneLinkStatus());
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in on this computer first, then create a phone link." }, { status: 401 });
    }
    await startPhoneLink(req);
    const url = issuePhonePass(user.id);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create a phone link." }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in on this computer first." }, { status: 401 });
  stopPhoneLink();
  return NextResponse.json({ url: null });
}
