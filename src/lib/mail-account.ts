import type { SmtpConfig } from "./types";
import { persistReadJson, persistWriteJson } from "./persist";

let peekCache: SmtpConfig | null = null;

export function envSmtp(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) return null;
  return { host, user, pass, port: Number.isFinite(port) ? port : 587 };
}

export function smtpPeek() {
  const env = envSmtp();
  const smtp = env || peekCache;
  if (smtp?.user && smtp.host) return { configured: true as const, user: smtp.user, host: smtp.host, port: smtp.port || 587 };
  return { configured: false as const, user: "", host: "", port: 587 };
}

export async function readGlobalSmtp(): Promise<SmtpConfig | null> {
  const env = envSmtp();
  if (env) {
    peekCache = env;
    return env;
  }
  if (peekCache?.host && peekCache.user && peekCache.pass) return peekCache;
  const stored = await persistReadJson<SmtpConfig>("smtp.json");
  if (stored?.user && stored.pass) peekCache = stored;
  return stored;
}

export async function writeGlobalSmtp(smtp: SmtpConfig) {
  if (!smtp.host || !smtp.user || !smtp.pass) return;
  peekCache = {
    host: smtp.host.trim(),
    port: smtp.port || 587,
    user: smtp.user.trim(),
    pass: smtp.pass.replace(/\s+/g, ""),
  };
  await persistWriteJson("smtp.json", peekCache);
}

export async function resolveSmtp(local?: SmtpConfig): Promise<SmtpConfig | null> {
  const env = envSmtp();
  if (env) return env;
  const stored = await readGlobalSmtp();
  if (stored?.host && stored.user && stored.pass) return stored;
  if (local?.host && local.user && local.pass) {
    return { host: local.host.trim(), user: local.user.trim(), pass: local.pass.replace(/\s+/g, ""), port: local.port || 587 };
  }
  return null;
}
