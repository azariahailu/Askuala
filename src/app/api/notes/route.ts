import { fail, mutate } from "@/lib/api";
import { extractTextFromBuffer } from "@/lib/extract-text";
import { defaultAlerts, nid, nowIso } from "@/lib/ids";
import { generateStudySummary } from "@/lib/note-summary";
import { markNoteRemoved, readUpload, saveUpload } from "@/lib/store";
import { after } from "next/server";
import { backupNotesToDrive } from "@/lib/notes-backup";
import { requireUser } from "@/lib/auth";
import type { Attachment, CourseNote, NoteKind } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

async function textFromUploads(files: { name: string; mime: string; buf?: Buffer }[]) {
  const chunks: string[] = [];
  for (const file of files) {
    if (!file.buf?.length) continue;
    try {
      const text = (await extractTextFromBuffer(file.buf, file.mime, file.name)).trim();
      if (text) chunks.push(`### ${file.name}\n${text.slice(0, 12000)}`);
    } catch {
      /* skip unreadable files */
    }
  }
  return chunks.join("\n\n");
}

async function textFromNoteAttachments(userId: string, note: CourseNote) {
  const chunks: string[] = [];
  for (const att of note.attachments || []) {
    try {
      const buf = await readUpload(userId, att.path);
      const text = (await extractTextFromBuffer(buf, att.mime, att.filename)).trim();
      if (text) chunks.push(`### ${att.filename}\n${text.slice(0, 12000)}`);
    } catch {
      /* missing or binary */
    }
  }
  return chunks.join("\n\n");
}

/** If the server copy of a note is missing (e.g. lost to an older save), restore it from the copy the browser sent. */
function findOrRestore(state: { notes: CourseNote[] }, id: string, form: FormData) {
  let note = state.notes.find((n) => n.id === id);
  if (note) return note;
  try {
    const sent = JSON.parse(String(form.get("noteJson") || "")) as CourseNote;
    if (sent?.id === id && sent.courseId) {
      state.notes.push(sent);
      note = sent;
    }
  } catch {
    /* nothing sent */
  }
  if (!note) throw new Error("Note not found");
  return note;
}

async function scheduleBackup() {
  try {
    const user = await requireUser();
    after(() => backupNotesToDrive(user.id).catch((e) => console.error("notes backup", e)));
  } catch {
    /* not signed in */
  }
}

export async function POST(req: Request) {
  await scheduleBackup();
  try {
    const form = await req.formData();
    const updateId = String(form.get("updateId") || "");
    if (updateId) {
      return await mutate(async (state, userId) => {
        const note = findOrRestore(state, updateId, form);
        if (form.has("transcript")) note.transcript = String(form.get("transcript") || "");
        if (form.has("guideDirections")) note.guideDirections = String(form.get("guideDirections") || "");
        const audio = form.get("audio");
        if (audio instanceof File && audio.size > 0) {
          const saved = await saveUpload(userId, audio, audio.name || "voice.webm");
          note.audioPath = saved.filename;
          note.audioSavedAt = nowIso();
          note.audioDriveUrl = undefined;
        }
        note.updatedAt = nowIso();
        return { note };
      });
    }
    const regenerateId = String(form.get("regenerateId") || "");
    if (regenerateId) {
      return await mutate(async (state, userId) => {
        const note = findOrRestore(state, regenerateId, form);
        const guideDirections = String(form.get("guideDirections") || "");
        note.guideDirections = guideDirections;
        if (form.has("transcript")) note.transcript = String(form.get("transcript") || "");
        const audio = form.get("audio");
        if (audio instanceof File && audio.size > 0) {
          const saved = await saveUpload(userId, audio, audio.name || "voice.webm");
          note.audioPath = saved.filename;
          note.audioSavedAt = nowIso();
          note.audioDriveUrl = undefined;
        }
        const files = form.getAll("files").filter((f): f is File => f instanceof File);
        const newAttachments: Attachment[] = [];
        const fileBufs: Record<string, Buffer> = {};
        for (const file of files) {
          const saved = await saveUpload(userId, file, file.name);
          const att: Attachment = {
            id: nid(),
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size: saved.size,
            path: saved.filename,
            createdAt: nowIso(),
          };
          newAttachments.push(att);
          if (saved.buf) fileBufs[saved.filename] = saved.buf;
        }
        const course = state.courses.find((c) => c.id === note.courseId);
        const fromOld = await textFromNoteAttachments(userId, note);
        const fromNew = await textFromUploads(
          newAttachments.map((a) => ({ name: a.filename, mime: a.mime, buf: fileBufs[a.path] })),
        );
        if (newAttachments.length) note.attachments = [...(note.attachments || []), ...newAttachments];
        const extraMaterials = [fromOld, fromNew].filter(Boolean).join("\n\n");
        const prior = note.summary;
        note.summary = await generateStudySummary({
          transcript: note.transcript,
          title: note.title,
          body: note.body,
          course,
          settings: state.settings,
          existing: note.summary,
          directions: guideDirections,
          extraMaterials,
        });
        if (prior.trim() && prior !== note.summary) note.summaryPrevious = prior;
        if (note.summary.trim() && note.summary !== prior) {
          note.summaryReadyAt = nowIso();
          // Keep studyPdfDriveFileId so the next Drive push replaces the same file.
          note.studyPdfDriveUrl = undefined;
          note.studyPdfPath = undefined;
        }
        note.updatedAt = nowIso();
        return { note };
      });
    }
    const courseId = String(form.get("courseId") || "");
    const kind = String(form.get("kind") || "note") as NoteKind;
    const title = String(form.get("title") || "Untitled");
    const body = String(form.get("body") || "");
    const catalogDate = String(form.get("catalogDate") || nowIso().slice(0, 10));
    const reminderAt = String(form.get("reminderAt") || "") || null;
    const transcript = String(form.get("transcript") || "");
    const summary = String(form.get("summary") || "");
    const alertsRaw = String(form.get("alerts") || "[]");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const audio = form.get("audio");

    return await mutate(async (state, userId) => {
      const attachments: Attachment[] = [];
      const fileBufs: Record<string, Buffer> = {};
      for (const file of files) {
        const saved = await saveUpload(userId, file, file.name);
        attachments.push({
          id: nid(),
          filename: file.name,
          mime: file.type,
          size: saved.size,
          path: saved.filename,
          createdAt: nowIso(),
        });
        if (saved.buf) fileBufs[saved.filename] = saved.buf;
      }
      let audioPath: string | null = null;
      let audioSavedAt: string | undefined;
      if (audio instanceof File && audio.size > 0) {
        const saved = await saveUpload(userId, audio, audio.name || "voice.webm");
        audioPath = saved.filename;
        audioSavedAt = nowIso();
      }
      const course = state.courses.find((c) => c.id === courseId);
      const extraMaterials = await textFromUploads(
        attachments.map((a) => ({ name: a.filename, mime: a.mime, buf: fileBufs[a.path] })),
      );
      let study = "";
      if (form.get("buildGuide") === "1") try {
        study = await generateStudySummary({
          transcript,
          title,
          body,
          course,
          settings: state.settings,
          directions: summary,
          extraMaterials,
        });
      } catch {
        study = "";
      }
      let parsedAlerts: CourseNote["alerts"] = [];
      try {
        const parsed = JSON.parse(alertsRaw);
        if (Array.isArray(parsed)) parsedAlerts = parsed;
      } catch {
        parsedAlerts = [];
      }
      const note: CourseNote = {
        id: nid(),
        courseId,
        kind,
        title,
        body,
        catalogDate,
        reminderAt,
        alerts: parsedAlerts.length ? parsedAlerts : kind === "reminder" ? defaultAlerts() : [],
        transcript,
        summary: study,
        summaryReadyAt: study.trim() ? nowIso() : undefined,
        guideDirections: summary || undefined,
        audioPath,
        audioSavedAt,
        attachments,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.notes.push(note);
      // Voice stays on Askuala for 7 days (never Drive). Study PDFs wait 12h before Drive.
      return { note };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  await scheduleBackup();
  try {
    const body = await req.json();
    return await mutate(async (state, userId) => {
      if (body.restoreFromTrash) {
        state.trash = state.trash || [];
        const hit = state.trash.find((n) => n.id === body.id);
        if (!hit) throw new Error("That note is not in the recycle bin.");
        state.trash = state.trash.filter((n) => n.id !== body.id);
        const { deletedAt: _gone, ...note } = hit;
        void _gone;
        note.updatedAt = nowIso();
        state.notes.push(note);
        return { note };
      }
      const note = state.notes.find((n) => n.id === body.id);
      if (!note) throw new Error("Note not found");
      if (body.saveSummary && typeof body.summary === "string") {
        const prior = note.summary;
        const next = body.summary;
        if (prior.trim() && prior !== next) note.summaryPrevious = prior;
        note.summary = next;
        note.summaryReadyAt = nowIso();
        note.studyPdfDriveUrl = undefined;
        note.studyPdfPath = undefined;
      } else if (body.restoreSummary) {
        const prev = (note.summaryPrevious || "").trim();
        if (!prev) throw new Error("No previous study guide is saved for this note.");
        const current = note.summary;
        note.summary = prev;
        note.summaryPrevious = current;
        note.summaryReadyAt = nowIso();
        note.studyPdfDriveUrl = undefined;
        note.studyPdfPath = undefined;
      } else if (body.regenerateSummary) {
        const course = state.courses.find((c) => c.id === note.courseId);
        const extraMaterials = await textFromNoteAttachments(userId, note);
        const prior = note.summary;
        const guideDirections = String(body.guideDirections || "");
        note.guideDirections = guideDirections;
        note.summary = await generateStudySummary({
          transcript: note.transcript,
          title: note.title,
          body: note.body,
          course,
          settings: state.settings,
          existing: note.summary,
          directions: guideDirections,
          extraMaterials,
        });
        if (prior.trim() && prior !== note.summary) note.summaryPrevious = prior;
        if (note.summary.trim() && note.summary !== prior) {
          note.summaryReadyAt = nowIso();
          // Keep studyPdfDriveFileId so the next Drive push replaces the same file.
          note.studyPdfDriveUrl = undefined;
          note.studyPdfPath = undefined;
        }
      } else {
        Object.assign(note, { ...body, updatedAt: nowIso(), id: note.id });
      }
      note.updatedAt = nowIso();
      return { note };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  await scheduleBackup();
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id") || "";
    let permanent = url.searchParams.get("permanent") === "1";
    if (!id) {
      try {
        const body = await req.json();
        id = String(body.id || "");
        permanent = permanent || Boolean(body.permanent);
      } catch {
        /* no body */
      }
    }
    if (!id) throw new Error("Note not found");
    return await mutate((state) => {
      state.trash = state.trash || [];
      if (permanent) {
        // Permanent delete only from the recycle bin.
        const before = state.trash.length;
        state.trash = state.trash.filter((n) => n.id !== id);
        if (state.trash.length === before) throw new Error("That note is not in the recycle bin.");
        markNoteRemoved(state, id);
        return { ok: true };
      }
      const note = state.notes.find((n) => n.id === id);
      if (!note) throw new Error("Note not found");
      state.notes = state.notes.filter((n) => n.id !== id);
      state.trash.unshift({ ...note, deletedAt: nowIso() });
      markNoteRemoved(state, id);
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}
