"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME } from "@/lib/brand";

function subscribeOrigin() {
  return () => undefined;
}

function clientOrigin() {
  return window.location.origin;
}

function emptyOrigin() {
  return "";
}

export default function HostGoogleSetupPage() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [publicUrl, setPublicUrl] = useState("https://askualastudy.vercel.app");
  const here = useSyncExternalStore(subscribeOrigin, clientOrigin, emptyOrigin);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const origins = useMemo(() => {
    const list: string[] = [];
    if (here) {
      list.push(here);
      if (here.includes("127.0.0.1")) list.push(here.replace("127.0.0.1", "localhost"));
      if (here.includes("localhost")) list.push(here.replace("localhost", "127.0.0.1"));
    }
    const deployed = publicUrl.trim().replace(/\/$/, "");
    if (deployed.startsWith("http")) list.push(deployed);
    return [...new Set(list)];
  }, [here, publicUrl]);
  const redirects = origins.map((o) => `${o}/api/google/callback`);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const res = await fetch("/api/setup/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Could not save");
      return;
    }
    setMsg("Saved on this server. Everyone who uses this app now just clicks Sign in with Google.");
    window.location.href = "/login";
  }

  return (
    <div className="relative min-h-screen bg-canvas p-6">
      <div className="absolute right-6 top-6 w-56">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-xl space-y-4 rounded-3xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold">Enable Sign in with Google</h1>

        <section className="rounded-xl border border-gold/30 bg-urgent p-4 text-sm">
          <h2 className="font-medium text-gold-2">Your Gmail is only for creating the app</h2>
          <p className="mt-2 text-muted">
            Google Cloud asks you to sign in because <em>someone</em> has to register “{APP_NAME}” as an app. That login is you as the developer, not “everyone uses Azaria’s calendar.”
          </p>
          <p className="mt-2 text-muted">
            After this is saved, you and every classmate sign into Askuala with <strong>their own</strong> Google account. Google will ask each person for their Calendar. Your events stay yours; theirs stay theirs.
          </p>
        </section>

        <section className="rounded-xl border border-line p-4 text-sm">
          <h2 className="font-medium">No paid domain</h2>
          <p className="mt-2 text-muted">
            On Vercel the site is{" "}
            <code className="text-gold-2">https://askualastudy.vercel.app</code>. Add that origin’s callback in Google Cloud. Localhost is only if you also run the app on this computer.
          </p>
        </section>

        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            In the top bar, pick the Cloud project that owns this app (not a random empty project).
          </li>
          <li>
            Finish the consent screen first — Google greys out <strong>Add URI</strong> until this exists. Open{" "}
            <a className="text-gold-2 underline" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
              Google Auth Platform
            </a>
            , click <strong>Get started</strong> (or Branding). User type <strong>External</strong>. App name {APP_NAME}. Support email = the Gmail you are signed into Cloud with. Developer contact = same Gmail. Skip homepage, privacy, terms, logo, and authorized domains (do not add <code>vercel.app</code> — you do not own it). Click through until it is saved. If it still says “configure your consent screen,” refresh the tab, then open Clients again.
          </li>
          <li>
            Enable{" "}
            <a className="text-gold-2 underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
              Google Calendar API
            </a>{" "}
            and{" "}
            <a className="text-gold-2 underline" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">
              Google Drive API
            </a>
            .
          </li>
          <li>
            On{" "}
            <a className="text-gold-2 underline" href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">
              Audience
            </a>
            , either add every Gmail that will sign in as a <strong>test user</strong> (including yours), or set the app to <strong>In production</strong>. Testing mode blocks everyone who isn’t on that list. Production does not need Google’s full verification for a student app — people may see “Google hasn’t verified this app” and click Advanced → continue.
          </li>
          <li>
            Then{" "}
            <a className="text-gold-2 underline" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">
              Clients
            </a>
            : type <strong>Web application</strong>, name {APP_NAME}. Now Add URI works.
          </li>
          <li>
            Authorized redirect URIs — add every URL below that you will actually use:
            <ul className="mt-1 list-disc pl-5 font-mono text-xs">
              {redirects.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </li>
        </ol>

        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm">
            Public URL after deploy (optional — only to list the extra redirect)
            <input
              className="mt-1 w-full rounded-lg bg-input p-3 text-sm"
              placeholder="https://askuala.yourschool.edu"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
            />
          </label>
          <input className="w-full rounded-lg bg-input p-3 text-sm" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
          <input className="w-full rounded-lg bg-input p-3 text-sm" type="password" placeholder="Client secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required />
          {err && <p className="text-sm text-red-400">{err}</p>}
          {msg && <p className="text-sm text-gold-2">{msg}</p>}
          <button className="w-full rounded-lg bg-gold py-3 text-on-gold">Save on this server</button>
        </form>
        <a href="/login" className="block text-center text-sm text-muted">
          Back to sign in
        </a>
      </div>
    </div>
  );
}
