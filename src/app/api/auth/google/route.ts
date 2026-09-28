import { NextResponse } from "next/server";
import { authUrl, googleConfigured, isPhoneTunnel, oauthOrigin, requestOrigin } from "@/lib/google";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  if (isPhoneTunnel(req)) {
    return NextResponse.redirect(new URL("/login?google=phone", origin));
  }
  const intentParam = new URL(req.url).searchParams.get("intent") || "login";
  const intent = intentParam === "switch" ? "switch" : intentParam === "connect" ? "connect" : "login";
  if (!googleConfigured()) {
    const dest = intent === "login" ? "/login?google=unavailable" : "/calendar?google=unavailable";
    return NextResponse.redirect(new URL(dest, origin));
  }
  const user = await getSessionUser();
  const url = authUrl({
    origin: oauthOrigin(req),
    intent: { intent, userId: user?.id },
  });
  if (!url) return NextResponse.redirect(new URL("/login?google=unavailable", origin));
  return NextResponse.redirect(url);
}
