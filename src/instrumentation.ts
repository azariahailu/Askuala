export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startMailLoop } = await import("./lib/mail-loop");
  startMailLoop();
}
