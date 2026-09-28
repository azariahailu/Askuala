import fs from "node:fs/promises";
import path from "node:path";
import { defaultSettings, emptyState } from "./ids";
import { persistRead, persistReadJson, usesBlob } from "./persist";
import type { AppState, Course, CourseEvent, CourseNote, ChatThread, ChatMessage, QuickPad } from "./types";

export type PlannerSeed = {
  courses: Course[];
  events: CourseEvent[];
  notes: CourseNote[];
  chats: ChatThread[];
  messages: ChatMessage[];
  activeChatId: string | null;
  quickPad: QuickPad;
  digestDaily?: boolean;
  digestWeekly?: boolean;
  digestDailyHour?: number;
  digestDailyMinute?: number;
  schoolCalHintDone?: boolean;
};

/** Snapshot is stored in private Blob / this Mac’s gitignored folders — never in git. */
const OWNER_EMAILS = new Set(["azariahailusdk@gmail.com", "azariahsd@gmail.com"]);

export function isOwnerPlannerEmail(email?: string | null) {
  return OWNER_EMAILS.has((email || "").trim().toLowerCase());
}

export function seedBlobPrefix(email: string) {
  return `owner-seed/${email.trim().toLowerCase()}`;
}

export function plannerLooksEmpty(state: AppState) {
  return (state.courses?.length || 0) === 0 && (state.events?.length || 0) === 0 && (state.notes?.length || 0) === 0;
}

export async function loadOwnerSeed(email?: string | null): Promise<PlannerSeed | null> {
  const key = (email || "").trim().toLowerCase();
  if (!OWNER_EMAILS.has(key)) return null;
  if (usesBlob()) {
    const fromCloud = await persistReadJson<PlannerSeed>(`${seedBlobPrefix(key)}/planner.json`);
    if (fromCloud) return fromCloud;
  }
  try {
    const slug = key.replace(/@/g, "_at_").replace(/\./g, "_");
    const raw = await fs.readFile(path.join(process.cwd(), "src/lib/seed", `${slug}.json`), "utf8");
    return JSON.parse(raw) as PlannerSeed;
  } catch {
    return null;
  }
}

export async function readOwnerUpload(email: string, storedName: string): Promise<Buffer | null> {
  const key = email.trim().toLowerCase();
  if (!OWNER_EMAILS.has(key)) return null;
  const name = path.basename(storedName);
  if (usesBlob()) {
    const cloud = await persistRead(`${seedBlobPrefix(key)}/uploads/${name}`);
    if (cloud) return cloud;
  }
  try {
    return await fs.readFile(path.join(process.cwd(), "seed-files", key, name));
  } catch {
    return null;
  }
}

/** Apply Azaria’s snapshot only when the login email matches. Other students stay on a blank planner. */
export async function applyPlannerSeed(state: AppState, email?: string | null) {
  const seed = await loadOwnerSeed(email);
  if (!seed) return false;
  if (state.settings.plannerImported) return false;
  if (!plannerLooksEmpty(state)) return false;
  const base = emptyState();
  state.courses = seed.courses || [];
  state.events = seed.events || [];
  state.notes = seed.notes || [];
  state.chats = seed.chats || [];
  state.messages = seed.messages || [];
  state.activeChatId = seed.activeChatId ?? state.chats[0]?.id ?? null;
  state.quickPad = seed.quickPad || base.quickPad;
  state.settings = {
    ...defaultSettings(),
    ...state.settings,
    geminiKey: "",
    openaiKey: "",
    deepseekKey: "",
    notification: {
      ...defaultSettings().notification,
      ...state.settings.notification,
      digestDaily: seed.digestDaily ?? true,
      digestWeekly: seed.digestWeekly ?? true,
      digestDailyHour: seed.digestDailyHour ?? 22,
      digestDailyMinute: seed.digestDailyMinute ?? 0,
      emailAddress: (email || "").trim().toLowerCase(),
    },
    google: {
      ...defaultSettings().google,
      schoolCalHintDone: Boolean(seed.schoolCalHintDone),
    },
    smtp: defaultSettings().smtp,
    plannerImported: true,
  };
  return true;
}
