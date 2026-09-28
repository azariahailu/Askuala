import { fail, mutate } from "@/lib/api";
import { nid, nowIso } from "@/lib/ids";
import { GUIDE_CHAT_ID, isGuideChatId } from "@/lib/guide-chat";

export async function POST() {
  try {
    return await mutate((state) => {
      const chat = {
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
      state.messages = [];
      return { chatId: chat.id };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    return await mutate((state) => {
      const id = String(body.id || "");
      const found = state.chats.find((c) => c.id === id);
      if (!found) throw new Error("Chat not found");
      state.activeChatId = id;
      state.messages = found.messages;
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    return await mutate((state) => {
      if (isGuideChatId(id)) throw new Error("The How to use chat stays pinned and cannot be deleted.");
      state.chats = state.chats.filter((c) => c.id !== id);
      if (state.activeChatId === id) state.activeChatId = state.chats[0]?.id ?? null;
      state.messages = state.chats.find((c) => c.id === state.activeChatId)?.messages ?? [];
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}
