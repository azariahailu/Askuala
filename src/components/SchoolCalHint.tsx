"use client";

import { useState } from "react";
import { useBuddy } from "./BuddyProvider";

export function SchoolCalHint() {
  const { data, postJson, refresh } = useBuddy();
  const [hidden, setHidden] = useState(false);
  if (!data || hidden || data.settings.schoolCalHintDone) return null;
  if ((data.events?.length || 0) > 0) return null;

  async function dismissAfterSync() {
    setHidden(true);
    try {
      await postJson("/api/settings", { schoolCalHintDone: true }, "PATCH");
      await refresh();
    } catch {
      /* already hidden on this page */
    }
  }

  return (
    <section className="rounded-xl border border-gold/50 bg-urgent p-4 text-sm">
      <h2 className="font-semibold text-gold-2">Before the first Google sync</h2>
      <p className="mt-1">
        Askuala reads <strong>Google Calendar</strong>, not Canvas or Blackboard directly. Put your school calendar on Google first, then connect and sync here.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>
          <strong>Canvas:</strong> Calendar → Calendar feed / iCal (often under calendar settings) → copy the feed URL → Google Calendar on the web → Other calendars → + → From URL → paste.
        </li>
        <li>
          <strong>Blackboard:</strong> Calendar → export or calendar feed if your campus offers it → same “From URL” step in Google Calendar.
        </li>
        <li>Wait until those events show in Google (your college Google account).</li>
        <li>Then click <strong>Connect Google</strong> / <strong>Sync Google Calendar</strong> on this page.</li>
      </ol>
      <p className="mt-2 text-muted">
        This notice is only for a first empty calendar. If your school calendar is already on Google, connect and sync once.
      </p>
      <button type="button" className="mt-3 text-gold-2 underline" onClick={() => void dismissAfterSync()}>
        Already set up — hide this
      </button>
    </section>
  );
}
