export function isBlobSuspended(err: unknown) {
  const m = err instanceof Error ? err.message : String(err);
  return /store has been suspended|store is blocked|BlobStoreSuspended/i.test(m);
}

export function blobSuspendedMessage() {
  return "Askuala is temporarily unavailable. Your courses and calendar are still saved. Try again in a bit, or email buddy.askuala@gmail.com.";
}
