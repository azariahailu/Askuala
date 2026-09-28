import Link from "next/link";
import { APP_NAME, ASSISTANT_NAME } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <img src="/icon.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="brand font-semibold text-gold-2">{APP_NAME}</span>
        </Link>
        <Link href="/login" className="text-sm text-gold-2">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
        <h1 className="text-2xl font-semibold">Privacy</h1>
        <p>
          {APP_NAME} stores your planner (courses, events, notes, chat, settings) per login. On the hosted site that data lives in the host’s cloud database (not on someone else’s laptop). Files you upload are copied to <strong>your</strong> Google Drive under Askuala → Files → uploads or outputs, and voice under Voice recordings, when you connect Google with Drive access.
        </p>
        <p>
          Google sign-in uses Calendar and Drive (files you create in Askuala). {ASSISTANT_NAME} uses the Gemini API key you paste in Settings — that key stays on your account and is not a shared class quota. Digests go to the email you logged in with. The sending mailbox is configured only by the site admin.
        </p>
        <p>
          You stay signed in on this browser as long as the browser allows (about 400 days — Chrome will not keep a cookie forever). You can sign out anytime. The admin account can disable or delete student accounts. Do not put secrets in syllabi you upload if you do not want them in Drive or in chat history.
        </p>
        <p>
          Questions: {APP_NAME} host — buddy.askuala@gmail.com.
        </p>
        <Link href="/" className="text-gold-2 underline">
          Back
        </Link>
      </main>
    </div>
  );
}
