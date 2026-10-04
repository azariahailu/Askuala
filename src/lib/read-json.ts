export async function readResponseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.ok || res.status === 202) {
      return { ok: true, extra: { pending: true } } as T;
    }
    throw new Error(
      res.status === 504 || res.status === 502 || res.status === 503 || res.status === 524
        ? "Askuala timed out. Try again: if you were saving, check whether it already stuck."
        : `Askuala could not finish that request (HTTP ${res.status}).`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "Askuala sent a broken reply from the server." : `Request failed (${res.status}).`);
  }
}
