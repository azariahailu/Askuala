import { Readable } from "node:stream";
import { google } from "googleapis";
import { makeOAuthClient } from "./google";
import { readUpload } from "./store";
import type { AppState, Attachment, Course, CourseNote } from "./types";

const FOLDER = "application/vnd.google-apps.folder";
const ROOT = "Askuala";
const FILES = "Files";
const UPLOADS = "uploads";
const OUTPUTS = "outputs";
const VOICE = "Voice recordings";

export type DriveKind = "uploads" | "outputs" | "voice";

export function isDriveDenied(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const extra = typeof err === "object" && err && "response" in err ? JSON.stringify((err as { response?: { data?: unknown } }).response?.data || "") : "";
  return /insufficient|accessNotConfigured|has not been used|drive\.googleapis|ACCESS_TOKEN_SCOPE|insufficientPermissions/i.test(`${msg} ${extra}`);
}

function driveName(raw: string) {
  return raw.replace(/[\\/:*?"<>|]/g, "·").replace(/\s+/g, " ").trim().slice(0, 180) || "Untitled";
}

function courseFolderName(course?: Course | null) {
  if (!course) return "Unsorted";
  const name = `${course.code}${course.name ? ` · ${course.name}` : ""}`.trim();
  return driveName(name);
}

function driveApi(state: AppState) {
  const auth = makeOAuthClient(state);
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

async function childFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
) {
  const safe = name.replace(/'/g, "\\'");
  const q = `name='${safe}' and mimeType='${FOLDER}' and '${parentId}' in parents and trashed=false`;
  const found = await drive.files.list({ q, fields: "files(id,name)", pageSize: 5, spaces: "drive" });
  const id = found.data.files?.[0]?.id;
  if (id) return id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER, parents: [parentId] },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Could not create a Drive folder.");
  return created.data.id;
}

export async function ensureAskualaDrive(state: AppState) {
  const drive = driveApi(state);
  if (!drive) return { ok: false as const, reason: "auth" as const };
  try {
    const g = state.settings.google;
    if (!g.driveRootId) {
      const q = `name='${ROOT}' and mimeType='${FOLDER}' and 'root' in parents and trashed=false`;
      const found = await drive.files.list({ q, fields: "files(id)", pageSize: 1, spaces: "drive" });
      g.driveRootId = found.data.files?.[0]?.id || "";
      if (!g.driveRootId) {
        const created = await drive.files.create({
          requestBody: { name: ROOT, mimeType: FOLDER },
          fields: "id",
        });
        g.driveRootId = created.data.id || "";
      }
    }
    if (!g.driveRootId) throw new Error("Could not create the Askuala Drive folder.");
    if (!g.driveFilesId) g.driveFilesId = await childFolder(drive, FILES, g.driveRootId);
    if (!g.driveUploadsId) g.driveUploadsId = await childFolder(drive, UPLOADS, g.driveFilesId);
    if (!g.driveOutputsId) g.driveOutputsId = await childFolder(drive, OUTPUTS, g.driveFilesId);
    if (!g.driveVoiceId) g.driveVoiceId = await childFolder(drive, VOICE, g.driveRootId);
    g.driveOk = true;
    return { ok: true as const, drive };
  } catch (err) {
    state.settings.google.driveOk = false;
    if (isDriveDenied(err)) return { ok: false as const, reason: "scope" as const };
    throw err;
  }
}

function branchId(state: AppState, kind: DriveKind) {
  if (kind === "voice") return state.settings.google.driveVoiceId;
  if (kind === "outputs") return state.settings.google.driveOutputsId;
  return state.settings.google.driveUploadsId;
}

async function courseLeaf(drive: ReturnType<typeof google.drive>, branch: string, course?: Course | null) {
  const year = String(course?.year || "Undated");
  const term = course?.term || "Other";
  const yearId = await childFolder(drive, year, branch);
  const termId = await childFolder(drive, term, yearId);
  return childFolder(drive, courseFolderName(course), termId);
}

async function uploadBuffer(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string,
  mime: string,
  buf: Buffer,
) {
  const created = await drive.files.create({
    requestBody: { name: driveName(name), parents: [parentId] },
    media: { mimeType: mime || "application/octet-stream", body: Readable.from(buf) },
    fields: "id,webViewLink",
  });
  return { id: created.data.id || "", url: created.data.webViewLink || "" };
}

export async function pushBytesToDrive(opts: {
  state: AppState;
  userId: string;
  course?: Course | null;
  kind: DriveKind;
  displayName: string;
  mime: string;
  buf?: Buffer;
  storedName?: string;
}) {
  const ready = await ensureAskualaDrive(opts.state);
  if (!ready.ok) return { ok: false as const, reason: ready.reason };
  let buf = opts.buf;
  if (!buf && opts.storedName) {
    try {
      buf = await readUpload(opts.userId, opts.storedName);
    } catch {
      buf = undefined;
    }
  }
  if (!buf?.length) return { ok: false as const, reason: "missing" as const };
  const parent = await courseLeaf(ready.drive, branchId(opts.state, opts.kind), opts.course);
  const hit = await uploadBuffer(ready.drive, parent, opts.displayName, opts.mime, buf);
  return { ok: true as const, ...hit };
}

export function voiceDriveName(note: Pick<CourseNote, "title" | "catalogDate" | "createdAt">, storedName: string) {
  const date = (note.catalogDate || note.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const ext = storedName.includes(".") ? storedName.slice(storedName.lastIndexOf(".")) : ".webm";
  return `${date} · ${note.title || "Voice"}${ext}`;
}

export async function pushNoteUploadsToDrive(
  state: AppState,
  userId: string,
  note: CourseNote,
  course?: Course | null,
  buffers?: { files?: Record<string, Buffer>; audio?: Buffer; studyPdf?: Buffer },
) {
  if (!state.settings.google.refreshToken && !state.settings.google.accessToken) {
    return { ok: false as const, reason: "auth" as const };
  }
  try {
    if (note.audioPath && !note.audioDriveUrl) {
      const hit = await pushBytesToDrive({
        state,
        userId,
        course,
        kind: "voice",
        storedName: note.audioPath,
        displayName: voiceDriveName(note, note.audioPath),
        mime: "audio/webm",
        buf: buffers?.audio,
      });
      if (hit.ok) note.audioDriveUrl = hit.url;
      else if (hit.reason !== "missing") return hit;
    }
    for (const file of note.attachments) {
      if (file.driveUrl) continue;
      const hit = await pushBytesToDrive({
        state,
        userId,
        course,
        kind: "uploads",
        storedName: file.path,
        displayName: file.filename,
        mime: file.mime,
        buf: file.path ? buffers?.files?.[file.path] : undefined,
      });
      if (hit.ok) {
        file.driveFileId = hit.id;
        file.driveUrl = hit.url;
      } else if (hit.reason !== "missing") return hit;
    }
    return { ok: true as const };
  } catch (err) {
    if (isDriveDenied(err)) {
      state.settings.google.driveOk = false;
      return { ok: false as const, reason: "scope" as const };
    }
    return { ok: false as const, reason: "error" as const, message: err instanceof Error ? err.message : "Drive upload failed" };
  }
}

export async function pushStudyPdfToDrive(opts: {
  state: AppState;
  userId: string;
  note: CourseNote;
  course?: Course | null;
  buf: Buffer;
  filename: string;
}) {
  const hit = await pushBytesToDrive({
    state: opts.state,
    userId: opts.userId,
    course: opts.course,
    kind: "outputs",
    displayName: opts.filename,
    mime: "application/pdf",
    buf: opts.buf,
  });
  if (hit.ok) opts.note.studyPdfDriveUrl = hit.url;
  return hit;
}

export async function pushPlainUploadsToDrive(
  state: AppState,
  userId: string,
  course: Course | undefined,
  files: Attachment[],
  buffers?: Record<string, Buffer>,
) {
  for (const file of files) {
    if (file.driveUrl) continue;
    const hit = await pushBytesToDrive({
      state,
      userId,
      course,
      kind: "uploads",
      storedName: file.path,
      displayName: file.filename,
      mime: file.mime,
      buf: file.path ? buffers?.[file.path] : undefined,
    });
    if (hit.ok) {
      file.driveFileId = hit.id;
      file.driveUrl = hit.url;
    } else if (hit.reason !== "missing") return hit;
  }
  return { ok: true as const };
}

export async function backfillDrive(state: AppState, userId: string) {
  const ready = await ensureAskualaDrive(state);
  if (!ready.ok) return { ok: false as const, reason: ready.reason, uploaded: 0 };
  let uploaded = 0;
  for (const note of state.notes) {
    const course = state.courses.find((c) => c.id === note.courseId);
    const before = `${note.audioDriveUrl || ""}|${note.attachments.map((a) => a.driveUrl || "").join(",")}|${note.studyPdfDriveUrl || ""}`;
    const hit = await pushNoteUploadsToDrive(state, userId, note, course);
    if (!hit.ok) return { ...hit, uploaded };
    const after = `${note.audioDriveUrl || ""}|${note.attachments.map((a) => a.driveUrl || "").join(",")}|${note.studyPdfDriveUrl || ""}`;
    if (after !== before) uploaded += 1;
  }
  return { ok: true as const, uploaded };
}
