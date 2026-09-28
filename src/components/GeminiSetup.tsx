"use client";

import { useState } from "react";
import { useBuddy } from "./BuddyProvider";

export function GeminiSetup({ force = false }: { force?: boolean }) {
  const { data, postJson, refresh } = useBuddy();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = Boolean(data?.settings.geminiConfigured);
  if (ready && !force) return null;

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/settings", { geminiKey: key.trim() }, "PATCH");
      setKey("");
      setMsg("Saved. Askuala Buddy will use this key only for your login.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gold/40 bg-urgent p-4 text-sm">
      <h2 className="font-semibold text-gold-2">Set up Gemini (your own key)</h2>
      <p className="mt-1 text-muted">
        Askuala does not share a class-wide Gemini quota. Each student uses a free Google AI Studio key on their own account. The host’s env key is not used for chat.
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          Open{" "}
          <a className="text-gold-2 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio → API keys
          </a>{" "}
          and sign in with the Google account you want billed/quota on (usually the same college Google).
        </li>
        <li>Accept the Gemini API terms if asked. Use the free tier unless you choose otherwise.</li>
        <li>Click <strong>Create API key</strong>. If it asks for a Google Cloud project, create or pick one, then create the key.</li>
        <li>Copy the whole key (starts with <code>AIza</code>). Do not email it or put it in a shared doc.</li>
        <li>Paste it below (or in Settings) and Save. You can replace it later the same way.</li>
      </ol>
      <p className="mt-2 text-muted">
        If Studio says the key is restricted, create an unrestricted key for Gemini. If a model is busy, send again — the app tries another Gemini model on <em>your</em> key.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded-lg bg-input p-2"
          type="password"
          autoComplete="off"
          placeholder="Paste Gemini API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button type="button" disabled={busy || !key.trim()} className="rounded-lg bg-gold px-3 py-2 text-on-gold disabled:opacity-50" onClick={save}>
          {busy ? "Saving…" : "Save key"}
        </button>
      </div>
      {msg && <p className="mt-2 text-gold-2">{msg}</p>}
    </section>
  );
}
