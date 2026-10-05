"use client";

import { useState } from "react";
import { useBuddy } from "./BuddyProvider";

export function CalendarFeedBox() {
  const { data, refresh } = useBuddy();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const feeds = data?.settings.calendarFeeds || [];

  async function run(path: "add" | "sync" | "remove", extra?: object) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/calendar-feeds", {
        method: path === "remove" ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(path === "add" ? { url } : path === "sync" ? { sync: true } : extra),
      });
      const json = await res.json();
      const extraJson = json.extra || json;
      if (!res.ok) throw new Error(json.error || extraJson.message || "Could not update the calendar.");
      setMsg(extraJson.message || "Calendar is up to date.");
      if (path === "add") setUrl("");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update the calendar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gold/40 bg-surface p-4 space-y-3 text-sm">
      <h2 className="font-medium text-gold-2">Add a class calendar link</h2>
      <p className="text-muted">
        Schools on Outlook or Canvas (Montgomery College and others) can skip Google. In Canvas or Blackboard open Calendar, then calendar settings / iCal / Calendar feed. In Outlook open the calendar, then Share or Publish, and copy the ICS link. Paste it here. Events show on your Askuala calendar.
      </p>
      <label className="block">
        Calendar link
        <input
          className="mt-1 w-full bg-input p-2"
          placeholder="https://…/calendar.ics"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !url.trim()}
          className="rounded-lg bg-gold px-3 py-2 text-on-gold disabled:opacity-50"
          onClick={() => void run("add")}
        >
          {busy ? "Adding…" : "Add to Askuala"}
        </button>
        {feeds.length > 0 && (
          <button type="button" disabled={busy} className="rounded-lg border border-gold/40 px-3 py-2 text-gold-2 disabled:opacity-50" onClick={() => void run("sync")}>
            Sync links
          </button>
        )}
      </div>
      {feeds.length > 0 && (
        <ul className="space-y-2">
          {feeds.map((feed) => (
            <li key={feed.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-input px-3 py-2">
              <span>
                <span className="font-medium">{feed.name}</span>
                {feed.lastSyncedAt ? (
                  <span className="ml-2 text-xs text-muted">
                    Updated {new Date(feed.lastSyncedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                ) : null}
              </span>
              <button type="button" disabled={busy} className="text-red-400 disabled:opacity-50" onClick={() => void run("remove", { id: feed.id })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-gold-2">{msg}</p>}
    </section>
  );
}
