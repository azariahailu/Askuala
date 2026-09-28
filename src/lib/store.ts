import { nid, nowIso, emptyState } from "./ids";
import { googleAppReady } from "./google-app";
import { attachEventsToCourses, collapseGoogleSeries, dedupeEvents } from "./calendar-utils";
import { hydrateSyllabusWork } from "./apply-extraction";
import { applyCourseSchedule, salvageCourseName } from "./course-schedule";
import { normalizePlannerEvents } from "./normalize-events";
import { wasAway } from "./checkpoint";
import { smtpPeek } from "./mail-account";
import { assistantProvider } from "./llm";
import { ensureGuideChat } from "./guide-chat";
import { isAdminEmail } from "./admin";
import { applyPlannerSeed, isOwnerPlannerEmail, readOwnerUpload } from "./planner-seed";
import { persistList, persistRead, persistReadJson, persistWrite, persistWriteJson, onVercel, usesBlob } from "./persist";
import type { AppState, AppUser, ClientState, PublicSettings } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const queues = new Map<string, Promise<void>>();
const emails = new Map<string, string>();

export function bindUserEmail(userId: string, email: string) {
  emails.set(userId, email.trim().toLowerCase());
}

function assertUserId(userId: string) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(userId)) throw new Error("Invalid user");
}

export function userDir(userId: string) {
  assertUserId(userId);
  return path.join(DATA_DIR, "users", userId);
}

export function uploadDir(userId: string) {
  return path.join(userDir(userId), "uploads");
}

function storeKey(userId: string) {
  return `users/${userId}/store.json`;
}

function storePath(userId: string) {
  return path.join(userDir(userId), "store.json");
}

async function loadRawStore(userId: string): Promise<string | null> {
  const cloud = await persistReadJson<AppState>(storeKey(userId));
  if (cloud) return JSON.stringify(cloud);
  if (usesBlob() || onVercel()) return null;
  try {
    return await fs.readFile(storePath(userId), "utf8");
  } catch {
    try {
      return await fs.readFile(`${storePath(userId)}.bak`, "utf8");
    } catch {
      return null;
    }
  }
}

function hydrateState(parsed: AppState): AppState {
  const base = emptyState();
  const merged = {
    ...base,
    ...parsed,
    settings: {
      ...base.settings,
      ...parsed.settings,
      openaiKey: parsed.settings?.openaiKey ?? "",
      deepseekKey: parsed.settings?.deepseekKey ?? "",
      geminiKey: parsed.settings?.geminiKey ?? "",
      notification: {
        ...base.settings.notification,
        ...parsed.settings?.notification,
        digestDaily: parsed.settings?.notification?.digestDaily ?? true,
        digestWeekly: parsed.settings?.notification?.digestWeekly ?? true,
        digestDailyHour: parsed.settings?.notification?.digestDailyHour ?? 22,
        digestDailyMinute: parsed.settings?.notification?.digestDailyMinute ?? 0,
      },
      google: { ...base.settings.google, ...parsed.settings?.google },
      smtp: { ...base.settings.smtp, ...parsed.settings?.smtp },
    },
    courses: (parsed.courses ?? []).map((c) => ({ ...c, officeHours: c.officeHours || "" })),
    events: (parsed.events ?? [])
      .filter((e) => e && typeof e.start === "string" && e.start)
      .map((e) => ({
        ...e,
        title: e.title ?? "",
        details: e.details ?? "",
        releasedAt: e.releasedAt ?? null,
        googleAlerts: e.googleAlerts ?? false,
        alerts: e.alerts ?? [],
      })),
    notes: parsed.notes ?? [],
    messages: parsed.messages ?? [],
    chats: parsed.chats ?? [],
    activeChatId: parsed.activeChatId ?? null,
    quickPad: {
      body: parsed.quickPad?.body || "",
      todos: Array.isArray(parsed.quickPad?.todos) ? parsed.quickPad.todos : [],
      updatedAt: parsed.quickPad?.updatedAt || nowIso(),
    },
    firedAlertKeys: parsed.firedAlertKeys ?? [],
    uiText: parsed.uiText ?? {},
  };
  migrateChats(merged);
  try {
    attachEventsToCourses(merged);
  } catch (e) {
    console.error("attachEventsToCourses", e);
  }
  try {
    collapseGoogleSeries(merged);
  } catch (e) {
    console.error("collapseGoogleSeries", e);
  }
  try {
    hydrateSyllabusWork(merged);
  } catch (e) {
    console.error("hydrateSyllabusWork", e);
  }
  try {
    for (const course of merged.courses) {
      if (course.dropped) continue;
      course.name = salvageCourseName(course);
      applyCourseSchedule(merged, course);
    }
  } catch (e) {
    console.error("applyCourseSchedule", e);
  }
  try {
    dedupeEvents(merged);
  } catch (e) {
    console.error("dedupeEvents", e);
  }
  try {
    normalizePlannerEvents(merged);
    dedupeEvents(merged);
  } catch (e) {
    console.error("normalizePlannerEvents", e);
  }
  const activityAt = merged.lastActiveAt;
  const snap = merged.resumeStop;
  merged.lastActiveAt = activityAt;
  merged.resume = wasAway(activityAt) ? snap : undefined;
  return merged;
}

export async function readState(userId: string): Promise<AppState> {
  const destRaw = await loadRawStore(userId);
  try {
    let state: AppState;
    if (!destRaw) {
      state = emptyState();
    } else {
      try {
        state = hydrateState(JSON.parse(destRaw) as AppState);
      } catch (bad) {
        console.error("readState: store is unreadable", userId, bad);
        throw new Error("Could not read planner data.");
      }
    }
    const email = emails.get(userId);
    const seeded = await applyPlannerSeed(state, email);
    if (seeded || !destRaw) {
      await persistWriteJson(storeKey(userId), { ...state, resume: undefined });
    }
    return destRaw && !seeded ? state : hydrateState(state);
  } catch (err) {
    console.error("readState", userId, err);
    throw err instanceof Error ? err : new Error("Could not read planner data.");
  }
}

export async function listUserIds() {
  const names = new Set<string>();
  for (const key of await persistList("users/")) {
    const m = key.match(/^users\/([^/]+)\/store\.json$/);
    if (m) names.add(m[1]);
  }
  if (!usesBlob()) {
    try {
      const dirs = await fs.readdir(path.join(DATA_DIR, "users"));
      for (const name of dirs) {
        try {
          await fs.access(storePath(name));
          names.add(name);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* none */
    }
  }
  return [...names];
}

function migrateChats(state: AppState) {
  if (!state.chats) state.chats = [];
  if (!state.chats.length && state.messages?.length) {
    const first = state.messages.find((m) => m.role === "user")?.content || "Chat";
    state.chats.push({
      id: nid(),
      title: first.slice(0, 48) || "Chat",
      createdAt: state.messages[0]?.createdAt || nowIso(),
      updatedAt: state.messages[state.messages.length - 1]?.createdAt || nowIso(),
      messages: state.messages,
    });
  }
  ensureGuideChat(state);
  if (!state.activeChatId || !state.chats.some((c) => c.id === state.activeChatId)) {
    state.activeChatId = state.chats[0]?.id ?? null;
  }
  const active = state.chats.find((c) => c.id === state.activeChatId);
  state.messages = active?.messages ?? [];
}

export function activeChat(state: AppState) {
  migrateChats(state);
  return state.chats.find((c) => c.id === state.activeChatId) || null;
}

function plannerWeight(state: { courses?: unknown[]; events?: unknown[]; notes?: unknown[]; chats?: unknown[] }) {
  return (state.courses?.length || 0) + (state.events?.length || 0) + (state.notes?.length || 0) + (state.chats?.length || 0);
}

export async function writeState(userId: string, state: AppState) {
  migrateChats(state);
  try {
    attachEventsToCourses(state);
  } catch (e) {
    console.error("write attachEventsToCourses", e);
  }
  try {
    collapseGoogleSeries(state);
  } catch (e) {
    console.error("write collapseGoogleSeries", e);
  }
  try {
    normalizePlannerEvents(state);
    dedupeEvents(state);
  } catch (e) {
    console.error("write normalizePlannerEvents", e);
  }
  const dest = storePath(userId);
  let raw = "";
  try {
    raw = (await loadRawStore(userId)) || "";
  } catch {
    /* first write */
  }
  if (raw) {
    let prev: { courses?: unknown[]; events?: unknown[]; notes?: unknown[]; chats?: unknown[] } | null = null;
    try {
      prev = JSON.parse(raw);
    } catch {
      prev = null;
    }
    // A store we cannot parse is still the student's data: keep a copy and never replace it with an empty planner.
    if (!prev || (plannerWeight(prev) > 0 && plannerWeight(state) === 0)) {
      if (plannerWeight(state) === 0) {
        throw new Error("Refused to overwrite your saved planner with an empty one. Your data is untouched.");
      }
    }
  }
  const persist = { ...state, resume: undefined };
  await persistWriteJson(storeKey(userId), persist);
  if (!usesBlob() && !onVercel()) {
    await fs.mkdir(userDir(userId), { recursive: true });
    await fs.writeFile(dest, JSON.stringify(persist));
  }
}

export async function updateState<T>(userId: string, fn: (state: AppState) => Promise<T> | T): Promise<T> {
  let result!: T;
  const prev = queues.get(userId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const state = await readState(userId);
    result = await fn(state);
    if (result && typeof result === "object" && (result as { skipPersist?: boolean }).skipPersist) return;
    await writeState(userId, state);
  });
  queues.set(
    userId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  await run;
  return result;
}

export async function saveUpload(userId: string, file: File | Blob, filename: string) {
  const buf = Buffer.from(await file.arrayBuffer());
  const safe = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  if (onVercel() || usesBlob()) {
    await persistWrite(`users/${userId}/uploads/${safe}`, buf, file.type || "application/octet-stream");
    return { dest: "", size: buf.length, filename: safe, buf };
  }
  await fs.mkdir(uploadDir(userId), { recursive: true });
  const dest = path.join(uploadDir(userId), safe);
  await fs.writeFile(dest, buf);
  return { dest, size: buf.length, filename: safe, buf };
}

export async function readUpload(userId: string, storedName: string) {
  const name = path.basename(storedName);
  if (usesBlob()) {
    const own = await persistRead(`users/${userId}/uploads/${name}`);
    if (own) return own;
  }
  const email = emails.get(userId);
  if (email && isOwnerPlannerEmail(email)) {
    const owner = await readOwnerUpload(email, name);
    if (owner) return owner;
  }
  const dest = path.join(uploadDir(userId), name);
  return fs.readFile(dest);
}

export function publicUploadPath(storedName: string) {
  return `/api/files/${encodeURIComponent(storedName)}`;
}

export function toClient(user: AppUser, state: AppState): ClientState {
  const smtp = smtpPeek();
  const inbox = user.email;
  const settings: PublicSettings = {
    notification: { ...state.settings.notification, emailAddress: inbox, lastLoginMailAt: undefined },
    googleConnected: Boolean(
      state.settings.google.refreshToken ||
        (state.settings.google.accessToken &&
          (!state.settings.google.expiryDate || state.settings.google.expiryDate > Date.now() + 30_000)),
    ),
    googleEmail: state.settings.google.connectedEmail,
    driveReady: Boolean(state.settings.google.driveOk),
    appGoogleReady: googleAppReady(),
    smtpConfigured: smtp.configured,
    isAdmin: isAdminEmail(user.email),
    schoolCalHintDone: Boolean(state.settings.google.schoolCalHintDone),
    ...(isAdminEmail(user.email)
      ? { smtpHost: smtp.host, smtpPort: smtp.port, smtpUser: smtp.user }
      : {}),
    geminiConfigured: Boolean((state.settings.geminiKey || "").trim()),
    assistantProvider: assistantProvider(state.settings),
  };
  return {
    me: user,
    courses: state.courses.map((c) => ({
      ...c,
      syllabusText: "",
      extraContext: c.extraContext || "",
    })),
    events: state.events,
    notes: state.notes,
    messages: activeChat(state)?.messages ?? [],
    chats: state.chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, pinned: Boolean(c.pinned) })),
    activeChatId: state.activeChatId,
    quickPad: state.quickPad || { body: "", todos: [], updatedAt: nowIso() },
    settings,
    resume: state.resume,
    lastActiveAt: state.lastActiveAt,
    uiText: state.uiText || {},
  };
}
