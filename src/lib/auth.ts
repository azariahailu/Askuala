import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { isAdminEmail } from "./admin";
import { nid, nowIso } from "./ids";
import { persistDelete, persistReadJson, persistWriteJson, usesBlob, onVercel } from "./persist";
import type { AppUser } from "./types";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const COOKIE = "askuala_session";
const ACCOUNTS_KEY = "users.json";
/** Chrome (and others) cap cookie lifetime at ~400 days. That is as close to “stay signed in forever” as a browser cookie can be. */
const SESSION_DAYS = 400;

export type StoredUser = AppUser & { passwordHash: string; googleId?: string; disabled?: boolean };

async function machineSecret() {
  if (onVercel() || process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (32+ characters) in production. Without it, every deploy logs everyone out.");
  }
  const SECRET_PATH = path.join(DATA_DIR, "session-secret");
  try {
    const saved = (await fs.readFile(SECRET_PATH, "utf8")).trim();
    if (saved.length >= 32) return saved;
  } catch {
    /* first local run */
  }
  const fresh = randomBytes(48).toString("base64url");
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SECRET_PATH, fresh, { mode: 0o600 });
  return fresh;
}

async function secretKey() {
  const fromEnv = (process.env.SESSION_SECRET || "").trim();
  if (fromEnv.length < 32) {
    if (onVercel() || process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a long random string (32+ characters).");
    }
  }
  const raw = fromEnv.length >= 32 ? fromEnv : await machineSecret();
  return new TextEncoder().encode(raw.padEnd(32, "0").slice(0, 64));
}

export async function loadUsers(): Promise<StoredUser[]> {
  const fromCloud = await persistReadJson<StoredUser[]>(ACCOUNTS_KEY);
  if (fromCloud) return fromCloud;
  if (!usesBlob()) {
    try {
      return JSON.parse(await fs.readFile(path.join(DATA_DIR, ACCOUNTS_KEY), "utf8")) as StoredUser[];
    } catch {
      return [];
    }
  }
  return [];
}

async function saveUsers(users: StoredUser[]) {
  await persistWriteJson(ACCOUNTS_KEY, users);
}

function hashPassword(password: string, salt?: string) {
  const s = salt || randomBytes(16).toString("hex");
  return new Promise<string>((resolve, reject) => {
    scrypt(password, s, 64, (err, buf) => {
      if (err) reject(err);
      else resolve(`${s}:${buf.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const check = await hashPassword(password, salt);
  const a = Buffer.from(check);
  const b = Buffer.from(`${salt}:${hex}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function publicUser(u: StoredUser): AppUser {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

export async function registerUser(name: string, email: string, password: string) {
  const users = await loadUsers();
  const norm = email.trim().toLowerCase();
  if (users.some((u) => u.email === norm)) throw new Error("An account with that email already exists.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const user: StoredUser = {
    id: nid(),
    email: norm,
    name: name.trim() || norm.split("@")[0],
    passwordHash: await hashPassword(password),
    createdAt: nowIso(),
  };
  users.push(user);
  await saveUsers(users);
  return publicUser(user);
}

export async function loginUser(email: string, password: string) {
  const users = await loadUsers();
  const user = users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) throw new Error("Email or password is incorrect.");
  if (user.disabled) throw new Error("This account is disabled.");
  if (!user.passwordHash) throw new Error("This account uses Google. Click “Sign in with Google”.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Email or password is incorrect.");
  }
  return publicUser(user);
}

export async function loginOrLinkGoogle(profile: { email: string; name: string; googleId: string }) {
  const users = await loadUsers();
  const email = profile.email.trim().toLowerCase();
  const byGoogle = users.find((u) => profile.googleId && u.googleId === profile.googleId);
  if (byGoogle) {
    if (byGoogle.disabled) throw new Error("This account is disabled.");
    return publicUser(byGoogle);
  }
  const byEmail = users.find((u) => u.email === email);
  if (byEmail?.disabled) throw new Error("This account is disabled.");
  if (!byEmail) {
    const user: StoredUser = {
      id: nid(),
      email,
      name: profile.name || email.split("@")[0],
      passwordHash: "",
      googleId: profile.googleId,
      createdAt: nowIso(),
    };
    users.push(user);
    await saveUsers(users);
    return publicUser(user);
  }
  // A password account with this email is not auto-claimed: that would let someone
  // pre-register a victim's school address and inherit their calendar after they sign in with Google.
  if (byEmail.passwordHash && byEmail.googleId && byEmail.googleId !== profile.googleId) {
    throw new Error("That email already has an Askuala password. Log in with email, then connect Google from Settings.");
  }
  if (byEmail.passwordHash && !byEmail.googleId) {
    throw new Error("That email already has an Askuala password. Log in with email, then connect Google from Settings.");
  }
  if (profile.googleId && byEmail.googleId !== profile.googleId) {
    byEmail.googleId = profile.googleId;
    if (!byEmail.name) byEmail.name = profile.name;
    await saveUsers(users);
  }
  return publicUser(byEmail);
}

export async function setSession(user: AppUser, opts?: { secure?: boolean }) {
  const token = await new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(await secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(opts?.secure),
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export function cookieSecureFromRequest(req: Request) {
  const xf = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (xf) return xf === "https";
  return new URL(req.url).protocol === "https:";
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const users = await loadUsers();
  const user = users.find((u) => u.id === id);
  return user ? publicUser(user) : null;
}

export async function getSessionUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secretKey());
    const users = await loadUsers();
    const user = users.find((u) => u.id === payload.sub);
    if (!user || user.disabled) return null;
    return publicUser(user);
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    const err = new Error("Admin only");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

export async function listPublicUsers() {
  const users = await loadUsers();
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    google: Boolean(u.googleId),
    admin: isAdminEmail(u.email),
    disabled: Boolean(u.disabled),
  }));
}

export async function setUserDisabled(id: string, disabled: boolean) {
  const users = await loadUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error("User not found");
  if (isAdminEmail(user.email)) throw new Error("The admin account cannot be disabled.");
  user.disabled = disabled;
  await saveUsers(users);
  return publicUser(user);
}

export async function deleteUserAccount(id: string) {
  const users = await loadUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error("User not found");
  if (isAdminEmail(user.email)) throw new Error("The admin account cannot be deleted.");
  await saveUsers(users.filter((u) => u.id !== id));
  await persistDelete(`users/${id}/store.json`);
  return { ok: true };
}
