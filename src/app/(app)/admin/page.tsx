"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useBuddy } from "@/components/BuddyProvider";
import { ADMIN_EMAIL } from "@/lib/admin";

type Row = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastActiveAt: string;
  courses: number;
  events: number;
  notes: number;
  chats: number;
  googleLogin: boolean;
  googleCalendar: boolean;
  googleEmail: string;
  gemini: boolean;
  admin: boolean;
  disabled: boolean;
};

type Site = {
  googleReady: boolean;
  googleClientIdHint: string;
  smtpConfigured: boolean;
  smtpUser: string;
};

type Detail = {
  account: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    disabled: boolean;
    googleLogin: boolean;
    admin: boolean;
  };
  lastActiveAt: string;
  resume: { at?: string; path?: string; lines?: string[] } | null;
  settings: {
    gemini: boolean;
    googleCalendar: boolean;
    googleEmail: string;
    driveOk: boolean;
    lastSyncedAt: string;
    emailEnabled: boolean;
    digestDaily: boolean;
    digestWeekly: boolean;
    inbox: string;
  };
  courses: { id: string; code: string; name: string; term: string; year: number; instructor: string; meetingPattern: string; dropped: boolean; createdAt: string }[];
  events: { id: string; title: string; type: string; start: string; end: string | null; allDay: boolean; courseId: string | null; source: string; canceled: boolean; location: string }[];
  notes: { id: string; title: string; kind: string; courseId: string; catalogDate: string; createdAt: string; hasBody: boolean; hasTranscript: boolean; hasSummary: boolean; hasAudio: boolean; files: string[]; summaryPreview: string }[];
  chats: { id: string; title: string; pinned: boolean; updatedAt: string; messages: { role: string; content: string; createdAt: string; files: string[] }[] }[];
  quickPad: { body: string; todos: { id: string; text: string; done: boolean }[]; updatedAt: string };
};

function when(iso?: string) {
  if (!iso) return "none";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "none";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminPage() {
  const { data } = useBuddy();
  const [users, setUsers] = useState<Row[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const admin = Boolean(data?.settings.isAdmin);

  async function load() {
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Admin only");
      return;
    }
    setUsers(json.users || []);
    setSite(json.site || null);
  }

  async function openUser(id: string) {
    setOpenId(id);
    setDetail(null);
    setDetailBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load that account");
      setDetail(json.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load that account");
    } finally {
      setDetailBusy(false);
    }
  }

  useEffect(() => {
    if (admin) void load();
  }, [admin]);

  if (!admin) {
    return (
      <p className="text-sm text-muted">
        Administration is only for {ADMIN_EMAIL}. Sign out, then log in with that Google or email account.
      </p>
    );
  }

  const students = users.filter((u) => !u.admin);

  if (openId) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <button type="button" className="text-sm text-gold-2 underline" onClick={() => { setOpenId(null); setDetail(null); }}>
          ← All accounts
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
        {detailBusy && <p className="text-sm text-muted">Loading their planner…</p>}
        {detail && <UserDossier detail={detail} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="text-sm text-muted">
          Signed in as <strong>{data?.me?.email || ADMIN_EMAIL}</strong>. Open any account to see their courses, calendar,
          notes, chats, and settings. Keys and Google tokens stay hidden.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-medium text-gold-2">Accounts</h2>
          <p className="mt-1 text-2xl font-semibold">{students.length}</p>
          <p className="text-muted">students · {users.length} total including admin</p>
        </section>
        <section className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-medium text-gold-2">Site Google</h2>
          <p className="mt-1">{site?.googleReady ? "Sign-in client is configured" : "Not configured"}</p>
          {site?.googleClientIdHint ? <p className="mt-1 break-all text-xs text-muted">{site.googleClientIdHint}</p> : null}
          <p className="mt-2 text-muted">Classmates never enable APIs. That lives on this Cloud project.</p>
        </section>
        <section className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-medium text-gold-2">Outgoing mail</h2>
          <p className="mt-1">{site?.smtpConfigured ? `Sending as ${site.smtpUser || ADMIN_EMAIL}` : "SMTP not set"}</p>
          <Link href="/settings" className="mt-2 inline-block text-gold-2 underline">
            SMTP and digests in Settings
          </Link>
        </section>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="p-2">Account</th>
              <th className="p-2">Planner</th>
              <th className="p-2">Google</th>
              <th className="p-2">Gemini</th>
              <th className="p-2">Last used</th>
              <th className="p-2">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line align-top">
                <td className="p-2">
                  <button type="button" className="text-left font-medium text-gold-2 underline" onClick={() => void openUser(u.id)}>
                    {u.name || "none"}
                  </button>
                  <div>
                    {u.email}
                    {u.admin ? " · admin" : ""}
                  </div>
                  <div className="text-xs text-muted">Joined {when(u.createdAt)}</div>
                </td>
                <td className="p-2 whitespace-nowrap">
                  {u.courses} courses
                  <div className="text-muted">
                    {u.events} events · {u.notes} notes · {u.chats || 0} chats
                  </div>
                </td>
                <td className="p-2">
                  {u.googleLogin ? "Google login" : "email login"}
                  <div className="text-muted">
                    {u.googleCalendar ? `calendar${u.googleEmail ? ` · ${u.googleEmail}` : ""}` : "calendar off"}
                  </div>
                </td>
                <td className="p-2">{u.gemini ? "key saved" : "none"}</td>
                <td className="p-2 whitespace-nowrap">{when(u.lastActiveAt)}</td>
                <td className="p-2">{u.disabled ? "disabled" : "active"}</td>
                <td className="p-2">
                  <button type="button" className="text-left text-gold-2 underline" onClick={() => void openUser(u.id)}>
                    Open
                  </button>
                  {!u.admin && (
                    <div className="mt-1 flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-gold-2 underline"
                        onClick={async () => {
                          await fetch("/api/admin/users", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: u.id, disabled: !u.disabled }),
                          });
                          await load();
                        }}
                      >
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        className="text-left text-red-400 underline"
                        onClick={async () => {
                          if (!confirm(`Delete ${u.email}? This removes their planner.`)) return;
                          await fetch("/api/admin/users", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: u.id }),
                          });
                          await load();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserDossier({ detail }: { detail: Detail }) {
  const a = detail.account;
  const s = detail.settings;
  const courseName = (id: string | null) => {
    const c = detail.courses.find((x) => x.id === id);
    return c ? `${c.code} ${c.name}` : "none";
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{a.name || a.email}</h1>
        <p className="text-sm text-muted">
          {a.email}
          {a.admin ? " · admin" : ""}
          {a.disabled ? " · disabled" : ""}
          {" · "}
          {a.googleLogin ? "Google login" : "email login"}
          {" · joined "}
          {when(a.createdAt)}
          {" · last used "}
          {when(detail.lastActiveAt)}
        </p>
        <p className="mt-1 text-xs text-muted">Account id {a.id}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-medium text-gold-2">Connections</h2>
          <p>Gemini key: {s.gemini ? "saved" : "none"}</p>
          <p>Google Calendar: {s.googleCalendar ? `on${s.googleEmail ? ` · ${s.googleEmail}` : ""}` : "off"}</p>
          <p>Drive: {s.driveOk ? "ready" : "not ready"}</p>
          <p>Last calendar sync: {when(s.lastSyncedAt)}</p>
          <p>Digest inbox: {s.inbox || "none"}</p>
          <p>
            Mail {s.emailEnabled ? "on" : "off"} · daily {s.digestDaily ? "on" : "off"} · weekly {s.digestWeekly ? "on" : "off"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-medium text-gold-2">Last stop</h2>
          {detail.resume?.path ? <p>Left on {detail.resume.path}</p> : <p className="text-muted">No resume snapshot</p>}
          {detail.resume?.at ? <p className="text-muted">{when(detail.resume.at)}</p> : null}
          {(detail.resume?.lines || []).slice(0, 8).map((line) => (
            <p key={line} className="text-muted">
              {line}
            </p>
          ))}
        </div>
      </section>

      <Section title={`Courses (${detail.courses.length})`}>
        {detail.courses.length === 0 && <p className="text-muted">None</p>}
        {detail.courses.map((c) => (
          <div key={c.id} className="border-t border-line py-2">
            <p className="font-medium">
              {c.code} · {c.name}
              {c.dropped ? " · dropped" : ""}
            </p>
            <p className="text-muted">
              {c.term} {c.year}
              {c.instructor ? ` · ${c.instructor}` : ""}
              {c.meetingPattern ? ` · ${c.meetingPattern}` : ""}
            </p>
          </div>
        ))}
      </Section>

      <Section title={`Upcoming calendar (${detail.events.length})`}>
        {detail.events.length === 0 && <p className="text-muted">Nothing from today forward</p>}
        {detail.events.slice(0, 120).map((e) => (
          <div key={e.id} className="border-t border-line py-2">
            <p className="font-medium">{e.title}</p>
            <p className="text-muted">
              {e.type} · {e.allDay ? `${e.start.slice(0, 10)} all day` : when(e.start)} · {courseName(e.courseId)} · {e.source}
              {e.location ? ` · ${e.location}` : ""}
            </p>
          </div>
        ))}
        {detail.events.length > 120 && <p className="pt-2 text-muted">Showing the next 120 of {detail.events.length}.</p>}
      </Section>

      <Section title={`Notes (${detail.notes.length})`}>
        {detail.notes.length === 0 && <p className="text-muted">None</p>}
        {detail.notes.map((n) => (
          <div key={n.id} className="border-t border-line py-2">
            <p className="font-medium">
              {n.title} · {n.kind}
            </p>
            <p className="text-muted">
              {n.catalogDate || when(n.createdAt)} · {courseName(n.courseId)}
              {n.hasAudio ? " · voice" : ""}
              {n.hasTranscript ? " · transcript" : ""}
              {n.hasSummary ? " · study guide" : ""}
              {n.files.length ? ` · files: ${n.files.join(", ")}` : ""}
            </p>
            {n.summaryPreview ? <p className="mt-1 whitespace-pre-wrap text-muted">{n.summaryPreview}</p> : null}
          </div>
        ))}
      </Section>

      <Section title={`Chats (${detail.chats.length})`}>
        {detail.chats.length === 0 && <p className="text-muted">None</p>}
        {detail.chats.map((c) => (
          <div key={c.id} className="border-t border-line py-3">
            <p className="font-medium">
              {c.title || "Chat"}
              {c.pinned ? " · pinned" : ""}
            </p>
            <p className="text-xs text-muted">{when(c.updatedAt)}</p>
            <div className="mt-2 space-y-2">
              {c.messages.map((m, i) => (
                <div key={`${c.id}-${i}`} className="rounded-lg bg-input p-2">
                  <p className="text-xs text-gold-2">
                    {m.role} · {when(m.createdAt)}
                    {m.files.length ? ` · ${m.files.join(", ")}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Quick notes">
        {detail.quickPad.body ? <p className="whitespace-pre-wrap">{detail.quickPad.body}</p> : <p className="text-muted">Empty pad</p>}
        {detail.quickPad.todos.map((t) => (
          <p key={t.id} className="text-muted">
            {t.done ? "☑" : "☐"} {t.text}
          </p>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 text-sm">
      <h2 className="mb-2 font-medium text-gold-2">{title}</h2>
      {children}
    </section>
  );
}
