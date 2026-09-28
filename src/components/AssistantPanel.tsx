"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Maximize2, Paperclip, Pin, Plus, Send, Trash2, X } from "lucide-react";
import { useBuddy } from "./BuddyProvider";
import { ChatMarkdown } from "./ChatMarkdown";
import { GeminiSetup } from "./GeminiSetup";
import { TourVideo } from "./TourVideo";
import { APP_NAME, ASSISTANT_NAME } from "@/lib/brand";

export function AssistantPanel({
  variant = "page",
  onClose,
}: {
  variant?: "page" | "popup";
  onClose?: () => void;
}) {
  const { data, postForm, postJson, refresh, ui } = useBuddy();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const chats = [...(data?.chats || [])].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const activeId = data?.activeChatId;
  const popup = variant === "popup";
  const activePinned = chats.find((c) => c.id === activeId)?.pinned;

  async function send() {
    if (busy) return;
    if (!text.trim() && files.length === 0) return;
    setBusy(true);
    setErr("");
    try {
      const form = new FormData();
      form.set("message", text);
      if (activeId) form.set("chatId", activeId);
      for (const f of files) form.append("files", f);
      await postForm("/api/assistant", form);
      setText("");
      setFiles([]);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Assistant could not reply");
    } finally {
      setBusy(false);
    }
  }

  const thread = (
    <>
      <div className={`flex-1 space-y-3 overflow-auto p-3 ${popup ? "min-h-0" : "p-4"}`}>
        {activePinned && !popup && <TourVideo compact />}
        <GeminiSetup />
        {(data?.messages || []).length === 0 && (
          <p className="text-sm text-muted">{ui("chat.empty")}</p>
        )}
        {(data?.messages || []).map((m) => (
          <div
            key={m.id}
            className={`max-w-[90%] rounded-2xl px-3 py-2 ${m.role === "user" ? "ml-auto bg-gold text-on-gold" : "bg-input"}`}
          >
            {m.role === "assistant" ? <ChatMarkdown text={m.content} /> : <div className="whitespace-pre-wrap text-sm">{m.content}</div>}
            {m.attachments?.length > 0 && (
              <div className="mt-1 text-xs opacity-80">{m.attachments.map((a) => a.filename).join(", ")}</div>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-muted">Thinking…</p>}
        <div ref={bottom} />
      </div>
      {err && <p className="px-3 text-sm text-red-400">{err}</p>}
      {files.length > 0 && <div className="px-3 text-xs text-gold-2">{files.map((f) => f.name).join(", ")}</div>}
      <div className="flex items-end gap-2 border-t border-line p-2">
        <button type="button" className="rounded-lg p-2 hover:bg-hover" onClick={() => inputRef.current?.click()} title="Attach files">
          <Paperclip size={18} />
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        <textarea
          className="max-h-32 min-h-11 flex-1 resize-y rounded-lg bg-input p-2 text-sm"
          placeholder={ui("chat.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={send} disabled={busy} className="rounded-lg bg-gold p-2 text-on-gold disabled:opacity-50">
          <Send size={18} />
        </button>
      </div>
    </>
  );

  if (popup) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <select
            className="min-w-0 flex-1 bg-transparent text-sm font-medium"
            value={activeId || ""}
            onChange={async (e) => {
              const id = e.target.value;
              if (!id) return;
              await postJson("/api/chats", { id }, "PATCH");
              await refresh();
            }}
          >
            {chats.length === 0 && <option value="">Chat</option>}
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.pinned ? "Pinned · " : ""}
                {c.title || "Chat"}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1.5 hover:bg-hover"
              title="New chat"
              onClick={async () => {
                await postJson("/api/chats", {});
                await refresh();
              }}
            >
              <Plus size={16} />
            </button>
            <Link href="/assistant" className="rounded-md p-1.5 text-gold-2 hover:bg-hover" title="Open full page" onClick={onClose}>
              <Maximize2 size={16} />
            </Link>
            <button type="button" className="rounded-md p-1.5 hover:bg-hover" onClick={onClose} aria-label="Close chat">
              <X size={16} />
            </button>
          </div>
        </div>
        {thread}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] gap-3">
      <aside className="hidden w-56 shrink-0 flex-col rounded-2xl border border-line bg-surface sm:flex">
        <div className="border-b border-line p-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-gold px-3 py-2 text-sm text-on-gold"
            onClick={async () => {
              await postJson("/api/chats", {});
              await refresh();
            }}
          >
            <Plus size={16} /> New chat
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-auto p-2">
          {chats.map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${c.id === activeId ? "bg-hover" : ""}`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={async () => {
                  await postJson("/api/chats", { id: c.id }, "PATCH");
                  await refresh();
                }}
              >
                {c.pinned && <Pin size={12} className="mr-1 inline shrink-0 text-gold-2" />}
                {c.title || "Chat"}
              </button>
              {!c.pinned && (
                <button
                  type="button"
                  className="shrink-0 p-1 text-muted hover:text-red-400"
                  title="Delete chat"
                  onClick={async () => {
                    await fetch(`/api/chats?id=${encodeURIComponent(c.id)}`, { method: "DELETE", credentials: "include" });
                    await refresh();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {chats.length === 0 && <p className="px-2 text-xs text-muted">No chats yet.</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line p-4">
          <div>
            <h1 className="text-lg font-semibold">{activePinned ? chats.find((c) => c.id === activeId)?.title || ASSISTANT_NAME : ASSISTANT_NAME}</h1>
            <p className="text-sm text-muted">
              {activePinned
                ? "Pinned manual — always here, cannot be deleted. Use New chat for other threads."
                : `The assistant in ${APP_NAME}. Gemini when a key is saved. Old chats stay until you delete them.`}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-1 text-sm sm:hidden"
            onClick={async () => {
              await postJson("/api/chats", {});
              await refresh();
            }}
          >
            New
          </button>
        </div>
        <div className="flex gap-2 overflow-auto border-b border-line p-2 sm:hidden">
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs ${c.id === activeId ? "bg-gold text-on-gold" : "bg-input"}`}
              onClick={async () => {
                await postJson("/api/chats", { id: c.id }, "PATCH");
                await refresh();
              }}
            >
              {c.pinned ? "Pinned · " : ""}
              {(c.title || "Chat").slice(0, 16)}
            </button>
          ))}
        </div>
        {thread}
      </div>
    </div>
  );
}
