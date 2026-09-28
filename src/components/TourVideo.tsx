"use client";

import { useEffect, useState } from "react";

const SCENES = [
  { t: "Askuala", d: "College planner: courses, calendar, notes, and Askuala Buddy." },
  { t: "Sign in", d: "Use your college Google or email. Mail goes to that same address — no extra inbox." },
  { t: "Gemini", d: "Paste your own Google AI Studio key in Settings. Each student has their own quota." },
  { t: "School calendar", d: "Export Canvas or Blackboard to Google Calendar, then Connect Google here." },
  { t: "Courses", d: "Add a course and upload or paste the syllabus. Dated work lands on the calendar." },
  { t: "Home", d: "Urgent 48 hours, majors in 2 weeks, and work-by-week for every course." },
  { t: "Notes & Buddy", d: "Record lectures, get study guides (PDFs go to Drive → Files → outputs). Ask Buddy to edit the planner." },
  { t: "Install", d: "Safari: Share → Add to Home Screen. Chrome: Install app. The Askuala logo is the icon." },
];

const HOLD_MS = 4500;

export function TourVideo({ compact = false }: { compact?: boolean }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SCENES.length), HOLD_MS);
    return () => window.clearInterval(t);
  }, [playing]);

  const scene = SCENES[i];
  const pct = ((i + 1) / SCENES.length) * 100;

  return (
    <div className={`overflow-hidden rounded-xl border border-gold/40 bg-black text-white ${compact ? "p-2" : "p-3"}`}>
      <p className="mb-2 text-sm font-medium text-[#e4c56a]">How to use Askuala</p>
      <div className={`relative aspect-video w-full overflow-hidden rounded-lg bg-[#0d0d0d] ${compact ? "" : ""}`}>
        <img src="/icon.png" alt="" className="pointer-events-none absolute right-4 top-4 h-14 w-14 rounded-xl opacity-90 sm:h-20 sm:w-20" />
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#c9a227]">
            {i + 1} / {SCENES.length}
          </p>
          <h3 className="brand mt-1 text-2xl font-semibold text-[#e4c56a] sm:text-3xl">{scene.t}</h3>
          <p className="mt-2 max-w-[36rem] text-sm text-[#f4f1ea] sm:text-base">{scene.d}</p>
        </div>
        <div className="absolute bottom-0 left-0 h-1 bg-[#c9a227]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-white/20 px-2 py-1 text-xs"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="rounded-md px-2 py-1 text-xs text-[#e4c56a]" onClick={() => setI((n) => (n + 1) % SCENES.length)}>
          Next
        </button>
      </div>
    </div>
  );
}
