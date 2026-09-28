import nodemailer from "nodemailer";
import { addDays, addMonths, endOfDay, startOfDay } from "date-fns";
import { alertFireAt, expandEvents, inferCourseId, isMajorAssessment, isRoutineNoise } from "./calendar-utils";
import { resolveSmtp } from "./mail-account";
import { TYPE_LABELS, type AppState, type CourseEvent, type CourseNote } from "./types";
import { geminiApiKey, llmChat } from "./llm";
import { APP_NAME } from "./brand";

export type DueAlert = {
  key: string;
  title: string;
  body: string;
  channel: "popup" | "email";
  when: string;
};

export function collectDueAlerts(state: AppState, now = new Date()): DueAlert[] {
  const out: DueAlert[] = [];
  const fired = new Set(state.firedAlertKeys);

  const consider = (
    id: string,
    title: string,
    body: string,
    whenIso: string,
    alerts: { id: string; amount: number; unit: "minutes" | "hours" | "days" | "weeks"; channel: "popup" | "email" }[],
  ) => {
    const when = new Date(whenIso);
    for (const alert of alerts) {
      const fireAt = alertFireAt(when, alert.amount, alert.unit);
      const key = `${id}:${alert.id}`;
      if (fired.has(key)) continue;
      if (now >= fireAt && now <= when) {
        out.push({
          key,
          title,
          body,
          channel: alert.channel,
          when: whenIso,
        });
      }
    }
  };

  for (const event of expandEvents(
    state.events.filter((e) => e.source !== "google" && !isRoutineNoise(e)),
    addDays(now, -2),
    addMonths(now, 8),
  )) {
    if (event.source === "google" || isRoutineNoise(event) || event.googleAlerts) continue;
    const alerts = state.settings.notification.defaultAlerts;
    consider(event.id, event.title, event.details, event.start, alerts);
  }
  for (const note of state.notes) {
    if (!note.reminderAt) continue;
    consider(note.id, note.title, note.body, note.reminderAt, note.alerts.length ? note.alerts : state.settings.notification.defaultAlerts);
  }
  return out;
}

async function transporterFor(state?: AppState) {
  const smtp = await resolveSmtp(state?.settings.smtp);
  if (!smtp) return null;
  return {
    smtp,
    mailer: nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      auth: { user: smtp.user, pass: smtp.pass },
    }),
  };
}

/** Digests and reminders — only if the student left email on. Always to the login address set on the state. */
export async function sendEmail(state: AppState, subject: string, text: string) {
  const to = state.settings.notification.emailAddress;
  if (!to || !state.settings.notification.emailEnabled) return false;
  const ready = await transporterFor(state);
  if (!ready) return false;
  await ready.mailer.sendMail({
    from: `"${APP_NAME}" <${ready.smtp.user}>`,
    to,
    subject: `${APP_NAME}: ${subject}`,
    text,
  });
  return true;
}

/** Sign-in mail. Goes to the address they logged in with. Sender is the admin SMTP mailbox (buddy.askuala@gmail.com). */
export async function sendLoginEmail(to: string, name?: string) {
  const ready = await transporterFor();
  if (!ready || !to) return false;
  const who = name?.trim() || to.split("@")[0];
  await ready.mailer.sendMail({
    from: `"${APP_NAME}" <${ready.smtp.user}>`,
    to,
    subject: `${APP_NAME}: you’re signed in`,
    text: `Hi ${who},\n\nYou’re signed in to ${APP_NAME}. This mailbox (${to}) is where briefs and reminders will go — you don’t add another inbox.\n\nDaily: tomorrow’s work in one email. Sunday: the week ahead. Office hours are left out.\n\nIf this wasn’t you, sign out and change your password.\n`,
  });
  return true;
}

/** New-account notice. Goes to the SMTP mailbox itself (buddy.askuala@gmail.com), not the student. */
export async function sendAdminNewUserEmail(opts: {
  name: string;
  email: string;
  id: string;
  createdAt: string;
  method: "password" | "google";
}) {
  const ready = await transporterFor();
  if (!ready) return false;
  const to = ready.smtp.user;
  await ready.mailer.sendMail({
    from: `"${APP_NAME}" <${to}>`,
    to,
    subject: `${APP_NAME}: new user ${opts.email}`,
    text: [
      `A new ${APP_NAME} account was created.`,
      "",
      `Name: ${opts.name || "—"}`,
      `Email: ${opts.email}`,
      `Signed up with: ${opts.method === "google" ? "Google" : "email + password"}`,
      `Account id: ${opts.id}`,
      `Created: ${opts.createdAt}`,
      "",
      "This mail was sent to the SMTP sender inbox.",
    ].join("\n"),
  });
  return true;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function courseLabel(state: AppState, event: CourseEvent) {
  const id = inferCourseId(event, state.courses) || event.courseId;
  const c = state.courses.find((x) => x.id === id);
  return c ? `${c.code}` : "Non-course";
}

function inWindow(event: CourseEvent, start: Date, end: Date) {
  const t = new Date(event.start).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function digestEvents(state: AppState, start: Date, end: Date) {
  const from = startOfDay(start);
  const to = endOfDay(end);
  const seen = new Set<string>();
  const out: CourseEvent[] = [];
  const add = (e: CourseEvent) => {
    if (e.canceled || isRoutineNoise(e)) return;
    const key = `${e.id}|${e.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const e of expandEvents(state.events, from, to)) add(e);
  for (const e of state.events) {
    if (e.recurrence) continue;
    if (inWindow(e, from, to)) add(e);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

function lineFor(state: AppState, e: CourseEvent) {
  const type = TYPE_LABELS[e.type] || e.type;
  const loc = e.location ? ` @ ${e.location}` : "";
  return `  ${fmtWhen(e.start)} · ${courseLabel(state, e)} · ${e.title} (${type})${loc}`;
}

function digestEventsOnDay(state: AppState, ymd: string) {
  const from = new Date(`${ymd}T00:00:00-05:00`);
  const to = new Date(`${addCalendarYmd(ymd, 1)}T06:00:00-04:00`);
  return digestEvents(state, from, to).filter((e) => eventNyYmd(e.start) === ymd);
}

async function briefBody(state: AppState, start: Date, end: Date, heading: string, ymdForDay?: string) {
  const items = ymdForDay ? digestEventsOnDay(state, ymdForDay) : digestEvents(state, start, end);
  const skeleton = formatWindowItems(heading, items, state);
  if (!geminiApiKey(state.settings) || !items.length) return skeleton;
  try {
    const { text } = await llmChat(
      [
        {
          role: "system",
          content:
            "Write a short plain-text college briefing email. Use only the listed facts. No invented times or work. Keep course codes. 2-4 short paragraphs, then repeat the bullet list.",
        },
        { role: "user", content: skeleton },
      ],
      state.settings,
      false,
      false,
    );
    const clean = (text || "").trim();
    return clean ? `${clean}\n\n—\n${skeleton}` : skeleton;
  } catch {
    return skeleton;
  }
}

function formatWindowItems(heading: string, items: CourseEvent[], state: AppState) {
  const lines = [heading, ""];
  if (!items.length) {
    lines.push("Nothing on the calendar in this window (office hours, lectures, and problem sets are left out of these emails).");
    return lines.join("\n");
  }
  let day = "";
  for (const e of items) {
    const d = new Date(e.start).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" });
    if (d !== day) {
      day = d;
      lines.push(d);
    }
    lines.push(lineFor(state, e));
  }
  return lines.join("\n");
}

function formatWindow(state: AppState, start: Date, end: Date, heading: string) {
  return formatWindowItems(heading, digestEvents(state, start, end), state);
}

function formatMajors(state: AppState, now: Date) {
  const end = addDays(startOfDay(now), 14);
  const items = digestEvents(state, now, end).filter((e) =>
    isMajorAssessment({ ...e, courseId: inferCourseId(e, state.courses) || e.courseId }),
  );
  const lines = ["Major assessments · next 2 weeks", ""];
  if (!items.length) {
    lines.push("No exams, projects, papers, or presentations in the next two weeks.");
    return lines.join("\n");
  }
  for (const e of items) lines.push(lineFor(state, e));
  return lines.join("\n");
}

function weeklyBody(state: AppState, weekStart: Date, weekEnd: Date, now: Date, heading: string) {
  return [formatWindow(state, weekStart, weekEnd, heading), "", formatMajors(state, now)].join("\n");
}

async function sendOnce(state: AppState, key: string, subject: string, body: string) {
  if (state.firedAlertKeys.includes(key)) return;
  try {
    const ok = await sendEmail(state, subject, body);
    if (ok) state.firedAlertKeys.push(key);
  } catch (e) {
    console.error(e);
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nyParts(now: Date) {
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour: Number(map.hour), minute: Number(map.minute) };
}

function nyYmd(now: Date) {
  const p = nyParts(now);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function addCalendarYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function eventNyYmd(iso: string) {
  return nyYmd(new Date(iso));
}

export async function sendDigests(state: AppState, now = new Date()) {
  const n = state.settings.notification;
  if (!n.emailEnabled) return;
  const hasCalendar = state.events.some((e) => !e.canceled);
  if (!hasCalendar) return;

  const clock = nyParts(now);
  const todayYmd = nyYmd(now);
  const dailyH = ((n.digestDailyHour ?? 22) + 24) % 24;
  const dailyM = Math.min(59, Math.max(0, n.digestDailyMinute ?? 0));
  const pastDaily = clock.hour > dailyH || (clock.hour === dailyH && clock.minute >= dailyM);

  if (n.digestDaily !== false) {
    if (pastDaily) {
      const tomorrowYmd = addCalendarYmd(todayYmd, 1);
      const items = digestEventsOnDay(state, tomorrowYmd);
      if (items.length) {
        const tomorrow = new Date(items[0].start);
        await sendOnce(
          state,
          `digest:daily:${todayYmd}`,
          `Tomorrow · ${tomorrow.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" })}`,
          await briefBody(state, now, now, `What’s coming up tomorrow`, tomorrowYmd),
        );
      }
    } else {
      const yest = addCalendarYmd(todayYmd, -1);
      const items = digestEventsOnDay(state, todayYmd).filter((e) => new Date(e.start) >= now);
      if (items.length) {
        await sendOnce(
          state,
          `digest:daily:${yest}`,
          `Today · ${now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" })}`,
          await briefBody(state, now, now, `Catch-up: the scheduled tomorrow-brief was missed (computer was off) — what’s left today`, todayYmd),
        );
      }
    }
  }

  if (n.digestWeekly !== false) {
    const { keySundayYmd, from, to, due } = weeklyWindow(now);
    if (!due) return;
    if (!digestEvents(state, from, to).length) return;
    await sendOnce(
      state,
      `digest:weekly:${keySundayYmd}`,
      "This week ahead",
      weeklyBody(state, from, to, now, "This week (office hours, lectures, and problem sets omitted)"),
    );
  }
}

function nyWeekdaySun0(now: Date) {
  const w = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
}

function ymdStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000-05:00`);
}

function ymdEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999-04:00`);
}

function weeklyWindow(now: Date) {
  const clock = nyParts(now);
  const todayYmd = nyYmd(now);
  const dow = nyWeekdaySun0(now);
  if (dow === 0) {
    const fromYmd = addCalendarYmd(todayYmd, 1);
    return {
      keySundayYmd: todayYmd,
      from: ymdStart(fromYmd),
      to: ymdEnd(addCalendarYmd(fromYmd, 6)),
      due: clock.hour > 11 || (clock.hour === 11 && clock.minute >= 0),
    };
  }
  const lastSundayYmd = addCalendarYmd(todayYmd, -dow);
  const mondayYmd = addCalendarYmd(lastSundayYmd, 1);
  const fromYmd = todayYmd < mondayYmd ? mondayYmd : todayYmd;
  return {
    keySundayYmd: lastSundayYmd,
    from: ymdStart(fromYmd),
    to: ymdEnd(addCalendarYmd(mondayYmd, 6)),
    due: true,
  };
}

export async function processNotifications(state: AppState, opts?: { mail?: boolean }) {
  const due = collectDueAlerts(state);
  const popups: DueAlert[] = [];
  const n = state.settings.notification;
  const fired0 = state.firedAlertKeys.length;
  for (const alert of due) {
    if (alert.channel === "email") continue;
    if (n.popupEnabled) {
      state.firedAlertKeys.push(alert.key);
      popups.push(alert);
    }
  }
  if (opts?.mail !== false) await sendDigests(state);
  if (state.firedAlertKeys.length > 4000) state.firedAlertKeys = state.firedAlertKeys.slice(-2000);
  return { popups, changed: state.firedAlertKeys.length !== fired0 };
}

export function eventLabel(e: CourseEvent) {
  return `${e.title}\n${new Date(e.start).toLocaleString()}\n${e.details}`;
}

export function noteLabel(n: CourseNote) {
  return `${n.title}\n${n.body}`;
}
