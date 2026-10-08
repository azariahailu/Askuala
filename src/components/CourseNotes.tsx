"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { NOTE_KINDS, type AlertRule, type CourseNote, type NoteKind } from "@/lib/types";
import { useBuddy } from "./BuddyProvider";
import { ChatMarkdown } from "./ChatMarkdown";
import { nanoid } from "nanoid";
import { buildStudyDocx, studyFileSlug } from "@/lib/study-docx";
import { captureStudyPrintPdf, downloadBlob, printStudyGuide, studyGuideHtml } from "@/lib/study-print";
import { clearNoteDraft, readNoteDraft, writeNoteDraft } from "@/lib/note-draft";

export function CourseNotes({ courseId }: { courseId: string }) {
  const { data, postForm, postJson } = useBuddy();
  const notes = (data?.notes || []).filter((n) => n.courseId === courseId);
  const course = data?.courses.find((c) => c.id === courseId);
  const courseLabel = `${course?.code || ""} ${course?.name || ""}`.trim();
  const [kind, setKind] = useState<NoteKind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [catalogDate, setCatalogDate] = useState(new Date().toISOString().slice(0, 10));
  const [reminderAt, setReminderAt] = useState("");
  const [alerts, setAlerts] = useState<AlertRule[]>(() => [
    { id: "draft-email", amount: 1, unit: "days", channel: "email" },
    { id: "draft-popup", amount: 30, unit: "minutes", channel: "popup" },
  ]);
  const [files, setFiles] = useState<File[]>([]);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [recording, setRecording] = useState(false);
  const [sort, setSort] = useState<"date" | "kind">("date");
  const [err, setErr] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [openNote, setOpenNote] = useState<CourseNote | null>(null);
  const [recovered, setRecovered] = useState(false);
  const stopWanted = useRef(false);
  const deadline = useRef(0);
  const finals = useRef("");
  const restarting = useRef(false);
  const live = useRef({ title: "", body: "", transcript: "", summary: "", kind: "note" as NoteKind, catalogDate: "" });

  function persist(next = live.current, allowClear = false) {
    writeNoteDraft(courseId, next, allowClear);
  }

  function commit(patch: Partial<{ title: string; body: string; transcript: string; summary: string; kind: NoteKind; catalogDate: string }>) {
    const next = { ...live.current, ...patch };
    live.current = next;
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    if (patch.transcript !== undefined) {
      setTranscript(patch.transcript);
      finals.current = patch.transcript;
    }
    if (patch.summary !== undefined) setSummary(patch.summary);
    if (patch.kind !== undefined) setKind(patch.kind);
    if (patch.catalogDate !== undefined) setCatalogDate(patch.catalogDate);
    persist(next, false);
  }

  useEffect(() => {
    const d = readNoteDraft(courseId);
    if (d) {
      setKind(d.kind || "note");
      setTitle(d.title || "");
      setBody(d.body || "");
      setTranscript(d.transcript || "");
      setSummary(d.summary || "");
      if (d.catalogDate) setCatalogDate(d.catalogDate);
      finals.current = d.transcript || "";
      live.current = {
        title: d.title || "",
        body: d.body || "",
        transcript: d.transcript || "",
        summary: d.summary || "",
        kind: d.kind || "note",
        catalogDate: d.catalogDate || catalogDate,
      };
      setRecovered(true);
    } else {
      setKind("note");
      setTitle("");
      setBody("");
      setTranscript("");
      setSummary("");
      finals.current = "";
      live.current = { title: "", body: "", transcript: "", summary: "", kind: "note", catalogDate };
      setRecovered(false);
    }
  }, [courseId]);

  useEffect(() => {
    const id = courseId;
    const onLeave = () => writeNoteDraft(id, live.current);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      writeNoteDraft(id, live.current);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, [courseId]);

  useEffect(() => {
    return () => {
      stopWanted.current = true;
      recRef.current?.stop();
      mediaRef.current?.stop();
    };
  }, []);

  function startRecognition() {
    if (stopWanted.current || Date.now() > deadline.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    const rec = new SR() as SpeechRecognition & {
      maxAlternatives: number;
      onend: (() => void) | null;
    };
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i] as unknown as { isFinal: boolean; 0: { transcript: string } };
        const chunk = row[0].transcript;
        if (row.isFinal) {
          if (!finals.current.includes(chunk)) finals.current = `${finals.current} ${chunk}`.trim();
        } else interim += `${chunk} `;
      }
      setTranscript(`${finals.current} ${interim}`.trim());
      live.current = { ...live.current, transcript: `${finals.current} ${interim}`.trim() };
      persist(live.current, true);
    };
    rec.onend = () => {
      recRef.current = null;
      if (stopWanted.current || Date.now() > deadline.current) return;
      if (restarting.current) return;
      restarting.current = true;
      setTimeout(() => {
        restarting.current = false;
        startRecognition();
      }, 200);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setTimeout(startRecognition, 400);
    }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErr("Live transcription needs Chrome or Edge.");
      return;
    }
    setErr("");
    stopWanted.current = false;
    deadline.current = Date.now() + 2 * 60 * 60 * 1000;
    finals.current = transcript;
    startRecognition();
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudio(new Blob(chunks.current, { type: "audio/webm" }));
      };
      mr.start(5000);
      mediaRef.current = mr;
    });
    setRecording(true);
  }

  function stopVoice() {
    stopWanted.current = true;
    recRef.current?.stop();
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function save() {
    try {
      const form = new FormData();
      form.set("courseId", courseId);
      form.set("kind", kind);
      form.set("title", title || (kind === "note" ? "Untitled note" : "Untitled"));
      form.set("body", body);
      form.set("catalogDate", catalogDate);
      form.set("reminderAt", reminderAt);
      form.set("transcript", transcript);
      form.set("summary", summary);
      form.set("alerts", JSON.stringify(alerts));
      for (const f of files) form.append("files", f);
      if (audio) form.append("audio", new File([audio], "voice.webm", { type: "audio/webm" }));
      await postForm("/api/notes", form);
      setTitle("");
      setBody("");
      setTranscript("");
      setSummary("");
      setFiles([]);
      setAudio(null);
      setRecovered(false);
      finals.current = "";
      live.current = { title: "", body: "", transcript: "", summary: "", kind, catalogDate };
      clearNoteDraft(courseId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save note");
    }
  }

  const shown = [...notes].sort((a, b) => {
    if (sort === "kind") return a.kind.localeCompare(b.kind);
    return (b.catalogDate || b.createdAt).localeCompare(a.catalogDate || a.createdAt);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-medium">Add to this course</h3>
        <label className="mt-2 block text-sm">
          Type
          <select className="mt-1 w-full bg-input p-2" value={kind} onChange={(e) => commit({ kind: e.target.value as NoteKind })}>
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {labelKind(k)}
              </option>
            ))}
          </select>
        </label>
        <input className="mt-2 w-full bg-input p-2" placeholder="Title" value={title} onChange={(e) => commit({ title: e.target.value })} />
        <label className="mt-2 block text-sm">
          Catalog date
          <input type="date" className="mt-1 w-full bg-input p-2" value={catalogDate} onChange={(e) => commit({ catalogDate: e.target.value })} />
        </label>
        <textarea className="mt-2 min-h-24 w-full bg-input p-2" placeholder="Write anything you want to remember…" value={body} onChange={(e) => commit({ body: e.target.value })} />
        {kind === "note" && (
          <div className="mt-3 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between text-sm">
              <span>Live voice notes</span>
              {!recording ? (
                <button type="button" className="text-gold-2" onClick={startVoice}>
                  Record + transcribe
                </button>
              ) : (
                <button type="button" className="text-red-400" onClick={stopVoice}>
                  Stop
                </button>
              )}
            </div>
            <textarea
              className="mt-2 min-h-24 w-full bg-input p-2 text-sm"
              value={transcript}
              onChange={(e) => commit({ transcript: e.target.value })}
              placeholder="Live transcript appears here: edit freely."
            />
            {recovered && transcript && (
              <p className="mt-2 text-xs text-gold-2">Recovered a draft from this browser. Hit Save so it is stored on the server.</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {recording
                ? "Recording: keeps going for up to 2 hours until you stop. Transcript autosaves in this browser. A study summary is generated when you save."
                : "Transcript autosaves in this browser while you type or record. Study summary is written from the transcript, your notes, PDF/Word/text attachments, and any directions below."}
            </p>
            <textarea
              className="min-h-16 w-full bg-input p-2 text-sm"
              value={summary}
              onChange={(e) => commit({ summary: e.target.value })}
              placeholder="Directions for the study guide: extra topics to include, parts to change, or “keep all of this and add…”"
            />
          </div>
        )}
        {kind === "reminder" && (
          <div className="mt-3 space-y-2 text-sm">
            <label>
              Remind me at
              <input type="datetime-local" className="mt-1 w-full bg-input p-2" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
            </label>
            <p>Alerts (like Google Calendar)</p>
            {alerts.map((a, i) => (
              <div key={a.id} className="flex gap-2">
                <input type="number" className="w-16 bg-input p-1" value={a.amount} onChange={(e) => updateAlert(i, { amount: Number(e.target.value) })} />
                <select className="bg-input p-1" value={a.unit} onChange={(e) => updateAlert(i, { unit: e.target.value as AlertRule["unit"] })}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </select>
                <select className="bg-input p-1" value={a.channel} onChange={(e) => updateAlert(i, { channel: e.target.value as AlertRule["channel"] })}>
                  <option value="popup">popup</option>
                  <option value="email">email</option>
                </select>
                <span>before</span>
                <button type="button" className="text-red-400" onClick={() => setAlerts((list) => list.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="text-gold-2" onClick={() => setAlerts((a) => [...a, { id: nanoid(), amount: 10, unit: "minutes", channel: "popup" }])}>
              + another alert
            </button>
          </div>
        )}
        <label className="mt-3 block text-sm">
          Attachments
          <input type="file" multiple className="mt-1 block" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
        <p className="mt-1 text-xs text-muted">
          PDF, Word, and text files are read into the study guide. For lecture video, use Record + transcribe or paste a transcript. Study guides and voice notes can go to your Drive under Askuala.
        </p>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <button onClick={save} className="mt-3 rounded-lg bg-gold px-3 py-2 text-on-gold">
          Save
        </button>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">Saved</h3>
          <select className="bg-input p-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as "date" | "kind")}>
            <option value="date">By date</option>
            <option value="kind">By type</option>
          </select>
        </div>
        <div className="space-y-3">
          {shown.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              onOpen={() => setOpenNote(n)}
              onDelete={async () => {
                try {
                  await postJson(`/api/notes?id=${encodeURIComponent(n.id)}`, {}, "DELETE");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not delete note");
                }
              }}
            />
          ))}
          {shown.length === 0 && <p className="text-sm text-muted">Nothing saved in this course yet.</p>}
        </div>
      </div>
      {openNote && (
        <StudyWindow
          note={openNote}
          courseLabel={courseLabel}
          onClose={() => setOpenNote(null)}
          onRegenerate={async (guideDirections, rebuildFiles, transcript, audio) => {
            const form = new FormData();
            form.set("regenerateId", openNote.id);
            form.set("guideDirections", guideDirections);
            form.set("transcript", transcript);
            for (const f of rebuildFiles) form.append("files", f);
            if (audio) form.append("audio", new File([audio], "voice.webm", { type: "audio/webm" }));
            const json = await postForm("/api/notes", form);
            const next = json.notes?.find((n) => n.id === openNote.id);
            if (next) setOpenNote(next);
          }}
          onSaveVoice={async (transcript, audio, guideDirections) => {
            const form = new FormData();
            form.set("updateId", openNote.id);
            form.set("transcript", transcript);
            form.set("guideDirections", guideDirections);
            if (audio) form.append("audio", new File([audio], "voice.webm", { type: "audio/webm" }));
            const json = await postForm("/api/notes", form);
            const next = json.notes?.find((n) => n.id === openNote.id);
            if (next) setOpenNote(next);
          }}
          onSaveSummary={async (summary) => {
            const json = await postJson("/api/notes", { id: openNote.id, saveSummary: true, summary }, "PATCH");
            const next = json.notes?.find((n) => n.id === openNote.id);
            if (next) setOpenNote(next);
          }}
          onRestore={
            openNote.summaryPrevious
              ? async () => {
                  const json = await postJson("/api/notes", { id: openNote.id, restoreSummary: true }, "PATCH");
                  const next = json.notes?.find((n) => n.id === openNote.id);
                  if (next) setOpenNote(next);
                }
              : undefined
          }
        />
      )}
    </div>
  );

  function updateAlert(i: number, patch: Partial<AlertRule>) {
    setAlerts((list) => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
}

function NoteCard({ note, onOpen, onDelete }: { note: CourseNote; onOpen: () => void; onDelete: () => void | Promise<void> }) {
  return (
    <article className="cursor-pointer rounded-xl border border-line bg-surface p-3 text-sm" onClick={onOpen}>
      <div className="flex justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase text-muted">
            {labelKind(note.kind)} · {note.catalogDate || note.createdAt.slice(0, 10)}
          </p>
          <h4 className="font-medium">{note.title}</h4>
        </div>
        <button
          className="text-xs text-red-400"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void onDelete();
          }}
        >
          Delete
        </button>
      </div>
      {note.summary && <p className="mt-2 line-clamp-3 text-muted">{note.summary}</p>}
      {!note.summary && note.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-ink">{note.body}</p>}
    </article>
  );
}

function StudyWindow({
  note,
  courseLabel,
  onClose,
  onRegenerate,
  onSaveVoice,
  onSaveSummary,
  onRestore,
}: {
  note: CourseNote;
  courseLabel: string;
  onClose: () => void;
  onRegenerate: (guideDirections: string, files: File[], transcript: string, audio: Blob | null) => Promise<void>;
  onSaveVoice: (transcript: string, audio: Blob | null, guideDirections: string) => Promise<void>;
  onSaveSummary: (summary: string) => Promise<void>;
  onRestore?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [guideDirections, setGuideDirections] = useState(note.guideDirections || "");
  const [rebuildFiles, setRebuildFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.summary || "");
  const [transcriptDraft, setTranscriptDraft] = useState(note.transcript || "");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopWanted = useRef(false);
  const deadline = useRef(0);
  const finals = useRef(note.transcript || "");
  const restarting = useRef(false);
  const { postForm } = useBuddy();
  const capturedSummary = useRef("");
  const dateLabel = note.catalogDate || note.createdAt.slice(0, 10);
  const canExport = Boolean(note.summary) && !editing;

  useEffect(() => {
    if (!editing) setDraft(note.summary || "");
  }, [note.summary, note.id, editing]);

  useEffect(() => {
    setGuideDirections(note.guideDirections || "");
  }, [note.id, note.guideDirections]);

  useEffect(() => {
    if (recording) return;
    setTranscriptDraft(note.transcript || "");
    finals.current = note.transcript || "";
    setAudioBlob(null);
  }, [note.id, note.transcript, recording]);

  const localAudioUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : ""), [audioBlob]);

  useEffect(() => {
    return () => {
      if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    };
  }, [localAudioUrl]);

  useEffect(() => {
    return () => {
      stopWanted.current = true;
      try {
        recRef.current?.stop();
      } catch {
        /* already stopped */
      }
      try {
        mediaRef.current?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  function startRecognition() {
    if (stopWanted.current || Date.now() > deadline.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    const rec = new SR() as SpeechRecognition & {
      maxAlternatives: number;
      onend: (() => void) | null;
    };
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i] as unknown as { isFinal: boolean; 0: { transcript: string } };
        const chunk = row[0].transcript;
        if (row.isFinal) {
          if (!finals.current.includes(chunk)) finals.current = `${finals.current} ${chunk}`.trim();
        } else interim += `${chunk} `;
      }
      setTranscriptDraft(`${finals.current} ${interim}`.trim());
    };
    rec.onend = () => {
      recRef.current = null;
      if (stopWanted.current || Date.now() > deadline.current) return;
      if (restarting.current) return;
      restarting.current = true;
      setTimeout(() => {
        restarting.current = false;
        startRecognition();
      }, 200);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setTimeout(startRecognition, 400);
    }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErr("Live transcription needs Chrome or Edge.");
      return;
    }
    setErr("");
    stopWanted.current = false;
    deadline.current = Date.now() + 2 * 60 * 60 * 1000;
    finals.current = transcriptDraft;
    startRecognition();
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioBlob(new Blob(chunks.current, { type: "audio/webm" }));
      };
      mr.start(5000);
      mediaRef.current = mr;
    });
    setRecording(true);
  }

  function stopVoice() {
    stopWanted.current = true;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    try {
      mediaRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setRecording(false);
  }

  useEffect(() => {
    if (!note.summary || capturedSummary.current === note.summary) return;
    const t = window.setTimeout(() => {
      void (async () => {
        if (!bodyRef.current) return;
        try {
          const blob = await captureStudyPrintPdf({
            title: note.title,
            course: courseLabel,
            date: dateLabel,
            html: bodyRef.current.innerHTML,
            extraHtml: note.body ? note.body.replace(/</g, "&lt;") : "",
          });
          const form = new FormData();
          form.set("noteId", note.id);
          form.set("studyPdf", new File([blob], "study-guide.pdf", { type: "application/pdf" }));
          await postForm("/api/notes/print-pdf", form);
          capturedSummary.current = note.summary;
        } catch {
          /* Drive flush retries after the next open */
        }
      })();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [note.summary, note.id, note.title, note.body, courseLabel, dateLabel, postForm]);

  async function word() {
    if (!note.summary) return;
    setErr("");
    try {
      const blob = await buildStudyDocx({
        title: note.title,
        course: courseLabel,
        date: dateLabel,
        markdown: note.summary,
      });
      downloadBlob(blob, `${studyFileSlug(note.title)}.docx`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build the Word file");
    }
  }

  async function share() {
    if (!note.summary || !bodyRef.current) return;
    setErr("");
    const page = studyGuideHtml({
      title: note.title,
      course: courseLabel,
      date: dateLabel,
      html: bodyRef.current.innerHTML,
      extraHtml: note.body ? note.body.replace(/</g, "&lt;") : "",
    });
    const filename = `${studyFileSlug(note.title)}.html`;
    downloadBlob(new Blob([page], { type: "text/html;charset=utf-8" }), filename);
  }

  function printPdf() {
    if (!bodyRef.current) return;
    printStudyGuide({
      title: note.title,
      course: courseLabel,
      date: dateLabel,
      html: bodyRef.current.innerHTML,
      extraHtml: note.body ? note.body.replace(/</g, "&lt;") : "",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <p className="text-[11px] uppercase text-muted">
              {labelKind(note.kind)} · {dateLabel}
            </p>
            <h2 className="text-2xl font-semibold">{note.title}</h2>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-40" disabled={!canExport} onClick={() => void share()}>
              <Share2 size={14} /> Share
            </button>
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-40" disabled={!canExport} onClick={printPdf}>
              <Printer size={14} /> Print / PDF
            </button>
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-40" disabled={!canExport} onClick={() => void word()}>
              <Download size={14} /> Word
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-sm text-gold-2 disabled:opacity-40"
              disabled={busy || !note.summary}
              onClick={() => {
                setErr("");
                setDraft(note.summary || "");
                setEditing(true);
              }}
            >
              Edit guide
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-sm text-gold-2 disabled:opacity-40"
              disabled={busy || !onRestore || editing}
              onClick={async () => {
                if (!onRestore) return;
                setBusy(true);
                setErr("");
                try {
                  await onRestore();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not restore the previous study guide");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore previous
            </button>
            <button
              className="rounded-lg px-3 py-1 text-sm text-gold-2"
              disabled={busy || editing || recording}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  await onRegenerate(guideDirections, rebuildFiles, transcriptDraft, audioBlob);
                  setRebuildFiles([]);
                  setAudioBlob(null);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not rebuild the study guide");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Writing study guide…" : "Rebuild study guide"}
            </button>
            <button className="rounded-lg px-3 py-1 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {err && <p className="px-5 pt-2 text-sm text-red-400">{err}</p>}
        <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-6 md:grid-cols-5">
          <section className="md:col-span-3">
            <h3 className="mb-2 text-sm font-medium text-gold-2">Study guide</h3>
            {!editing && (
              <>
                <textarea
                  className="mb-3 min-h-16 w-full bg-input p-2 text-sm"
                  value={guideDirections}
                  onChange={(e) => setGuideDirections(e.target.value)}
                  placeholder="Rebuild directions (optional): add a topic or fix a section. Guides stay full lecture notes either way."
                />
                <label className="mb-3 block text-sm text-muted">
                  Add files for this rebuild
                  <input
                    type="file"
                    multiple
                    className="mt-1 block w-full text-sm text-ink"
                    onChange={(e) => setRebuildFiles(Array.from(e.target.files || []))}
                  />
                </label>
                {rebuildFiles.length > 0 && (
                  <p className="mb-3 text-xs text-muted">
                    {rebuildFiles.map((f) => f.name).join(", ")} — will be folded into the next rebuild with your directions.
                  </p>
                )}
              </>
            )}
            {editing ? (
              <div className="mb-3">
                <textarea
                  className="min-h-[28rem] w-full bg-input p-3 font-mono text-sm leading-relaxed text-ink"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-40"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setErr("");
                      try {
                        await onSaveSummary(draft);
                        setEditing(false);
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : "Could not save the study guide");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Saving…" : "Save guide"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-muted"
                    disabled={busy}
                    onClick={() => {
                      setDraft(note.summary || "");
                      setEditing(false);
                      setErr("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">Markdown edit mode. Graphs use fenced <code className="buddy-inline-code">graph</code> blocks; code uses language fences.</p>
              </div>
            ) : note.summary ? (
              <div
                ref={bodyRef}
                className="cursor-text rounded-xl border border-transparent p-1 text-[15px] leading-relaxed hover:border-line [&_p]:mb-2 [&_strong]:text-base"
                onDoubleClick={() => {
                  setDraft(note.summary || "");
                  setEditing(true);
                }}
                title="Double-click to edit"
              >
                <ChatMarkdown text={note.summary} />
              </div>
            ) : (
              <div className="text-[15px] leading-relaxed">No guide yet: add a transcript and save, then rebuild.</div>
            )}
            <p className="mb-3 text-xs text-muted">
              Voice stays on Askuala for 7 days, then is deleted (never copied to Drive). Study-guide PDFs go to Drive under Askuala → year → term → course after 12 hours. Lecture file uploads stay in Askuala only.
            </p>
            {note.studyPdfDriveUrl && (
              <a className="mt-2 inline-block text-xs text-gold-2 underline" href={note.studyPdfDriveUrl} target="_blank" rel="noreferrer">
                Study guide PDF on Drive
              </a>
            )}
            {note.body && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-medium text-gold-2">Your notes</h3>
                <p className="whitespace-pre-wrap">{note.body}</p>
              </div>
            )}
          </section>
          <section className="md:col-span-2 border-t border-line pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted">Transcript</h3>
              {!recording ? (
                <button type="button" className="text-sm text-gold-2 disabled:opacity-40" disabled={busy || editing} onClick={startVoice}>
                  Record + transcribe
                </button>
              ) : (
                <button type="button" className="text-sm text-red-400" onClick={stopVoice}>
                  Stop
                </button>
              )}
            </div>
            <textarea
              className="min-h-40 w-full bg-input p-2 text-sm text-ink"
              value={transcriptDraft}
              onChange={(e) => {
                setTranscriptDraft(e.target.value);
                finals.current = e.target.value;
              }}
              disabled={busy}
              placeholder="Live transcript appears here. Record more on this note, edit freely, then Save or Rebuild."
            />
            <p className="mt-2 text-xs text-muted">
              {recording
                ? "Recording into this note (up to 2 hours). Stop, then Save transcript & voice, or Rebuild with your directions."
                : "Add another lecture segment here. Save stores transcript/voice; Rebuild uses them with your instructions (still full lecture notes)."}
            </p>
            {(localAudioUrl || note.audioPath) && (
              <audio className="mt-3 w-full" controls src={localAudioUrl || `/api/files/${note.audioPath}`} />
            )}
            <button
              type="button"
              className="mt-3 rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-40"
              disabled={busy || recording || editing}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  await onSaveVoice(transcriptDraft, audioBlob, guideDirections);
                  setAudioBlob(null);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not save transcript / voice");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save transcript & voice"}
            </button>
            {note.attachments.map((a) => (
              <span key={a.id} className="mr-2 inline-flex flex-wrap gap-x-2 text-xs">
                <a className="text-gold-2 underline" href={a.driveUrl || `/api/files/${a.path}`} target={a.driveUrl ? "_blank" : undefined} rel={a.driveUrl ? "noreferrer" : undefined}>
                  {a.filename}
                </a>
                {a.driveUrl && (
                  <a className="text-gold-2 underline" href={a.driveUrl} target="_blank" rel="noreferrer">
                    Drive
                  </a>
                )}
              </span>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function labelKind(k: NoteKind) {
  return {
    note: "Note",
    reminder: "Reminder",
    question: "Office-hour question",
    office_hours: "Office hours",
    resource: "Resource",
  }[k];
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechRecognition: new () => SpeechRecognition;
  }
}
