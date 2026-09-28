import { NextResponse } from "next/server";
import { fail, mutate, withUserState } from "@/lib/api";
import { authUrl, clearGoogleSession, GOOGLE_RECONNECT_MSG, googleConfigured, isInvalidGrant, oauthOrigin, syncGoogle } from "@/lib/google";

export async function GET(req: Request) {
  try {
    const origin = oauthOrigin(req);
    const { user, state } = await withUserState();
    if (!googleConfigured(state)) {
      return NextResponse.json({
        reason: "setup",
        message: "Google Calendar isn’t available.",
      });
    }
    if (state.settings.google.refreshToken || (state.settings.google.accessToken && (!state.settings.google.expiryDate || state.settings.google.expiryDate > Date.now() + 30_000))) {
      return NextResponse.json({ connected: true, email: state.settings.google.connectedEmail });
    }
    const urlAuth = authUrl({ state, origin, intent: { intent: "connect", userId: user.id } });
    return NextResponse.json({ authUrl: urlAuth, reason: "auth" });
  } catch (err) {
    return fail(err);
  }
}

export async function POST() {
  try {
    return await mutate(async (state) => {
      try {
        const result = await syncGoogle(state);
        if (result && "ok" in result && result.ok) state.settings.google.schoolCalHintDone = true;
        return result;
      } catch (err) {
        if (isInvalidGrant(err)) {
          clearGoogleSession(state);
          return { ok: false, reason: "auth" as const, reconnect: true, message: GOOGLE_RECONNECT_MSG };
        }
        throw err;
      }
    });
  } catch (err) {
    if (isInvalidGrant(err)) {
      return NextResponse.json({ extra: { ok: false, reason: "auth", reconnect: true, message: GOOGLE_RECONNECT_MSG } });
    }
    return fail(err);
  }
}
