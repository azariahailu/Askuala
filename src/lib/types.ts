export const TERMS = ["Fall", "Spring", "Summer"] as const;
export type TermName = (typeof TERMS)[number];

export const EVENT_TYPES = [
  "exam",
  "quiz",
  "assignment",
  "project",
  "lab",
  "pset",
  "reading",
  "office_hour",
  "lecture",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const NOTE_KINDS = [
  "note",
  "reminder",
  "question",
  "office_hours",
  "resource",
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const ALERT_UNITS = ["minutes", "hours", "days", "weeks"] as const;
export type AlertUnit = (typeof ALERT_UNITS)[number];

export const ALERT_CHANNELS = ["popup", "email"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const RECUR_FREQS = ["hourly", "daily", "weekly", "monthly", "yearly"] as const;
export type RecurFreq = (typeof RECUR_FREQS)[number];

export type Recurrence = {
  freq: RecurFreq;
  interval?: number;
  byDay?: string[];
  until?: string | null;
  count?: number | null;
};

export type AlertRule = {
  id: string;
  amount: number;
  unit: AlertUnit;
  channel: AlertChannel;
};

export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  createdAt: string;
  driveFileId?: string;
  driveUrl?: string;
};

export type CourseEvent = {
  id: string;
  courseId: string | null;
  title: string;
  details: string;
  type: EventType;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string;
  weight: string;
  source: "syllabus" | "assistant" | "manual" | "google" | "announcement";
  googleEventId: string | null;
  googleCalendarId: string | null;
  viewOnly: boolean;
  recurrence: Recurrence | null;
  releasedAt: string | null;
  canceled: boolean;
  googleAlerts: boolean;
  /** Per-event Google reminders. Empty + googleAlerts false = none. amount 0 = at event time. */
  alerts?: AlertRule[];
  createdAt: string;
  updatedAt: string;
};

export type CourseNote = {
  id: string;
  courseId: string;
  kind: NoteKind;
  title: string;
  body: string;
  catalogDate: string;
  reminderAt: string | null;
  alerts: AlertRule[];
  transcript: string;
  summary: string;
  /** Last study guide before a rebuild, so Keep-and-add mistakes can be undone. */
  summaryPrevious?: string;
  audioPath: string | null;
  audioDriveUrl?: string;
  studyPdfDriveUrl?: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
};

export type Policy = {
  id: string;
  title: string;
  body: string;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  instructor: string;
  instructorEmail: string;
  location: string;
  meetingPattern: string;
  term: TermName;
  year: number;
  academicYear: number;
  color: string;
  googleColorId: string;
  googleCalendarId: string | null;
  policies: Policy[];
  extraContext: string;
  /** Repeating office hours / extra times, applied to the calendar on save. */
  officeHours: string;
  syllabusText: string;
  /** Skip re-parsing this syllabus on load when it still matches. */
  syllabusFp?: string;
  dropped: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  createdAt: string;
};

export type ChatThread = {
  id: string;
  title: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type QuickTodo = {
  id: string;
  text: string;
  done: boolean;
};

export type QuickPad = {
  body: string;
  todos: QuickTodo[];
  updatedAt: string;
};

export type NotificationPrefs = {
  emailEnabled: boolean;
  popupEnabled: boolean;
  emailAddress: string;
  lastLoginMailAt?: string;
  digest: "off" | "daily" | "every_event";
  digestDaily: boolean;
  digestWeekly: boolean;
  digestDailyHour: number;
  digestDailyMinute: number;
  defaultAlerts: AlertRule[];
};

export type GoogleAuth = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  expiryDate: number;
  connectedEmail: string;
  driveOk: boolean;
  driveRootId: string;
  driveFilesId: string;
  driveVoiceId: string;
  driveUploadsId: string;
  driveOutputsId: string;
  schoolCalHintDone: boolean;
  lastSyncedAt?: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export type AppSettings = {
  geminiKey: string;
  openaiKey: string;
  deepseekKey: string;
  notification: NotificationPrefs;
  google: GoogleAuth;
  smtp: SmtpConfig;
  plannerImported?: boolean;
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type AppState = {
  courses: Course[];
  events: CourseEvent[];
  notes: CourseNote[];
  messages: ChatMessage[];
  chats: ChatThread[];
  activeChatId: string | null;
  quickPad: QuickPad;
  settings: AppSettings;
  firedAlertKeys: string[];
  resume?: PlannerResume;
  resumeStop?: PlannerResume;
  lastActiveAt?: string;
  uiText?: Record<string, string>;
};

export type PlannerResume = {
  at: string;
  path?: string;
  lines: string[];
};

export type PublicSettings = {
  notification: NotificationPrefs;
  googleConnected: boolean;
  googleEmail: string;
  driveReady: boolean;
  appGoogleReady: boolean;
  smtpConfigured: boolean;
  isAdmin: boolean;
  schoolCalHintDone: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  geminiConfigured: boolean;
  assistantProvider: string;
};

export type ClientState = {
  me: AppUser;
  courses: Course[];
  events: CourseEvent[];
  notes: CourseNote[];
  messages: ChatMessage[];
  chats: { id: string; title: string; updatedAt: string; pinned?: boolean }[];
  activeChatId: string | null;
  quickPad: QuickPad;
  settings: PublicSettings;
  resume?: PlannerResume;
  lastActiveAt?: string;
  uiText?: Record<string, string>;
};

export const COURSE_COLORS = [
  { hex: "#E4C56A", google: "5" },
  { hex: "#5BA3FF", google: "9" },
  { hex: "#34D399", google: "10" },
  { hex: "#FB923C", google: "6" },
  { hex: "#C084FC", google: "3" },
  { hex: "#F87171", google: "11" },
  { hex: "#2DD4BF", google: "7" },
  { hex: "#F472B6", google: "4" },
  { hex: "#A3E635", google: "2" },
  { hex: "#818CF8", google: "1" },
  { hex: "#A8A29E", google: "8" },
];

export const TYPE_LABELS: Record<EventType, string> = {
  exam: "Exams",
  quiz: "Quizzes",
  assignment: "Assignments",
  project: "Project works",
  lab: "Lab works",
  pset: "Problem sets",
  reading: "Readings",
  office_hour: "Office hours",
  lecture: "Lectures",
  other: "Other",
};
