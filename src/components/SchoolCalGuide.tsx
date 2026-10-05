export function SchoolCalGuide({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        Put your class calendar on Askuala with a link. You do not need Google. Schools on Outlook only (Montgomery College and others) use this.
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
        <li>
          <strong>Canvas:</strong> open Calendar → calendar settings → iCal or Calendar feed → copy the URL.
        </li>
        <li>
          <strong>Blackboard:</strong> open Calendar → export or calendar feed, if your campus has one → copy the URL.
        </li>
        <li>
          <strong>Outlook:</strong> open the class calendar → Share or Publish → copy the ICS link.
        </li>
        <li>
          Paste that link in <strong>Add a class calendar link</strong> on this page, then Add to Askuala.
        </li>
      </ol>
      <p className="mt-2">
        Google is optional. Use Connect Google only if your college calendar already lives in Google and sign in works.
      </p>
    </div>
  );
}
