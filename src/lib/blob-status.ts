export function isBlobSuspended(err: unknown) {
  const m = err instanceof Error ? err.message : String(err);
  return /store has been suspended|store is blocked|BlobStoreSuspended/i.test(m);
}

export function blobSuspendedMessage() {
  return "Sign-in is blocked because Vercel Blob on the Hobby plan hit its monthly cap. Your accounts and calendars are still in the store — nothing was deleted. Access on this store resumes 10/29/26, or upgrade the Ha Ge'ez team to Pro (vercel.com/ha-ge-ez/~/settings/billing) and then unsuspend Storage → Blob → askualastudy.";
}
