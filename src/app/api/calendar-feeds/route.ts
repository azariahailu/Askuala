import { fail, mutate } from "@/lib/api";
import { nid } from "@/lib/ids";
import { normalizeFeedUrl, removeCalendarFeed, syncAllFeeds, syncOneFeed } from "@/lib/ics-feed";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    return await mutate(async (state) => {
      if (!state.calendarFeeds) state.calendarFeeds = [];
      if (body.sync === true && !body.url) {
        const extra = await syncAllFeeds(state);
        return { ok: true, message: extra.feeds ? "Calendar is up to date." : "Add a calendar link first.", ...extra };
      }
      const url = normalizeFeedUrl(String(body.url || ""));
      const existing = state.calendarFeeds.find((f) => f.url === url);
      const feed = existing || { id: nid(), url, name: "Class calendar" };
      if (!existing) state.calendarFeeds.push(feed);
      const extra = await syncOneFeed(state, feed);
      return {
        ok: true,
        message: existing ? "Calendar is up to date." : `Added ${feed.name}.`,
        ...extra,
      };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) throw new Error("Pick a calendar to remove.");
    return await mutate(async (state) => {
      removeCalendarFeed(state, id);
      return { ok: true, message: "Removed that calendar link." };
    });
  } catch (err) {
    return fail(err);
  }
}
