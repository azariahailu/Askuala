import { NextResponse } from "next/server";
import { cookieSecureFromRequest, getSessionUser, loginOrLinkGoogle, setSession } from "@/lib/auth";
import { afterLoginPath } from "@/lib/admin";
import { decodeOAuthState, exchangeCode, oauthOrigin, requestOrigin, syncGoogle } from "@/lib/google";
import { ensureGoogleAppLoaded } from "@/lib/google-app";
import { ensureAskualaDrive } from "@/lib/google-drive";
import { updateState } from "@/lib/store";
import { afterLogin, afterSignup } from "@/lib/login-mail";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const oauth = oauthOrigin(req);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state") || "";
  const googleError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const sessionUser = await getSessionUser();
  const failPath = sessionUser ? "/calendar" : "/login";
  try {
    await ensureGoogleAppLoaded();
    if (googleError) {
      const raw = googleError.replace(/\+/g, " ");
      if (/access_denied|cancelled|canceled/i.test(raw)) {
        throw new Error("Google cancelled or blocked this sign-in. Use email below, or try Google again. Calendar and Drive are connected later in Settings: not on this first click.");
      }
      throw new Error(raw);
    }
    if (!code) {
      throw new Error(
        "Google did not finish sign-in. Add https://askualastudy.vercel.app/api/google/callback as an Authorized redirect URI, or use email below.",
      );
    }
    const intent = decodeOAuthState(rawState);

    if (intent.intent === "login") {
      const profile = await exchangeCode(code, undefined, oauth);
      const { user, created } = await loginOrLinkGoogle(profile);
      await setSession(user, { secure: cookieSecureFromRequest(req) });
      if (created) void afterSignup(user, "google");
      void afterLogin(user);
      return NextResponse.redirect(new URL(afterLoginPath(user.email), origin));
    }

    const user = sessionUser;
    if (!user) return NextResponse.redirect(new URL("/login", origin));
    let syncNote = "";
    await updateState(user.id, async (state) => {
      await exchangeCode(code, state, oauth);
      await ensureAskualaDrive(state).catch(() => undefined);
      try {
        const result = await syncGoogle(state);
        if (result && "ok" in result && result.ok) state.settings.google.schoolCalHintDone = true;
        if (result && "message" in result && result.message) syncNote = String(result.message);
        if (result && "ok" in result && result.ok === false && "message" in result) {
          syncNote = String(result.message);
        }
      } catch (err) {
        syncNote = err instanceof Error ? err.message : "Google connected; first sync did not finish.";
      }
    });
    const cal = new URL("/calendar", origin);
    if (syncNote && /not been used|disabled|insufficient|Enable it/i.test(syncNote)) {
      cal.searchParams.set("google", "error");
      cal.searchParams.set("message", syncNote);
    } else {
      cal.searchParams.set("google", "connected");
      if (syncNote) cal.searchParams.set("message", syncNote);
    }
    return NextResponse.redirect(cal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google connect failed";
    if (/Hobby plan hit its monthly cap|file store \(Vercel Blob\) is paused|store has been suspended/i.test(message)) {
      return NextResponse.redirect(new URL("/login?google=blob", origin));
    }
    return NextResponse.redirect(new URL(`${failPath}?google=error&message=${encodeURIComponent(message)}`, origin));
  }
}
