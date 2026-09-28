import { fail, mutate } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { writeGlobalSmtp } from "@/lib/mail-account";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    return await mutate(async (state) => {
      if (body.notification) {
        const rest = { ...body.notification };
        delete rest.emailAddress;
        state.settings.notification = { ...state.settings.notification, ...rest };
      }
      const me = await getSessionUser();
      if (me?.email) state.settings.notification.emailAddress = me.email;
      if (body.google) {
        if (body.google.clientId != null) state.settings.google.clientId = body.google.clientId;
        if (body.google.clientSecret != null) state.settings.google.clientSecret = body.google.clientSecret;
      }
      if (body.smtp) {
        const me = await getSessionUser();
        if (!isAdminEmail(me?.email)) throw new Error("Only the admin account can change SMTP.");
        const prevPass = state.settings.smtp.pass;
        state.settings.smtp = { ...state.settings.smtp, ...body.smtp };
        if (typeof body.smtp.user === "string") state.settings.smtp.user = body.smtp.user.trim();
        if (typeof body.smtp.host === "string") state.settings.smtp.host = body.smtp.host.trim();
        if (typeof body.smtp.pass === "string" && body.smtp.pass) {
          state.settings.smtp.pass = body.smtp.pass.replace(/\s+/g, "");
        } else {
          state.settings.smtp.pass = prevPass;
        }
        await writeGlobalSmtp(state.settings.smtp);
      }
      if (typeof body.geminiKey === "string" && body.geminiKey.trim()) state.settings.geminiKey = body.geminiKey.trim();
      if (body.schoolCalHintDone === true) state.settings.google.schoolCalHintDone = true;
      if (body.openaiKey != null) state.settings.openaiKey = body.openaiKey;
      if (typeof body.deepseekKey === "string" && body.deepseekKey.trim()) state.settings.deepseekKey = body.deepseekKey.trim();
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}
