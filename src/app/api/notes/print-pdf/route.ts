import { fail, mutate } from "@/lib/api";
import { pushStudy, STUDY_PDF_DRIVE_DELAY_MS } from "@/lib/google-drive";
import { nowIso } from "@/lib/ids";
import { saveUpload } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const noteId = String(form.get("noteId") || "");
    const file = form.get("studyPdf");
    if (!noteId) throw new Error("Note not found");
    if (!(file instanceof Blob) || !file.size) throw new Error("Study PDF is missing");
    return await mutate(async (state, userId) => {
      const note = state.notes.find((n) => n.id === noteId);
      if (!note) throw new Error("Note not found");
      const saved = await saveUpload(userId, file, `${noteId}-print.pdf`);
      note.studyPdfPath = saved.filename;
      note.studyPdfFmt = 2;
      note.updatedAt = nowIso();
      // Store locally only. Drive gets the PDF after 12 hours without a rebuild — never on create.
      const ready = Date.parse(note.summaryReadyAt || note.createdAt || "");
      const due = Number.isFinite(ready) && Date.now() - ready >= STUDY_PDF_DRIVE_DELAY_MS;
      if (due && !note.studyPdfDriveUrl) {
        try {
          await pushStudy(state, userId, note);
        } catch {
          /* tick retries */
        }
      }
      return { note };
    });
  } catch (err) {
    return fail(err);
  }
}
