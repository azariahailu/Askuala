import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { DEEPSEEK_PULL_MODEL, ensureLocalDeepseek, ollamaStatus, pullMessage, pullProgress, startDeepseekPull, wakeOllama } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    await requireUser();
    await wakeOllama();
    const status = await ollamaStatus();
    const progress = pullProgress();
    return NextResponse.json({
      ...status,
      pulling: !status.ready && (progress.running || progress.bytes > 50_000_000),
      progress,
      message: status.ready ? `DeepSeek is ready (${status.deepseek}).` : pullMessage(),
      modelWanted: DEEPSEEK_PULL_MODEL,
      unlimited: true,
      provider: "local DeepSeek via Ollama",
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST() {
  try {
    await requireUser();
    await wakeOllama();
    const status = await ollamaStatus();
    if (!status.up) {
      return NextResponse.json(
        {
          ok: false,
          error: "Install Ollama once from https://ollama.com. You can quit that app after — this app starts the engine when you chat.",
        },
        { status: 400 },
      );
    }
    if (status.ready) {
      return NextResponse.json({ ok: true, message: `DeepSeek is ready (${status.deepseek}). No chat or upload limits.` });
    }
    const progress = pullProgress();
    if (progress.running || progress.bytes > 50_000_000) {
      return NextResponse.json({ ok: false, pulling: true, progress, message: pullMessage() });
    }
    startDeepseekPull();
    const again = await ensureLocalDeepseek();
    return NextResponse.json({
      ok: again.ok,
      message: again.ok ? `DeepSeek is ready (${again.model}).` : again.message,
    });
  } catch (err) {
    return fail(err);
  }
}
