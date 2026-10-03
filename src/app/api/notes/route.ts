import { fail, mutate } from "@/lib/api";
import { extractTextFromBuffer } from "@/lib/extract-text";
import { defaultAlerts, nid, nowIso } from "@/lib/ids";
import { generateStudySummary } from "@/lib/note-summary";
import { pushNoteUploadsToDrive, pushStudyPdfToDrive } from "@/lib/google-drive";
import { readUpload, saveUpload } from "@/lib/store";
import { studyGuidePdf } from "@/lib/study-pdf";
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

async function pushStudy(state: Parameters<typeof pushStudyPdfToDrive>[0]["state"], userId: string, note: CourseNote) {
  if (!note.summary.trim()) return;
  const course = state.courses.find((c) => c.id === note.courseId);
  const buf = await studyGuidePdf(`${note.title || "Study guide"}`, note.summary);
  const date = (note.catalogDate || note.createdAt || "").slice(0, 10);
  await pushStudyPdfToDrive({
    state,
    userId,
    note,
    course,
    buf,
    filename: `${date} · ${note.title || "Study guide"}.pdf`,
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
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
      let audioBuf: Buffer | undefined;
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
      if (audio instanceof File && audio.size > 0) {
        const saved = await saveUpload(userId, audio, audio.name || "voice.webm");
        audioPath = saved.filename;
        audioBuf = saved.buf;
      }
      const course = state.courses.find((c) => c.id === courseId);
      const extraMaterials = await textFromUploads(
        attachments.map((a) => ({ name: a.filename, mime: a.mime, buf: fileBufs[a.path] })),
      );
      let study = "";
      try {
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
        audioPath,
        attachments,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.notes.push(note);
      try {
        await pushNoteUploadsToDrive(state, userId, note, course, { files: fileBufs, audio: audioBuf });
        await pushStudy(state, userId, note);
      } catch {
        /* local note still saved */
      }
      return { note };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    return await mutate(async (state, userId) => {
      const note = state.notes.find((n) => n.id === body.id);
      if (!note) throw new Error("Note not found");
      if (body.restoreSummary) {
        const prev = (note.summaryPrevious || "").trim();
        if (!prev) throw new Error("No previous study guide is saved for this note.");
        const current = note.summary;
        note.summary = prev;
        note.summaryPrevious = current;
      } else if (body.regenerateSummary) {
        const course = state.courses.find((c) => c.id === note.courseId);
        const extraMaterials = await textFromNoteAttachments(userId, note);
        const prior = note.summary;
        note.summary = await generateStudySummary({
          transcript: note.transcript,
          title: note.title,
          body: note.body,
          course,
          settings: state.settings,
          existing: note.summary,
          directions: String(body.guideDirections || ""),
          extraMaterials,
        });
        if (prior.trim() && prior !== note.summary) note.summaryPrevious = prior;
        try {
          await pushStudy(state, userId, note);
        } catch {
          /* keep the guide in the note */
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
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id") || "";
    if (!id) {
      try {
        const body = await req.json();
        id = String(body.id || "");
      } catch {
        /* no body */
      }
    }
    if (!id) throw new Error("Note not found");
    return await mutate((state) => {
      const before = state.notes.length;
      state.notes = state.notes.filter((n) => n.id !== id);
      if (state.notes.length === before) throw new Error("Note not found");
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}
