import { createHash } from "node:crypto";
import { isPastEvent } from "./calendar-utils";
import { nowIso } from "./ids";
import type { AppState, PlannerResume } from "./types";

export const AWAY_MS = 3 * 60 * 60 * 1000;

export function syllabusFingerprint(text: string) {
  return createHash("sha1").update(text || "").digest("hex").slice(0, 16);
}

export function buildResume(state: AppState, page?: string): PlannerResume {
  const upcoming = state.events
    .filter((e) => !e.canceled && !isPastEvent(e) && e.type !== "office_hour")
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 14);
  const courses = state.courses.filter((c) => !c.dropped).map((c) => c.code);
  const lines = [
    `Stopped on ${page || "the app"}`,
    `Courses: ${courses.join(", ") || "none"}`,
    ...upcoming.map((e) => `${new Date(e.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${e.title}`),
  ];
  return { at: nowIso(), path: page || "", lines };
}

export function wasAway(lastActiveAt?: string | null) {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() >= AWAY_MS;
}

/** Update last-used snapshot. `stop` = leaving the app; `active` = still here. Do not overwrite the snapshot at the start of a return after 3h+. */
export function recordPresence(state: AppState, opts: { reason: "active" | "stop"; path?: string }) {
  const away = wasAway(state.lastActiveAt);
  const now = nowIso();
  if (opts.reason === "stop") {
    state.resumeStop = buildResume(state, opts.path);
    state.lastActiveAt = now;
    return { froze: true as const };
  }
  state.lastActiveAt = now;
  if (away) return { returning: true as const };
  state.resumeStop = buildResume(state, opts.path);
  return { ok: true as const };
}
