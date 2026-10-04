import { after, NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { pushPlainUploadsToDrive } from "@/lib/google-drive";
import { runAssistant, titleFromMessage } from "@/lib/local-chat";
import { nid, nowIso } from "@/lib/ids";
import { activeChat, saveUpload, updateState } from "@/lib/store";
import { GUIDE_CHAT_ID, isGuideChatId } from "@/lib/guide-chat";
import type { Attachment, AppState } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

async function finishReply(opts: {
  userId: string;
  message: string;
  extractedText: string;
  userMsgId: string;
  attachments: Attachment[];
  fileBufs: Record<string, Buffer>;
}) {
  await updateState(opts.userId, async (state: AppState) => {
    const chat = activeChat(state);
    const history = (chat?.messages || []).filter((m) => m.id !== opts.userMsgId);
    let reply = "";
    try {
      const ran = await runAssistant({
        state,
        message: opts.message,
        extractedText: opts.extractedText,
        extra: opts.message,
        history,
      });
      reply = ran.reply;
    } catch (e) {
      const err = e instanceof Error ? e.message : "Gemini failed";
      reply = /denied access/i.test(err)
        ? `Gemini blocked this key (${err.slice(0, 120)}). Create a new AI Studio key if it keeps happening.`
        : `Gemini did not return text (${err.slice(0, 220)}).`;
    }
    if (!reply.trim()) {
      reply = "Gemini returned no text that time. Ask again in a moment.";
    }
    chat?.messages.push({
      id: nid(),
      role: "assistant",
      content: reply,
      attachments: [],
      createdAt: nowIso(),
    });
    if (chat) {
      chat.updatedAt = nowIso();
      state.messages = chat.messages;
    }
    if (opts.attachments.length) {
      try {
        await pushPlainUploadsToDrive(state, opts.userId, undefined, opts.attachments, opts.fileBufs);
      } catch {
        /* chat still saved */
      }
    }
  }, { light: true });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const message = String(form.get("message") || "");
    const chatId = String(form.get("chatId") || "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const user = await requireUser();

    const attachments: Attachment[] = [];
    const fileBufs: Record<string, Buffer> = {};
    let extractedText = "";
    for (const file of files) {
      const saved = await saveUpload(user.id, file, file.name);
      attachments.push({
        id: nid(),
        filename: file.name,
        mime: file.type,
        size: saved.size,
        path: saved.filename,
        createdAt: nowIso(),
      });
      if (saved.buf) fileBufs[saved.filename] = saved.buf;
      try {
        const { extractTextFromBuffer, extractTextFromPath } = await import("@/lib/extract-text");
        extractedText += `\n\n--- ${file.name} ---\n${
          saved.dest
            ? await extractTextFromPath(saved.dest, file.type, file.name)
            : await extractTextFromBuffer(saved.buf || Buffer.alloc(0), file.type, file.name)
        }`;
      } catch {
        extractedText += `\n\n--- ${file.name} ---\n`;
      }
    }

    const userMsg = {
      id: nid(),
      role: "user" as const,
      content: message || (files.length ? `(attached ${files.map((f) => f.name).join(", ")})` : ""),
      attachments,
      createdAt: nowIso(),
    };

    await updateState(user.id, async (state) => {
      if (chatId && state.chats.some((c) => c.id === chatId)) state.activeChatId = chatId;
      let chat = activeChat(state);
      if (!chat) {
        chat = {
          id: nid(),
          title: "New chat",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          messages: [],
        };
        const rest = state.chats.filter((c) => c.id !== GUIDE_CHAT_ID);
        const guide = state.chats.find((c) => c.id === GUIDE_CHAT_ID);
        state.chats = guide ? [guide, chat, ...rest] : [chat, ...rest];
        state.activeChatId = chat.id;
      }
      chat.messages.push(userMsg);
      const userTurns = chat.messages.filter((m) => m.role === "user").length;
      if (!isGuideChatId(chat.id) && (userTurns === 1 || !chat.title || chat.title === "New chat")) {
        chat.title = titleFromMessage(userMsg.content) || files[0]?.name || "Chat";
      }
      chat.updatedAt = nowIso();
      state.messages = chat.messages;
    }, { light: true });

    const job = finishReply({
      userId: user.id,
      message,
      extractedText,
      userMsgId: userMsg.id,
      attachments,
      fileBufs,
    }).catch((err) => console.error("assistant after", err));
    after(() => job);

    return new NextResponse(JSON.stringify({ ok: true, extra: { pending: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return fail(err);
  }
}
