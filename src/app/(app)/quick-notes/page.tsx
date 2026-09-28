"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useBuddy } from "@/components/BuddyProvider";
import type { QuickTodo } from "@/lib/types";

export default function QuickNotesPage() {
  const { data, postJson } = useBuddy();
  const pad = data?.quickPad;
  const [body, setBody] = useState(pad?.body || "");
  const [todos, setTodos] = useState<QuickTodo[]>(pad?.todos || []);
  const [draft, setDraft] = useState("");
  const fromLocal = useRef(false);
  const [ready, setReady] = useState(false);
  const live = useRef({ body: "", todos: [] as QuickTodo[] });
  live.current = { body, todos };

  function persistLocal() {
    try {
      localStorage.setItem("askuala-quick-pad", JSON.stringify({ ...live.current, at: Date.now() }));
    } catch {
      /* quota */
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("askuala-quick-pad");
      if (raw) {
        const d = JSON.parse(raw) as { body?: string; todos?: QuickTodo[] };
        if (d.body || (d.todos && d.todos.length)) {
          if (d.body) setBody(d.body);
          if (d.todos) setTodos(d.todos);
          fromLocal.current = true;
          setReady(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!pad || fromLocal.current) return;
    fromLocal.current = true;
    setBody(pad.body || "");
    setTodos(pad.todos || []);
    setReady(true);
  }, [pad]);

  useEffect(() => {
    if (!ready) return;
    persistLocal();
    const t = window.setTimeout(() => {
      void postJson("/api/quick-notes", live.current).catch(() => undefined);
    }, 400);
    const onLeave = () => persistLocal();
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.clearTimeout(t);
      persistLocal();
      window.removeEventListener("pagehide", onLeave);
    };
  }, [body, todos, postJson, ready]);

  function addTodo() {
    const text = draft.trim();
    if (!text) return;
    setTodos((list) => [...list, { id: nanoid(10), text, done: false }]);
    setDraft("");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quick Notes</h1>
        <p className="text-sm text-muted">Scratch pad and checklists — not tied to a course.</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold-2">To-do</h2>
        <div className="flex gap-2">
          <input
            className="min-h-11 flex-1 rounded-lg bg-input px-3 text-sm"
            placeholder="Add a task…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTodo();
              }
            }}
          />
          <button type="button" className="rounded-lg bg-gold px-3 text-on-gold" aria-label="Add task" onClick={addTodo}>
            <Plus size={16} />
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {todos.length === 0 && <li className="text-sm text-muted">Nothing on the list yet.</li>}
          {todos.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg bg-input px-2 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--gold)]"
                checked={item.done}
                onChange={() => setTodos((list) => list.map((t) => (t.id === item.id ? { ...t, done: !t.done } : t)))}
              />
              <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-muted line-through" : ""}`}>{item.text}</span>
              <button
                type="button"
                className="p-1 text-muted hover:text-red-400"
                aria-label="Remove task"
                onClick={() => setTodos((list) => list.filter((t) => t.id !== item.id))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold-2">Notes</h2>
        <textarea
          className="min-h-64 w-full resize-y rounded-lg bg-input p-3 text-sm"
          placeholder="Write anything — packing lists, reminders, ideas…"
          value={body}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            live.current = { ...live.current, body: next };
            persistLocal();
          }}
        />
      </section>
    </div>
  );
}
