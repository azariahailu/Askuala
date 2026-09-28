import { NextResponse } from "next/server";
import { googleAppReady, writeGoogleApp } from "@/lib/google-app";

export async function POST(req: Request) {
  try {
    // First run only. Once a client is saved, nobody can swap it over HTTP and capture everyone's OAuth codes.
    if (googleAppReady()) {
      return NextResponse.json(
        { error: "Google sign-in is already set up on this server. Edit data/google-app.json on the computer itself to change it." },
        { status: 403 },
      );
    }
    const body = (await req.json()) as { clientId?: string; clientSecret?: string };
    const clientId = (body.clientId || "").trim();
    const clientSecret = (body.clientSecret || "").trim();
    if (!clientId.endsWith(".apps.googleusercontent.com") || clientSecret.length < 8) {
      return NextResponse.json({ error: "That doesn’t look like a Google Web client ID and secret." }, { status: 400 });
    }
    writeGoogleApp(clientId, clientSecret);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save" }, { status: 400 });
  }
}
