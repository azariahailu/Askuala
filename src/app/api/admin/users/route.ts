import { NextResponse } from "next/server";
import { deleteUserAccount, listPublicUsers, loadAdminUserDetail, requireAdmin, setUserDisabled } from "@/lib/auth";
import { googleAppPeek } from "@/lib/google-app";
import { smtpPeek } from "@/lib/mail-account";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (id) return NextResponse.json({ user: await loadAdminUserDetail(id) });
    const google = googleAppPeek();
    const smtp = smtpPeek();
    return NextResponse.json({
      users: await listPublicUsers(),
      site: {
        googleReady: google.ready,
        googleClientIdHint: google.clientIdHint,
        smtpConfigured: smtp.configured,
        smtpUser: smtp.user,
      },
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Admin only" }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as { id?: string; disabled?: boolean };
    if (!body.id || typeof body.disabled !== "boolean") {
      return NextResponse.json({ error: "id and disabled required" }, { status: 400 });
    }
    const user = await setUserDisabled(body.id, body.disabled);
    return NextResponse.json({ user });
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteUserAccount(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status });
  }
}
