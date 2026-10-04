import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppSettings } from "./types";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const OLLAMA = "http://127.0.0.1:11434";
const PREFERRED = process.env.OLLAMA_MODEL || "deepseek-r1:8b";
const FALLBACKS = ["deepseek-r1:8b", "deepseek-r1:7b", "deepseek-r1:1.5b", "deepseek-r1"];
const SERVE_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`,
};

let pulling: Promise<void> | null = null;
let waking: Promise<boolean> | null = null;

function ollamaBin() {
  return (
    ["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", "/Applications/Ollama.app/Contents/Resources/ollama"].find((p) => existsSync(p)) ||
    "ollama"
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnOllama(args: string[]) {
  const child = spawn(/*turbopackIgnore: true*/ ollamaBin(), args, { env: SERVE_ENV, stdio: "ignore", detached: true });
  child.unref();
  child.on("error", () => undefined);
  return child;
}

async function ollamaJson(path: string, init?: RequestInit, ms = 4000) {
  const res = await fetch(`${OLLAMA}${path}`, { ...init, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  return res.json();
}

export async function ollamaStatus() {
  try {
    const data = (await ollamaJson("/api/tags", undefined, 800)) as { models?: { name: string }[] };
    const models = data.models?.map((m) => m.name) || [];
    const deepseek = models.find((n) => /deepseek/i.test(n)) || "";
    return { up: true, models, deepseek, ready: Boolean(deepseek) };
  } catch {
    return { up: false, models: [] as string[], deepseek: "", ready: false };
  }
}

const MODEL_BYTES = 5.2 * 1024 * 1024 * 1024;

function blobBytes() {
  const dir = join(homedir(), ".ollama/models/blobs");
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    try {
      n += statSync(join(dir, name)).size;
    } catch {
      /* ignore */
    }
  }
  return n;
}

function pullRunning() {
  const r = spawnSync("pgrep", ["-f", "ollama pull"], { encoding: "utf8" });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

export function pullProgress() {
  const bytes = blobBytes();
  const running = pullRunning();
  const pct = Math.min(99, Math.round((bytes / MODEL_BYTES) * 100));
  const gb = (bytes / (1024 * 1024 * 1024)).toFixed(1);
  return { running, bytes, gb, pct: bytes ? pct : running ? 1 : 0 };
}

function pickModel(models: string[]) {
  return (
    models.find((n) => n === PREFERRED || n.startsWith(`${PREFERRED}:`) || n.startsWith(`${PREFERRED}-`)) ||
    models.find((n) => /deepseek/i.test(n)) ||
    ""
  );
}

export async function wakeOllama() {
  const already = await ollamaStatus();
  if (already.up) return true;
  if (!waking) {
    waking = (async () => {
      spawnOllama(["serve"]);
      for (const ms of [400, 800, 1600, 2500, 4000]) {
        await sleep(ms);
        if ((await ollamaStatus()).up) return true;
      }
      return false;
    })().finally(() => {
      waking = null;
    });
  }
  return waking;
}

export function startDeepseekPull() {
  if (pulling || pullRunning()) return;
  pulling = new Promise((resolve) => {
    const child = spawnOllama(["pull", PREFERRED]);
    child.on("exit", () => {
      pulling = null;
      resolve();
    });
    child.on("error", () => {
      pulling = null;
      resolve();
    });
  });
}

export async function ensureLocalDeepseek() {
  await wakeOllama();
  const status = await ollamaStatus();
  if (!status.up) {
    return {
      ok: false as const,
      reason: "install" as const,
      message: llmMissingMessage(),
    };
  }
  const model = pickModel(status.models);
  if (model) return { ok: true as const, model, reason: "ready" as const, message: "" };
  if (!pullRunning()) startDeepseekPull();
  return {
    ok: false as const,
    reason: "pulling" as const,
    message: pullMessage(),
  };
}

async function ollamaChat(model: string, messages: ChatMsg[], json = false, long = false) {
  const tryOnce = async (think: boolean | undefined) => {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think,
        format: json ? "json" : undefined,
        messages,
        keep_alive: "10m",
        options: { temperature: json ? 0.1 : 0.3, num_ctx: json || long ? 8192 : 4096, num_predict: json || long ? 1800 : 700 },
      }),
      signal: AbortSignal.timeout(json || long ? 180000 : 90000),
    });
    if (!res.ok) throw new Error(`ollama chat ${res.status} ${await res.text().catch(() => "")}`.slice(0, 240));
    const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
    return cleanModelText(data.message?.content || "") || (json ? "" : cleanModelText(data.message?.thinking || ""));
  };
  let text = await tryOnce(false);
  if (!text) text = await tryOnce(undefined);
  return text;
}

function cleanModelText(raw: string) {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^\s*Thinking[\s\S]*?(?:\n\n|$)/i, "")
    .trim();
}

const workingByKey = new Map<string, string>();
const listedByKey = new Map<string, { at: number; ids: string[] }>();
const busyUntil = new Map<string, number>();
const SKIP_MODEL = /image|tts|audio|live|transcribe|embedding|computer-use|robotics|omni|veo|lyria/i;
/** Older 3.6/3.7 previews had a tiny free cap. 3.8-flash is the model Google tells us to use. */
const TIGHT_FREE_TIER = /gemini-3\.6|gemini-3\.7|gemini-3-flash-preview/i;
const RETIRED_GEMINI = /gemini-2\.0|gemini-1\.5/i;

/** Try these if ListModels is empty or incomplete. Skip 404s; keep going. */
const ALL_FLASH = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-pro-latest",
  "gemini-pro",
];

export function rememberWorkingGemini(key: string, model: string) {
  const n = model.replace(/^models\//, "");
  if (TIGHT_FREE_TIER.test(n) || RETIRED_GEMINI.test(n)) return;
  workingByKey.set(key, n);
}

export function geminiApiKey(settings?: AppSettings) {
  return (settings?.geminiKey || "").trim();
}

export function isGeminiHighDemand(message: string) {
  return /high demand|spikes in demand|overloaded/i.test(message);
}

export function isGeminiQuotaError(message: string) {
  if (isGeminiHighDemand(message)) return false;
  return /quota exceeded|rate.?limit|too many requests|generate_content_free_tier|request cap/i.test(message);
}

export function friendlyGeminiError(message: string, _key?: string) {
  if (isGeminiHighDemand(message)) {
    return "Gemini is busy on Google’s side. Send the same message again.";
  }
  if (isGeminiQuotaError(message)) {
    return "Google’s free Gemini limit for one model is used up on this API key (earlier retries count: not how many chats you sent today). Send again; Askuala will use another Gemini model.";
  }
  if (/api key|401|403|permission|invalid/i.test(message) && !/not found|no longer available/i.test(message)) {
    return "Gemini rejected the API key. Check it in Settings.";
  }
  return message.replace(/\s*\*.*$/, "").trim() || message;
}

function markGeminiBusy(model: string, hours = 0.025) {
  const name = model.replace(/^models\//, "");
  const ms = Math.round(hours * 3600_000);
  busyUntil.set(name, Date.now() + ms);
  for (const [key, id] of workingByKey) {
    if (id === name || id === model) workingByKey.delete(key);
  }
}

function notBusy(id: string) {
  return (busyUntil.get(id) || 0) < Date.now();
}

function modelScore(id: string) {
  const n = id.replace(/^models\//, "");
  if (RETIRED_GEMINI.test(n)) return -1;
  if (/gemini-3\.8-flash/i.test(n)) return 10000;
  if (/gemini-flash-latest/i.test(n)) return 9500;
  if (/gemini-3\.5-flash(?!-lite)/i.test(n)) return 9200;
  if (/gemini-2\.5-flash(?!-lite)/i.test(n)) return 8000;
  if (/gemini-2\.5-flash-lite/i.test(n)) return 7800;
  const m = n.match(/(\d+)\.(\d+)/);
  const major = m ? Number(m[1]) : 0;
  const minor = m ? Number(m[2]) : 0;
  let score = major * 1000 + minor * 10;
  if (/flash/i.test(n) && !/lite/i.test(n)) score += 8;
  if (/lite/i.test(n)) score += 2;
  if (/latest/i.test(n)) score += 5;
  return score;
}

export async function geminiFlashModels(key: string) {
  const cached = listedByKey.get(key);
  const working = workingByKey.get(key);
  const fallback = [...ALL_FLASH].sort((a, b) => modelScore(b) - modelScore(a));
  const ids = (cached?.ids?.length ? cached.ids : fallback).filter((id) => !RETIRED_GEMINI.test(id));
  if (!cached || Date.now() - cached.at > 10 * 60_000) {
    listedByKey.set(key, { at: Date.now(), ids });
    void refreshGeminiModelList(key);
  }
  const ordered =
    working && ids.includes(working) && !TIGHT_FREE_TIER.test(working)
      ? [working, ...ids.filter((id) => id !== working)]
      : ids;
  const cool = ordered.filter(notBusy);
  const hot = ordered.filter((id) => !notBusy(id));
  return [...cool, ...hot];
}

async function refreshGeminiModelList(key: string) {
  const fromApi: string[] = [];
  try {
    let pageToken = "";
    for (let i = 0; i < 3; i++) {
      const q = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      q.searchParams.set("key", key);
      q.searchParams.set("pageSize", "200");
      if (pageToken) q.searchParams.set("pageToken", pageToken);
      const res = await fetch(q, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
        nextPageToken?: string;
      };
      if (!res.ok) break;
      for (const m of data.models || []) {
        const name = (m.name || "").replace(/^models\//, "");
        if (!name) continue;
        if (!(m.supportedGenerationMethods || []).includes("generateContent")) continue;
        if (SKIP_MODEL.test(name)) continue;
        if (RETIRED_GEMINI.test(name)) continue;
        if (!/gemini|gemma/i.test(name)) continue;
        fromApi.push(name);
      }
      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }
  } catch {
    return;
  }
  if (!fromApi.length) return;
  const unique = [...new Set([...fromApi, ...ALL_FLASH])]
    .filter((id) => !RETIRED_GEMINI.test(id))
    .sort((a, b) => modelScore(b) - modelScore(a))
    .slice(0, 16);
  listedByKey.set(key, { at: Date.now(), ids: unique });
}

type GContent = { role: string; parts: Record<string, unknown>[] };

export async function geminiGenerate(opts: {
  key: string;
  system?: string;
  contents: GContent[];
  tools?: unknown;
  json?: boolean;
  long?: boolean;
}): Promise<{ text: string; parts: Record<string, unknown>[]; model: string }> {
  const { key } = opts;
  let lastErr = "";
  let keepErr = "";
  const listed = await geminiFlashModels(key);
  const cool = listed.filter((id) => notBusy(id) && !TIGHT_FREE_TIER.test(id));
  const tight = listed.filter((id) => notBusy(id) && TIGHT_FREE_TIER.test(id));
  const models = (cool.length ? [...cool, ...tight] : listed.filter(notBusy).length ? listed.filter(notBusy) : listed).slice(
    0,
    opts.long ? 8 : 8,
  );
  const ms = opts.long ? 45000 : 12000;

  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) await sleep(900);
  for (const model of models) {
    try {
      const body: Record<string, unknown> = {
        contents: opts.contents,
        generationConfig: {
          temperature: opts.json ? 0.1 : 0.4,
          maxOutputTokens: opts.json ? 8192 : opts.long ? 16384 : 4096,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      };
      if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
      if (opts.tools) body.tools = opts.tools;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ms),
      });
      const raw = await res.text();
      let data: {
        error?: { message?: string };
        candidates?: { content?: { parts?: Record<string, unknown>[] }; finishReason?: string }[];
      } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        lastErr = `gemini ${res.status} (empty or invalid JSON)`;
        keepErr = lastErr;
        continue;
      }
      if (!res.ok) {
        lastErr = data.error?.message || `gemini ${res.status}`;
        if (isGeminiHighDemand(lastErr) || res.status === 503) {
          markGeminiBusy(model, 45 / 3600);
          keepErr = lastErr;
          await sleep(400);
          continue;
        }
        if (isGeminiQuotaError(lastErr) || res.status === 429) {
          markGeminiBusy(model, TIGHT_FREE_TIER.test(model) ? 12 : 0.25);
          keepErr = lastErr;
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(friendlyGeminiError(lastErr, key));
        }
        if (/not found|no longer available/i.test(lastErr) || res.status === 404) {
          markGeminiBusy(model, 168);
          continue;
        }
        keepErr = lastErr;
        continue;
      }
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = cleanModelText(parts.map((p) => (typeof p.text === "string" ? p.text : "")).join(""));
      if (text || parts.some((p) => p.functionCall)) {
        rememberWorkingGemini(key, model);
        return { text, parts, model };
      }
      lastErr = data.candidates?.[0]?.finishReason || "gemini empty";
      keepErr = lastErr;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "gemini failed";
      if (/API key|rejected the API key/i.test(lastErr)) throw new Error(friendlyGeminiError(lastErr, key));
      if (isGeminiHighDemand(lastErr) || isGeminiQuotaError(lastErr)) {
        markGeminiBusy(model);
        keepErr = lastErr;
        continue;
      }
      keepErr = lastErr;
    }
  }
  }
  throw new Error(friendlyGeminiError(keepErr || lastErr || "gemini empty", key));
}

export function assistantProvider(settings?: AppSettings) {
  if (geminiApiKey(settings)) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  return "ollama";
}

export function llmConfigured(settings?: AppSettings) {
  return Boolean(geminiApiKey(settings));
}

async function geminiChat(messages: ChatMsg[], json = false, long = false, key = "") {
  if (!key) throw new Error("no-gemini-key");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const hit = await geminiGenerate({ key, system, contents, json, long });
  if (!hit.text) throw new Error("gemini empty");
  return { text: hit.text, model: hit.model };
}

async function groqChat(messages: ChatMsg[], json = false, long = false) {
  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) throw new Error("no-groq");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages,
      temperature: json ? 0.1 : 0.4,
      max_tokens: json || long ? 4096 : 2048,
      response_format: json ? { type: "json_object" } : undefined,
    }),
    signal: AbortSignal.timeout(json || long ? 120000 : 60000),
  });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message || `groq ${res.status}`);
  const text = cleanModelText(data.choices?.[0]?.message?.content || "");
  if (!text) throw new Error("groq empty");
  return { text, model: "groq" };
}

export async function llmChat(_messages: ChatMsg[], _settings?: AppSettings, json = false, long = false) {
  const key = geminiApiKey(_settings);
  if (key) {
    try {
      const hit = await geminiChat(_messages, json, long, key);
      return { text: hit.text, provider: "gemini", model: hit.model };
    } catch (e) {
      return { text: "", provider: "gemini", error: friendlyGeminiError(e instanceof Error ? e.message : "Gemini failed"), reason: "gemini" as const };
    }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const hit = await groqChat(_messages, json, long);
      return { text: hit.text, provider: "groq", model: hit.model };
    } catch {
      /* ollama last */
    }
  }
  const ready = await ensureLocalDeepseek();
  if (!ready.ok) {
    return {
      text: "",
      provider: "",
      error: key ? "Gemini did not reply. Check the API key in Settings." : llmMissingMessage(),
      reason: ready.reason,
    };
  }
  const models = [ready.model, ...((await ollamaStatus()).models || [])].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr = "";
  for (const model of models.slice(0, 3)) {
    try {
      const text = await ollamaChat(model, _messages, json, long);
      if (text) return { text, provider: "ollama", model };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Local model failed.";
    }
  }
  return { text: "", provider: "", error: lastErr || "no-text" };
}

export function pullMessage() {
  const p = pullProgress();
  if (p.running || p.bytes > 0) {
    return `Downloading the local assistant onto this Mac (~5 GB, one-time). ${p.gb} GB so far (~${p.pct}%). Stay on this page.`;
  }
  return `Starting the one-time local assistant download (~5 GB). Stay on this page.`;
}

export function llmMissingMessage() {
  return `Gemini is not set up on this account yet. Askuala Buddy needs your own free Google AI Studio key (not someone else’s). Open Settings and follow every step under “Your Gemini key”.`;
}

export const DEEPSEEK_PULL_MODEL = PREFERRED;
export const OLLAMA_FALLBACKS = FALLBACKS;
