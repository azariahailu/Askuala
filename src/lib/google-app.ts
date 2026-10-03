import fs from "node:fs";
import path from "node:path";
import { persistReadJson, persistWrite } from "./persist";

const FILE = path.join(process.cwd(), "data", "google-app.json");
const BLOB_KEY = "google-app.json";

type AppGoogle = { clientId: string; clientSecret: string };

let cache: AppGoogle | null = null;

function empty(): AppGoogle {
  return { clientId: "", clientSecret: "" };
}

function fromEnv(): AppGoogle {
  return {
    clientId: (process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  };
}

export function readGoogleApp(): AppGoogle {
  const env = fromEnv();
  if (env.clientId && env.clientSecret) {
    cache = env;
    return cache;
  }
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

export async function ensureGoogleAppLoaded() {
  const env = fromEnv();
  if (env.clientId && env.clientSecret) {
    cache = env;
    return cache;
  }
  if (cache?.clientId && cache.clientSecret) return cache;
  const stored = await persistReadJson<AppGoogle>(BLOB_KEY);
  if (stored?.clientId && stored.clientSecret) {
    cache = { clientId: stored.clientId.trim(), clientSecret: stored.clientSecret.trim() };
    return cache;
  }
  return readGoogleApp();
}

export async function writeGoogleApp(clientId: string, clientSecret: string) {
  cache = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  await persistWrite(BLOB_KEY, JSON.stringify(cache, null, 2));
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch {
    /* Vercel has no durable disk; Blob is enough. */
  }
}

export function envGoogleCreds(): AppGoogle {
  const env = fromEnv();
  if (env.clientId && env.clientSecret) return env;
  const file = readGoogleApp();
  return {
    clientId: env.clientId || file.clientId,
    clientSecret: env.clientSecret || file.clientSecret,
  };
}

export function googleAppReady() {
  const c = envGoogleCreds();
  return Boolean(c.clientId && c.clientSecret);
}

export function googleAppPeek() {
  const c = envGoogleCreds();
  const id = c.clientId;
  return {
    ready: Boolean(id && c.clientSecret),
    clientIdHint: id ? `${id.slice(0, 20)}…` : "",
  };
}
