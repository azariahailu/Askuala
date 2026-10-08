import { fail, mutate } from "@/lib/api";
import { backfillDrive } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    return await mutate(async (state, userId) => {
      const result = await backfillDrive(state, userId);
      if (!result.ok) {
        return {
          ok: false,
          uploaded: 0,
          message:
            result.reason === "scope"
              ? "Google still has Calendar only. In Settings, click Connect Google again and allow Drive."
              : "Could not update Drive folders.",
        };
      }
      return {
        ok: true,
        uploaded: result.uploaded,
        changed: result.changed,
        message: result.changed
          ? "Drive course folders flattened (PDFs in the course folder). Old Voice folders trashed. Expired local voice removed."
          : "Drive layout is already flat. Voice stays on Askuala for 7 days only.",
      };
    });
  } catch (err) {
    return fail(err);
  }
}
