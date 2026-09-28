import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { bindUserEmail, readUpload } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const user = await requireUser();
    bindUserEmail(user.id, user.email);
    const { name } = await ctx.params;
    const safe = path.basename(name);
    const buf = await readUpload(user.id, safe);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename="${safe}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
