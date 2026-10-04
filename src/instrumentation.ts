export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.VERCEL === "1") return;
  const { startMailLoop } = await import("./lib/mail-loop");
  startMailLoop();
}
