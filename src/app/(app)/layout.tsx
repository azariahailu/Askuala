import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { startMailLoop } from "@/lib/mail-loop";
import { readGlobalSmtp } from "@/lib/mail-account";
import { readState, toClient } from "@/lib/store";
import { BuddyProvider } from "@/components/BuddyProvider";
import { GuardShell } from "@/components/AppShell";

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
    return (
      <BuddyProvider>
        <GuardShell>{children}</GuardShell>
      </BuddyProvider>
    );
  }
}
