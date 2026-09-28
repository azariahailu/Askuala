#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -d "$ROOT/Contents" ]; then
  ROOT="$(cd "$ROOT/../.." && pwd)"
fi
# When launched from Askuala Buddy.app/Contents/MacOS
if [ ! -f "$ROOT/package.json" ]; then
  ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi

cd "$ROOT"

PORT="${ASKUALA_PORT:-3000}"
URL="http://127.0.0.1:${PORT}"

alive() {
  command -v curl >/dev/null || return 1
  code="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 --max-time 3 "$URL" || true)"
  [ -n "$code" ] && [ "$code" != "000" ]
}

if alive; then
  echo "Askuala is already running."
  if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL"; fi
  exit 0
fi

if ! command -v node >/dev/null; then
  echo "Node.js is required. Install it from https://nodejs.org (LTS), then double-click again."
  if command -v open >/dev/null; then open "https://nodejs.org"; fi
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing (first time only)…"
  npm install
fi

if [ ! -f .env.local ] && [ ! -f .env ]; then
  cp .env.example .env.local
fi

echo ""
echo "Askuala is running at $URL"
echo "On your phone (same Wi‑Fi), open:"
if command -v ipconfig >/dev/null; then
  ipconfig getifaddr en0 2>/dev/null | awk -v p="$PORT" '{print "  http://"$1":"p}'
  ipconfig getifaddr en1 2>/dev/null | awk -v p="$PORT" '{print "  http://"$1":"p}'
fi
hostname -I 2>/dev/null | awk -v p="$PORT" '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]/ && $i !~ /^127/) print "  http://"$i":"p}'
echo "Leave this window open. Close it to quit. Allow the firewall if the phone can’t connect."
echo ""

if command -v open >/dev/null; then
  (sleep 2 && open "$URL") &
elif command -v xdg-open >/dev/null; then
  (sleep 2 && xdg-open "$URL") &
fi

exec npx next dev -H 0.0.0.0 -p "$PORT"
