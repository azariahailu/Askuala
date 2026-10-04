"use client";

import { useEffect, useState } from "react";

function isDeployedHttps() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return window.location.protocol === "https:";
}

export function PhoneAccess({ compact }: { compact?: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [onPhone, setOnPhone] = useState(false);
  const [deployed, setDeployed] = useState(() => typeof window !== "undefined" && isDeployedHttps());

  useEffect(() => {
    setOnPhone(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
    setDeployed(isDeployedHttps());
    if (isDeployedHttps()) return;
    fetch("/api/phone-link")
      .then((r) => r.json())
      .then((j) => setUrl(j.url || ""))
      .catch(() => undefined);
  }, []);

  async function create() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/phone-link", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create a phone link");
      setUrl(json.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create a phone link");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const text = url || (typeof window !== "undefined" ? window.location.origin : "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this into your phone’s browser", text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (onPhone) return null;

  if (deployed) {
    if (compact) {
      return (
        <button type="button" className="max-w-[12rem] truncate text-left text-xs text-gold-2" onClick={copy}>
          {copied ? "Copied" : "Copy site link"}
        </button>
      );
    }
    return (
      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="font-medium">Phones and tablets</h2>
        <p className="text-sm text-muted">
          Open this same Askuala address in Safari or Chrome on any device. Sign in with Google or email there: you do not need this computer to stay awake.
        </p>
        <button type="button" className="rounded-lg bg-gold px-3 py-2 text-on-gold" onClick={copy}>
          {copied ? "Copied" : "Copy this site’s link"}
        </button>
      </section>
    );
  }

  if (compact) {
    if (deployed) return null;
    return (
      <button
        type="button"
        className="max-w-[12rem] truncate text-left text-xs text-gold-2"
        onClick={url ? copy : create}
        disabled={busy}
      >
        {busy ? "Phone link…" : copied ? "Copied" : url ? "Copy phone link" : "Phone link"}
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <h2 className="font-medium">Open on your phone (local only)</h2>
      <p className="text-sm text-muted">
        While Askuala is still running on this computer, you can create a temporary tunnel. After you deploy to Vercel, skip this: use the public https URL on any device and sign in there.
      </p>
      {url ? (
        <div className="space-y-2 text-sm">
          <p className="break-all rounded bg-input px-2 py-2 font-mono">{url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-gold px-3 py-2 text-on-gold" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-2"
              onClick={async () => {
                await fetch("/api/phone-link", { method: "DELETE" });
                setUrl("");
              }}
            >
              Turn off
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} className="rounded-lg bg-gold px-3 py-2 text-on-gold disabled:opacity-50" onClick={create}>
          {busy ? "Creating link (first time can take a minute)…" : "Create phone link"}
        </button>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
    </section>
  );
}
