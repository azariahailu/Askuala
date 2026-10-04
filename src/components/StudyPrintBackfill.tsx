"use client";

import { useEffect, useRef } from "react";
import { ChatMarkdown } from "./ChatMarkdown";
import { useBuddy } from "./BuddyProvider";
import { captureStudyPrintPdf } from "@/lib/study-print";

export function StudyPrintBackfill() {
  const { data, postForm } = useBuddy();
  const bodyRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const skipped = useRef(new Set<string>());
  const note = (data?.notes || []).find((n) => n.summary.trim() && !n.studyPdfPath && !skipped.current.has(n.id));
  const course = data?.courses.find((c) => c.id === note?.courseId);
  const courseLabel = `${course?.code || ""} ${course?.name || ""}`.trim();

  useEffect(() => {
    if (!note?.summary || busy.current) return;
    const id = note.id;
    const t = window.setTimeout(() => {
      void (async () => {
        if (!bodyRef.current || busy.current) return;
        busy.current = true;
        try {
          const blob = await captureStudyPrintPdf({
            title: note.title,
            course: courseLabel,
            date: note.catalogDate || note.createdAt.slice(0, 10),
            html: bodyRef.current.innerHTML,
            extraHtml: note.body ? note.body.replace(/</g, "&lt;") : "",
          });
          const form = new FormData();
          form.set("noteId", id);
          form.set("studyPdf", new File([blob], "study-guide.pdf", { type: "application/pdf" }));
          await postForm("/api/notes/print-pdf", form);
        } catch {
          skipped.current.add(id);
        } finally {
          busy.current = false;
        }
      })();
    }, 800);
    return () => window.clearTimeout(t);
  }, [note, courseLabel, postForm]);

  if (!note) return null;
  return (
    <div className="pointer-events-none fixed left-[-140vw] top-0 w-[44rem]" aria-hidden>
      <div ref={bodyRef}>
        <ChatMarkdown text={note.summary} />
      </div>
    </div>
  );
}
