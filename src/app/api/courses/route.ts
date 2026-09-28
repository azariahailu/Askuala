import { fail, mutate } from "@/lib/api";
import { applyCourseSchedule, salvageCourseName } from "@/lib/course-schedule";
import { nid, nowIso, nextCourseColor } from "@/lib/ids";
import { academicYearFor } from "@/lib/terms";
import { pushEvent, ensureCourseCalendar } from "@/lib/google";
import type { Course, Policy, TermName } from "@/lib/types";

const EDITABLE = [
  "code",
  "name",
  "instructor",
  "instructorEmail",
  "location",
  "meetingPattern",
  "term",
  "year",
  "color",
  "googleColorId",
  "extraContext",
  "officeHours",
  "syllabusText",
] as const;

function applyFields(course: Course, body: Record<string, unknown>) {
  for (const key of EDITABLE) {
    if (body[key] === undefined) continue;
    const next = body[key];
    if (
      (key === "extraContext" || key === "officeHours" || key === "syllabusText") &&
      String(next || "").trim() === "" &&
      String((course as unknown as Record<string, unknown>)[key] || "").trim()
    ) {
      continue;
    }
    (course as unknown as Record<string, unknown>)[key] = next;
  }
  if (Array.isArray(body.policies)) {
    course.policies = (body.policies as Policy[]).map((p) => ({
      id: p.id || nid(),
      title: String(p.title || "").trim() || "Policy",
      body: String(p.body || ""),
    }));
  }
  const term = (["Fall", "Spring", "Summer"].includes(String(course.term)) ? course.term : "Fall") as TermName;
  course.term = term;
  course.year = Number(course.year) || course.year;
  course.academicYear = academicYearFor(course.term, course.year);
  course.updatedAt = nowIso();
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown> & { id: string };
    return await mutate(async (state) => {
      const course = state.courses.find((c) => c.id === body.id);
      if (!course) throw new Error("Course not found");
      applyFields(course, body);
      course.name = salvageCourseName(course);
      applyCourseSchedule(state, course);
      try {
        await ensureCourseCalendar(state, course);
      } catch (e) {
        console.error(e);
      }
      for (const event of state.events) {
        if (event.canceled || event.courseId !== course.id) continue;
        if (event.type === "lecture" || event.type === "office_hour") continue;
        try {
          await pushEvent(state, event, true);
        } catch (e) {
          console.error(e);
        }
      }
      return { course };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { id, drop } = await req.json();
    return await mutate((state) => {
      const course = state.courses.find((c) => c.id === id);
      if (!course) throw new Error("Course not found");
      if (drop === false) {
        state.courses = state.courses.filter((c) => c.id !== id);
        state.events = state.events.filter((e) => e.courseId !== id);
        state.notes = state.notes.filter((n) => n.courseId !== id);
      } else {
        course.dropped = true;
        course.updatedAt = nowIso();
      }
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown> & { id?: string; create?: boolean };
    return await mutate((state) => {
      if (body.create) {
        const color = nextCourseColor(state.courses.length);
        const course: Course = {
          id: nid(),
          code: String(body.code || "").trim() || "NEW 000",
          name: String(body.name || "").trim() || "Untitled course",
          instructor: "",
          instructorEmail: "",
          location: "",
          meetingPattern: "",
          term: "Fall",
          year: 2026,
          academicYear: 1,
          color: color.hex,
          googleColorId: color.google,
          googleCalendarId: null,
          policies: [],
          extraContext: "",
          officeHours: "",
          syllabusText: "",
          dropped: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        applyFields(course, body);
        course.name = salvageCourseName(course);
        applyCourseSchedule(state, course);
        state.courses.push(course);
        return { course };
      }
      const course = state.courses.find((c) => c.id === body.id);
      if (!course) throw new Error("Course not found");
      course.dropped = false;
      course.updatedAt = nowIso();
      return { course };
    });
  } catch (err) {
    return fail(err);
  }
}
