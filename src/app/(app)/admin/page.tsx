"use client";

import { useEffect, useState } from "react";
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

function when(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminPage() {
  const { data } = useBuddy();
  const [users, setUsers] = useState<Row[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [err, setErr] = useState("");
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="text-sm text-muted">
          Signed in as <strong>{data?.me?.email || ADMIN_EMAIL}</strong>. This login manages every classmate’s account and
          site mail/Google setup. Student planners stay on their own logins.
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
                  <div className="font-medium">{u.name || "—"}</div>
                  <div>
                    {u.email}
                    {u.admin ? " · admin" : ""}
                  </div>
                  <div className="text-xs text-muted">Joined {when(u.createdAt)}</div>
                </td>
                <td className="p-2 whitespace-nowrap">
                  {u.courses} courses
                  <div className="text-muted">
                    {u.events} events · {u.notes} notes
                  </div>
                </td>
                <td className="p-2">
                  {u.googleLogin ? "Google login" : "email login"}
                  <div className="text-muted">
                    {u.googleCalendar ? `calendar${u.googleEmail ? ` · ${u.googleEmail}` : ""}` : "calendar off"}
                  </div>
                </td>
                <td className="p-2">{u.gemini ? "key saved" : "—"}</td>
                <td className="p-2 whitespace-nowrap">{when(u.lastActiveAt)}</td>
                <td className="p-2">{u.disabled ? "disabled" : "active"}</td>
                <td className="p-2">
                  {!u.admin && (
                    <div className="flex flex-col gap-1">
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
