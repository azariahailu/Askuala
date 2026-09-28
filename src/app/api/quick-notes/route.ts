import { fail, mutate } from "@/lib/api";
import { nid, nowIso } from "@/lib/ids";
import type { QuickTodo } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return await mutate((state) => {
      const todos = Array.isArray(body.todos)
        ? (body.todos as QuickTodo[]).map((t) => ({
            id: String(t.id || nid()),
            text: String(t.text || ""),
            done: Boolean(t.done),
          }))
        : state.quickPad?.todos || [];
      state.quickPad = {
        body: typeof body.body === "string" ? body.body : state.quickPad?.body || "",
        todos: todos.filter((t) => t.text.trim() || !t.done),
        updatedAt: nowIso(),
      };
      return { ok: true };
    });
  } catch (err) {
    return fail(err);
  }
}
