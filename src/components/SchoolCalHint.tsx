"use client";

import { useState } from "react";
import { useBuddy } from "./BuddyProvider";
import { SchoolCalGuide } from "./SchoolCalGuide";

export function SchoolCalHint() {
  const { data, postJson, refresh } = useBuddy();
  const [hidden, setHidden] = useState(false);
  if (!data || hidden || data.settings.schoolCalHintDone) return null;
  if ((data.settings.calendarFeeds?.length || 0) > 0) return null;
  if (data.settings.googleConnected) return null;

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
      <h2 className="font-semibold text-gold-2">Add your class calendar</h2>
      <SchoolCalGuide className="mt-1 text-muted" />
      <button type="button" className="mt-3 text-gold-2 underline" onClick={() => void dismissAfterSync()}>
        Already set up: hide this
      </button>
    </section>
  );
}
