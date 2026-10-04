import fs from "node:fs/promises";
import path from "node:path";
import { defaultSettings, emptyState } from "./ids";
import { persistRead, persistReadJson, usesCloud } from "./persist";
import type { AppState } from "./types";

/** Snapshot is stored in private Blob / this Mac’s gitignored folders: never in git. */
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

export async function loadOwnerSeed(email?: string | null): Promise<AppState | null> {
  const key = (email || "").trim().toLowerCase();
  if (!OWNER_EMAILS.has(key)) return null;
  if (usesCloud()) {
    const fromCloud = await persistReadJson<AppState>(`${seedBlobPrefix(key)}/planner.json`);
    if (fromCloud) return fromCloud;
  }
  try {
    const slug = key.replace(/@/g, "_at_").replace(/\./g, "_");
    const raw = await fs.readFile(path.join(process.cwd(), "src/lib/seed", `${slug}.json`), "utf8");
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

export async function readOwnerUpload(email: string, storedName: string): Promise<Buffer | null> {
  const key = email.trim().toLowerCase();
  if (!OWNER_EMAILS.has(key)) return null;
  const name = path.basename(storedName);
  if (usesCloud()) {
    const cloud = await persistRead(`${seedBlobPrefix(key)}/uploads/${name}`);
    if (cloud) return cloud;
  }
  try {
    return await fs.readFile(path.join(process.cwd(), "seed-files", key, name));
  } catch {
    return null;
  }
}

function stripHostSecrets(seed: AppState, email: string): AppState {
  const base = emptyState();
  const g = seed.settings?.google || base.settings.google;
  return {
    ...base,
    ...seed,
    settings: {
      ...defaultSettings(),
      ...seed.settings,
      openaiKey: seed.settings?.openaiKey || "",
      deepseekKey: seed.settings?.deepseekKey || "",
      geminiKey: seed.settings?.geminiKey || "",
      notification: {
        ...defaultSettings().notification,
        ...seed.settings?.notification,
        emailAddress: email,
      },
      plannerImported: true,
      google: {
        ...defaultSettings().google,
        ...g,
        clientId: "",
        clientSecret: "",
        accessToken: "",
        refreshToken: "",
        expiryDate: 0,
        schoolCalHintDone: true,
      },
    },
  };
}

/** Apply Azaria’s snapshot only when the login email matches. Other students stay on a blank planner. */
export async function applyPlannerSeed(state: AppState, email?: string | null) {
  const seed = await loadOwnerSeed(email);
  if (!seed) return false;
  const seedKey = (seed.settings?.geminiKey || "").trim();
  if (!plannerLooksEmpty(state)) {
    if (seedKey && !(state.settings.geminiKey || "").trim()) {
      state.settings.geminiKey = seedKey;
      return true;
    }
    return false;
  }
  const next = stripHostSecrets(seed, (email || "").trim().toLowerCase());
  state.courses = next.courses || [];
  state.events = next.events || [];
  state.notes = next.notes || [];
  state.chats = next.chats || [];
  state.messages = next.messages || [];
  state.activeChatId = next.activeChatId ?? state.chats[0]?.id ?? null;
  state.quickPad = next.quickPad || emptyState().quickPad;
  state.settings = next.settings;
  state.firedAlertKeys = next.firedAlertKeys || [];
  state.resumeStop = next.resumeStop;
  state.lastActiveAt = next.lastActiveAt;
  state.uiText = next.uiText || {};
  return true;
}
