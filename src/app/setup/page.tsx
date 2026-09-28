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
  const [publicUrl, setPublicUrl] = useState("");
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
            You do not need to buy a website. Each person can run {APP_NAME} on their own laptop (double-click the launcher in the project folder). Localhost in the list below is enough. Skip the public URL unless you later put it on a free host that gives you a <code className="text-gold-2">*.railway.app</code>-style address.
          </p>
        </section>

        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Sign into{" "}
            <a className="text-gold-2 underline" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">
              Google Auth Platform → Clients
            </a>{" "}
            with any Google account you control (developer hat). Create a project named {APP_NAME} if asked.
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
            , either add every Gmail that will sign in as a <strong>test user</strong> (including yours), or set the app to <strong>In production</strong>. Testing mode blocks everyone who isn’t on that list (that’s the 403 you see). Production does not need Google’s full verification for a student app — people may see “Google hasn’t verified this app” and click Advanced → continue.
          </li>
          <li>Create an OAuth client: type <strong>Web application</strong>, name {APP_NAME} (existing “Askuala Buddy” clients still work).</li>
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
