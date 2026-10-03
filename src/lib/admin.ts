export const ADMIN_EMAIL = "buddy.askuala@gmail.com";

export function isAdminEmail(email?: string | null) {
  const n = (email || "").trim().toLowerCase();
  if (!n) return false;
  if (n === ADMIN_EMAIL) return true;
  const extra = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(extra) && n === extra;
}

export function afterLoginPath(email?: string | null) {
  return isAdminEmail(email) ? "/admin" : "/home";
}
