"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useBuddy } from "@/components/BuddyProvider";
import { AddCourseModal } from "@/components/AddCourseModal";
import { UpcomingPins } from "@/components/UpcomingPins";
import { WeeklyPsetBoard } from "@/components/WeeklyPsetBoard";
import { termsForAcademicYear } from "@/lib/terms";
import { useMounted } from "@/lib/use-mounted";
import { APP_NAME } from "@/lib/brand";

function isLongAway(at?: string) {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() >= 3 * 60 * 60 * 1000;
}

export default function DashboardPage() {
  const { data, ui } = useBuddy();
  const [open, setOpen] = useState(false);
  const mounted = useMounted();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{ui("home.welcome")}</h1>
          <p className="text-sm text-muted sm:text-base">{ui("home.tagline")}</p>
        </div>
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-on-gold">
          <Plus size={16} /> {ui("home.addCourse")}
        </button>
      </div>

      {mounted && data?.resume && isLongAway(data.lastActiveAt) && data.resume.lines.length > 0 && (
        <section className="rounded-2xl border border-gold/40 bg-urgent p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-2">{ui("home.away")}</h2>
          <p className="mt-1 text-sm text-muted">
            Last time you used {APP_NAME}
            {data.resume.at
              ? ` · stopped ${new Date(data.resume.at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : ""}
            {data.resume.path ? ` · ${data.resume.path}` : ""}. This is that snapshot, not a new session.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {data.resume.lines.slice(0, 10).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <UpcomingPins events={data?.events || []} courses={data?.courses || []} />
      <WeeklyPsetBoard events={data?.events || []} courses={data?.courses || []} />

      {[1, 2, 3, 4].map((year) => (
        <section key={year}>
          <h2 className="mb-3 text-xl font-medium">Year {year}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {termsForAcademicYear(year).map((t) => {
              const courses =
                data?.courses.filter((c) => c.academicYear === year && c.term === t.term && c.year === t.year) || [];
              return (
                <div key={t.label} className="rounded-xl border border-line bg-surface p-3">
                  <h3 className="text-sm text-muted">{t.label}</h3>
                  {courses.length === 0 && <p className="mt-2 text-sm text-muted">No courses</p>}
                  {courses.map((c) => (
                    <Link key={c.id} href={`/courses/${c.id}`} className="relative z-10 mt-2 block min-h-11 rounded-lg p-2 hover:bg-hover">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                      <span className="font-medium">{c.code}</span>
                      <div className="text-sm text-muted">{c.name}</div>
                      {c.dropped && <span className="text-xs text-red-400">Dropped</span>}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {open && <AddCourseModal onClose={() => setOpen(false)} />}
    </div>
  );
}
