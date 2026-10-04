import { Readable } from "node:stream";
import { google } from "googleapis";
import { makeOAuthClient } from "./google";
import { readUpload } from "./store";
import type { AppState, Attachment, Course, CourseNote } from "./types";

const FOLDER = "application/vnd.google-apps.folder";
const ROOT = "Askuala";
const FILES = "Files";
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

function courseFolderName(course?: Pick<Course, "code" | "name"> | null) {
  if (!course) return "Unsorted";
  const name = `${course.code}${course.name ? ` · ${course.name}` : ""}`.trim();
  return driveName(name);
}

type CourseDrivePrev = Pick<Course, "code" | "name" | "year" | "term">;

const pendingDrive = new Map<string, CourseDrivePrev | undefined>();

export function markCourseDriveSync(course: Course, prev?: CourseDrivePrev) {
  if (!pendingDrive.has(course.id)) pendingDrive.set(course.id, prev);
}

export async function flushCourseDriveSync(state: AppState, extra: Course[] = []) {
  const jobs = [...pendingDrive.entries()];
  pendingDrive.clear();
  for (const course of extra) {
    if (!jobs.some(([id]) => id === course.id)) jobs.push([course.id, undefined]);
  }
  for (const [id, prev] of jobs) {
    const course = state.courses.find((c) => c.id === id);
    if (!course || course.dropped) continue;
    try {
      await syncCourseDriveFolder(state, course, prev);
    } catch {
      /* next save retries */
    }
  }
}

function driveApi(state: AppState) {
  const auth = makeOAuthClient(state);
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

async function listNamedFolders(drive: ReturnType<typeof google.drive>, name: string, parentId?: string) {
  const safe = name.replace(/'/g, "\\'");
  let q = `name='${safe}' and mimeType='${FOLDER}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const files: { id?: string | null; createdTime?: string | null }[] = [];
  let pageToken: string | undefined;
  do {
    const found = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, createdTime)",
      pageSize: 20,
      spaces: "drive",
      orderBy: "createdTime",
      pageToken,
    });
    files.push(...(found.data.files || []));
    pageToken = found.data.nextPageToken || undefined;
  } while (pageToken);
  return files.filter((f) => f.id);
}

async function folderAlive(drive: ReturnType<typeof google.drive>, id: string) {
  try {
    const f = await drive.files.get({ fileId: id, fields: "id,trashed" });
    return Boolean(f.data.id && !f.data.trashed);
  } catch {
    return false;
  }
}

async function childCount(drive: ReturnType<typeof google.drive>, parentId: string) {
  const found = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    pageSize: 20,
    spaces: "drive",
  });
  return found.data.files?.length || 0;
}

async function pickAskualaRoot(drive: ReturnType<typeof google.drive>, storedId?: string) {
  const inRoot = await listNamedFolders(drive, ROOT, "root");
  const pool = inRoot.length ? inRoot : await listNamedFolders(drive, ROOT);
  if (pool.length > 1) {
    let best = pool[0];
    let bestN = -1;
    let bestCreated = best.createdTime || "9999";
    for (const folder of pool) {
      const n = await childCount(drive, folder.id!);
      const created = folder.createdTime || "9999";
      if (n > bestN || (n === bestN && created < bestCreated)) {
        best = folder;
        bestN = n;
        bestCreated = created;
      }
    }
    return best.id || "";
  }
  if (pool[0]?.id) return pool[0].id;
  if (storedId && (await folderAlive(drive, storedId))) return storedId;
  return "";
}

async function childFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
) {
  const existing = await listNamedFolders(drive, name, parentId);
  if (existing[0]?.id) return existing[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER, parents: [parentId] },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Could not create a Drive folder.");
  return created.data.id;
}

export function resetDriveCatalog(state: AppState) {
  const g = state.settings.google;
  g.driveRootId = "";
  g.driveFilesId = "";
  g.driveUploadsId = "";
  g.driveOutputsId = "";
  g.driveVoiceId = "";
  g.driveOk = false;
  for (const note of state.notes) {
    note.audioDriveUrl = undefined;
    note.studyPdfDriveUrl = undefined;
    for (const file of note.attachments) {
      file.driveUrl = undefined;
      file.driveFileId = undefined;
    }
  }
}

export async function ensureAskualaDrive(state: AppState) {
  const drive = driveApi(state);
  if (!drive) return { ok: false as const, reason: "auth" as const };
  try {
    const g = state.settings.google;
    if (g.driveRootId && !(await folderAlive(drive, g.driveRootId))) {
      resetDriveCatalog(state);
    }
    const chosen = await pickAskualaRoot(drive, g.driveRootId);
    if (chosen && chosen !== g.driveRootId) {
      g.driveRootId = chosen;
      g.driveFilesId = "";
      g.driveUploadsId = "";
      g.driveOutputsId = "";
      g.driveVoiceId = "";
    } else if (!chosen) {
      resetDriveCatalog(state);
      const created = await drive.files.create({
        requestBody: { name: ROOT, mimeType: FOLDER },
        fields: "id",
      });
      g.driveRootId = created.data.id || "";
    } else {
      g.driveRootId = chosen;
    }
    if (!g.driveRootId) throw new Error("Could not create the Askuala Drive folder.");
    g.driveOk = true;
    return { ok: true as const, drive };
  } catch (err) {
    state.settings.google.driveOk = false;
    if (isDriveDenied(err)) return { ok: false as const, reason: "scope" as const };
    throw err;
  }
}

function yearName(course?: Pick<Course, "year"> | null) {
  return String(course?.year || new Date().getFullYear());
}

function termName(course?: Pick<Course, "term"> | null) {
  return course?.term || "Fall";
}

/** Creates Askuala / year / term / this course / Files (study PDFs) and Voice recordings. */
export async function ensureCourseDriveTree(state: AppState, course?: Course | null) {
  if (course) return syncCourseDriveFolder(state, course);
  const ready = await ensureAskualaDrive(state);
  if (!ready.ok || !state.settings.google.driveRootId) return ready;
  const root = state.settings.google.driveRootId;
  await courseBin(ready.drive, root, course, "outputs");
  await courseBin(ready.drive, root, course, "voice");
  return { ok: true as const };
}

/** Keep the Drive course folder in sync with code/name/term/year. Renames and moves; does not duplicate. */
export async function syncCourseDriveFolder(state: AppState, course: Course, prev?: CourseDrivePrev) {
  if (!state.settings.google.refreshToken && !state.settings.google.accessToken) {
    return { ok: false as const, reason: "auth" as const };
  }
  try {
    const ready = await ensureAskualaDrive(state);
    if (!ready.ok || !state.settings.google.driveRootId) return ready;
    const drive = ready.drive;
    const root = state.settings.google.driveRootId;
    const wantName = courseFolderName(course);
    const yearId = await childFolder(drive, yearName(course), root);
    const termId = await childFolder(drive, termName(course), yearId);
    let folderId = "";
    if (course.driveFolderId && (await folderAlive(drive, course.driveFolderId))) {
      folderId = course.driveFolderId;
    }
    if (!folderId) {
      folderId = (await listNamedFolders(drive, wantName, termId))[0]?.id || "";
    }
    if (!folderId && (course.driveFolderName || prev)) {
      const oldLabel = course.driveFolderName || (prev ? courseFolderName(prev) : "");
      if (oldLabel) folderId = (await listNamedFolders(drive, oldLabel, termId))[0]?.id || "";
      if (!folderId && prev) {
        const oldYear = (await listNamedFolders(drive, yearName(prev), root))[0]?.id;
        const oldTerm = oldYear ? (await listNamedFolders(drive, termName(prev), oldYear))[0]?.id : "";
        if (oldTerm) folderId = (await listNamedFolders(drive, oldLabel, oldTerm))[0]?.id || "";
      }
    }
    if (!folderId) folderId = await childFolder(drive, wantName, termId);
    else {
      const meta = await drive.files.get({ fileId: folderId, fields: "id,name,parents,trashed" });
      const parent = meta.data.parents?.[0] || "";
      const rename = meta.data.name !== wantName ? { name: wantName } : undefined;
      if (parent && parent !== termId) {
        await drive.files.update({
          fileId: folderId,
          ...(rename ? { requestBody: rename } : {}),
          addParents: termId,
          removeParents: parent,
          fields: "id",
        });
      } else if (rename) {
        await drive.files.update({
          fileId: folderId,
          requestBody: rename,
          fields: "id",
        });
      }
    }
    await childFolder(drive, VOICE, folderId);
    const filesId = await childFolder(drive, FILES, folderId);
    await flattenOutputsIntoFiles(drive, filesId);
    course.driveFolderId = folderId;
    course.driveFolderName = wantName;
    return { ok: true as const };
  } catch (err) {
    if (isDriveDenied(err)) {
      state.settings.google.driveOk = false;
      return { ok: false as const, reason: "scope" as const };
    }
    return { ok: false as const, reason: "error" as const };
  }
}

/** Askuala / year / term / course / Files (PDFs) or Voice recordings */
async function courseBin(
  drive: ReturnType<typeof google.drive>,
  rootId: string,
  course: Course | null | undefined,
  kind: DriveKind,
) {
  const yearId = await childFolder(drive, yearName(course), rootId);
  const termId = await childFolder(drive, termName(course), yearId);
  let courseId = "";
  if (course?.driveFolderId && (await folderAlive(drive, course.driveFolderId))) {
    courseId = course.driveFolderId;
  } else {
    courseId = await childFolder(drive, courseFolderName(course), termId);
    if (course) {
      course.driveFolderId = courseId;
      course.driveFolderName = courseFolderName(course);
    }
  }
  if (kind === "voice") return childFolder(drive, VOICE, courseId);
  const filesId = await childFolder(drive, FILES, courseId);
  await flattenOutputsIntoFiles(drive, filesId);
  return filesId;
}

async function flattenOutputsIntoFiles(drive: ReturnType<typeof google.drive>, filesId: string) {
  const outputs = await listNamedFolders(drive, OUTPUTS, filesId);
  for (const folder of outputs) {
    if (!folder.id) continue;
    let pageToken: string | undefined;
    do {
      const found = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: "nextPageToken, files(id)",
        pageSize: 50,
        pageToken,
        spaces: "drive",
      });
      for (const kid of found.data.files || []) {
        if (!kid.id) continue;
        await drive.files.update({
          fileId: kid.id,
          addParents: filesId,
          removeParents: folder.id,
          fields: "id",
        });
      }
      pageToken = found.data.nextPageToken || undefined;
    } while (pageToken);
    await drive.files.update({ fileId: folder.id, requestBody: { trashed: true } });
  }
}

async function findFileByName(drive: ReturnType<typeof google.drive>, parentId: string, name: string) {
  const safe = driveName(name).replace(/'/g, "\\'");
  const found = await drive.files.list({
    q: `name='${safe}' and '${parentId}' in parents and trashed=false`,
    fields: "files(id, webViewLink)",
    pageSize: 1,
    spaces: "drive",
  });
  const file = found.data.files?.[0];
  if (!file?.id) return null;
  return { id: file.id, url: file.webViewLink || "" };
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
  replace?: boolean;
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
  const parent = await courseBin(ready.drive, opts.state.settings.google.driveRootId, opts.course, opts.kind);
  const existing = await findFileByName(ready.drive, parent, opts.displayName);
  if (existing && !opts.replace) return { ok: true as const, ...existing };
  if (existing && opts.replace) {
    const updated = await ready.drive.files.update({
      fileId: existing.id,
      media: { mimeType: opts.mime || "application/octet-stream", body: Readable.from(buf) },
      fields: "id,webViewLink",
    });
    return { ok: true as const, id: updated.data.id || existing.id, url: updated.data.webViewLink || existing.url };
  }
  const hit = await uploadBuffer(ready.drive, parent, opts.displayName, opts.mime, buf);
  return { ok: true as const, ...hit };
}

export function voiceDriveName(note: Pick<CourseNote, "title" | "catalogDate" | "createdAt">, storedName: string) {
  const date = (note.catalogDate || note.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const ext = storedName.includes(".") ? storedName.slice(storedName.lastIndexOf(".")) : ".webm";
  const stamp = storedName.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 18);
  return `${date} · ${note.title || "Voice"} · ${stamp}${ext}`;
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
    return { ok: true as const };
  } catch (err) {
    if (isDriveDenied(err)) {
      state.settings.google.driveOk = false;
      return { ok: false as const, reason: "scope" as const };
    }
    return { ok: false as const, reason: "error" as const, message: err instanceof Error ? err.message : "Drive upload failed" };
  }
}

export const STUDY_PDF_DRIVE_DELAY_MS = 12 * 60 * 60 * 1000;

export async function pushStudy(state: AppState, userId: string, note: CourseNote) {
  if (!note.studyPdfPath) return { ok: false as const, reason: "missing" as const };
  const course = state.courses.find((c) => c.id === note.courseId);
  const buf = await readUpload(userId, note.studyPdfPath).catch(() => null);
  if (!buf?.length) return { ok: false as const, reason: "missing" as const };
  const date = (note.catalogDate || note.createdAt || "").slice(0, 10);
  return pushStudyPdfToDrive({
    state,
    userId,
    note,
    course,
    buf,
    filename: `${date} · ${note.title || "Study guide"}.pdf`,
  });
}

/** Copies a study-guide PDF to Drive only after it has sat 12 hours without a rebuild. */
export async function flushDueStudyPdfs(state: AppState, userId: string) {
  if (!state.settings.google.refreshToken && !state.settings.google.accessToken) return false;
  let changed = false;
  const now = Date.now();
  for (const note of state.notes) {
    if (!note.studyPdfPath || note.studyPdfDriveUrl) continue;
    const ready = Date.parse(note.summaryReadyAt || note.updatedAt || note.createdAt || "");
    if (!Number.isFinite(ready) || now - ready < STUDY_PDF_DRIVE_DELAY_MS) continue;
    try {
      const hit = await pushStudy(state, userId, note);
      if (hit.ok) changed = true;
    } catch {
      /* try again next tick */
    }
  }
  return changed;
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
    replace: true,
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

export async function backfillDrive(state: AppState, userId: string, opts?: { limit?: number }) {
  const pending = state.notes.some((n) => n.audioPath && !n.audioDriveUrl);
  if (!pending) return { ok: true as const, uploaded: 0 };
  const ready = await ensureAskualaDrive(state);
  if (!ready.ok) return { ok: false as const, reason: ready.reason, uploaded: 0 };
  const limit = Math.max(1, opts?.limit ?? 3);
  let uploaded = 0;
  for (const note of state.notes) {
    if (uploaded >= limit) break;
    if (!note.audioPath || note.audioDriveUrl) continue;
    const course = state.courses.find((c) => c.id === note.courseId);
    const before = `${note.audioDriveUrl || ""}|${note.attachments.map((a) => a.driveUrl || "").join(",")}`;
    const hit = await pushNoteUploadsToDrive(state, userId, note, course);
    if (!hit.ok && hit.reason === "scope") return { ...hit, uploaded };
    const after = `${note.audioDriveUrl || ""}|${note.attachments.map((a) => a.driveUrl || "").join(",")}`;
    if (after !== before) uploaded += 1;
  }
  return { ok: true as const, uploaded };
}
