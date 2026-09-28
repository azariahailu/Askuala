import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { TourVideo } from "@/components/TourVideo";

export default function TourPage() {
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
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Tour</h1>
        <p className="text-sm text-muted">
          Autoplaying walkthrough of sign-in, Gemini, Google Calendar, courses, Home, notes, Buddy, and installing the app (logo as the icon). Also at the top of the How to use chat after you sign in.
        </p>
        <TourVideo />
        <Link href="/login" className="inline-block rounded-lg bg-gold px-4 py-2 text-on-gold">
          Sign in
        </Link>
      </main>
    </div>
  );
}
