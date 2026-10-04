import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { del, get, list, put } from "@vercel/blob";
import { blobSuspendedMessage, isBlobSuspended } from "./blob-status";

const ROOT = path.join(process.cwd(), "data");

export function onVercel() {
  return process.env.VERCEL === "1";
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

function r2Config(): R2Config | null {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_BUCKET || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: (process.env.R2_ENDPOINT || "").trim() || `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

/** Cloudflare R2. Preferred over Vercel Blob when both are set. Local disk unless ASKUALA_USE_R2=1. */
export function usesR2() {
  if (!r2Config()) return false;
  if (onVercel()) return true;
  return process.env.ASKUALA_USE_R2 === "1";
}

/** Vercel Blob only when R2 is not configured. Local disk unless ASKUALA_USE_BLOB=1. */
export function usesBlob() {
  if (usesR2()) return false;
  const token = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!token) return false;
  if (onVercel()) return true;
  return process.env.ASKUALA_USE_BLOB === "1";
}

export function usesCloud() {
  return usesR2() || usesBlob();
}

export function assertCloudReady() {
  if (onVercel() && !usesCloud()) {
    throw new Error(
      "Vercel needs Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) or BLOB_READ_WRITE_TOKEN so student data is not stored on a laptop.",
    );
  }
}

let r2Client: S3Client | null = null;

function r2() {
  const cfg = r2Config();
  if (!cfg) throw new Error("Cloudflare R2 is not configured.");
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  return { client: r2Client, bucket: cfg.bucket };
}

function wrapBlob(err: unknown): never {
  if (isBlobSuspended(err)) throw new Error(blobSuspendedMessage());
  throw err instanceof Error ? err : new Error(String(err));
}

function isMissing(err: unknown) {
  const any = err as { name?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
  const code = any?.name || any?.Code || "";
  const status = any?.$metadata?.httpStatusCode;
  const message = err instanceof Error ? err.message : "";
  return status === 404 || /NoSuchKey|NotFound|not found|404/i.test(`${code} ${message}`);
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    return Buffer.from(await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
  }
  return Buffer.from(await new Response(body as BodyInit).arrayBuffer());
}

async function r2Read(key: string): Promise<Buffer | null> {
  const { client, bucket } = r2();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await bodyToBuffer(out.Body);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function r2Write(key: string, body: Buffer, contentType: string, exclusive = false) {
  const { client, bucket } = r2();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(exclusive ? { IfNoneMatch: "*" } : {}),
      }),
    );
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (exclusive && (status === 412 || /PreconditionFailed|UnknownError/i.test(err instanceof Error ? err.message : ""))) {
      return false;
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function r2Delete(key: string) {
  const { client, bucket } = r2();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (!isMissing(err)) throw err instanceof Error ? err : new Error(String(err));
  }
}

async function r2List(prefix: string): Promise<string[]> {
  const { client, bucket } = r2();
  const names: string[] = [];
  let token: string | undefined;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const obj of out.Contents || []) {
      if (obj.Key) names.push(obj.Key);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return names;
}

export async function persistRead(key: string): Promise<Buffer | null> {
  assertCloudReady();
  if (usesR2()) return r2Read(key);
  if (usesBlob()) {
    try {
      const result = await get(key, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    } catch (err) {
      if (isBlobSuspended(err)) wrapBlob(err);
      const message = err instanceof Error ? err.message : "";
      if (/not found|404/i.test(message)) return null;
      wrapBlob(err);
    }
  }
  try {
    return await fs.readFile(path.join(ROOT, key));
  } catch {
    return null;
  }
}

export async function persistWrite(key: string, body: Buffer | string, contentType = "application/json") {
  assertCloudReady();
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  if (usesR2()) {
    await r2Write(key, buf, contentType);
    return;
  }
  if (usesBlob()) {
    try {
      await put(key, buf, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
      return;
    } catch (err) {
      wrapBlob(err);
    }
  }
  const dest = path.join(ROOT, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
}

export async function persistDelete(key: string) {
  if (usesR2()) {
    await r2Delete(key);
    return;
  }
  if (usesBlob()) {
    try {
      await del(key);
    } catch (err) {
      if (!isBlobSuspended(err) && !/not found|404/i.test(err instanceof Error ? err.message : "")) wrapBlob(err);
    }
    return;
  }
  await fs.unlink(path.join(ROOT, key)).catch(() => undefined);
}

export async function persistList(prefix: string) {
  if (usesR2()) return r2List(prefix);
  if (usesBlob()) {
    try {
      const { blobs } = await list({ prefix, limit: 1000 });
      return blobs.map((b) => b.pathname);
    } catch (err) {
      wrapBlob(err);
    }
  }
  const dir = path.join(ROOT, prefix);
  try {
    const names = await fs.readdir(dir, { recursive: true });
    return names.map((n) => path.join(prefix, n).replaceAll("\\", "/"));
  } catch {
    return [];
  }
}

export async function persistReadJson<T>(key: string): Promise<T | null> {
  const buf = await persistRead(key);
  if (!buf) return null;
  return JSON.parse(buf.toString("utf8")) as T;
}

export async function persistWriteJson(key: string, value: unknown) {
  await persistWrite(key, JSON.stringify(value), "application/json");
}

/** True if this process created the key. False if it already existed. */
export async function persistCreateExclusive(key: string, body: string) {
  const buf = Buffer.from(body);
  if (usesR2()) return r2Write(key, buf, "text/plain", true);
  if (usesBlob()) {
    const existing = await persistRead(key);
    if (existing) return false;
    await persistWrite(key, buf, "text/plain");
    return true;
  }
  const dest = path.join(ROOT, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.writeFile(dest, buf, { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "EEXIST") return false;
    throw err;
  }
}
