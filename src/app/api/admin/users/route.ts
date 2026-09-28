import { NextResponse } from "next/server";
import { deleteUserAccount, listPublicUsers, requireAdmin, setUserDisabled } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await listPublicUsers() });
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
