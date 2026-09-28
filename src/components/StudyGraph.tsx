"use client";

import type { StudyGraphSpec } from "@/lib/study-graph";
import { studyGraphSvg } from "@/lib/study-graph";

export function StudyGraph({ spec }: { spec: StudyGraphSpec }) {
  return (
    <figure className="study-graph my-4">
      <div className="overflow-x-auto rounded-xl border border-line" dangerouslySetInnerHTML={{ __html: studyGraphSvg(spec) }} />
      {spec.read ? <figcaption className="mt-2 text-[13px] leading-snug text-muted">{spec.read}</figcaption> : null}
    </figure>
  );
}
