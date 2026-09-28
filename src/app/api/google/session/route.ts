import { NextResponse } from "next/server";
import { cookieSecureFromRequest, getSessionUser, loginOrLinkGoogle, setSession } from "@/lib/auth";
import { profileFromAccessToken, syncGoogle } from "@/lib/google";
import { updateState } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      accessToken?: string;
      expiresIn?: number;
      intent?: "login" | "connect" | "switch";
    };
    const accessToken = body.accessToken || "";
    if (!accessToken) {
      return NextResponse.json({ error: "Google did not return an access token." }, { status: 400 });
    }
    const profile = await profileFromAccessToken(accessToken);
    const expiryDate = Date.now() + Math.max(60, body.expiresIn || 3600) * 1000;
    const sessionUser = await getSessionUser();
    const intent = body.intent || (sessionUser ? "connect" : "login");

    async function save(userId: string) {
      await updateState(userId, async (state) => {
        state.settings.google.accessToken = accessToken;
        state.settings.google.expiryDate = expiryDate;
        state.settings.google.connectedEmail = profile.email;
        if (intent === "switch") state.settings.google.refreshToken = state.settings.google.refreshToken;
        await syncGoogle(state);
      });
    }

    if ((intent === "login" || !sessionUser) && !sessionUser) {
      const user = await loginOrLinkGoogle(profile);
      await setSession(user, { secure: cookieSecureFromRequest(req) });
      await save(user.id);
      return NextResponse.json({ ok: true, next: "/calendar?google=connected" });
    }

    if (!sessionUser) {
      return NextResponse.json({ error: "Log in first, then connect Google Calendar." }, { status: 401 });
    }
    await save(sessionUser.id);
    return NextResponse.json({ ok: true, next: "/calendar?google=connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google connect failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
