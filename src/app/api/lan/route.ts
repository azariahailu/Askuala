import { NextResponse } from "next/server";
import { lanUrls } from "@/lib/lan";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ urls: [] });
  const port = Number(new URL(req.url).port || process.env.PORT || process.env.ASKUALA_PORT || 3000);
  return NextResponse.json({ urls: lanUrls(port) });
}
