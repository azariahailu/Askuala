import { fail, mutate } from "@/lib/api";
import { extractTextFromBuffer, extractTextFromPath } from "@/lib/extract-text";
import { freeExtract } from "@/lib/local-chat";
import { applyExtraction } from "@/lib/apply-extraction";
import { applyDegreeRoadmap, looksLikeDegreeRoadmap, purgeRoadmapJunk } from "@/lib/planned-courses";
import { syncCourseDriveFolder } from "@/lib/google-drive";
import { saveUpload } from "@/lib/store";
import { nid, nowIso } from "@/lib/ids";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const extra = String(form.get("extra") || "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    let text = "";
    const attachments: Attachment[] = [];
    return await mutate(async (state, userId) => {
      for (const file of files) {
        const saved = await saveUpload(userId, file, file.name);
        attachments.push({
          id: nid(),
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size: saved.size,
          path: saved.filename,
          createdAt: nowIso(),
        });
        const extracted = saved.dest
          ? await extractTextFromPath(saved.dest, file.type, file.name)
          : await extractTextFromBuffer(saved.buf || Buffer.alloc(0), file.type, file.name);
        text += `\n\n--- ${file.name} ---\n${extracted}`;
      }
      const courseId = String(form.get("courseId") || "") || undefined;
      const source = `${text}\n\n${extra}`.trim();
      if (!source) throw new Error("Upload a syllabus or paste the Canvas page.");
      if (looksLikeDegreeRoadmap(source)) {
        purgeRoadmapJunk(state);
        const result = applyDegreeRoadmap(state, source);
        for (const plan of result.courses) {
          const course = state.courses.find((c) => c.code === plan.code && c.term === plan.term && c.year === plan.year);
          if (!course) continue;
          try {
            await syncCourseDriveFolder(state, course);
          } catch {
            /* planner still saved */
          }
        }
        return {
          courseId: courseId || state.courses[state.courses.length - 1]?.id,
          summary: `Degree roadmap: added ${result.created} course names (${result.skipped} already present). No lectures or assignments invented.`,
          files: attachments.length,
        };
      }
      const existing = courseId ? state.courses.find((c) => c.id === courseId) : undefined;
      const prev = existing
        ? { code: existing.code, name: existing.name, year: existing.year, term: existing.term }
        : undefined;
      const extraction = await freeExtract(source, extra, state.settings);
      const course = applyExtraction(state, extraction, { extraContext: extra, courseId });
      try {
        await syncCourseDriveFolder(state, course, prev);
      } catch {
        /* course still saved */
      }
      return { courseId: course.id, summary: extraction.summary, files: attachments.length };
    });
  } catch (err) {
    return fail(err);
  }
}
