import type { NoteKind } from "./types";

export type NoteComposerDraft = {
  title: string;
  body: string;
  transcript: string;
  summary: string;
  kind: NoteKind;
  catalogDate?: string;
};

export function noteDraftKey(courseId: string) {
  return `askuala-note-draft-${courseId}`;
}

function stores(): Storage[] {
  try {
    return [localStorage, sessionStorage];
  } catch {
    return [];
  }
}

export function readNoteDraft(courseId: string): NoteComposerDraft | null {
  if (typeof window === "undefined") return null;
  const keys = [noteDraftKey(courseId), `askuala-draft-${courseId}`];
  for (const store of stores()) {
    for (const k of keys) {
      try {
        const raw = store.getItem(k);
        if (!raw) continue;
        const d = JSON.parse(raw) as NoteComposerDraft;
        if (d.transcript?.trim() || d.title?.trim() || d.body?.trim() || d.summary?.trim()) return d;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export function writeNoteDraft(courseId: string, payload: NoteComposerDraft, allowClear = false) {
  if (typeof window === "undefined") return;
  const key = noteDraftKey(courseId);
  const empty = !payload.transcript?.trim() && !payload.title?.trim() && !payload.body?.trim() && !payload.summary?.trim();
  try {
    if (empty) {
      if (allowClear) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
        localStorage.removeItem(`askuala-draft-${courseId}`);
        sessionStorage.removeItem(`askuala-draft-${courseId}`);
      }
      return;
    }
    const raw = JSON.stringify({ ...payload, at: Date.now() });
    localStorage.setItem(key, raw);
    sessionStorage.setItem(key, raw);
  } catch {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...payload, at: Date.now() }));
    } catch {
      /* quota */
    }
  }
}

export function clearNoteDraft(courseId: string) {
  writeNoteDraft(courseId, { title: "", body: "", transcript: "", summary: "", kind: "note" }, true);
}
