import { NextResponse } from "next/server";
import { fail, withUserState } from "@/lib/api";
import { sendEmail } from "@/lib/notify";
import { APP_NAME } from "@/lib/brand";

export async function POST() {
  try {
    const { user, state } = await withUserState();
    state.settings.notification.emailAddress = user.email;
    if (!state.settings.notification.emailEnabled) {
      return NextResponse.json({ error: "Turn on Send email, Save, then try again." }, { status: 400 });
    }
    const ok = await sendEmail(
      state,
      "Test email",
      `This is a test from ${APP_NAME}.\nTo (your login email): ${user.email}\n\nBriefs and the sign-in note use this same address.`,
    );
    if (!ok) {
      return NextResponse.json({ error: "SMTP is not set. On Vercel add SMTP_HOST/USER/PASS for buddy.askuala@gmail.com, or save SMTP in admin Settings." }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      message: `Sent a test to ${user.email}. Check inbox and spam.`,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/535|BadCredentials|Username and Password not accepted/i.test(raw)) {
      return NextResponse.json(
        {
          error:
            "Gmail rejected the sender login (535). Use the sender Gmail’s address as SMTP user, and a 16-character App Password: not the normal Gmail password. Google Account (that sender) → Security → 2-Step Verification ON → App passwords → Mail / Other → copy the password. Spaces in it are fine; we strip them. Then Save and send test again.",
        },
        { status: 400 },
      );
    }
    if (/550\s*5\.2\.1|Mailbox cannot be accessed/i.test(raw)) {
      return NextResponse.json(
        {
          error:
            "Microsoft blocked SMTP on that mailbox (550 5.2.1). School Outlook often cannot send this way. Use a Gmail or other mailbox you created as the sender, and keep your usual inbox in Notifications as the recipient.",
        },
        { status: 400 },
      );
    }
    return fail(err);
  }
}
