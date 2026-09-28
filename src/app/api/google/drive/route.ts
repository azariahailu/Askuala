import { fail, mutate } from "@/lib/api";
import { backfillDrive } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    return await mutate(async (state, userId) => {
      const result = await backfillDrive(state, userId);
      if (!result.ok && result.reason === "scope") {
        return {
          ok: false,
          uploaded: result.uploaded || 0,
          message: "Google still has Calendar only. In Settings, click Connect Google again and allow Drive.",
        };
      }
      if (!result.ok && result.reason === "auth") {
        return { ok: false, uploaded: 0, message: "Connect Google in Settings first." };
      }
      if (!result.ok) {
        return { ok: false, uploaded: result.uploaded || 0, message: "Could not copy files to Drive." };
      }
      return {
        ok: true,
        uploaded: result.uploaded,
        message:
          result.uploaded > 0
            ? `Copied ${result.uploaded} note(s) into Drive → Askuala.`
            : "Drive folders are ready. Nothing new to copy.",
      };
    });
  } catch (err) {
    return fail(err);
  }
}
