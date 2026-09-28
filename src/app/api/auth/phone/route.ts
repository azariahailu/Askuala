import { NextResponse } from "next/server";
import { cookieSecureFromRequest, getUserById, setSession } from "@/lib/auth";
import { requestOrigin } from "@/lib/google";
import { readPhonePass } from "@/lib/phone-link";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const token = new URL(req.url).searchParams.get("t") || "";
  const userId = readPhonePass(token);
  if (!userId) {
    return NextResponse.redirect(new URL("/login?google=phone", origin));
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.redirect(new URL("/login?google=phone", origin));
  }
  await setSession(user, { secure: cookieSecureFromRequest(req) });
  return NextResponse.redirect(new URL("/home", origin));
}
