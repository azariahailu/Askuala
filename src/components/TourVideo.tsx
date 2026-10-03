"use client";

import { useEffect, useState } from "react";

type Kind =
  | "login"
  | "home"
  | "resume"
  | "addCourse"
  | "syllabus"
  | "course"
  | "cal"
  | "addEvent"
  | "google"
  | "notes"
  | "study"
  | "quick"
  | "buddy"
  | "gemini"
  | "mail"
  | "install";

type Scene = { t: string; d: string; kind: Kind; path: string; x: string; y: string; nav?: string };

const SCENES: Scene[] = [
  {
    t: "Sign in",
    d: "College Google or email + password on this same site — phone, tablet, or computer.",
    kind: "login",
    path: "askualastudy.vercel.app/login",
    x: "50%",
    y: "58%",
  },
  {
    t: "Home",
    d: "Urgent 48 hours, majors in 2 weeks, work-by-week, then courses by year and term.",
    kind: "home",
    path: "askualastudy.vercel.app/home",
    nav: "Home",
    x: "42%",
    y: "38%",
  },
  {
    t: "While you were away",
    d: "Leave for 3+ hours and Home shows the snapshot from when you stopped — not a new session.",
    kind: "resume",
    path: "askualastudy.vercel.app/home",
    nav: "Home",
    x: "48%",
    y: "36%",
  },
  {
    t: "Add a course",
    d: "Code, name, term, meetings, office hours, then optional syllabus file or paste.",
    kind: "addCourse",
    path: "askualastudy.vercel.app/home",
    nav: "Home",
    x: "72%",
    y: "22%",
  },
  {
    t: "Syllabus → calendar",
    d: "Upload or paste. Lectures, office hours, and all dated work land on the calendar — readings too.",
    kind: "syllabus",
    path: "askualastudy.vercel.app/courses/econ-1115",
    nav: "ECON 1115",
    x: "55%",
    y: "48%",
  },
  {
    t: "Course page",
    d: "Each course has Overview, Calendar, and Notes — same urgent, majors, and work-by-week as Home.",
    kind: "course",
    path: "askualastudy.vercel.app/courses/econ-1115",
    nav: "ECON 1115",
    x: "38%",
    y: "28%",
  },
  {
    t: "Unified calendar",
    d: "Month grid keeps past days faded. Upcoming starts from now. Lenses: majors, office hours, psets, course work.",
    kind: "cal",
    path: "askualastudy.vercel.app/calendar",
    nav: "Calendar",
    x: "36%",
    y: "32%",
  },
  {
    t: "Add event",
    d: "Pick course, type, time, location. Recurring lectures and office hours stay one series, not hundreds of copies.",
    kind: "addEvent",
    path: "askualastudy.vercel.app/calendar",
    nav: "Calendar",
    x: "78%",
    y: "22%",
  },
  {
    t: "Google Calendar + Drive",
    d: "Connect after Canvas is on Google. We import every calendar you checked. Files go to Drive → Askuala.",
    kind: "google",
    path: "askualastudy.vercel.app/calendar",
    nav: "Calendar",
    x: "48%",
    y: "48%",
  },
  {
    t: "Course notes",
    d: "Notes, reminders, questions, office-hour notes, attachments. Record a lecture and get a live transcript.",
    kind: "notes",
    path: "askualastudy.vercel.app/courses/econ-1115?tab=notes",
    nav: "ECON 1115",
    x: "50%",
    y: "44%",
  },
  {
    t: "Study guides",
    d: "Save a recording and Askuala writes a study PDF — graphs included. Print, Word, or Drive outputs.",
    kind: "study",
    path: "askualastudy.vercel.app/courses/econ-1115?tab=notes",
    nav: "ECON 1115",
    x: "58%",
    y: "52%",
  },
  {
    t: "Quick Notes",
    d: "A scratch pad and checklist for anything. It is not a course unless you ask Buddy to turn a line into an event.",
    kind: "quick",
    path: "askualastudy.vercel.app/quick-notes",
    nav: "Notes",
    x: "48%",
    y: "42%",
  },
  {
    t: "Askuala Buddy",
    d: "This chat can read and edit the whole planner — move an exam, add a pset, open a course — using your Gemini key.",
    kind: "buddy",
    path: "askualastudy.vercel.app/assistant",
    nav: "Buddy",
    x: "62%",
    y: "58%",
  },
  {
    t: "Your Gemini key",
    d: "Paste an AI Studio key in Settings. Each student has their own quota. Buddy uses tools; it will not dump an empty reply.",
    kind: "gemini",
    path: "askualastudy.vercel.app/settings",
    nav: "Settings",
    x: "50%",
    y: "42%",
  },
  {
    t: "Email briefs",
    d: "One daily mail of tomorrow’s items, one Sunday week-ahead. Empty windows skipped. Office hours omitted.",
    kind: "mail",
    path: "askualastudy.vercel.app/settings",
    nav: "Settings",
    x: "52%",
    y: "50%",
  },
  {
    t: "Add to Home Screen",
    d: "Safari Share → Add to Home Screen, or Chrome → Install app. Same login on every device. The Askuala logo is the icon.",
    kind: "install",
    path: "askualastudy.vercel.app",
    x: "70%",
    y: "30%",
  },
];

const NAV = ["Home", "Calendar", "Buddy", "Notes", "Settings"];

function LogoMark({ size = 20 }: { size?: number }) {
  return <img src="/icon-192.png" alt="" width={size} height={size} className="shrink-0 rounded-md" style={{ width: size, height: size }} />;
}

function Chip({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9px] ${on ? "bg-[#b8860b] text-[#111]" : "bg-[#efe8d8] text-[#6b6458]"}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-[#e0d6c2] bg-[#fffdf8] p-1.5 ${className}`}>{children}</div>;
}

function AppChrome({ path, nav, showNav, children }: { path: string; nav?: string; showNav: boolean; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f1e6] text-[11px] text-[#1c1914] sm:text-xs">
      <div className="flex items-center gap-1.5 border-b border-[#e0d6c2] bg-[#efe8d8] px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#e8a0a0]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#e0c56a]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#8ecf9a]" />
        <div className="ml-1 min-w-0 flex-1 truncate rounded bg-white px-2 py-0.5 text-[9px] text-[#6b6458] sm:text-[10px]">{path}</div>
      </div>
      <div className="flex min-h-0 flex-1">
        {showNav && (
          <aside className="hidden w-[30%] shrink-0 flex-col gap-1 border-r border-[#e0d6c2] bg-[#efe8d8] p-1.5 sm:flex">
            <div className="mb-1 flex items-center gap-1.5 px-1">
              <LogoMark size={16} />
              <span className="font-semibold text-[#8a5a00]">Askuala</span>
            </div>
            {NAV.map((item) => (
              <div
                key={item}
                className={`rounded px-1.5 py-1 ${item === nav ? "bg-[#f3e6c4] text-[#8a5a00]" : "text-[#6b6458]"}`}
              >
                {item}
              </div>
            ))}
            <div className="mt-2 px-1 text-[9px] uppercase tracking-wide text-[#6b6458]">Year 1</div>
            <div className={`rounded px-1.5 py-1 ${nav === "ECON 1115" ? "bg-[#f3e6c4] text-[#1c1914]" : "text-[#1c1914]"}`}>ECON 1115</div>
            <div className="rounded px-1.5 py-1 text-[#6b6458]">MATH 1150</div>
            <div className="rounded px-1.5 py-1 text-[#6b6458]">S&DS 1000</div>
          </aside>
        )}
        <div className="min-w-0 flex-1 overflow-hidden p-2">{children}</div>
      </div>
    </div>
  );
}

function Screen({ kind }: { kind: Kind }) {
  if (kind === "login") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-[min(16rem,92%)] rounded-2xl border border-[#e0d6c2] bg-[#fffdf8] p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <LogoMark size={28} />
            <div>
              <div className="text-sm font-semibold text-[#8a5a00]">Askuala</div>
              <div className="text-[10px] text-[#6b6458]">Courses, calendar, Buddy</div>
            </div>
          </div>
          <div className="mb-2 rounded-lg border border-[#e0d6c2] py-2 text-center">Sign in with Google</div>
          <div className="rounded-lg bg-[#b8860b] py-2 text-center font-medium text-[#111]">Create account</div>
        </div>
      </div>
    );
  }
  if (kind === "home") {
    return (
      <div className="grid h-full gap-1.5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Home</div>
          <span className="rounded-md bg-[#b8860b] px-2 py-0.5 text-[9px] text-[#111]">+ Add course</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ["Urgent 48h", "S&DS mini-exam"],
            ["Majors · 2 wks", "MATH skill check"],
            ["This week", "ECON ch. 4 reading"],
          ].map(([h, b]) => (
            <Card key={h} className="bg-[#fff4d6]">
              <div className="text-[9px] uppercase tracking-wide text-[#8a5a00]">{h}</div>
              <div className="mt-1 text-[10px]">{b}</div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="text-[9px] text-[#6b6458]">Year 1 · Fall 2026</div>
          <div className="mt-1 font-medium">ECON 1115 · Microeconomics</div>
          <div className="text-[10px] text-[#6b6458]">MATH 1150 · Calculus · S&DS 1000</div>
        </Card>
      </div>
    );
  }
  if (kind === "resume") {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Home</div>
        <Card className="bg-[#fff4d6]">
          <div className="text-[9px] uppercase tracking-wide text-[#8a5a00]">While you were away</div>
          <div className="mt-1 text-[10px]">Stopped Tue 9:12 AM · ECON 1115 notes · MATH pset due Thu</div>
        </Card>
        <Card>
          <div className="text-[10px] text-[#6b6458]">This is the stop snapshot, not a new session.</div>
        </Card>
      </div>
    );
  }
  if (kind === "addCourse") {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Add course</div>
        <Card>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div className="rounded bg-white px-1.5 py-1">ECON 1115</div>
            <div className="rounded bg-white px-1.5 py-1">Fall 2026</div>
            <div className="col-span-2 rounded bg-white px-1.5 py-1">MW 10:30 · HQ 100</div>
          </div>
        </Card>
        <div className="rounded-lg bg-[#b8860b] py-1.5 text-center text-[10px] font-medium text-[#111]">Save course</div>
      </div>
    );
  }
  if (kind === "syllabus") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">ECON 1115 · Update from file</div>
        <div className="rounded-lg border border-dashed border-[#b8860b]/60 bg-[#fffdf8] px-2 py-4 text-center text-[10px] text-[#6b6458]">
          Drop syllabus.pdf or paste Canvas
        </div>
        <Card className="bg-[#fff4d6]">
          <div className="text-[10px]">Pset 3 · Oct 3 · calendar</div>
          <div className="text-[10px]">Ch. 5 reading · Oct 7 · calendar</div>
          <div className="text-[10px]">Office hours Wed 4–5 · series</div>
        </Card>
      </div>
    );
  }
  if (kind === "course") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">ECON 1115 · Principles</div>
        <div className="flex gap-1">
          <Chip on>Overview</Chip>
          <Chip>Calendar</Chip>
          <Chip>Notes</Chip>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Card className="bg-[#fff4d6]">
            <div className="text-[9px] text-[#8a5a00]">Urgent</div>
            <div className="text-[10px]">Quiz Thu</div>
          </Card>
          <Card>
            <div className="text-[9px] text-[#8a5a00]">Policies</div>
            <div className="text-[10px]">Late work: 10% / day</div>
          </Card>
        </div>
      </div>
    );
  }
  if (kind === "cal") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Unified calendar</div>
          <span className="rounded-md bg-[#b8860b] px-2 py-0.5 text-[9px] text-[#111]">+ Add event</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {["Unified", "Majors", "Office hours", "Problem sets", "Course work"].map((l, i) => (
            <Chip key={l} on={i === 0}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 28 }, (_, n) => (
            <div
              key={n}
              className={`h-5 rounded text-center text-[8px] leading-5 ${
                n < 3 ? "bg-[#efe8d8] text-[#b5ae9f]" : n === 8 || n === 16 ? "bg-[#b8860b] text-[#111]" : "bg-[#fffdf8] border border-[#e0d6c2]"
              }`}
            />
          ))}
        </div>
        <div className="text-[10px] text-[#6b6458]">Upcoming from now · S&DS mini-exam today</div>
      </div>
    );
  }
  if (kind === "addEvent") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">New event</div>
        <Card>
          <div className="space-y-1 text-[10px]">
            <div className="rounded bg-white px-1.5 py-1">MATH 1150 · Skill Check 1</div>
            <div className="flex gap-1">
              <Chip on>exam</Chip>
              <Chip>quiz</Chip>
              <Chip>pset</Chip>
            </div>
            <div className="rounded bg-white px-1.5 py-1">Oct 1 · all day</div>
          </div>
        </Card>
        <div className="rounded-lg bg-[#b8860b] py-1.5 text-center text-[10px] font-medium text-[#111]">Save</div>
      </div>
    );
  }
  if (kind === "google") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">Connect Google Calendar</div>
        <Card>
          <p className="text-[10px] text-[#6b6458]">
            Import every calendar you checked in Google — lectures, psets, the rest, not only the primary calendar.
          </p>
          <div className="mt-2 rounded-lg bg-[#b8860b] py-1.5 text-center text-[10px] font-medium text-[#111]">
            Connect Google (Calendar + Drive)
          </div>
        </Card>
        <div className="text-[10px] text-[#6b6458]">Drive: Askuala → Files / Voice / outputs</div>
      </div>
    );
  }
  if (kind === "notes") {
    return (
      <div className="space-y-2">
        <div className="flex gap-1">
          <Chip>Overview</Chip>
          <Chip>Calendar</Chip>
          <Chip on>Notes</Chip>
        </div>
        <Card>
          <div className="font-medium">Lecture · elasticity</div>
          <div className="mt-1 h-1.5 w-full rounded bg-[#efe8d8]">
            <div className="h-1.5 w-2/3 rounded bg-[#b8860b]" />
          </div>
          <div className="mt-1 text-[10px] text-[#6b6458]">Recording + live transcript</div>
        </Card>
        <div className="flex gap-1 text-[9px]">
          <Chip>note</Chip>
          <Chip>reminder</Chip>
          <Chip>question</Chip>
          <Chip>resource</Chip>
        </div>
      </div>
    );
  }
  if (kind === "study") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">Study guide</div>
        <Card>
          <div className="text-[10px] font-medium">Elasticity — lecture summary</div>
          <div className="mt-1 h-10 rounded bg-[#efe8d8]" />
          <div className="mt-1 text-[9px] text-[#6b6458]">Supply / demand graph · PDF → Drive outputs</div>
        </Card>
        <div className="flex gap-1 text-[9px]">
          <Chip on>Print</Chip>
          <Chip>Word</Chip>
          <Chip>Share</Chip>
        </div>
      </div>
    );
  }
  if (kind === "quick") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">Quick Notes</div>
        <Card>
          <div className="text-[10px]">Office hours questions for ECON</div>
          <div className="mt-2 space-y-1 text-[10px]">
            <div>☐ Print MATH skill-check sheet</div>
            <div>☑ Email TF about mini-exam</div>
          </div>
        </Card>
      </div>
    );
  }
  if (kind === "buddy") {
    return (
      <div className="flex h-full flex-col gap-1.5">
        <div className="font-semibold">Askuala Buddy</div>
        <div className="max-w-[85%] rounded-2xl border border-[#e0d6c2] bg-[#fffdf8] p-2 text-[10px]">Move my MATH exam to Friday?</div>
        <div className="ml-auto max-w-[85%] rounded-2xl bg-[#b8860b] p-2 text-[10px] text-[#111]">Done. MATH 1150 exam is Friday 10am.</div>
        <div className="mt-auto rounded-lg border border-[#e0d6c2] bg-white px-2 py-1.5 text-[10px] text-[#6b6458]">Ask to edit the planner…</div>
      </div>
    );
  }
  if (kind === "gemini") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">Settings · Gemini</div>
        <Card className="bg-[#fff4d6]">
          <div className="text-[10px] text-[#8a5a00]">Your AI Studio key</div>
          <div className="mt-1 h-7 rounded border border-[#e0d6c2] bg-white" />
          <div className="mt-1 text-[9px] text-[#6b6458]">Saved on this login — not a shared class quota</div>
        </Card>
      </div>
    );
  }
  if (kind === "mail") {
    return (
      <div className="space-y-2">
        <div className="font-semibold">Settings · Email</div>
        <Card>
          <div className="text-[10px]">☑ Daily digest · tomorrow’s items · 10:00 PM ET</div>
          <div className="mt-1 text-[10px]">☑ Sunday week-ahead · 11:00 AM ET</div>
          <div className="mt-1 text-[9px] text-[#6b6458]">No empty mail · office hours omitted</div>
        </Card>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-[#e0d6c2] bg-[#fffdf8] p-3 shadow-sm">
        <LogoMark size={40} />
        <div>
          <div className="font-semibold text-[#8a5a00]">Askuala</div>
          <div className="text-[10px] text-[#6b6458]">Add to Home Screen</div>
        </div>
      </div>
    </div>
  );
}

export function TourVideo({ compact = false }: { compact?: boolean; variant?: "public" | "guide" }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hold = compact ? 2800 : 3800;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SCENES.length), hold);
    return () => window.clearInterval(t);
  }, [playing, hold]);

  const scene = SCENES[i] || SCENES[0];
  const pct = ((i + (playing ? 0.35 : 0)) / SCENES.length) * 100;
  const showNav = scene.kind !== "login" && scene.kind !== "install";

  return (
    <div className={`overflow-hidden rounded-xl border border-[#e0d6c2] bg-[#fffdf8] text-[#1c1914] ${compact ? "p-2" : "p-3"}`}>
      <p className="mb-2 text-sm font-medium text-[#8a5a00]">Screen tour — everything Askuala does</p>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-[#e0d6c2] bg-[#f6f1e6]">
        <AppChrome path={scene.path} nav={scene.nav} showNav={showNav}>
          <Screen kind={scene.kind} />
        </AppChrome>
        <span className={`tour-pointer tour-pointer-light ${playing ? "tour-click" : ""}`} style={{ left: scene.x, top: scene.y }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#f6f1e6] via-[#f6f1e6]/92 to-transparent px-3 pb-3 pt-10">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8a5a00]">
            {i + 1} / {SCENES.length}
          </p>
          <h3 className="text-lg font-semibold text-[#1c1914] sm:text-xl">{scene.t}</h3>
          {!compact && <p className="mt-0.5 max-w-lg text-xs text-[#6b6458] sm:text-sm">{scene.d}</p>}
        </div>
        {!playing && (
          <button
            type="button"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#f6f1e6]/55"
            onClick={() => setPlaying(true)}
            aria-label="Play screen tour"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#b8860b] text-xl text-[#111]">▶</span>
            <span className="mt-2 text-sm font-medium text-[#1c1914]">Play screen tour</span>
          </button>
        )}
        <div className="absolute bottom-0 left-0 z-20 h-0.5 bg-[#b8860b]" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-md border border-[#e0d6c2] px-2 py-1 text-xs" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-[#8a5a00]"
          onClick={() => {
            setPlaying(true);
            setI((n) => (n + 1) % SCENES.length);
          }}
        >
          Next
        </button>
        <span className="text-[10px] text-[#6b6458]">{scene.t}</span>
      </div>
    </div>
  );
}
