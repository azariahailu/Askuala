import { pushBytesToDrive } from "./google-drive";
import { readState, updateState } from "./store";

/**
 * Copies every note (and the recycle bin) to the student's Google Drive as
 * Askuala/Notes backup.json, replacing the previous copy. Safe to call often.
 */
export async function backupNotesToDrive(userId: string) {
  const peek = await readState(userId);
  const g = peek.settings.google;
  if (!g.refreshToken && !g.accessToken) return { ok: false, reason: "not-connected" };
  const payload = {
    savedAt: new Date().toISOString(),
    courses: peek.courses.map((c) => ({ id: c.id, name: c.name })),
    notes: peek.notes,
    trash: peek.trash || [],
  };
  return updateState(
    userId,
    async (state) => {
      const res = await pushBytesToDrive({
        state,
        userId,
        course: null,
        kind: "outputs",
        displayName: "Notes backup.json",
        mime: "application/json",
        buf: Buffer.from(JSON.stringify(payload, null, 2)),
        replace: true,
        atRoot: true,
      });
      return { ...res, skipPersist: !res.ok };
    },
    { light: true },
  );
}
