"use client";

import { useEffect, useRef, useState } from "react";
import { useBuddy } from "@/components/BuddyProvider";
import { nanoid } from "nanoid";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignInGoogle } from "@/components/SignInGoogle";
import { GeminiSetup } from "@/components/GeminiSetup";
import { PhoneAccess } from "@/components/PhoneAccess";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { AlertRule } from "@/lib/types";

export default function SettingsPage() {
  const { data, postJson, refresh } = useBuddy();
  const n = data?.settings.notification;
  const [emailEnabled, setEmailEnabled] = useState(n?.emailEnabled ?? true);
  const [popupEnabled, setPopupEnabled] = useState(n?.popupEnabled ?? false);
  const [digestDaily, setDigestDaily] = useState(n?.digestDaily ?? true);
  const [digestWeekly, setDigestWeekly] = useState(n?.digestWeekly ?? true);
  const [digestDailyHour, setDigestDailyHour] = useState(n?.digestDailyHour ?? 22);
  const [digestDailyMinute, setDigestDailyMinute] = useState(n?.digestDailyMinute ?? 0);
  const [alerts, setAlerts] = useState<AlertRule[]>(n?.defaultAlerts || []);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [msg, setMsg] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    const nn = data.settings.notification;
    setEmailEnabled(nn.emailEnabled);
    setPopupEnabled(nn.popupEnabled);
    setDigestDaily(nn.digestDaily ?? true);
    setDigestWeekly(nn.digestWeekly ?? true);
    setDigestDailyHour(nn.digestDailyHour ?? 22);
    setDigestDailyMinute(nn.digestDailyMinute ?? 0);
    if (nn.defaultAlerts?.length) setAlerts(nn.defaultAlerts);
    setSmtpHost(data.settings.smtpHost || "smtp.gmail.com");
    setSmtpPort(String(data.settings.smtpPort || 587));
    setSmtpUser(data.settings.smtpUser || ADMIN_EMAIL);
  }, [data]);

  const admin = Boolean(data?.settings.isAdmin);

  async function save() {
    await postJson(
      "/api/settings",
      {
        notification: {
          emailEnabled,
          popupEnabled,
          digest: "daily",
          digestDaily,
          digestWeekly,
          digestDailyHour,
          digestDailyMinute,
          defaultAlerts: alerts,
        },
        ...(admin ? { smtp: { host: smtpHost, port: Number(smtpPort), user: smtpUser, pass: smtpPass } } : {}),
      },
      "PATCH",
    );
    setMsg("Saved.");
    await refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">
          Briefs go to the email you logged in with. Connect Google on this device so Calendar and Drive stay on your account.
        </p>
        {admin && (
          <p className="mt-2 text-sm text-muted">
            This is the site admin login ({ADMIN_EMAIL}). SMTP below is site-wide.{" "}
            <a href="/admin" className="text-gold-2 underline">
              Manage users
            </a>
          </p>
        )}
      </div>

      <PhoneAccess />

      <GeminiSetup force />

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="font-medium">Appearance</h2>
        <p className="text-sm text-muted">Light, dark, or match your device. Saved on this browser.</p>
        <ThemeToggle />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="font-medium">Notifications</h2>
        <p className="text-sm text-muted">
          Askuala sends <strong>one</strong> daily email (everything tomorrow, listed together) and one Sunday week-ahead email — never a separate mail per event. Mail goes to <strong>{data?.me?.email || "the address you logged in with"}</strong>. Calendar pings are set on each event.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} /> Send email
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input type="checkbox" checked={digestDaily} onChange={(e) => setDigestDaily(e.target.checked)} /> Daily snapshot of tomorrow at
          <input
            type="time"
            className="bg-input p-1"
            value={`${String(digestDailyHour).padStart(2, "0")}:${String(digestDailyMinute).padStart(2, "0")}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              if (Number.isFinite(h)) setDigestDailyHour(h);
              if (Number.isFinite(m)) setDigestDailyMinute(m);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={digestWeekly} onChange={(e) => setDigestWeekly(e.target.checked)} /> Sunday 11:00 AM — the week ahead
        </label>
        <p className="text-sm">Google “Remind me” lead times (email/popup on the event in Google Calendar). These do not send extra Askuala emails.</p>
        {alerts.map((a, i) => (
          <div key={a.id} className="flex flex-wrap gap-2 text-sm">
            <input type="number" className="w-16 bg-input p-1" value={a.amount} onChange={(e) => setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, amount: Number(e.target.value) } : x)))} />
            <select className="bg-input p-1" value={a.unit} onChange={(e) => setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, unit: e.target.value as AlertRule["unit"] } : x)))}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
            <select className="bg-input p-1" value={a.channel} onChange={(e) => setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, channel: e.target.value as AlertRule["channel"] } : x)))}>
              <option value="email">email</option>
              <option value="popup">popup</option>
            </select>
            <span>before</span>
            <button type="button" className="text-red-400" onClick={() => setAlerts((list) => list.filter((_, idx) => idx !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button className="text-sm text-gold-2" type="button" onClick={() => setAlerts((a) => [...a, { id: nanoid(), amount: 1, unit: "days", channel: "email" }])}>
          + reminder
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} /> Also try browser popups when this tab is open
        </label>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="font-medium">Google Calendar and Drive</h2>
        <p className="text-sm text-muted">
          {data?.settings.googleConnected
            ? `Google account: ${data.settings.googleEmail}. Calendar syncs here. Notes copy into Drive as Askuala → Files → uploads; study-guide PDFs into Files → outputs; recordings into Voice recordings; then year / term / course.`
            : data?.settings.appGoogleReady
              ? "Connect the Google account that owns your calendars and Drive (your college or personal Gmail). Do not sign in with a dedicated app mailbox."
              : "Google sign-in isn’t available right now. You can still use the calendar in this app."}
        </p>
        {data?.settings.googleConnected && !data.settings.driveReady && (
          <p className="text-sm text-gold-2">
            Calendar is connected, but Drive is not allowed yet. Click Connect Google again and accept Drive (and Calendar) so Askuala can create those folders. Enable the Google Drive API on /setup if the host has not.
          </p>
        )}
        {data?.settings.driveReady && <p className="text-sm text-gold-2">Drive folders are ready. New uploads go there automatically. Voice files are named like 2026-09-23 · note title.</p>}
        <p className="text-sm text-muted">
          On Unified calendar, use <strong>Connect / Sync Google</strong> (top right). That is the same action as Connect here. After Google allows Calendar, that button says Sync — pull latest from Google. Your Askuala events stay even if you have not synced yet.
        </p>
        {data?.settings.appGoogleReady && (
          <div className="flex flex-wrap gap-3">
            <SignInGoogle intent="connect" className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-on-gold" />
            <SignInGoogle intent="switch" className="flex items-center gap-2 rounded-lg border border-gold/40 px-3 py-2 text-gold-2" />
            {data.settings.googleConnected && (
              <button
                type="button"
                disabled={driveBusy}
                className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-50"
                onClick={async () => {
                  setDriveBusy(true);
                  setMsg("");
                  try {
                    const json = await postJson("/api/google/drive", {});
                    const extra = json.extra as { message?: string } | undefined;
                    setMsg(extra?.message || json.error || "Drive update finished.");
                    await refresh();
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Drive copy failed");
                  } finally {
                    setDriveBusy(false);
                  }
                }}
              >
                {driveBusy ? "Copying to Drive…" : "Copy existing notes to Drive"}
              </button>
            )}
          </div>
        )}
      </section>

      {admin && (
      <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <h2 className="font-medium">Sending account (SMTP)</h2>
        <p className="text-sm text-muted">
          This mailbox <strong>sends</strong> as buddy.askuala@gmail.com (or the SMTP user below). Students never see this. Their login email is always the To address.
        </p>
        <p className="rounded-lg bg-input p-2 text-sm">
          From {smtpUser || ADMIN_EMAIL} → To each student’s login email
        </p>
        <p className="text-sm text-muted">
          Use a Gmail App Password (16 letters) for buddy.askuala@gmail.com. Everyday Gmail password fails with 535. Save SMTP here or as SMTP_* env on Vercel.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Sender login = buddy.askuala@gmail.com</li>
          <li>Password = Google App Password only</li>
          <li>Save and send test email to your admin login</li>
        </ol>
        {data?.settings.smtpConfigured && <p className="text-sm text-gold-2">Sending account is saved. Leave the password blank to keep the current one.</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-1 text-sm"
            onClick={() => {
              setSmtpHost("smtp.gmail.com");
              setSmtpPort("587");
              setSmtpUser(ADMIN_EMAIL);
            }}
          >
            Gmail sender (recommended)
          </button>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-1 text-sm"
            onClick={() => {
              setSmtpHost("smtp.office365.com");
              setSmtpPort("587");
            }}
          >
            Microsoft sender
          </button>
        </div>
        <label className="block text-sm">
          SMTP host
          <input className="mt-1 w-full bg-input p-2 text-sm" placeholder="smtp.gmail.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
        </label>
        <label className="block text-sm">
          Port
          <input className="mt-1 w-full bg-input p-2 text-sm" placeholder="587" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
        </label>
        <label className="block text-sm">
          Sender email (login)
          <input className="mt-1 w-full bg-input p-2 text-sm" placeholder={ADMIN_EMAIL} value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
        </label>
        <label className="block text-sm">
          Sender password
          <input className="mt-1 w-full bg-input p-2 text-sm" type="password" placeholder="App password for that sender" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={mailBusy}
          className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2 disabled:opacity-50"
          onClick={async () => {
            setMailBusy(true);
            setMsg("");
            try {
              await save();
              const res = await fetch("/api/notifications/test", { method: "POST" });
              const json = await res.json();
              setMsg(json.message || json.error || (res.ok ? "Test sent." : "Test failed"));
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Test failed");
            } finally {
              setMailBusy(false);
            }
          }}
        >
          {mailBusy ? "Sending…" : "Save and send test email"}
        </button>
      </section>
      )}

      <button onClick={save} className="rounded-lg bg-gold px-4 py-2 text-on-gold">
        Save settings
      </button>
      {msg && <p className="text-sm text-gold-2">{msg}</p>}
    </div>
  );
}
