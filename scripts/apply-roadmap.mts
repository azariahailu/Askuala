import fs from "node:fs";
import path from "node:path";
import { extractTextFromPath } from "../src/lib/extract-text.ts";
import { applyDegreeRoadmap, parseDegreeRoadmap, purgeRoadmapJunk } from "../src/lib/planned-courses.ts";
import type { AppState } from "../src/lib/types.ts";

const pdf =
  process.argv[2] ||
  "/Users/azaria/Library/CloudStorage/OneDrive-YaleUniversity/Documents/Important Docs/Azaria's Ultimate B.S._M.A. Degree Roadmap.pdf";
const storePath =
  process.argv[3] ||
  path.join(process.cwd(), "data/users/PHU2FnLvgeez/store.json");

const text = await extractTextFromPath(pdf, "application/pdf", path.basename(pdf));
console.log("parsed", parseDegreeRoadmap(text).map((c) => `${c.term} ${c.year} | ${c.code} | ${c.name}`).join("\n"));
const state = JSON.parse(fs.readFileSync(storePath, "utf8")) as AppState;
const removed = purgeRoadmapJunk(state);
const result = applyDegreeRoadmap(state, text);
fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
console.log({ removed, ...result, courseCount: state.courses.length, events: state.events.length });
