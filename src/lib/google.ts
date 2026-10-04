import { google, type calendar_v3 } from "googleapis";
import { envGoogleCreds, googleAppReady } from "./google-app";
import type { AppState, Course, CourseEvent, EventType, Recurrence } from "./types";
import { nid, nowIso, nextCourseColor, phoneAlertRules } from "./ids";
import { academicYearFor, currentAcademicGuess } from "./terms";
import { attachEventsToCourses, collapseGoogleSeries, dedupeEvents, findMatchingEvent, inferCourseId, isRoutineNoise, recurringSlotKey, shouldNotRecur } from "./calendar-utils";
import { normalizePlannerEvents } from "./normalize-events";
import { APP_NAME, GOOGLE_CAL_TITLE_RE } from "./brand";

export type OAuthIntent = { intent: "login" | "connect" | "switch"; userId?: string };

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file",
];

const TZ = "America/New_York";
const PHONE_TYPES: EventType[] = ["exam", "quiz", "project"];

function quietOnPhone(event: CourseEvent) {
  return isRoutineNoise(event);
}

function wantsPhoneReminders(event: CourseEvent) {
  if (event.canceled || quietOnPhone(event)) return false;
  if (PHONE_TYPES.includes(event.type)) return true;
  return Boolean(event.googleAlerts);
}

export function ensureEventPhoneReminders(event: CourseEvent) {
  if (event.canceled || event.source === "google") return;
  if (quietOnPhone(event)) {
    event.googleAlerts = false;
    event.alerts = [];
    return;
  }
  if (!PHONE_TYPES.includes(event.type) && !event.googleAlerts) return;
  event.googleAlerts = true;
  if (!event.alerts?.length) event.alerts = phoneAlertRules();
}

function headerHost(req: Request) {
  return req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host")?.split(",")[0]?.trim() || "";
}

export function isPhoneTunnel(req: Request) {
  return /trycloudflare\.com(:\d+)?$/i.test(headerHost(req));
}

export function isLoopbackHost(host: string) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host.split(",")[0]?.trim() || "");
}

export function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = headerHost(req);
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (/trycloudflare\.com/i.test(host) ? "https" : url.protocol.replace(":", ""));
  if (host) return `${proto}://${host}`;
  return url.origin;
}

export function oauthOrigin(req: Request) {
  const origin = requestOrigin(req);
  if (/trycloudflare\.com/i.test(origin)) {
    return `http://127.0.0.1:${process.env.PORT || process.env.ASKUALA_PORT || 3000}`;
  }
  return origin;
}

export function appUrl(origin?: string) {
  return origin || process.env.APP_URL || process.env.NEXTAUTH_URL || "http://127.0.0.1:3000";
}

export { envGoogleCreds, googleAppReady };

export function googleCreds(_state?: AppState) {
  return envGoogleCreds();
}

export function googleClientId(_state?: AppState) {
  return envGoogleCreds().clientId;
}

export function googleConfigured(_state?: AppState) {
  return googleAppReady();
}

export function encodeOAuthState(s: OAuthIntent) {
  return Buffer.from(JSON.stringify(s)).toString("base64url");
}

export function decodeOAuthState(raw: string): OAuthIntent {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthIntent;
  } catch {
    return { intent: "connect", userId: raw || undefined };
  }
}

export function makeOAuthClient(state?: AppState, origin?: string, redirectUri?: string) {
  const { clientId, clientSecret } = googleCreds(state);
  const hasTokens = Boolean(state?.settings.google.accessToken || state?.settings.google.refreshToken);
  if (!clientId && !hasTokens) return null;
  const client = new google.auth.OAuth2(
    clientId || undefined,
    clientSecret || undefined,
    redirectUri ?? `${appUrl(origin)}/api/google/callback`,
  );
  if (hasTokens && state) {
    client.setCredentials({
      access_token: state.settings.google.accessToken || undefined,
      refresh_token: state.settings.google.refreshToken || undefined,
      expiry_date: state.settings.google.expiryDate || undefined,
    });
  }
  if (state) {
    client.on("tokens", (tokens) => {
      if (tokens.access_token) state.settings.google.accessToken = tokens.access_token;
      if (tokens.refresh_token) state.settings.google.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) state.settings.google.expiryDate = tokens.expiry_date;
    });
  }
  return client;
}

const LOGIN_SCOPES = ["openid", "email", "profile"];

export function authUrl(opts: { state?: AppState; origin?: string; intent: OAuthIntent }) {
  const { clientId, clientSecret } = googleCreds(opts.state);
  if (!clientId || !clientSecret) return null;
  const loginOnly = opts.intent.intent === "login";
  const client = new google.auth.OAuth2(clientId, clientSecret, `${appUrl(opts.origin)}/api/google/callback`);
  return client.generateAuthUrl({
    access_type: loginOnly ? "online" : "offline",
    prompt: loginOnly ? "select_account" : "consent",
    include_granted_scopes: true,
    state: encodeOAuthState(opts.intent),
    scope: loginOnly ? LOGIN_SCOPES : SCOPES,
    login_hint: opts.state?.settings.google.connectedEmail || undefined,
  });
}

export async function exchangeCode(code: string, state?: AppState, origin?: string, redirectUri?: string) {
  const { clientId, clientSecret } = googleCreds(state);
  if (!clientId || !clientSecret) {
    throw new Error("Google sign-in isn’t available.");
  }
  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri || `${appUrl(origin)}/api/google/callback`,
  );
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  if (state) {
    state.settings.google.accessToken = tokens.access_token || "";
    state.settings.google.refreshToken = tokens.refresh_token || state.settings.google.refreshToken;
    state.settings.google.expiryDate = tokens.expiry_date || 0;
    state.settings.google.connectedEmail = me.data.email || "";
  }
  return {
    tokens,
    email: (me.data.email || "").toLowerCase(),
    name: me.data.name || me.data.email || "Student",
    googleId: me.data.id || "",
  };
}

export async function profileFromAccessToken(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  const email = (me.data.email || "").toLowerCase();
  if (!email) throw new Error("Google did not return an email for this account.");
  return {
    email,
    name: me.data.name || me.data.email || "Student",
    googleId: me.data.id || "",
  };
}

function cal(state: AppState) {
  if (!state.settings.google.accessToken && !state.settings.google.refreshToken) return null;
  const auth = makeOAuthClient(state);
  if (!auth) return null;
  return google.calendar({ version: "v3", auth });
}

export async function ensureCourseCalendar(state: AppState, course: Course) {
  const api = cal(state);
  if (!api || course.dropped) return null;
  if (course.googleCalendarId) return course.googleCalendarId;
  const created = await api.calendars.insert({
    requestBody: {
      summary: `${APP_NAME} · ${course.code} ${course.name}`,
      description: `${APP_NAME} calendar for ${course.code}`,
      timeZone: TZ,
    },
  });
  const id = created.data.id;
  if (!id) return null;
  try {
    await api.calendarList.patch({
      calendarId: id,
      requestBody: {
        colorId: course.googleColorId || "5",
        selected: true,
        hidden: false,
        defaultReminders: [],
      },
    });
  } catch {
    /* color is best-effort */
  }
  course.googleCalendarId = id;
  return id;
}

async function ensurePrimaryPhoneDefaults(_api: calendar_v3.Calendar, _minutes = 10) {
  /* Do not rewrite primary-calendar default reminders. That pings office hours and everything else. */
}

function googleAuthBlob(err: unknown) {
  const e = err as { message?: string; response?: { data?: unknown } };
  return `${e.message || ""} ${JSON.stringify(e.response?.data || {})}`;
}

export function isInsufficientScope(err: unknown) {
  return /insufficient(?: authentication)? scopes|ACCESS_TOKEN_SCOPE/i.test(googleAuthBlob(err));
}

export function isInvalidGrant(err: unknown) {
  return /invalid_grant|token has been expired or revoked|invalid_rapt/i.test(googleAuthBlob(err));
}

export function clearGoogleSession(state: AppState) {
  state.settings.google.accessToken = "";
  state.settings.google.refreshToken = "";
  state.settings.google.expiryDate = 0;
  state.settings.google.driveOk = false;
  state.settings.google.driveRootId = "";
  state.settings.google.driveFilesId = "";
  state.settings.google.driveVoiceId = "";
}

export const GOOGLE_RECONNECT_MSG =
  "Google Calendar login expired or was revoked. Click Sync (or Connect Google Calendar in Settings) and Allow again so Askuala can get a new token.";

function googleErr(err: unknown) {
  if (isInvalidGrant(err)) return GOOGLE_RECONNECT_MSG;
  const e = err as { message?: string; errors?: { message?: string }[]; response?: { data?: { error?: { message?: string } | string } } };
  const nested = e.response?.data?.error;
  const nestedMsg = typeof nested === "string" ? nested : nested?.message;
  const msg = nestedMsg || e.errors?.[0]?.message || e.message || "Google Calendar did not save this event.";
  if (/disabled_client/i.test(msg)) {
    return "Google’s OAuth client for this app is disabled (disabled_client). That usually follows the buddy.askuala Google account being shut down. Appeal will not turn Calendar sync back on by itself: you need a new OAuth client from a Google Cloud project you still own, then put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local and connect your personal Gmail.";
  }
  return msg;
}

function wallClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace("Z", "").slice(0, 19);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

function googleReminderOverrides(event: CourseEvent) {
  const out: { method: "email" | "popup"; minutes: number }[] = [];
  const rules = event.alerts?.length ? event.alerts : phoneAlertRules();
  for (const a of rules) {
    let minutes = Number(a.amount) || 0;
    if (a.unit === "hours") minutes *= 60;
    if (a.unit === "days") minutes *= 60 * 24;
    if (a.unit === "weeks") minutes *= 60 * 24 * 7;
    minutes = Math.min(40320, Math.max(0, Math.round(minutes)));
    const method = a.channel === "email" ? "email" : "popup";
    if (!out.some((x) => x.method === method && x.minutes === minutes)) out.push({ method, minutes });
    if (out.length >= 5) break;
  }
  if (!out.some((x) => x.method === "popup")) {
    out.unshift({ method: "popup", minutes: 10 });
  }
  return out.slice(0, 5);
}

function eventBody(state: AppState, event: CourseEvent, syncReminders = false) {
  const course = event.courseId ? state.courses.find((c) => c.id === event.courseId) : null;
  const endIso = event.end || new Date(new Date(event.start).getTime() + 60 * 60 * 1000).toISOString();
  const timed = event.allDay
    ? { start: { date: event.start.slice(0, 10) }, end: { date: endIso.slice(0, 10) } }
    : {
        start: { dateTime: wallClock(event.start), timeZone: TZ },
        end: { dateTime: wallClock(endIso), timeZone: TZ },
      };
  const remind = wantsPhoneReminders(event);
  const silent = quietOnPhone(event);
  return {
    summary: event.title,
    description: [
      event.releasedAt && `Posted/available: ${new Date(event.releasedAt).toLocaleString()}`,
      event.details,
      event.weight && `Grade weight: ${event.weight}`,
      course ? `${course.code} ${course.name}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    location: event.location || undefined,
    colorId: course?.googleColorId,
    ...timed,
    recurrence: event.recurrence ? [toRrule(event.recurrence)] : undefined,
    extendedProperties: {
      private: { askualaId: event.id.split("::")[0] },
    },
    ...(silent
      ? { reminders: { useDefault: false as const, overrides: [] } }
      : remind
        ? { reminders: { useDefault: false as const, overrides: googleReminderOverrides(event) } }
        : syncReminders
          ? { reminders: { useDefault: false as const, overrides: [] } }
          : {}),
  };
}

async function findByAskualaId(api: calendar_v3.Calendar, calendarId: string, askualaId: string) {
  try {
    const res = await api.events.list({
      calendarId,
      privateExtendedProperty: [`askualaId=${askualaId}`],
      maxResults: 2,
      showDeleted: false,
    });
    return res.data.items?.find((i) => i.id && i.status !== "cancelled") || null;
  } catch {
    return null;
  }
}

export async function pushEvent(state: AppState, event: CourseEvent, syncReminders = false) {
  const api = cal(state);
  if (!api || event.canceled) return;
  if (quietOnPhone(event)) {
    event.googleAlerts = false;
    event.alerts = [];
  } else {
    ensureEventPhoneReminders(event);
  }
  const course = event.courseId ? state.courses.find((c) => c.id === event.courseId) : null;
  const courseCal =
    event.googleCalendarId && event.googleCalendarId !== "primary" ? event.googleCalendarId : course ? await ensureCourseCalendar(state, course) : null;
  const remind = wantsPhoneReminders(event);
  if (remind) {
    const mins = googleReminderOverrides(event).find((x) => x.method === "popup")?.minutes ?? 10;
    await ensurePrimaryPhoneDefaults(api, mins);
  }
  const calendarId = remind ? "primary" : courseCal || event.googleCalendarId || "primary";
  const body = eventBody(state, event, syncReminders);
  const realId = event.id.split("::")[0];
  const oldCal = event.googleCalendarId;
  const oldId = event.googleEventId;
  try {
    if (!event.googleEventId || event.googleCalendarId !== calendarId) {
      const found = await findByAskualaId(api, calendarId, realId);
      if (found?.id) {
        event.googleEventId = found.id;
        event.googleCalendarId = calendarId;
      }
    }
    if (event.googleEventId && event.googleCalendarId === calendarId) {
      await api.events.patch({ calendarId, eventId: event.googleEventId, requestBody: body });
    } else {
      const created = await api.events.insert({ calendarId, requestBody: body });
      event.googleEventId = created.data.id || null;
      event.googleCalendarId = calendarId;
    }
    const stored = state.events.find((e) => e.id === realId);
    if (stored) {
      stored.googleEventId = event.googleEventId;
      stored.googleCalendarId = calendarId;
    }
    if (oldId && oldCal && oldCal !== calendarId) {
      try {
        await api.events.delete({ calendarId: oldCal, eventId: oldId });
      } catch {
        /* leftover copy */
      }
    }
  } catch (err) {
    console.error("pushEvent", realId, err);
    throw new Error(googleErr(err));
  }
}

export async function deleteGoogleEvent(state: AppState, event: CourseEvent) {
  const api = cal(state);
  if (!api || !event.googleEventId || !event.googleCalendarId) return;
  try {
    await api.events.delete({ calendarId: event.googleCalendarId, eventId: event.googleEventId });
  } catch {
    /* already gone */
  }
}

async function dropGoogleDuplicates(state: AppState, removed: CourseEvent[]) {
  const api = cal(state);
  if (!api) return;
  const keepIds = new Set(
    state.events.map((e) => e.googleEventId).filter((id): id is string => Boolean(id)),
  );
  const seen = new Set<string>();
  for (const event of removed) {
    if (!event.googleEventId || !event.googleCalendarId) continue;
    if (keepIds.has(event.googleEventId)) continue;
    const key = `${event.googleCalendarId}|${event.googleEventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await api.events.delete({ calendarId: event.googleCalendarId, eventId: event.googleEventId });
    } catch {
      /* already gone */
    }
  }
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

function toRrule(rec: Recurrence) {
  const freq = (rec.freq || "weekly").toUpperCase();
  const parts = [`FREQ=${freq}`];
  if ((rec.interval || 1) > 1) parts.push(`INTERVAL=${rec.interval}`);
  if (freq === "WEEKLY" && rec.byDay?.length) parts.push(`BYDAY=${rec.byDay.join(",")}`);
  if (rec.count && rec.count > 0) parts.push(`COUNT=${rec.count}`);
  if (rec.until) parts.push(`UNTIL=${rec.until.replace(/[-:]/g, "").slice(0, 15)}Z`);
  return `RRULE:${parts.join(";")}`;
}

function recurrenceFromGoogle(g: calendar_v3.Schema$Event): Recurrence | null {
  const raw = (g.recurrence || []).find((r) => /RRULE/i.test(r));
  if (!raw) return null;
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
      untilIso = new Date(
        `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`,
      ).toISOString();
    }
  }
  return { freq, interval, byDay: byDay.length ? byDay : undefined, until: untilIso, count };
}

function upsertFromGoogle(state: AppState, g: calendar_v3.Schema$Event, calendarId: string) {
  if (!g.id || g.status === "cancelled") return;
  const askualaId = g.extendedProperties?.private?.askualaId;
  const masterId = g.recurringEventId;
  const ours = state.events.find(
    (e) =>
      e.googleEventId === g.id ||
      e.googleEventId === masterId ||
      (askualaId && e.id === askualaId),
  );
  if (ours) {
    if (!ours.googleEventId) ours.googleEventId = masterId || g.id;
    ours.googleCalendarId = calendarId;
    ours.viewOnly = false;
    if (g.updated && ours.updatedAt && new Date(g.updated) > new Date(ours.updatedAt)) {
      const start = g.start?.dateTime || (g.start?.date ? `${g.start.date}T00:00:00` : null);
      if (start) {
        ours.title = g.summary || ours.title;
        ours.details = g.description || ours.details;
        ours.start = new Date(start).toISOString();
        ours.end = g.end?.dateTime ? new Date(g.end.dateTime).toISOString() : ours.end;
        ours.location = g.location || ours.location;
        ours.allDay = Boolean(g.start?.date && !g.start?.dateTime);
        ours.updatedAt = nowIso();
      }
    }
    return;
  }

  if (masterId) return;

  const start = g.start?.dateTime || (g.start?.date ? `${g.start.date}T00:00:00` : null);
  if (!start) return;
  const startIso = new Date(start).toISOString();
  const title = g.summary || "(busy)";
  const rec = recurrenceFromGoogle(g);
  const guessedType = guessImportedType(title);
  const datedWork = shouldNotRecur({ title, type: guessedType });
  const seriesHit = !datedWork
    ? state.events.find((e) => {
        if (e.canceled || !e.recurrence) return false;
        const guessCourse =
          inferCourseId(
            { title, details: g.description || "", courseId: state.courses.find((c) => c.googleCalendarId === calendarId)?.id || null } as CourseEvent,
            state.courses,
          ) ||
          e.courseId;
        const incoming = {
          ...e,
          title,
          start: startIso,
          type: guessedType,
          courseId: guessCourse,
          recurrence: rec || e.recurrence,
        };
        return recurringSlotKey(incoming) === recurringSlotKey(e);
      })
    : undefined;
  if (seriesHit) {
    seriesHit.googleEventId = seriesHit.googleEventId || g.id;
    return;
  }
  const courseId =
    inferCourseId(
      { title, details: g.description || "", courseId: state.courses.find((c) => c.googleCalendarId === calendarId)?.id || null } as CourseEvent,
      state.courses,
    ) ||
    state.courses.find((c) => c.googleCalendarId === calendarId)?.id ||
    null;
  const dup = findMatchingEvent(
    state.events,
    { courseId, title, start: startIso, type: guessedType, recurrence: datedWork ? null : rec },
    state.courses,
  );
  if (dup) {
    dup.googleEventId = dup.googleEventId || g.id;
    dup.googleCalendarId = dup.googleCalendarId || calendarId;
    dup.viewOnly = false;
    if (datedWork) dup.recurrence = null;
    if (g.description && g.description.length > (dup.details?.length || 0)) dup.details = g.description;
    if (g.location && !dup.location) dup.location = g.location;
    return;
  }

  state.events.push({
    id: nid(),
    courseId: inferCourseId(
      { title, details: g.description || "", courseId: state.courses.find((c) => c.googleCalendarId === calendarId)?.id || null } as CourseEvent,
      state.courses,
    ) ||
      state.courses.find((c) => c.googleCalendarId === calendarId)?.id ||
      null,
    title,
    details: g.description || "Synced from Google Calendar. Edits here write back to Google.",
    type: guessedType,
    start: startIso,
    end: g.end?.dateTime ? new Date(g.end.dateTime).toISOString() : g.end?.date ? `${g.end.date}T00:00:00.000Z` : null,
    allDay: Boolean(g.start?.date && !g.start?.dateTime),
    location: g.location || "",
    weight: "",
    source: "google",
    googleEventId: g.id,
    googleCalendarId: calendarId,
    viewOnly: false,
    recurrence: datedWork ? null : rec,
    releasedAt: null,
    canceled: false,
    googleAlerts: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function parseAskualaCalendarTitle(summary: string) {
  const named = summary.match(
    /^Askuala(?: Buddy)? ·\s+([A-Za-z]{2,6}(?:\s*&\s*[A-Za-z]{2,4})?\s+\d{3,5}[A-Za-z]?)\s+(.+)$/i,
  );
  if (named) return { code: named[1].replace(/\s+/g, " ").toUpperCase(), name: named[2].trim() };
  const courseish = summary.match(/\b([A-Za-z]{2,6}(?:\s*&\s*[A-Za-z]{2,4})?)\s+(\d{3,5}[A-Za-z]?)\b/);
  if (courseish) {
    const code = `${courseish[1]} ${courseish[2]}`.replace(/\s+/g, " ").toUpperCase();
    const name = summary.replace(GOOGLE_CAL_TITLE_RE, "").replace(courseish[0], "").trim() || code;
    return { code, name };
  }
  return null;
}

function skipGoogleCalendar(item: calendar_v3.Schema$CalendarListEntry) {
  const id = item.id || "";
  const summary = item.summary || "";
  if (item.accessRole === "freeBusyReader") return true;
  if (/holidays in /i.test(summary)) return true;
  if (/holiday@group\.v\.calendar\.google\.com/i.test(id)) return true;
  if (/weather.*@group\.v\.calendar\.google\.com/i.test(id)) return true;
  return false;
}

function ensureCourseFromCalendar(state: AppState, item: calendar_v3.Schema$CalendarListEntry, parsed: { code: string; name: string }) {
  if (!item.id) return;
  let course = state.courses.find(
    (c) => c.googleCalendarId === item.id || (!c.dropped && c.code.toLowerCase() === parsed.code.toLowerCase()),
  );
  if (!course) {
    const guess = currentAcademicGuess();
    const color = nextCourseColor(state.courses.length);
    const now = nowIso();
    course = {
      id: nid(),
      code: parsed.code,
      name: parsed.name,
      instructor: "",
      instructorEmail: "",
      location: "",
      meetingPattern: "",
      term: guess.term,
      year: guess.year,
      academicYear: academicYearFor(guess.term, guess.year),
      color: color.hex,
      googleColorId: item.colorId || color.google,
      googleCalendarId: item.id,
      policies: [],
      extraContext: "",
      officeHours: "",
      syllabusText: "",
      dropped: false,
      createdAt: now,
      updatedAt: now,
    };
    state.courses.push(course);
  } else {
    course.googleCalendarId = item.id;
    if (!course.name) course.name = parsed.name;
  }
}

async function calendarsToSync(api: calendar_v3.Calendar, state: AppState) {
  const ids: string[] = [];
  const seen: string[] = [];
  const restored: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await api.calendarList.list({ maxResults: 250, pageToken, showHidden: true });
    for (const item of res.data.items || []) {
      if (!item.id) continue;
      const summary = (item.summary || item.id).trim();
      seen.push(summary);
      if (skipGoogleCalendar(item)) continue;
      if (item.selected === false && item.id !== "primary") continue;
      ids.push(item.id);
      const parsed = parseAskualaCalendarTitle(summary);
      if (parsed) {
        ensureCourseFromCalendar(state, item, parsed);
        restored.push(summary);
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  if (!ids.includes("primary")) ids.unshift("primary");
  return { ids: [...new Set(ids)], seen, restored };
}

async function listEvents(api: calendar_v3.Calendar, calendarId: string, timeMin: string, timeMax: string) {
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await api.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: false,
      maxResults: 2500,
      pageToken,
      fields:
        "nextPageToken,items(id,status,summary,description,location,start,end,updated,recurrence,recurringEventId,extendedProperties)",
    });
    items.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return items;
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  if (!items.length) return;
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker()));
}

function seriesStillOpen(event: CourseEvent, now: Date) {
  const rec = event.recurrence;
  if (!rec) return false;
  if (rec.until) return new Date(rec.until).getTime() >= now.getTime();
  return true;
}

function eventIsCurrentOrFuture(event: CourseEvent, now: Date) {
  if (seriesStillOpen(event, now)) return true;
  const end = new Date(event.end || event.start);
  return end.getTime() >= now.getTime();
}

function needsOutboundPush(event: CourseEvent, now: Date) {
  if (event.canceled || event.id.includes("::")) return false;
  if (!eventIsCurrentOrFuture(event, now)) return false;
  if (quietOnPhone(event)) {
    const stripReminders = Boolean(event.googleAlerts || event.alerts?.length);
    event.googleAlerts = false;
    event.alerts = [];
    return Boolean(stripReminders && event.googleEventId);
  }
  ensureEventPhoneReminders(event);
  const remind = wantsPhoneReminders(event);
  const desired = remind ? "primary" : event.googleCalendarId || "primary";
  if (event.googleEventId && event.googleCalendarId === desired) return false;
  return true;
}

export async function refreshGoogleIfStale(state: AppState, maxAgeMs = 90_000) {
  if (!state.settings.google.refreshToken && !state.settings.google.accessToken) return;
  const at = Date.parse(state.settings.google.lastSyncedAt || "");
  if (Number.isFinite(at) && Date.now() - at < maxAgeMs) return;
  try {
    await syncGoogle(state);
  } catch (err) {
    console.error("refreshGoogleIfStale", err);
  }
}

export async function syncGoogle(state: AppState) {
  const api = cal(state);
  if (!api) {
    return {
      ok: false,
      reason: "setup" as const,
      message: "Connect Google Calendar to sync.",
    };
  }
  if (!state.settings.google.refreshToken && !state.settings.google.accessToken) {
    return { ok: false, reason: "auth" as const, reconnect: true, message: "Connect Google Calendar to sync both ways." };
  }
  const expiredAccess =
    Boolean(state.settings.google.expiryDate) && Date.now() > state.settings.google.expiryDate + 30_000;
  if (expiredAccess && !state.settings.google.refreshToken) {
    clearGoogleSession(state);
    return { ok: false, reason: "auth" as const, reconnect: true, message: GOOGLE_RECONNECT_MSG };
  }

  const removedBefore = dedupeEvents(state);

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 400 * 86400000).toISOString();
  let discovered: Awaited<ReturnType<typeof calendarsToSync>>;
  try {
    discovered = await calendarsToSync(api, state);
  } catch (err) {
    if (isInvalidGrant(err) || isInsufficientScope(err)) {
      clearGoogleSession(state);
      return { ok: false, reason: "auth" as const, reconnect: true, message: GOOGLE_RECONNECT_MSG };
    }
    throw err;
  }
  const calendarIds = [
    ...new Set([
      ...discovered.ids,
      ...state.courses.map((c) => c.googleCalendarId).filter((id): id is string => Boolean(id)),
    ]),
  ];

  await mapPool(calendarIds, 4, async (calendarId) => {
    try {
      const items = await listEvents(api, calendarId, timeMin, timeMax);
      for (const g of items) upsertFromGoogle(state, g, calendarId);
    } catch (err) {
      console.error("syncGoogle list", calendarId, err);
    }
  });

  for (const course of state.courses) {
    if (course.dropped || course.googleCalendarId) continue;
    try {
      await ensureCourseCalendar(state, course);
    } catch (err) {
      console.error("ensureCourseCalendar", course.code, err);
    }
  }

  attachEventsToCourses(state);
  normalizePlannerEvents(state);

  const canceledGoogle = state.events.filter((event) => event.canceled && event.googleEventId && event.googleCalendarId);
  await mapPool(canceledGoogle, 4, async (event) => {
    try {
      await deleteGoogleEvent(state, event);
      event.googleEventId = null;
    } catch (err) {
      console.error("syncGoogle delete", event.id, err);
    }
  });

  const outbound = state.events.filter((event) => needsOutboundPush(event, now));
  await mapPool(outbound, 4, async (event) => {
    try {
      await pushEvent(state, event, true);
    } catch (err) {
      console.error("syncGoogle push", event.id, err);
    }
  });

  attachEventsToCourses(state);
  collapseGoogleSeries(state);
  normalizePlannerEvents(state);
  const removedAfter = dedupeEvents(state);
  await dropGoogleDuplicates(state, [...removedBefore, ...removedAfter]);

  const email = state.settings.google.connectedEmail || "Google Calendar";
  state.settings.google.lastSyncedAt = new Date().toISOString();
  return {
    ok: true,
    reason: "synced" as const,
    message: "Calendar is up to date.",
    googleEmail: email,
    restoredCalendars: discovered.restored,
    visibleCalendars: discovered.seen,
  };
}
