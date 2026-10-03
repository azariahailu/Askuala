import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { startMailLoop } from "@/lib/mail-loop";
import { readGlobalSmtp } from "@/lib/mail-account";
import { readState, toClient } from "@/lib/store";
import { BuddyProvider } from "@/components/BuddyProvider";
import { GuardShell } from "@/components/AppShell";
import { blobSuspendedMessage, isBlobSuspended } from "@/lib/blob-status";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    void readGlobalSmtp();
    if (process.env.VERCEL !== "1") startMailLoop();
    const initial = toClient(user, await readState(user.id));
    return (
      <BuddyProvider initial={initial}>
        <GuardShell>{children}</GuardShell>
      </BuddyProvider>
    );
  } catch (e) {
    console.error("AppLayout", e);
    const blob = isBlobSuspended(e) || /file store \(Vercel Blob\) is paused/i.test(e instanceof Error ? e.message : "");
    const message = blob ? blobSuspendedMessage() : e instanceof Error ? e.message : "Could not load your workspace.";
    return (
      <div className="mx-auto max-w-lg space-y-3 p-10 text-sm">
        <p className="font-medium">Askuala cannot load your planner right now.</p>
        <p className="text-muted">{message}</p>
      </div>
    );
  }
}
