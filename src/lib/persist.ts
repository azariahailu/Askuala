import fs from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";

const ROOT = path.join(process.cwd(), "data");

export function usesBlob() {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN || "").trim());
}

export function onVercel() {
  return process.env.VERCEL === "1";
}

export function assertCloudReady() {
  if (onVercel() && !usesBlob()) {
    throw new Error("Vercel needs BLOB_READ_WRITE_TOKEN so student data is not stored on a laptop. Create a Blob store in the Vercel project and add the token.");
  }
}

async function blobUrl(key: string) {
  const { blobs } = await list({ prefix: key, limit: 20 });
  return blobs.find((b) => b.pathname === key)?.url || "";
}

export async function persistRead(key: string): Promise<Buffer | null> {
  assertCloudReady();
  if (usesBlob()) {
    const url = await blobUrl(key);
    if (!url) return null;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await fs.readFile(path.join(ROOT, key));
  } catch {
    return null;
  }
}

export async function persistWrite(key: string, body: Buffer | string, contentType = "application/json") {
  assertCloudReady();
  if (usesBlob()) {
    await put(key, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
    return;
  }
  const dest = path.join(ROOT, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, body);
}

export async function persistDelete(key: string) {
  if (usesBlob()) {
    const url = await blobUrl(key);
    if (url) await del(url);
    return;
  }
  await fs.unlink(path.join(ROOT, key)).catch(() => undefined);
}

export async function persistList(prefix: string) {
  if (usesBlob()) {
    const { blobs } = await list({ prefix, limit: 1000 });
    return blobs.map((b) => b.pathname);
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
