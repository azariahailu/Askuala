import { fail, mutate } from "@/lib/api";
import { findMatchingEvent, shouldNotRecur } from "@/lib/calendar-utils";
import { nid, nowIso } from "@/lib/ids";
import { deleteGoogleEvent, pushEvent } from "@/lib/google";
import type { CourseEvent } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CourseEvent>;
    return await mutate(async (state) => {
      const start = body.start || nowIso();
      const type = body.type || "other";
      const hit = findMatchingEvent(
        state.events,
        {
          courseId: body.courseId ?? null,
          title: body.title || "Untitled",
          start,
          type,
          recurrence: body.recurrence ?? null,
        },
        state.courses,
      );
      if (hit) {
        Object.assign(hit, {
          title: body.title || hit.title,
          details: body.details ?? hit.details,
          type,
          start,
          end: body.end ?? hit.end,
          allDay: Boolean(body.allDay),
          location: body.location ?? hit.location,
          courseId: body.courseId ?? hit.courseId,
          recurrence: shouldNotRecur({ title: body.title || hit.title, type }) ? null : body.recurrence ?? hit.recurrence,
          googleAlerts: Boolean(body.googleAlerts && (body.alerts?.length ?? 0) > 0),
          alerts: Array.isArray(body.alerts) ? body.alerts : hit.alerts,
          updatedAt: nowIso(),
          canceled: false,
        });
        await pushEvent(state, hit, true);
        return { event: hit };
      }
      const event: CourseEvent = {
        id: nid(),
        courseId: body.courseId ?? null,
        title: body.title || "Untitled",
        details: body.details || "",
        type: body.type || "other",
        start: body.start || nowIso(),
        end: body.end ?? null,
        allDay: Boolean(body.allDay),
        location: body.location || "",
        weight: body.weight || "",
        source: "manual",
        googleEventId: null,
        googleCalendarId: null,
        viewOnly: false,
        recurrence: shouldNotRecur({ title: body.title || "Untitled", type: body.type || "other" }) ? null : body.recurrence ?? null,
        releasedAt: body.releasedAt ?? null,
        canceled: false,
        googleAlerts: Boolean(body.googleAlerts && (body.alerts?.length ?? 0) > 0),
        alerts: Array.isArray(body.alerts) ? body.alerts : [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.events.push(event);
      await pushEvent(state, event, true);
      return { event };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Partial<CourseEvent> & { id: string };
    return await mutate(async (state) => {
      const id = body.id.split("::")[0];
      const event = state.events.find((e) => e.id === id);
      if (!event) throw new Error("Event not found");
      if (event.viewOnly) {
        event.viewOnly = false;
      }
      Object.assign(event, { ...body, id: event.id, updatedAt: nowIso() });
      if (shouldNotRecur(event)) event.recurrence = null;
      if (Array.isArray(body.alerts)) event.alerts = body.alerts;
      event.googleAlerts = Boolean(event.googleAlerts && (event.alerts?.length ?? 0) > 0);
      await pushEvent(state, event, true);
      return { event };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    return await mutate(async (state) => {
      const real = String(id).split("::")[0];
      const event = state.events.find((e) => e.id === real);
      if (!event) throw new Error("Event not found");
      if (event.viewOnly) {
        event.viewOnly = false;
      }
      event.canceled = true;
      event.updatedAt = nowIso();
      try {
        await deleteGoogleEvent(state, event);
      } catch (e) {
        console.error(e);
      }
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}
