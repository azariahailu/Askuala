import { NextResponse } from "next/server";
import { requireUser } from "./auth";
import { blobSuspendedMessage } from "./blob-status";
import { readState, toClient, updateState } from "./store";
import type { AppState } from "./types";

export async function withUserState() {
  const user = await requireUser();
  const state = await readState(user.id);
  return { user, state };
}

export function clientJson(user: Awaited<ReturnType<typeof requireUser>>, state: AppState, extra?: object) {
  return NextResponse.json({ ...toClient(user, state), ...extra });
}

export function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const blob = /file store \(Vercel Blob\) is paused|store has been suspended/i.test(message);
  const status = (err as { status?: number }).status === 401 ? 401 : blob ? 503 : 400;
  return NextResponse.json({ error: blob ? blobSuspendedMessage() : message }, { status });
}

export async function mutate(fn: (state: AppState, userId: string) => Promise<unknown> | unknown) {
  const user = await requireUser();
  const result = await updateState(user.id, async (state) => {
    const extra = await fn(state, user.id);
    const skipPersist = Boolean(extra && typeof extra === "object" && (extra as { skipPersist?: boolean }).skipPersist);
    return { state, extra, skipPersist };
  });
  return clientJson(user, result.state, { extra: result.extra });
}
