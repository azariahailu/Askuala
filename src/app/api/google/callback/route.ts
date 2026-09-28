import { NextResponse } from "next/server";
import { cookieSecureFromRequest, getSessionUser, loginOrLinkGoogle, setSession } from "@/lib/auth";
import { decodeOAuthState, exchangeCode, oauthOrigin, requestOrigin, syncGoogle } from "@/lib/google";
import { ensureAskualaDrive } from "@/lib/google-drive";
import { updateState } from "@/lib/store";
import { afterLogin } from "@/lib/login-mail";

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
    if (googleError) throw new Error(googleError.replace(/\+/g, " "));
    if (!code) {
      throw new Error(googleError || "Google sign-in was cancelled or blocked.");
    }
    const intent = decodeOAuthState(rawState);

    if (intent.intent === "login" && !sessionUser) {
      const profile = await exchangeCode(code, undefined, oauth);
      const user = await loginOrLinkGoogle(profile);
      await setSession(user, { secure: cookieSecureFromRequest(req) });
      await updateState(user.id, async (state) => {
        state.settings.google.accessToken = profile.tokens.access_token || "";
        state.settings.google.refreshToken = profile.tokens.refresh_token || state.settings.google.refreshToken;
        state.settings.google.expiryDate = profile.tokens.expiry_date || 0;
        state.settings.google.connectedEmail = profile.email;
        await ensureAskualaDrive(state).catch(() => undefined);
        await syncGoogle(state);
      });
      void afterLogin(user);
      return NextResponse.redirect(new URL("/home?google=connected", origin));
    }

    const user = sessionUser;
    if (!user) return NextResponse.redirect(new URL("/login", origin));
    await updateState(user.id, async (state) => {
      await exchangeCode(code, state, oauth);
      await ensureAskualaDrive(state).catch(() => undefined);
      await syncGoogle(state);
    });
    return NextResponse.redirect(new URL("/calendar?google=connected", origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google connect failed";
    return NextResponse.redirect(new URL(`${failPath}?google=error&message=${encodeURIComponent(message)}`, origin));
  }
}
