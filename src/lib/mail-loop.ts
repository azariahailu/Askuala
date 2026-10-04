import { listUserIds, updateState } from "./store";
import { backfillDrive, flushDueStudyPdfs } from "./google-drive";
import { processNotifications } from "./notify";
import { getUserById } from "./auth";
import { onVercel, usesCloud } from "./persist";

const g = globalThis as typeof globalThis & {
  askualaMailLoop?: ReturnType<typeof setInterval>;
  askualaMailBusy?: boolean;
};

function shouldMailLoop() {
  if (onVercel()) return false;
  if (process.env.ASKUALA_MAIL_LOOP === "1") return true;
  if (process.env.ASKUALA_MAIL_LOOP === "0") return false;
  return !usesCloud();
}

export function startMailLoop() {
  if (!shouldMailLoop()) return;
  if (g.askualaMailLoop) return;
  g.askualaMailLoop = setInterval(() => {
    void tickAllMail();
  }, 60_000);
  setTimeout(() => void tickAllMail(), 8000);
}

export async function tickAllMail() {
  if (g.askualaMailBusy) return;
  g.askualaMailBusy = true;
  try {
    const ids = await listUserIds();
    const mailed = new Set<string>();
    for (const id of ids) {
      await updateState(id, async (state) => {
        const account = await getUserById(id);
        if (account?.email) state.settings.notification.emailAddress = account.email;
        let driveChanged = false;
        try {
          const copied = await backfillDrive(state, id, { limit: 4 });
          if (copied.ok && copied.uploaded > 0) driveChanged = true;
        } catch {
          /* continue mail */
        }
        try {
          if (await flushDueStudyPdfs(state, id)) driveChanged = true;
        } catch {
          /* continue mail */
        }
        const inbox = (state.settings.notification.emailAddress || "").trim().toLowerCase();
        if (!state.settings.notification.emailEnabled || !inbox) {
          return { skipPersist: !driveChanged };
        }
        if (mailed.has(inbox)) {
          return { skipPersist: !driveChanged };
        }
        mailed.add(inbox);
        const extra = await processNotifications(state, { userId: id });
        return { ...extra, skipPersist: !extra.changed && !driveChanged };
      });
    }
  } catch (e) {
    console.error(e);
  } finally {
    g.askualaMailBusy = false;
  }
}
