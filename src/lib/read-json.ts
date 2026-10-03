export async function readResponseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    const timed = res.status === 504 || res.status === 502 || res.status === 503 || res.status === 524;
    throw new Error(
      timed
        ? "Askuala Buddy timed out before a reply arrived. Try again, or keep the question shorter."
        : "Askuala Buddy returned an empty reply. Try again.",
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "Askuala Buddy sent a broken reply. Try again." : `Request failed (${res.status}).`);
  }
}
