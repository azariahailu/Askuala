@echo off
set ROOT=%~dp0
cd /d "%ROOT%"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS from https://nodejs.org then run this again.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules npm install
if not exist .next npm run build
if not exist .env.local if not exist .env copy .env.example .env.local
echo Leave this window open. Close it to quit.
echo On your phone, same Wi-Fi, open http://THIS-PC-IP:3000
start "" http://127.0.0.1:3000
npx next start -H 0.0.0.0 -p 3000
