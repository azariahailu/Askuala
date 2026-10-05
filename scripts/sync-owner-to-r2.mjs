import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

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

function client() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_BUCKET || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 keys missing in .env.local");
  }
  return {
    bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: (process.env.R2_ENDPOINT || "").trim() || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") return Buffer.from(await body.transformToByteArray());
  return Buffer.from(await new Response(body).arrayBuffer());
}

async function getJson(s3, bucket, key) {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse((await bodyToBuffer(out.Body)).toString("utf8"));
  } catch (err) {
    const code = err?.name || err?.Code || "";
    if (err?.$metadata?.httpStatusCode === 404 || /NoSuchKey|NotFound/i.test(code)) return null;
    throw err;
  }
}

async function listAll(s3, bucket, prefix) {
  const names = [];
  let token;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
    );
    for (const obj of out.Contents || []) if (obj.Key) names.push(obj.Key);
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return names;
}

async function put(s3, bucket, key, body, contentType) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

function summarize(store, label) {
  if (!store) return `${label}: missing`;
  return `${label}: courses=${(store.courses || []).length} events=${(store.events || []).length} notes=${(store.notes || []).length} chats=${(store.chats || []).length} messages=${(store.messages || []).length} quickPad=${(store.quickPad?.pages || store.quickPad?.items || []).length || (store.quickPad ? "yes" : 0)} uiText=${Object.keys(store.uiText || {}).length} gemini=${Boolean((store.settings?.geminiKey || "").trim())} googleRefresh=${Boolean((store.settings?.google?.refreshToken || "").trim())}`;
}

async function filesIn(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function main() {
  loadDotEnv();
  const { s3, bucket } = client();
  const remoteUsers = (await getJson(s3, bucket, "users.json")) || [];
  const localUsers = JSON.parse(await readFile(path.join(DATA, "users.json"), "utf8"));
  const keys = await listAll(s3, bucket, "");
  console.log("r2 objects", keys.length);
  console.log(
    "r2 users",
    remoteUsers.map((u) => `${u.email} ${u.id} google=${Boolean(u.googleId)}`),
  );

  const nextUsers = remoteUsers.map((u) => ({ ...u }));
  const byEmail = new Map(nextUsers.map((u) => [String(u.email || "").toLowerCase(), u]));

  for (const local of localUsers) {
    const email = String(local.email || "").trim().toLowerCase();
    if (!OWNERS.has(email)) continue;
    const store = JSON.parse(await readFile(path.join(DATA, "users", local.id, "store.json"), "utf8"));
    let dest = byEmail.get(email);
    if (!dest) {
      dest = {
        id: local.id,
        email,
        name: local.name,
        passwordHash: local.passwordHash || "",
        googleId: local.googleId,
        createdAt: local.createdAt,
      };
      nextUsers.push(dest);
      byEmail.set(email, dest);
      console.log("created r2 user from local", email, dest.id);
    } else {
      dest.name = local.name || dest.name;
      if (local.googleId && !dest.googleId) dest.googleId = local.googleId;
      if (local.passwordHash && !dest.passwordHash) dest.passwordHash = local.passwordHash;
    }

    const remoteStore = await getJson(s3, bucket, `users/${dest.id}/store.json`);
    console.log(email, "localId", local.id, "r2Id", dest.id);
    console.log(summarize(store, "  local"));
    console.log(summarize(remoteStore, "  r2  "));

    const packed = { ...store };
    delete packed.resume;
    await put(s3, bucket, `users/${dest.id}/store.json`, Buffer.from(JSON.stringify(packed)), "application/json");
    await put(s3, bucket, `owner-seed/${email}/planner.json`, Buffer.from(JSON.stringify(packed)), "application/json");

    for (const extra of ["resume.json", "activity.json"]) {
      const full = path.join(DATA, "users", local.id, extra);
      try {
        const buf = await readFile(full);
        await put(s3, bucket, `users/${dest.id}/${extra}`, buf, "application/json");
        console.log("copied", extra);
      } catch {
        /* none */
      }
    }

    const seen = new Set();
    for (const dir of [path.join(DATA, "users", local.id, "uploads"), path.join(process.cwd(), "seed-files", email)]) {
      for (const name of await filesIn(dir)) {
        if (seen.has(name)) continue;
        const full = path.join(dir, name);
        const st = await stat(full);
        if (!st.isFile()) continue;
        seen.add(name);
        const buf = await readFile(full);
        await put(s3, bucket, `users/${dest.id}/uploads/${name}`, buf, "application/octet-stream");
        await put(s3, bucket, `owner-seed/${email}/uploads/${name}`, buf, "application/octet-stream");
      }
    }
    console.log("uploads copied", email, seen.size);
  }

  await put(s3, bucket, "users.json", Buffer.from(JSON.stringify(nextUsers, null, 2)), "application/json");
  console.log("users.json written", nextUsers.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
