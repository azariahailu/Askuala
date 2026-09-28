import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Tunnel, install, use } from "cloudflared";

let current: { url: string; stop: () => void } | null = null;
let starting: Promise<string> | null = null;
let pass: { token: string; userId: string; exp: number } | null = null;

function binaryPath() {
  const name = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return path.join(process.cwd(), "data", "bin", name);
}

function localPort(req?: Request) {
  if (req) {
    const p = Number(new URL(req.url).port);
    if (p) return p;
  }
  return Number(process.env.PORT || process.env.ASKUALA_PORT || 3000);
}

async function ensureBinary() {
  const dest = binaryPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) {
    await install(dest);
    if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
  }
  use(dest);
  return dest;
}

export function phoneLinkUrl() {
  if (!current?.url) return null;
  if (!pass || Date.now() > pass.exp) return current.url;
  return `${current.url.replace(/\/$/, "")}/api/auth/phone?t=${encodeURIComponent(pass.token)}`;
}

export function phoneLinkStatus() {
  return { url: phoneLinkUrl() };
}

export function issuePhonePass(userId: string) {
  pass = {
    token: randomBytes(24).toString("base64url"),
    userId,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  return phoneLinkUrl();
}

export function readPhonePass(token: string) {
  if (!pass || pass.token !== token || Date.now() > pass.exp) return null;
  const userId = pass.userId;
  pass = null;
  return userId;
}

export async function startPhoneLink(req?: Request) {
  if (current?.url) return current.url;
  if (starting) return starting;
  const port = localPort(req);
  starting = (async () => {
    await ensureBinary();
    const tunnel = Tunnel.quick(`http://127.0.0.1:${port}`);
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Could not create a phone link. Try again in a minute.")), 60_000);
      tunnel.once("url", (u) => {
        clearTimeout(timer);
        resolve(u);
      });
      tunnel.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      tunnel.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(code ? `Phone link stopped (${code}).` : "Phone link stopped."));
      });
    });
    if (/localhost|127\.0\.0\.1/i.test(url)) {
      tunnel.stop();
      throw new Error("Phone link pointed at this computer instead of the internet. Turn it off and create it again.");
    }
    current = {
      url,
      stop: () => {
        tunnel.stop();
        current = null;
        pass = null;
      },
    };
    tunnel.once("exit", () => {
      if (current?.url === url) {
        current = null;
        pass = null;
      }
    });
    return url;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export function stopPhoneLink() {
  current?.stop();
  current = null;
  pass = null;
}
