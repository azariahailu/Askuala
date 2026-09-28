import fs from "node:fs";
import path from "node:path";
import { heuristicExtract } from "../src/lib/heuristic";
import { applyExtraction } from "../src/lib/apply-extraction";
import type { AppState } from "../src/lib/types";

const storePath = path.join(process.cwd(), "data/users/XRMNms90f4QK/store.json");
const state = JSON.parse(fs.readFileSync(storePath, "utf8")) as AppState;

for (const course of state.courses) {
  const text = course.syllabusText || "";
  const pdf = text.split(/--- .+? ---\n/).slice(1).join("\n") || text;
  const extraction = heuristicExtract(pdf, course.extraContext || "");
  applyExtraction(state, extraction, { courseId: course.id });
  console.log(extraction.summary);
  console.log(
    "code",
    state.courses.find((c) => c.id === course.id)?.code,
    state.courses.find((c) => c.id === course.id)?.name,
  );
  console.log(
    "events",
    state.events.filter((e) => e.courseId === course.id).map((e) => `${e.type} ${e.title} ${e.start}`),
  );
}

fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
