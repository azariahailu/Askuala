# Askuala

Free college planner for you and anyone you share the app with. Upload a syllabus, get a course calendar, notes, reminders, and **Askuala Buddy**, the assistant that actually knows your classes.

Free college planner for you and anyone you share the app with. Upload a syllabus, get a course calendar, notes, reminders, and an assistant that actually knows your classes.

This is a **new** project (not an existing GitHub app). There is **no credit meter**, **no paid AI requirement**, and **no upload quota**. Parsing and chat run on the server for free. Optional OpenAI / Google keys only add extra power.

## Each person gets their own space

Friends sign up on the same deployment. Accounts are isolated: courses, files, notes, and Google tokens are per user.

## Run it (no Cursor, no paid domain)

This is an app that lives on each person’s computer. Zip the folder and send it, or share the git repo. Everyone double-clicks and uses their own account and calendar. Nothing is billed.

**Mac:** double-click `Askuala Buddy.command` (or `Askuala Buddy.app`). Keep the window open; close it to quit. First launch installs and builds once.

**Windows:** double-click `Askuala Buddy.bat`.

You need [Node.js LTS](https://nodejs.org) installed once. You do not need Cursor after that.

**Phone:** keep the app running on your laptop, same Wi‑Fi, open the address shown in Settings → Use on your phone (also printed in the launch window). Not a separate App Store install.

Google sign-in: the first person who sets the app up visits `/setup` once (localhost redirect URIs only). Copy that same project folder to friends, or copy `data/google-app.json` into theirs, so they only click Sign in with Google.

## Optional: run from a terminal

```bash
cd askuala-buddy
npm install
npm run app
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes if you expose it on a network | Signs login cookies |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Google login | One Web client for the whole app (or `/setup`). Redirect `http://127.0.0.1:3000/api/google/callback` and `http://localhost:3000/api/google/callback` |

## What it does

- Four academic years starting Fall 2026
- Syllabus + extra text → course name, policies, dated work, weekly items
- Unified calendar (month grid + list) and per-course calendars
- Event details, edit/delete, Google sync (course colors; other Google events view-only)
- Assistant with file attachments
- Notes, reminders with multiple alerts, live voice transcription
- Collapsible sidebar, notification preferences

License: use it freely for school.
