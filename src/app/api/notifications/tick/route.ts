import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { processNotifications } from "@/lib/notify";
import { updateState } from "@/lib/store";

export async function POST() {
  try {
    const user = await requireUser();
    // Goes through updateState so this minute-by-minute write shares the per-user queue with every other save.
    const result = await updateState(user.id, async (state) => {
      if (!state.settings.notification.popupEnabled) return { popups: [], skipPersist: true };
      const extra = await processNotifications(state, { mail: false });
      return { popups: extra.popups, skipPersist: !extra.changed };
    });
    return NextResponse.json({ extra: { popups: result.popups } });
  } catch (err) {
    return fail(err);
  }
}
