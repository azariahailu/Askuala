"use client";

import { useState } from "react";
import { TYPE_LABELS, type AlertRule, type CourseEvent, type EventType, type RecurFreq } from "@/lib/types";
import { shouldNotRecur } from "@/lib/calendar-utils";
import { useBuddy } from "./BuddyProvider";
import { nanoid } from "nanoid";

const FREQS: { id: "never" | RecurFreq | "custom"; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
  { id: "custom", label: "Custom" },
];

const DAY_OPTS = [
  ["SU", "Sun"],
  ["MO", "Mon"],
  ["TU", "Tue"],
  ["WE", "Wed"],
  ["TH", "Thu"],
  ["FR", "Fri"],
  ["SA", "Sat"],
] as const;

export function EventModal({
  event,
  courseId,
  onClose,
}: {
  event: CourseEvent | null;
  courseId: string | null;
  onClose: () => void;
}) {
  const { data, postJson } = useBuddy();
  const base = event
    ? event
    : {
        title: "",
        details: "",
        type: "assignment" as EventType,
        start: new Date().toISOString().slice(0, 16),
        end: "",
        allDay: false,
        location: "",
        weight: "",
        courseId,
        recurrence: null as CourseEvent["recurrence"],
        viewOnly: false,
      };
  const [title, setTitle] = useState(base.title);
  const [details, setDetails] = useState(base.details);
  const [type, setType] = useState<EventType>(base.type);
  const [start, setStart] = useState(toLocal(event?.start || new Date().toISOString()));
  const [end, setEnd] = useState(toLocal(event?.end || ""));
  const [allDay, setAllDay] = useState(base.allDay);
  const [location, setLocation] = useState(base.location);
  const [weight, setWeight] = useState(base.weight);
  const [cid, setCid] = useState<string>(event?.courseId || courseId || "");
  const rec = event?.recurrence;
  const [repeat, setRepeat] = useState<"never" | RecurFreq | "custom">(rec ? (rec.interval && rec.interval > 1 ? "custom" : rec.freq) : "never");
  const [customFreq, setCustomFreq] = useState<RecurFreq>(rec?.freq || "weekly");
  const [interval, setInterval] = useState(rec?.interval || 1);
  const [byDay, setByDay] = useState<string[]>(rec?.byDay?.length ? rec.byDay : [dow(toLocal(event?.start || new Date().toISOString()))]);
  const [until, setUntil] = useState(toLocal(rec?.until || "").slice(0, 16));
  const [releasedAt, setReleasedAt] = useState(toLocal(event?.releasedAt || ""));
  const [googleAlerts, setGoogleAlerts] = useState(event ? Boolean(event.googleAlerts || event.alerts?.length) : false);
  const [alerts, setAlerts] = useState<AlertRule[]>(
    event?.alerts?.length
      ? event.alerts
      : [{ id: nanoid(), amount: 10, unit: "minutes", channel: "popup" }],
  );
  const [err, setErr] = useState("");

  function recurrencePayload() {
    if (shouldNotRecur({ title, type })) return null;
    if (repeat === "never") return null;
    const freq = repeat === "custom" ? customFreq : repeat;
    return {
      freq,
      interval: repeat === "custom" ? Math.max(1, interval) : 1,
      byDay: freq === "weekly" ? byDay : undefined,
      until: until ? new Date(until).toISOString() : null,
    };
  }

  async function save() {
    try {
      const payload = {
        id: event?.id.split("::")[0],
        title,
        details,
        type,
        start: new Date(start).toISOString(),
        end: end ? new Date(end).toISOString() : null,
        allDay,
        location,
        weight,
        courseId: cid || null,
        recurrence: recurrencePayload(),
        releasedAt: releasedAt ? new Date(releasedAt).toISOString() : null,
        googleAlerts: googleAlerts && alerts.length > 0,
        alerts: googleAlerts ? alerts : [],
      };
      if (event) await postJson("/api/events", payload, "PATCH");
      else await postJson("/api/events", payload, "POST");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function remove() {
    if (!event) return;
    try {
      await postJson("/api/events", { id: event.id.split("::")[0] }, "DELETE");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const showDays = repeat === "weekly" || (repeat === "custom" && customFreq === "weekly");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-xl font-semibold">{event ? "Event details" : "New event"}</h2>
        <div className="grid gap-3 text-sm">
          <Field label="Title" value={title} onChange={setTitle} />
          <label className="grid gap-1">
            Full details
            <textarea className="min-h-32 rounded-lg bg-input p-2" value={details} onChange={(e) => setDetails(e.target.value)} />
          </label>
          <label>
            Activity type
            <select className="mt-1 w-full bg-input p-2" value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Course (optional)
            <select className="mt-1 w-full bg-input p-2" value={cid} onChange={(e) => setCid(e.target.value)}>
              <option value="">Non-course event</option>
              {data?.courses
                .filter((c) => !c.dropped)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
          </label>
          <label>
            Posted / available (optional)
            <input type="datetime-local" className="mt-1 w-full bg-input p-2" value={releasedAt} onChange={(e) => setReleasedAt(e.target.value)} />
          </label>
          <label>
            Due / starts
            <input type="datetime-local" className="mt-1 w-full bg-input p-2" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Ends
            <input type="datetime-local" className="mt-1 w-full bg-input p-2" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <Field label="Location" value={location} onChange={setLocation} />
          <Field label="Grade weight (optional)" value={weight} onChange={setWeight} />
          {!shouldNotRecur({ title, type }) && (
          <>
          <label>
            Repeat
            <select className="mt-1 w-full bg-input p-2" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
              {FREQS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {repeat === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                Every
                <input type="number" min={1} className="mt-1 w-full bg-input p-2" value={interval} onChange={(e) => setInterval(Number(e.target.value) || 1)} />
              </label>
              <label>
                Unit
                <select className="mt-1 w-full bg-input p-2" value={customFreq} onChange={(e) => setCustomFreq(e.target.value as RecurFreq)}>
                  {FREQS.filter((f) => f.id !== "never" && f.id !== "custom").map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {showDays && (
            <div className="flex flex-wrap gap-2">
              {DAY_OPTS.map(([id, label]) => (
                <label key={id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={byDay.includes(id)}
                    onChange={(e) => setByDay((d) => (e.target.checked ? [...d, id] : d.filter((x) => x !== id)))}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          {repeat !== "never" && (
            <label>
              Repeat until (optional)
              <input type="datetime-local" className="mt-1 w-full bg-input p-2" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
          </>
          )}
          <div className="rounded-lg border border-line p-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={googleAlerts}
                onChange={(e) => {
                  const on = e.target.checked;
                  setGoogleAlerts(on);
                  if (on && alerts.length === 0) {
                    setAlerts([{ id: nanoid(), amount: 0, unit: "minutes", channel: "popup" }]);
                  }
                }}
              />
              <span>
                Notify me on my phone via the Google Calendar app. This writes one popup reminder (default: 10 minutes before) on your primary calendar. Email reminders are separate and optional — they will not ping the phone. Use the Google Calendar app, not Apple Calendar.
              </span>
            </label>
            {googleAlerts && (
              <div className="mt-3 space-y-2">
                {alerts.map((a, i) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      className="bg-input p-1"
                      value={a.amount === 0 ? "at" : "before"}
                      onChange={(e) => {
                        const at = e.target.value === "at";
                        setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, amount: at ? 0 : x.amount || 30, unit: at ? "minutes" : x.unit } : x)));
                      }}
                    >
                      <option value="at">At event time</option>
                      <option value="before">Before</option>
                    </select>
                    {a.amount !== 0 && (
                      <>
                        <input
                          type="number"
                          min={1}
                          className="w-16 bg-input p-1"
                          value={a.amount}
                          onChange={(e) => setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, amount: Number(e.target.value) || 1 } : x)))}
                        />
                        <select
                          className="bg-input p-1"
                          value={a.unit}
                          onChange={(e) => setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, unit: e.target.value as AlertRule["unit"] } : x)))}
                        >
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                          <option value="weeks">weeks</option>
                        </select>
                      </>
                    )}
                    <select
                      className="bg-input p-1"
                      value={a.channel}
                      onChange={(e) => setAlerts((list) => list.map((x, idx) => (idx === i ? { ...x, channel: e.target.value as AlertRule["channel"] } : x)))}
                    >
                      <option value="popup">Calendar / phone</option>
                      <option value="email">email</option>
                    </select>
                    <button type="button" className="text-red-400" onClick={() => setAlerts((list) => list.filter((_, idx) => idx !== i))}>
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" className="text-gold-2" onClick={() => setAlerts((a) => [...a, { id: nanoid(), amount: 0, unit: "minutes", channel: "popup" }])}>
                    + at event time
                  </button>
                  <button type="button" className="text-gold-2" onClick={() => setAlerts((a) => [...a, { id: nanoid(), amount: 30, unit: "minutes", channel: "popup" }])}>
                    + 30 min before
                  </button>
                  <button type="button" className="text-gold-2" onClick={() => setAlerts((a) => [...a, { id: nanoid(), amount: 1, unit: "hours", channel: "popup" }])}>
                    + 1 hour before
                  </button>
                  <button type="button" className="text-gold-2" onClick={() => setAlerts((a) => [...a, { id: nanoid(), amount: 1, unit: "days", channel: "email" }])}>
                    + 1 day email
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 flex justify-between">
          {event ? (
            <button onClick={remove} className="text-red-400">
              Delete event
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2">
              Close
            </button>
            <button onClick={save} className="rounded-lg bg-gold px-3 py-2 text-on-gold">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {label}
      <input className="mt-1 w-full rounded-lg bg-input p-2" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function toLocal(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dow(local: string) {
  const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return map[new Date(local).getDay()] || "MO";
}
