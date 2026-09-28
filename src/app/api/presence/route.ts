import { fail, mutate } from "@/lib/api";
import { recordPresence } from "@/lib/checkpoint";

export async function POST(req: Request) {
  try {
    let reason: "active" | "stop" = "active";
    let page = "";
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("json")) {
      const body = (await req.json().catch(() => ({}))) as { reason?: string; path?: string };
      if (body.reason === "stop") reason = "stop";
      page = String(body.path || "");
    } else {
      const text = await req.text().catch(() => "");
      try {
        const body = JSON.parse(text) as { reason?: string; path?: string };
        if (body.reason === "stop") reason = "stop";
        page = String(body.path || "");
      } catch {
        /* beacon without body */
      }
    }
    return await mutate(async (state) => recordPresence(state, { reason, path: page }));
  } catch (err) {
    return fail(err);
  }
}
