import { NextResponse } from "next/server";
import { fail, mutate, withUserState } from "@/lib/api";
import { backfillDrive } from "@/lib/google-drive";
import { authUrl, clearGoogleSession, GOOGLE_RECONNECT_MSG, googleConfigured, isInsufficientScope, isInvalidGrant, oauthOrigin, syncGoogle } from "@/lib/google";
import { ensureGoogleAppLoaded } from "@/lib/google-app";

export async function GET(req: Request) {
  try {
    await ensureGoogleAppLoaded();
    const origin = oauthOrigin(req);
    const { user, state } = await withUserState();
    if (!googleConfigured(state)) {
      return NextResponse.json({
        reason: "setup",
        message: "Google Calendar isn’t available.",
      });
    }
    if (state.settings.google.refreshToken || state.settings.google.accessToken) {
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
    return await mutate(async (state, userId) => {
      try {
        const result = await syncGoogle(state);
        if (result && "ok" in result && result.ok) {
          state.settings.google.schoolCalHintDone = true;
          try {
            await backfillDrive(state, userId, { limit: 3 });
          } catch {
            /* calendar sync still counts */
          }
        }
        return result;
      } catch (err) {
        if (isInvalidGrant(err) || isInsufficientScope(err)) {
          clearGoogleSession(state);
          return { ok: false, reason: "auth" as const, reconnect: true, message: "Allow Calendar and Drive on Google’s next screen, then sync again." };
        }
        throw err;
      }
    });
  } catch (err) {
    if (isInvalidGrant(err) || isInsufficientScope(err)) {
      return NextResponse.json({ extra: { ok: false, reason: "auth", reconnect: true, message: GOOGLE_RECONNECT_MSG } });
    }
    return fail(err);
  }
}
