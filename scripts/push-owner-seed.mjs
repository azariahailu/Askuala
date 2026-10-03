import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import {
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { put } from "@vercel/blob";

const DATA = path.join(process.cwd(), "data");
const OWNERS = new Set(["azariahailusdk@gmail.com", "azariahsd@gmail.com"]);

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i);
      let v = t.slice(i + 1);
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function pack(store) {
  const clone = JSON.parse(JSON.stringify(store));
  const g = clone.settings?.google || {};
  clone.settings = {
    ...clone.settings,
    google: {
      ...g,
      clientId: "",
      clientSecret: "",
      accessToken: "",
      refreshToken: "",
      expiryDate: 0,
    },
    smtp: { host: "", port: 587, user: "", pass: "" },
    plannerImported: true,
  };
  delete clone.resume;
  return clone;
}

async function filesIn(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function r2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_BUCKET || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: (process.env.R2_ENDPOINT || "").trim() || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function upload(key, body, contentType) {
  const r2 = r2Config();
  if (r2) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return "r2";
  }
  const token = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!token) {
    throw new Error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in .env.local, then run: npm run seed:push");
  }
  await put(key, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
    contentType,
  });
  return "blob";
}

async function main() {
  loadDotEnv();
  const users = JSON.parse(await readFile(path.join(DATA, "users.json"), "utf8"));
  let dest = "";
  for (const user of users) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!OWNERS.has(email)) continue;
    const store = JSON.parse(await readFile(path.join(DATA, "users", user.id, "store.json"), "utf8"));
    const planner = Buffer.from(JSON.stringify(pack(store)));
    dest = await upload(`owner-seed/${email}/planner.json`, planner, "application/json");
    console.log("planner", dest, email, "bytes", planner.length, "courses", (store.courses || []).length, "events", (store.events || []).length, "notes", (store.notes || []).length, "chats", (store.chats || []).length);

    const seen = new Set();
    const dirs = [path.join(DATA, "users", user.id, "uploads"), path.join(process.cwd(), "seed-files", email)];
    for (const dir of dirs) {
      for (const name of await filesIn(dir)) {
        if (seen.has(name)) continue;
        const full = path.join(dir, name);
        const st = await stat(full);
        if (!st.isFile()) continue;
        seen.add(name);
        const buf = await readFile(full);
        await upload(`owner-seed/${email}/uploads/${name}`, buf, "application/octet-stream");
        console.log("file", dest, email, name, buf.length);
      }
    }
    console.log("files", email, seen.size);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
