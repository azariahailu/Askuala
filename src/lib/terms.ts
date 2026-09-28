import type { TermName } from "./types";

export const START_YEAR = 2026;
export const ACADEMIC_YEARS = [1, 2, 3, 4] as const;

export function termsForAcademicYear(academicYear: number): {
  term: TermName;
  year: number;
  academicYear: number;
  label: string;
}[] {
  const start = START_YEAR + academicYear - 1;
  return [
    { term: "Fall", year: start, academicYear, label: `Fall ${start}` },
    { term: "Spring", year: start + 1, academicYear, label: `Spring ${start + 1}` },
    { term: "Summer", year: start + 1, academicYear, label: `Summer ${start + 1}` },
  ];
}

export function allTerms() {
  return ACADEMIC_YEARS.flatMap((y) => termsForAcademicYear(y));
}

export function currentAcademicGuess(now = new Date()) {
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 7) return { term: "Fall" as TermName, year };
  if (month >= 4) return { term: "Summer" as TermName, year };
  return { term: "Spring" as TermName, year };
}

export function academicYearFor(term: TermName, year: number) {
  const start = term === "Fall" ? year : year - 1;
  return Math.min(4, Math.max(1, start - START_YEAR + 1));
}

export function termKey(term: TermName, year: number) {
  return `${term}-${year}`;
}
