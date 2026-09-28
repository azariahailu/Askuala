import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const DATA = path.join(process.cwd(), "data");
const OWNERS = new Set(["azariahailusdk@gmail.com", "azariahsd@gmail.com"]);

function pack(store) {
  const s = store.settings || {};
  const n = s.notification || {};
  return {
    courses: store.courses || [],
    events: store.events || [],
    notes: store.notes || [],
    chats: store.chats || [],
    messages: store.messages || [],
    activeChatId: store.activeChatId || null,
    quickPad: store.quickPad || { body: "", todos: [], updatedAt: "" },
    digestDaily: n.digestDaily ?? true,
    digestWeekly: n.digestWeekly ?? true,
    digestDailyHour: n.digestDailyHour ?? 22,
    digestDailyMinute: n.digestDailyMinute ?? 0,
    schoolCalHintDone: Boolean((s.google || {}).schoolCalHintDone),
  };
}

async function main() {
  const token = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!token) {
    throw new Error("Set BLOB_READ_WRITE_TOKEN, then run: npm run seed:push");
  }
  const users = JSON.parse(await readFile(path.join(DATA, "users.json"), "utf8"));
  for (const user of users) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!OWNERS.has(email)) continue;
    const store = JSON.parse(await readFile(path.join(DATA, "users", user.id, "store.json"), "utf8"));
    const planner = Buffer.from(JSON.stringify(pack(store)));
    await put(`owner-seed/${email}/planner.json`, planner, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
      contentType: "application/json",
    });
    console.log("planner", email, planner.length);
    const uploads = path.join(DATA, "users", user.id, "uploads");
    let names = [];
    try {
      names = await readdir(uploads);
    } catch {
      names = [];
    }
    for (const name of names) {
      const buf = await readFile(path.join(uploads, name));
      await put(`owner-seed/${email}/uploads/${name}`, buf, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        token,
      });
      console.log("file", email, name, buf.length);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
