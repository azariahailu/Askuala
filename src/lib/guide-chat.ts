import { APP_NAME, ASSISTANT_NAME } from "./brand";
import { nowIso } from "./ids";
import type { AppState, ChatMessage, ChatThread } from "./types";

export const GUIDE_CHAT_ID = "askuala-guide";
export const GUIDE_MESSAGE_ID = "askuala-guide-msg";
export const GUIDE_CHAT_TITLE = `How to use ${APP_NAME}`;

export function isGuideChatId(id: string | null | undefined) {
  return id === GUIDE_CHAT_ID;
}

export function guideManualBody() {
  return `# ${GUIDE_CHAT_TITLE}

**Screen tour**: press Play on the homepage, on [the tour page](/tour), or at the top of this thread.

Add ${APP_NAME} to your home screen from Safari or Chrome if you want the icon on your phone.

This thread is always pinned at the top. It cannot be deleted. It is the manual for everything ${APP_NAME} actually does. You can still type follow-up questions here; the pages and buttons below stay the source of truth.

${APP_NAME} is your course planner: syllabi become a calendar, notes and recordings live on each course, Google Calendar can sync both ways, files copy into Drive under **Askuala**, email briefs can go out once a day and once on Sunday, and **${ASSISTANT_NAME}** (this chat) can read and edit that planner when you ask.

Your data is per login. Another student on the same app does not see your courses.

---

## Sign in and accounts

- Create an account with email + password, or **Sign in with Google**.
- **Sign in with Google** uses your name and email only. Connect Calendar and Drive later in Settings.
- Prefer your **college Google** if that is where class calendars and Drive live.
- **Settings → Google Calendar and Drive**: Connect, or Switch if you need a different Google account. If Calendar already works but Drive folders are missing, Connect again and allow Drive.
- If Google says the app isn’t verified, that’s normal: choose Continue.

---

## Pages (left sidebar)

- **Home**: year/term course grid, **Add course**, urgent 48 hours, major assessments in 2 weeks, work-by-week.
- **Unified calendar**: month grid + upcoming list for all courses.
- **${ASSISTANT_NAME}**: this chat, plus New chat for other threads.
- **Quick Notes**: a scratch pad and checklist, not tied to one course.
- **Settings**: Gemini key, theme, email briefs, and Google.
- **Admin**: only buddy.askuala@gmail.com: user list, disable, delete.
- **Academics**: each course by year and term.

Light / dark / system theme is in Settings and in the sidebar.

---

## Home

- **Add course** opens the same form as a course page: code, name, term, year, instructor, meeting pattern, location, office hours, and optional syllabus **file or paste**.
- **Urgent · next 48 hours**: dated work and events starting soon (not a dump of every lecture).
- **Major assessments · next 2 weeks**: exams, papers, projects, presentations. Not office hours, not campus noise.
- **All courses · work by week**: readings, papers, drafts, problem sets, homework, quizzes, and other assignments from this week forward. Writing courses show that week’s readings and papers even when there are no weekly psets.
- **While you were away**: Home shows when you left and that the calendar is up to date.

---

## Courses

Open a course from Home or the sidebar.

**Buttons**

- **Edit course**: change code, name, instructor, meeting times, location, office hours, color, extra notes, policies.
- **Update from file/text**: upload or paste a syllabus / Canvas page again. ${APP_NAME} extracts lectures, office hours, and **all dated work**: problem sets, homework, papers, drafts, quizzes, projects, presentations, and **class-session readings**. Weekly psets appear only if the syllabus actually puts psets/homework on a cadence. Policies become short bullets, not the raw Canvas dump.
- **Drop / Restore**: mark the course dropped this term (calendar stays, it is flagged). Restore undoes that. This is **not** Yale’s add/drop.
- **Remove**: delete the course **in ${APP_NAME}** with its events and notes here. Confirm first.

**Tabs**

- **Overview**: that course’s urgent 48h, majors in 2 weeks, work-by-week, and key policies.
- **Calendar**: that course only, same month grid + upcoming list.
- **Notes**: notes, reminders, questions, office-hour notes, resources; attachments; voice recording + transcript; study summary; print / Word / share.

Four-year / degree **names** (future courses with no syllabus) belong on Home as course cards. They should not invent fake weekly psets.

---

## Calendar

- Month grid keeps **past** dates (faded). The **Upcoming** list starts from **now**.
- Titles include the **course code** (\`MATH 1150 · Problem Set 2\`). “Office hours” in a title is typed as office hours.
- Lenses on the unified calendar: **Unified**, **Majors**, **Office hours**, **Problem sets**, **Course work**, **Other**.
- **Add event**: pick course, title, type, start/end, location, optional Google/phone reminders.
- Event types: exam, quiz, assignment, project, lab, pset, reading, office_hour, lecture, other.
- Click an event to edit or cancel it. Per-event reminders: how long before, Calendar/phone vs email. Lectures, office hours, readings, and psets stay quiet on your phone until you opt in on that event.
- Recurring **lectures and office hours** stay as a series (one row), not hundreds of copies. Numbered problem sets, exams, papers, and homework are **one due date**, never a weekly repeat of “Problem Set 1.”
- Two problem sets cannot occupy the **same course, same due slot**. Sync merges those and numbers dated “Problem Set N” items in order.

---

## Google Calendar

- **Sync Google Calendar** after Canvas/Blackboard is on Google. If college email blocks this app, put Canvas on college Google Calendar, subscribe that calendar on a personal Gmail, then Connect with the personal account.

When connected:

- ${APP_NAME} **reads** your calendars from now forward and **writes** course calendars named like \`Askuala · CODE name\`.
- Edits here can update Google; Google events can appear here.
- Recurring office hours from an imported school calendar stay **one weekly series per person/slot**. Monday and Saturday for the same tutor are two series on purpose.
- You can still keep everything only inside ${APP_NAME} if you never connect Google.
- Drive (same Google account): after you **save or rebuild a study guide**, **My Drive → Askuala** appears (not before). Inside: **year → term → course → Files** (the print-style PDF, 12 hours after the last rebuild) plus **Voice recordings**. Uploads stay in Askuala, not Drive, so they do not use your Drive quota. Spring 2027 and new courses get new folders.

---

## Notes (course → Notes)

Kinds: **note**, **reminder**, **question**, **office hours**, **resource**.

On a note you can:

- Set a **title**, **catalog date**, and body.
- Attach files (PDFs, images, docs). Open them later from the note.
- For kind **note**: **Record + transcribe** (live transcript, up to about 2 hours). Transcript autosaves in this browser until you **Save**. Saving writes the audio + transcript on the server and generates a **study guide** (you can edit it). Guides should be lecture-length, with drawn graphs (supply/demand and other plots) when the session used them. Print, download as Word, or share.
- For kind **reminder**: a remind-at time plus email/popup lead times.
- Sort saved notes by date or kind. Open one to reread, regenerate the summary, or delete it.

Uploaded lecture files stay on this ${APP_NAME} account (not copied to Drive). When Drive is allowed, the print-style study-guide PDF goes to **Askuala → year → term → course → Files** (12 hours after the last rebuild), and recordings go to **Voice recordings** in that course. The same recording is not copied twice. One Askuala folder for everyone.

---

## Quick Notes

A pad of free text plus checkboxes. It autosaves in the browser and to your account. It is not a course and does not go on the class calendar unless you ask ${ASSISTANT_NAME} to add a real event.

---

## Mail and reminders (Settings)

Askuala sends **at most**:

- **One daily email** listing **tomorrow’s** items together (time is New York). If the computer was off, a catch-up can list what’s left **today**.
- **One Sunday 11:00 AM** (New York) **week-ahead** email.

Rules that are already in the product:

- Empty windows are skipped (no blank mail).
- **Office hours are omitted** from those digest emails.
- Not one email per event.

You still choose: send email on/off, daily time, Sunday on/off, extra browser popups when this tab is open. Briefs go to the address you logged in with.

---

## Phone, tablet, and computer

Open the same Askuala site on any device and sign in there.

---

## ${ASSISTANT_NAME}: how to use this chat

Open **${ASSISTANT_NAME}** in the sidebar, or the chat popup. **New chat** starts a blank thread. This How-to-use thread stays at the top.

- Type a question and press Enter (Shift+Enter for a new line) or the send button. The first time, add your Gemini key in Settings.
- **Paperclip** attaches a syllabus or other files so Buddy can update your planner.
- Threads stay until you delete them: except this one.
- If Gemini is busy or not set up, Buddy says that: it will not leave you with a blank reply.

### What it can **read** (ask in plain language)

- Every course: code, name, term, year, instructor, meeting pattern, location, dropped or not, policies, extra notes, office-hours text.
- The **calendar**: lectures, office hours, psets, homework, readings, papers, drafts, quizzes, exams, projects, labs: including weekly repeats expanded across the term.
- **What’s due soon**, this week, by course, or “what’s on Thursday.”
- **Notes**: titles, bodies, transcripts, study summaries, catalog dates, attachments’ names.
- Quick Notes pad, chats, and **on-screen labels** (sidebar and headings).
- Settings in summary form (Google connected or not, digest on/off): not a place to dump secrets.

Examples: “What’s due in the next 48 hours?” · “List MATH 1150 psets in order.” · “When is ECON 1115 office hours with O’Dea?” · “Summarize ENGL 1014 policies.” · “What did I record in yesterday’s note?”

### What it can **change** when you ask

Say the course and the change. It will confirm what it did.

- **Courses:** add a course (**names, term, and year only**: for a four-year plan, no fake lectures or psets); rename or retitle; set instructor; **set meeting pattern**; **set office hours** (including location in that text); **drop** this term; **restore**; **delete** the course from ${APP_NAME} forever (and its events/notes here).
- **Events:** add / update / delete (cancel) an exam, quiz, pset, homework, paper, draft, reading, lecture, office hour, project, lab, or other event; change title, date/time, location, details; stop a mistaken weekly repeat on numbered work.
- **Notes:** add, update body/title/summary, or delete a course note.
- **Labels:** rename what you see on screen (sidebar, Home headings, calendar lenses, buttons) via \`set_ui\`: e.g. “call Urgent ‘Due soon’.”

Examples you can send:

- “Add MATH 2250 Linear Algebra, Fall 2027, year 2.”
- “Set ECON 1115 office hours to Monday 2:45 to 4:15pm, 87 Trumbull.”
- “Move MATH 1150 Problem Set 4 to Thursday 11:59pm.”
- “Delete the duplicate Brianna office hours.”
- “Drop SCIE 0020.”
- “Remove the four-year roadmap course FREE 1.”
- “Add a note on ENGL 1014: office hours question about the research paper.”
- “Rename the sidebar Assistant label to Buddy.”
- “Update from this syllabus” (attach the file).

### Upload / paste through chat

Attach or paste a syllabus or Canvas page and say **update the course** / **apply this**. Dated work and office hours should land on the calendar the same way as **Update from file/text** on the course page.

### How to get a good edit

- Name the **course code**.
- Give a **date or weekday** for events.
- For deletes, say **which** event (title + day), not “clean everything” with no target.
- **Drop** = still in the planner, marked dropped. **Delete/remove course** = gone from ${APP_NAME}.

---

## What this pinned thread is

Keep this chat for the manual. Use **New chat** for homework help, planning, or one-off edits so this list stays easy to scroll. If the product changes, this first message is refreshed the next time you load ${APP_NAME}.
`;
}

export function ensureGuideChat(state: AppState) {
  if (!state.chats) state.chats = [];
  const existing = state.chats.find((c) => c.id === GUIDE_CHAT_ID);
  const createdAt = existing?.createdAt || nowIso();
  const guideMsg: ChatMessage = {
    id: GUIDE_MESSAGE_ID,
    role: "assistant",
    content: guideManualBody(),
    attachments: [],
    createdAt: existing?.messages.find((m) => m.id === GUIDE_MESSAGE_ID)?.createdAt || createdAt,
  };
  const extras = (existing?.messages || []).filter((m) => m.id !== GUIDE_MESSAGE_ID);
  const chat: ChatThread = {
    id: GUIDE_CHAT_ID,
    title: GUIDE_CHAT_TITLE,
    pinned: true,
    createdAt,
    updatedAt: existing?.updatedAt || createdAt,
    messages: [guideMsg, ...extras],
  };
  state.chats = [chat, ...state.chats.filter((c) => c.id !== GUIDE_CHAT_ID)];
  if (!state.activeChatId || !state.chats.some((c) => c.id === state.activeChatId)) {
    state.activeChatId = GUIDE_CHAT_ID;
  }
}
