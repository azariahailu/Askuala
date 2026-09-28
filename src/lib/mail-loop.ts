import { listUserIds, updateState } from "./store";
import { processNotifications } from "./notify";
import { getUserById } from "./auth";

const g = globalThis as typeof globalThis & { askualaMailLoop?: ReturnType<typeof setInterval> };

export function startMailLoop() {
  if (g.askualaMailLoop) return;
  g.askualaMailLoop = setInterval(() => {
    void tickAllMail();
  }, 60_000);
  setTimeout(() => void tickAllMail(), 8000);
}

export async function tickAllMail() {
  try {
    const ids = await listUserIds();
    for (const id of ids) {
      await updateState(id, async (state) => {
        const account = await getUserById(id);
        if (account?.email) state.settings.notification.emailAddress = account.email;
        if (!state.settings.notification.emailEnabled || !state.settings.notification.emailAddress) {
          return { skipPersist: true };
        }
        const extra = await processNotifications(state);
        return { ...extra, skipPersist: !extra.changed };
      });
    }
  } catch (e) {
    console.error(e);
  }
}
