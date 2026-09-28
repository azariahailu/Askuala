import { nowIso } from "./ids";
import { sendAdminNewUserEmail, sendLoginEmail } from "./notify";
import { updateState } from "./store";
import type { AppUser } from "./types";

const LOGIN_MAIL_MS = 12 * 60 * 60 * 1000;

export async function afterSignup(user: AppUser, method: "password" | "google") {
  try {
    await sendAdminNewUserEmail({
      name: user.name,
      email: user.email,
      id: user.id,
      createdAt: user.createdAt,
      method,
    });
  } catch (e) {
    console.error("afterSignup mail", e);
  }
}

export async function afterLogin(user: AppUser) {
  try {
    await updateState(user.id, async (state) => {
      state.settings.notification.emailAddress = user.email;
      const last = state.settings.notification.lastLoginMailAt;
      const recent = last && Date.now() - new Date(last).getTime() < LOGIN_MAIL_MS;
      if (recent) return;
      const sent = await sendLoginEmail(user.email, user.name);
      if (sent) state.settings.notification.lastLoginMailAt = nowIso();
    });
  } catch (e) {
    console.error("afterLogin mail", e);
  }
}
