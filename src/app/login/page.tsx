"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignInGoogle } from "@/components/SignInGoogle";
import { SchoolCalGuide } from "@/components/SchoolCalGuide";
import { APP_NAME, ASSISTANT_NAME } from "@/lib/brand";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const g = params.get("google");
    if (g === "unavailable" || g === "missing") {
      setErr("Google sign in isn’t available. Use email below.");
    }
    if (g === "phone") {
      setErr("Google sign in isn’t available on this link. Open askualastudy.vercel.app and sign in there.");
    }
    if (g === "error") setErr(params.get("message") || "Google sign in failed.");
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, name, email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not continue");
      router.push(json.next || "/home");
      router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="absolute right-6 top-6 w-56">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.png" alt="" className="h-12 w-12 rounded-xl" />
          <div>
            <h1 className="brand text-2xl font-semibold text-gold-2">{APP_NAME}</h1>
            <p className="text-sm text-muted">Courses, calendar, notes, and {ASSISTANT_NAME}.</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted">
          Same account on your phone or computer. If Google says the app isn’t verified, that’s normal for a class tool: choose Continue. Use your college Google if it lets you in; otherwise use a personal Gmail (see below).
        </p>
        <details className="mb-4 rounded-lg border border-line bg-input p-3 text-sm text-muted">
          <summary className="cursor-pointer text-gold-2">College email blocks Google sign in?</summary>
          <SchoolCalGuide className="mt-2" />
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Sign up here with a personal Gmail, or email + password, then Connect Google in Settings with the account that can see the school events.</li>
            <li>If Google shows Advanced → Continue, that’s the unverified-app warning. Campuses that block it entirely need the personal-Gmail path above.</li>
          </ul>
        </details>
        <SignInGoogle
          intent="login"
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-input py-3 font-medium hover:bg-hover disabled:opacity-50"
        />
        <div className="mb-4 flex items-center gap-2 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          or use email
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="mb-4 flex gap-2 text-sm">
          <button type="button" className={`rounded-full px-3 py-1 ${mode === "register" ? "bg-gold text-on-gold" : "bg-input"}`} onClick={() => setMode("register")}>
            Sign up
          </button>
          <button type="button" className={`rounded-full px-3 py-1 ${mode === "login" ? "bg-gold text-on-gold" : "bg-input"}`} onClick={() => setMode("login")}>
            Log in
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <input className="w-full rounded-lg bg-input p-3" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <input className="w-full rounded-lg bg-input p-3" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="w-full rounded-lg bg-input p-3" type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-gold py-3 font-medium text-on-gold disabled:opacity-50">
            {busy ? "Working…" : mode === "register" ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          <a href="/" className="text-gold-2 underline">
            Home
          </a>
          {" · "}
          <a href="/tour" className="text-gold-2 underline">
            Tour
          </a>
          {" · "}
          <a href="/privacy" className="text-gold-2 underline">
            Privacy
          </a>
        </p>
      </div>
    </div>
  );
}
