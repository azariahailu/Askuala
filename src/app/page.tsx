import Link from "next/link";
import { APP_NAME, ASSISTANT_NAME } from "@/lib/brand";
import { TourVideo } from "@/components/TourVideo";

function PublicBar() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <Link href="/" className="flex items-center gap-2">
        <img src="/icon.png" alt="" className="h-9 w-9 rounded-lg" />
        <span className="brand text-lg font-semibold text-gold-2">{APP_NAME}</span>
      </Link>
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/tour" className="text-muted hover:text-ink">
          Tour
        </Link>
        <Link href="/privacy" className="text-muted hover:text-ink">
          Privacy
        </Link>
        <Link href="/login" className="rounded-lg bg-gold px-3 py-2 text-on-gold">
          Sign in
        </Link>
      </nav>
    </header>
  );
}

export default function MarketingPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <PublicBar />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-12">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <img src="/icon.png" alt={`${APP_NAME} logo`} className="h-20 w-20 rounded-2xl" />
          <div>
            <h1 className="brand text-4xl font-semibold text-gold-2">{APP_NAME}</h1>
            <p className="mt-2 text-lg text-muted">
              Your courses, calendar, notes, and {ASSISTANT_NAME} — an assistant that can read and edit your planner.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Works on phone, tablet, and computer. After you sign in, add this site as an app (Safari Share → Add to Home Screen, or Chrome → Install app). The {APP_NAME} logo is the icon.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="rounded-lg bg-gold px-5 py-3 font-medium text-on-gold">
            Get started
          </Link>
          <Link href="/tour" className="rounded-lg border border-line px-5 py-3">
            Watch the tour
          </Link>
          <Link href="/home" className="rounded-lg border border-line px-5 py-3">
            Open planner
          </Link>
        </div>
        <TourVideo variant="public" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Syllabus → calendar, including dated work and class readings",
            "Urgent 48 hours, majors in 2 weeks, work-by-week",
            "Your Gemini key, your Google Calendar and Drive",
            "One daily digest and one Sunday week-ahead email",
          ].map((item) => (
            <li key={item} className="rounded-xl border border-line bg-surface p-4 text-sm">
              {item}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
