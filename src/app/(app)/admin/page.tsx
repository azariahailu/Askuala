"use client";

import { useEffect, useState } from "react";
import { useBuddy } from "@/components/BuddyProvider";
import { ADMIN_EMAIL } from "@/lib/admin";

type Row = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  google: boolean;
  admin: boolean;
  disabled: boolean;
};

export default function AdminPage() {
  const { data } = useBuddy();
  const [users, setUsers] = useState<Row[]>([]);
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
  }

  useEffect(() => {
    if (admin) void load();
  }, [admin]);

  if (!admin) {
    return <p className="text-sm text-muted">Administration is only for {ADMIN_EMAIL}.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="text-sm text-muted">
        {ADMIN_EMAIL} always has user management. Disable a classmate to block sign-in, or delete their planner data.
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Google</th>
              <th className="p-2">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="p-2">{u.name}</td>
                <td className="p-2">
                  {u.email}
                  {u.admin ? " · admin" : ""}
                </td>
                <td className="p-2">{u.google ? "yes" : "—"}</td>
                <td className="p-2">{u.disabled ? "disabled" : "active"}</td>
                <td className="p-2">
                  {!u.admin && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-gold-2 underline"
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
                        className="text-red-400 underline"
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
