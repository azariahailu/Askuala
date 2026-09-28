"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBuddy } from "./BuddyProvider";
import { CourseEditor } from "./CourseEditor";

export function AddCourseModal({ onClose, courseId }: { onClose: () => void; courseId?: string }) {
  const { data, postForm } = useBuddy();
  const router = useRouter();
  const course = courseId ? data?.courses.find((c) => c.id === courseId) : undefined;
  const [mode, setMode] = useState<"syllabus" | "manual">(courseId ? "syllabus" : "syllabus");
  const [extra, setExtra] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  if (mode === "manual") {
    return <CourseEditor course={course} onClose={onClose} />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const form = new FormData();
      form.set("extra", extra);
      if (courseId) form.set("courseId", courseId);
      if (files) for (const f of Array.from(files)) form.append("files", f);
      if (!files?.length && extra.trim().length < 8) throw new Error("Upload a syllabus or paste class info.");
      const json = await postForm("/api/courses/upload", form);
      const extraRes = json.extra as { summary?: string; courseId?: string } | undefined;
      setOk(extraRes?.summary || "Course saved from your materials.");
      if (extraRes?.courseId) {
        setTimeout(() => {
          onClose();
          router.push(`/courses/${extraRes.courseId}`);
          router.refresh();
        }, 600);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold">{courseId ? "Update this course" : "Add a course"}</h2>
        <div className="mt-3 flex gap-2 text-sm">
          <button type="button" className="rounded-full bg-gold px-3 py-1 text-on-gold" onClick={() => setMode("syllabus")}>
            From syllabus
          </button>
          <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => setMode("manual")}>
            Enter by hand
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">
          Upload a PDF or paste the Canvas syllabus. You can always edit name, schedule, and policies afterward.
        </p>
        <label className="mt-4 block text-sm">
          Syllabus or course files
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,application/pdf"
            onChange={(e) => setFiles(e.target.files)}
          />
        </label>
        <label className="mt-4 block text-sm">
          Paste Canvas syllabus (if there is no PDF)
          <textarea
            className="mt-1 min-h-32 w-full rounded-lg bg-input p-2"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Select all on the Canvas syllabus page, copy, paste here…"
          />
        </label>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        {ok && <p className="mt-2 text-sm text-gold-2">{ok}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2">
            Close
          </button>
          <button disabled={busy} className="rounded-lg bg-gold px-4 py-2 text-on-gold disabled:opacity-50">
            {busy ? "Reading…" : "Extract & save"}
          </button>
        </div>
      </form>
    </div>
  );
}
