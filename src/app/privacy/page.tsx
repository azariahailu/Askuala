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
          {APP_NAME} keeps your courses, calendar, notes, and chat on your own login. Classmates do not see your planner.
        </p>
        <p>
          Google sign in can connect your Calendar and Drive. Study guides and voice notes you choose to keep in Drive go to an Askuala folder in <strong>your</strong> Drive. {ASSISTANT_NAME} uses the Gemini key you add in Settings: it stays on your account.
        </p>
        <p>
          Email briefs go to the address you signed in with. You can sign out anytime. Questions: buddy.askuala@gmail.com.
        </p>
        <Link href="/" className="text-gold-2 underline">
          Back
        </Link>
      </main>
    </div>
  );
}
