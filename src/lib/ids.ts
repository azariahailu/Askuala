import { nanoid } from "nanoid";
import { COURSE_COLORS, type AlertRule, type AppSettings, type AppState } from "./types";

export function nid() {
  return nanoid(12);
}

/** Google Calendar “popup” reminders are what the phone app uses. At-event (0 min) often never fires on iOS. */
export function phoneAlertRules(): AlertRule[] {
  return [{ id: nid(), amount: 10, unit: "minutes", channel: "popup" }];
}

export function nowIso() {
  return new Date().toISOString();
}

export function nextCourseColor(existingCount: number) {
  return COURSE_COLORS[existingCount % COURSE_COLORS.length];
}

export function defaultSettings(): AppSettings {
  return {
    geminiKey: "",
    openaiKey: "",
    deepseekKey: "",
    notification: {
      emailEnabled: true,
      popupEnabled: false,
      emailAddress: "",
      digest: "daily",
      digestDaily: true,
      digestWeekly: true,
      digestDailyHour: 22,
      digestDailyMinute: 0,
      defaultAlerts: [
        { id: nid(), amount: 30, unit: "minutes", channel: "popup" },
        { id: nid(), amount: 2, unit: "hours", channel: "popup" },
        { id: nid(), amount: 1, unit: "days", channel: "email" },
      ],
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refreshToken: "",
      accessToken: "",
      expiryDate: 0,
      connectedEmail: "",
      driveOk: false,
      driveRootId: "",
      driveFilesId: "",
      driveVoiceId: "",
      driveUploadsId: "",
      driveOutputsId: "",
      schoolCalHintDone: false,
      lastSyncedAt: "",
    },
    smtp: {
      host: "",
      port: 587,
      user: "",
      pass: "",
    },
    plannerImported: false,
  };
}

export function emptyState(): AppState {
  return {
    courses: [],
    events: [],
    notes: [],
    messages: [],
    chats: [],
    activeChatId: null,
    quickPad: { body: "", todos: [], updatedAt: nowIso() },
    settings: defaultSettings(),
    firedAlertKeys: [],
    uiText: {},
  };
}

export function defaultAlerts(): AlertRule[] {
  return [
    { id: nid(), amount: 1, unit: "days", channel: "email" },
    { id: nid(), amount: 2, unit: "hours", channel: "email" },
  ];
}

export function officeHourTitle(holder: string, courseCode: string, extra = "") {
  const who = holder.trim() || "Instructor";
  const code = courseCode.trim() || "Course";
  const suffix = extra.trim() ? ` · ${extra.trim()}` : "";
  return `${who} — Office Hours · ${code}${suffix}`;
}
