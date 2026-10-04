export function SchoolCalGuide({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        Askuala reads <strong>Google Calendar</strong>, not Canvas or Blackboard. If your <strong>college email blocks</strong> this app, sign in with a personal Gmail (or email + password), then get class events onto that Google:
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
        <li>
          <strong>Canvas → college Google Calendar.</strong> In Canvas: Calendar → calendar settings / iCal feed → copy the URL. In Google Calendar on the web (college account): Other calendars → + → From URL → paste. Wait until class events appear.
        </li>
        <li>
          <strong>Blackboard:</strong> Calendar → export or feed URL if your campus has one → same “From URL” step on college Google Calendar.
        </li>
        <li>
          <strong>College calendar → personal Google</strong> (or the other way). On the college Google Calendar: Settings for that calendar → <strong>Share with specific people</strong> (your personal Gmail, “See all event details”) <em>or</em> Secret address in iCal → on personal Google: Other calendars → + → Subscribe to calendar / From URL.
        </li>
        <li>
          Open the personal Google Calendar and confirm the college events show. Then in Askuala click <strong>Connect Google</strong> / <strong>Sync</strong> with that same personal account.
        </li>
      </ol>
      <p className="mt-2">
        If college Google <em>can</em> sign in here, skip the personal hop: put Canvas on college Google and connect that account.
      </p>
    </div>
  );
}
