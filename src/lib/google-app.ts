import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "google-app.json");

type AppGoogle = { clientId: string; clientSecret: string };

let cache: AppGoogle | null = null;

function empty(): AppGoogle {
  return { clientId: "", clientSecret: "" };
}

export function readGoogleApp(): AppGoogle {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as AppGoogle;
    cache = { clientId: parsed.clientId || "", clientSecret: parsed.clientSecret || "" };
    return cache;
  } catch {
    if (cache?.clientId && cache.clientSecret) return cache;
    cache = empty();
    return cache;
  }
}

export function writeGoogleApp(clientId: string, clientSecret: string) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  cache = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

export function envGoogleCreds(): AppGoogle {
  const fromEnv = {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  };
  if (fromEnv.clientId && fromEnv.clientSecret) return fromEnv;
  const file = readGoogleApp();
  return {
    clientId: fromEnv.clientId || file.clientId,
    clientSecret: fromEnv.clientSecret || file.clientSecret,
  };
}

export function googleAppReady() {
  const c = envGoogleCreds();
  return Boolean(c.clientId && c.clientSecret);
}
