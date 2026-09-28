import { NextResponse } from "next/server";

const MODES = new Set(["light", "dark", "system"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = MODES.has(url.searchParams.get("mode") || "") ? url.searchParams.get("mode") : "system";
  const next = (url.searchParams.get("next") || "/").startsWith("/") ? url.searchParams.get("next") || "/" : "/";
  const html = `<!doctype html><meta charset="utf-8"><title>Theme</title><script>
try{localStorage.setItem("askuala-theme",${JSON.stringify(mode)});document.cookie="askuala-theme="+${JSON.stringify(mode)}+";path=/;max-age=31536000";document.documentElement.setAttribute("data-theme",${JSON.stringify(mode)});}catch(e){}
location.replace(${JSON.stringify(next)});
</script>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
