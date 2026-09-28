import { fail, mutate } from "@/lib/api";
import { extractTextFromBuffer, extractTextFromPath } from "@/lib/extract-text";
import { pushPlainUploadsToDrive } from "@/lib/google-drive";
import { runAssistant, titleChatThread, titleFromMessage } from "@/lib/local-chat";
import { nid, nowIso } from "@/lib/ids";
import { activeChat, saveUpload } from "@/lib/store";
import { GUIDE_CHAT_ID, isGuideChatId } from "@/lib/guide-chat";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const message = String(form.get("message") || "");
    const chatId = String(form.get("chatId") || "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    return await mutate(async (state, userId) => {
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
      const attachments: Attachment[] = [];
      const fileBufs: Record<string, Buffer> = {};
      let extractedText = "";
      for (const file of files) {
        const saved = await saveUpload(userId, file, file.name);
        attachments.push({
          id: nid(),
          filename: file.name,
          mime: file.type,
          size: saved.size,
          path: saved.filename,
          createdAt: nowIso(),
        });
        if (saved.buf) fileBufs[saved.filename] = saved.buf;
        extractedText += `\n\n--- ${file.name} ---\n${
          saved.dest
            ? await extractTextFromPath(saved.dest, file.type, file.name)
            : await extractTextFromBuffer(saved.buf || Buffer.alloc(0), file.type, file.name)
        }`;
      }
      const userMsg = {
        id: nid(),
        role: "user" as const,
        content: message || (files.length ? `(attached ${files.map((f) => f.name).join(", ")})` : ""),
        attachments,
        createdAt: nowIso(),
      };
      chat.messages.push(userMsg);
      const { reply } = await runAssistant({
        state,
        message,
        extractedText,
        extra: message,
        history: chat.messages.slice(0, -1),
      });
      chat.messages.push({
        id: nid(),
        role: "assistant",
        content: reply,
        attachments: [],
        createdAt: nowIso(),
      });
      const userTurns = chat.messages.filter((m) => m.role === "user").length;
      const raw = titleFromMessage(userMsg.content);
      if (!isGuideChatId(chat.id) && (userTurns === 1 || !chat.title || chat.title === "New chat" || chat.title === raw)) {
        chat.title = await titleChatThread({
          settings: state.settings,
          message: userMsg.content,
          reply,
          files: files.map((f) => f.name),
        });
      }
      chat.updatedAt = nowIso();
      state.messages = chat.messages;
      if (attachments.length) {
        try {
          await pushPlainUploadsToDrive(state, userId, undefined, attachments, fileBufs);
        } catch {
          /* chat still saved */
        }
      }
      return { reply };
    });
  } catch (err) {
    return fail(err);
  }
}
