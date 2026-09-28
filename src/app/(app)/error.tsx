"use client";

import { APP_NAME } from "@/lib/brand";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 p-10">
      <h1 className="text-xl font-semibold">{APP_NAME} hit a snag</h1>
      <p className="text-sm text-muted">Your courses and calendar are still saved. This screen is only this page load.</p>
      <p className="text-xs text-muted">{error.message}</p>
      <button type="button" className="rounded-lg bg-gold px-4 py-2 text-on-gold" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
