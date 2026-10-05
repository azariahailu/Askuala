import { nid, nowIso } from "./ids";
import { findMatchingEvent, inferCourseId, shouldNotRecur } from "./calendar-utils";
import type { AppState, CalendarFeed, CourseEvent, EventType, Recurrence } from "./types";

export function feedCalendarId(feedId: string) {
  return `feed:${feedId}`;
}

export function isFeedCalendarId(id?: string | null) {
  return Boolean(id && id.startsWith("feed:"));
}

export function normalizeFeedUrl(raw: string) {
  let next = raw.trim().replace(/^['"]|['"]$/g, "");
  if (/^webcal:/i.test(next)) next = next.replace(/^webcal:/i, "https:");
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    throw new Error("Paste the full calendar link from Canvas, Blackboard, or Outlook.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an https calendar link from Canvas, Blackboard, or Outlook.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
    throw new Error("That link is not a class calendar.");
  }
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
    throw new Error("That link is not a class calendar.");
  }
  return url.toString();
}

function guessImportedType(title: string): EventType {
  const t = title;
  if (/office\s*hour|\bOH\b/i.test(t)) return "office_hour";
  if (/\b(paper|draft|essay|proposal)\b/i.test(t) && !/\bread\b/i.test(t)) return "assignment";
  if (/\b(final|midterm|exam)\b/i.test(t)) return "exam";
  if (/\bquiz/i.test(t)) return "quiz";
  if (/\b(project|presentation|thesis)\b/i.test(t)) return "project";
  if (/pset|problem set|homework|\bhw\s*\d/i.test(t)) return "pset";
  if (/\(\s*FA\d{2}\s*\):/i.test(t) || /lecture/i.test(t)) return "lecture";
  return "other";
}

function unfoldIcs(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function icsProps(block: string) {
  const map = new Map<string, { params: string; value: string }>();
  for (const line of block.split("\n")) {
    const cut = line.indexOf(":");
    if (cut < 1) continue;
    const left = line.slice(0, cut);
    const value = line.slice(cut + 1);
    const [name, ...rest] = left.split(";");
    map.set(name.toUpperCase(), { params: rest.join(";"), value });
  }
  return map;
}

function parseIcsDate(params: string, value: string) {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    return { iso: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000`, allDay: true };
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const stamp = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (m[7] === "Z") return { iso: new Date(`${stamp}Z`).toISOString(), allDay: false };
  const tz = params.match(/TZID=([^;]+)/i)?.[1];
  if (tz) {
    const guess = new Date(stamp);
    if (!Number.isNaN(guess.getTime())) return { iso: guess.toISOString(), allDay: false };
  }
  return { iso: new Date(stamp).toISOString(), allDay: false };
}

function recurrenceFromRrule(raw: string): Recurrence | null {
  if (!raw || !/FREQ=/i.test(raw)) return null;
  const freqRaw = raw.match(/FREQ=([A-Z]+)/i)?.[1]?.toLowerCase() || "weekly";
  const freq = (["hourly", "daily", "weekly", "monthly", "yearly"].includes(freqRaw) ? freqRaw : "weekly") as Recurrence["freq"];
  const interval = Number(raw.match(/INTERVAL=(\d+)/i)?.[1] || 1);
  const count = Number(raw.match(/COUNT=(\d+)/i)?.[1] || 0) || null;
  const by = raw.match(/BYDAY=([^;]+)/i);
  const until = raw.match(/UNTIL=(\d{8}(?:T\d{6}Z)?)/i);
  const byDay = (by?.[1] || "")
    .split(",")
    .map((s) => s.replace(/^\d+/, "").trim())
    .filter(Boolean);
  let untilIso: string | null = null;
  if (until?.[1]) {
    const u = until[1];
    if (u.length === 8) untilIso = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T23:59:00.000Z`;
    else {
      untilIso = new Date(`${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`).toISOString();
    }
  }
  return { freq, interval, byDay: byDay.length ? byDay : undefined, until: untilIso, count };
}

export type ParsedFeedEvent = {
  uid: string;
  title: string;
  details: string;
  location: string;
  start: string;
  end: string | null;
  allDay: boolean;
  recurrence: Recurrence | null;
  canceled: boolean;
};

export function parseIcsCalendar(text: string) {
  const body = unfoldIcs(text);
  const name = unescapeIcs(body.match(/X-WR-CALNAME:(.+)/i)?.[1] || "") || "Class calendar";
  const events: ParsedFeedEvent[] = [];
  const chunks = body.split(/BEGIN:VEVENT/i).slice(1);
  for (const chunk of chunks) {
    const block = chunk.split(/END:VEVENT/i)[0] || "";
    const p = icsProps(block);
    const startRaw = p.get("DTSTART");
    if (!startRaw) continue;
    const start = parseIcsDate(startRaw.params, startRaw.value);
    if (!start) continue;
    const endRaw = p.get("DTEND") || p.get("DUE");
    const end = endRaw ? parseIcsDate(endRaw.params, endRaw.value) : null;
    const uid = unescapeIcs(p.get("UID")?.value || "") || `row-${events.length}-${start.iso}`;
    const title = unescapeIcs(p.get("SUMMARY")?.value || "") || "Class event";
    const status = (p.get("STATUS")?.value || "").toUpperCase();
    events.push({
      uid,
      title,
      details: unescapeIcs(p.get("DESCRIPTION")?.value || ""),
      location: unescapeIcs(p.get("LOCATION")?.value || ""),
      start: start.iso,
      end: end?.iso || null,
      allDay: start.allDay,
      recurrence: recurrenceFromRrule(p.get("RRULE")?.value || ""),
      canceled: status === "CANCELLED",
    });
  }
  return { name, events };
}

export async function fetchCalendarFeed(url: string) {
  const href = normalizeFeedUrl(url);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch(href, {
      signal: ac.signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error("Could not open that calendar link. Check Calendar settings in Canvas, Blackboard, or Outlook.");
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error("That calendar file is too large.");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That link is not a calendar feed. In Canvas use Calendar settings, then iCal / Calendar feed.");
    return parseIcsCalendar(text);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("The calendar link timed out. Try again.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function applyCalendarFeed(state: AppState, feed: CalendarFeed, parsed: ReturnType<typeof parseIcsCalendar>) {
  const calId = feedCalendarId(feed.id);
  const seen = new Set<string>();
  let added = 0;
  let updated = 0;
  for (const item of parsed.events) {
    if (item.canceled) continue;
    const key = `ics:${item.uid}`;
    seen.add(key);
    const type = guessImportedType(item.title);
    const datedWork = shouldNotRecur({ title: item.title, type });
    const rec = datedWork ? null : item.recurrence;
    const existing = state.events.find((e) => e.source === "feed" && e.googleEventId === key && e.googleCalendarId === calId);
    const courseId = inferCourseId({ title: item.title, details: item.details, courseId: null } as CourseEvent, state.courses);
    if (existing) {
      existing.title = item.title;
      existing.details = item.details || existing.details;
      existing.start = item.start;
      existing.end = item.end;
      existing.allDay = item.allDay;
      existing.location = item.location;
      existing.type = type;
      existing.recurrence = rec;
      existing.courseId = courseId || existing.courseId;
      existing.canceled = false;
      existing.updatedAt = nowIso();
      updated += 1;
      continue;
    }
    const dup = findMatchingEvent(state.events, { courseId, title: item.title, start: item.start, type, recurrence: rec }, state.courses);
    if (dup) {
      dup.googleEventId = dup.googleEventId || key;
      dup.googleCalendarId = dup.googleCalendarId || calId;
      if (item.details && item.details.length > (dup.details?.length || 0)) dup.details = item.details;
      if (item.location && !dup.location) dup.location = item.location;
      updated += 1;
      continue;
    }
    state.events.push({
      id: nid(),
      courseId,
      title: item.title,
      details: item.details || "From your class calendar link.",
      type,
      start: item.start,
      end: item.end,
      allDay: item.allDay,
      location: item.location,
      weight: "",
      source: "feed",
      googleEventId: key,
      googleCalendarId: calId,
      viewOnly: true,
      recurrence: rec,
      releasedAt: null,
      canceled: false,
      googleAlerts: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    added += 1;
  }
  for (const event of state.events) {
    if (event.source !== "feed" || event.googleCalendarId !== calId) continue;
    if (event.googleEventId && seen.has(event.googleEventId)) continue;
    event.canceled = true;
    event.updatedAt = nowIso();
  }
  feed.name = parsed.name || feed.name;
  feed.lastSyncedAt = nowIso();
  return { added, updated, total: parsed.events.length };
}

export function removeCalendarFeed(state: AppState, feedId: string) {
  const calId = feedCalendarId(feedId);
  state.calendarFeeds = (state.calendarFeeds || []).filter((f) => f.id !== feedId);
  state.events = state.events.filter((e) => !(e.source === "feed" && e.googleCalendarId === calId));
}

export async function syncOneFeed(state: AppState, feed: CalendarFeed) {
  const parsed = await fetchCalendarFeed(feed.url);
  return applyCalendarFeed(state, feed, parsed);
}

export async function syncAllFeeds(state: AppState) {
  const feeds = state.calendarFeeds || [];
  let added = 0;
  let updated = 0;
  for (const feed of feeds) {
    const extra = await syncOneFeed(state, feed);
    added += extra.added;
    updated += extra.updated;
  }
  return { added, updated, feeds: feeds.length };
}
