import { NextResponse } from "next/server";
import { loginUser, registerUser, setSession, clearSession, getSessionUser, cookieSecureFromRequest } from "@/lib/auth";
import { afterLoginPath } from "@/lib/admin";
import { afterLogin, afterSignup } from "@/lib/login-mail";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action as string;
    if (action === "register") {
      const user = await registerUser(body.name || "", body.email || "", body.password || "");
      await setSession(user, { secure: cookieSecureFromRequest(req) });
      void afterSignup(user, "password");
      void afterLogin(user);
      return NextResponse.json({ user, next: afterLoginPath(user.email) });
    }
    if (action === "login") {
      const user = await loginUser(body.email || "", body.password || "");
      await setSession(user, { secure: cookieSecureFromRequest(req) });
      void afterLogin(user);
      return NextResponse.json({ user, next: afterLoginPath(user.email) });
    }
    if (action === "logout") {
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Auth failed" }, { status: 400 });
  }
}
