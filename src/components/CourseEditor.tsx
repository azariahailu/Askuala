"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBuddy } from "./BuddyProvider";
import { COURSE_COLORS, type Course, type Policy, type TermName } from "@/lib/types";
import { allTerms } from "@/lib/terms";
import { nid } from "@/lib/ids";

type Draft = {
  code: string;
  name: string;
  instructor: string;
  instructorEmail: string;
  location: string;
  meetingPattern: string;
  term: TermName;
  year: number;
  color: string;
  googleColorId: string;
  extraContext: string;
  officeHours: string;
  policies: Policy[];
};

function fromCourse(c?: Course): Draft {
  const guess = allTerms()[0];
  const color = COURSE_COLORS[0];
  return {
    code: c?.code || "",
    name: c?.name || "",
    instructor: c?.instructor || "",
    instructorEmail: c?.instructorEmail || "",
    location: c?.location || "",
    meetingPattern: c?.meetingPattern || "",
    term: c?.term || guess.term,
    year: c?.year || guess.year,
    color: c?.color || color.hex,
    googleColorId: c?.googleColorId || color.google,
    extraContext: c?.extraContext || "",
    officeHours: c?.officeHours || "",
    policies: c?.policies?.length ? c.policies.map((p) => ({ ...p })) : [],
  };
}

export function CourseEditor({
  course,
  onClose,
}: {
  course?: Course;
  onClose: () => void;
}) {
  const { postJson } = useBuddy();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => fromCourse(course));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (!draft.code.trim() || !draft.name.trim()) throw new Error("Code and name are required.");
      const body = {
        ...draft,
        code: draft.code.trim(),
        name: draft.name.trim(),
        year: Number(draft.year),
      };
      if (course) {
        await postJson("/api/courses", { id: course.id, ...body }, "PATCH");
        onClose();
      } else {
        const json = await postJson("/api/courses", { create: true, ...body }, "POST");
        const id = (json.extra as { course?: { id: string } } | undefined)?.course?.id;
        onClose();
        if (id) router.push(`/courses/${id}`);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <form
        onSubmit={save}
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold">{course ? "Edit course" : "New course"}</h2>
        <p className="mt-1 text-sm text-muted">Change any field yourself. Syllabus upload/paste is separate and can still fill these in.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Course code
            <input className="mt-1 w-full bg-input p-2" value={draft.code} onChange={(e) => set("code", e.target.value)} placeholder="ENGL 1014" />
          </label>
          <label className="block text-sm sm:col-span-2">
            Course name
            <input className="mt-1 w-full bg-input p-2" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Black and Indigenous Ecologies" />
          </label>
          <label className="block text-sm">
            Instructor
            <input className="mt-1 w-full bg-input p-2" value={draft.instructor} onChange={(e) => set("instructor", e.target.value)} />
          </label>
          <label className="block text-sm">
            Instructor email
            <input className="mt-1 w-full bg-input p-2" value={draft.instructorEmail} onChange={(e) => set("instructorEmail", e.target.value)} />
          </label>
          <label className="block text-sm">
            Meeting pattern
            <input className="mt-1 w-full bg-input p-2" value={draft.meetingPattern} onChange={(e) => set("meetingPattern", e.target.value)} placeholder="MW 11:35-12:50 PM" />
          </label>
          <label className="block text-sm">
            Classroom / location
            <input className="mt-1 w-full bg-input p-2" value={draft.location} onChange={(e) => set("location", e.target.value)} />
          </label>
          <label className="block text-sm">
            Term
            <select
              className="mt-1 w-full bg-input p-2"
              value={`${draft.term}-${draft.year}`}
              onChange={(e) => {
                const hit = allTerms().find((t) => `${t.term}-${t.year}` === e.target.value);
                if (!hit) return;
                setDraft((d) => ({ ...d, term: hit.term, year: hit.year }));
              }}
            >
              {allTerms().map((t) => (
                <option key={t.label} value={`${t.term}-${t.year}`}>
                  Year {t.academicYear} · {t.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">Year 1 is Fall 2026 / Spring 2027. The syllabus “Fall 2026” line sets term and calendar year; Years 1–4 map that onto 2026–2030.</span>
          </label>
          <label className="block text-sm">
            Color
            <div className="mt-2 flex flex-wrap gap-2">
              {COURSE_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`h-7 w-7 rounded-full border ${draft.color === c.hex ? "border-ink ring-2 ring-gold" : "border-line"}`}
                  style={{ background: c.hex }}
                  onClick={() => setDraft((d) => ({ ...d, color: c.hex, googleColorId: c.google }))}
                  aria-label={c.hex}
                />
              ))}
            </div>
          </label>
        </div>

        <label className="mt-4 block text-sm">
          Weekly office hours / repeating times
          <textarea
            className="mt-1 min-h-16 w-full rounded-lg bg-input p-2"
            value={draft.officeHours}
            onChange={(e) => set("officeHours", e.target.value)}
            placeholder="Wed 4:00–5:00pm LC 101"
          />
          <span className="mt-1 block text-xs text-muted">Saved onto the calendar as a repeating series (through the end of term), not just this text field.</span>
        </label>

        <label className="mt-4 block text-sm">
          Extra notes (your own)
          <textarea className="mt-1 min-h-24 w-full rounded-lg bg-input p-2" value={draft.extraContext} onChange={(e) => set("extraContext", e.target.value)} />
        </label>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Key policies (short bullets)</h3>
            <button
              type="button"
              className="text-sm text-gold-2"
              onClick={() => setDraft((d) => ({ ...d, policies: [...d.policies, { id: nid(), title: "", body: "" }] }))}
            >
              + policy
            </button>
          </div>
          {draft.policies.length === 0 && <p className="mt-2 text-sm text-muted">None yet. Add grading, attendance, AI use, etc.</p>}
          {draft.policies.map((p, i) => (
            <div key={p.id} className="mt-2 rounded-lg border border-line p-2">
              <input
                className="w-full bg-input p-1 text-sm"
                placeholder="Policy title"
                value={p.title}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    policies: d.policies.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)),
                  }))
                }
              />
              <textarea
                className="mt-1 min-h-16 w-full bg-input p-1 text-sm"
                placeholder="One highlight per line"
                value={p.body}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    policies: d.policies.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)),
                  }))
                }
              />
              <button
                type="button"
                className="mt-1 text-xs text-red-400"
                onClick={() => setDraft((d) => ({ ...d, policies: d.policies.filter((_, idx) => idx !== i) }))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2">
            Cancel
          </button>
          <button disabled={busy} className="rounded-lg bg-gold px-4 py-2 text-on-gold disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
