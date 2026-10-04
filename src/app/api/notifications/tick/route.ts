import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { backfillDrive, flushDueStudyPdfs } from "@/lib/google-drive";
import { processNotifications } from "@/lib/notify";
import { updateState } from "@/lib/store";

export async function POST() {
  try {
    const user = await requireUser();
    const result = await updateState(user.id, async (state) => {
      let driveChanged = false;
      try {
        const copied = await backfillDrive(state, user.id, { limit: 5 });
        if (copied.ok && copied.uploaded > 0) driveChanged = true;
      } catch {
        /* next tick */
      }
      try {
        if (await flushDueStudyPdfs(state, user.id)) driveChanged = true;
      } catch {
        /* next tick */
      }
      if (!state.settings.notification.popupEnabled) {
        return { popups: [], skipPersist: !driveChanged };
      }
      const extra = await processNotifications(state, { mail: false });
      return { popups: extra.popups, skipPersist: !extra.changed && !driveChanged };
    });
    return NextResponse.json({ extra: { popups: result.popups } });
  } catch (err) {
    return fail(err);
  }
}
