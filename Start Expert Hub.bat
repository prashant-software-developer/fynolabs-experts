@echo off
title Expert Hub (local)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
echo Node version:
node -v
if not exist node_modules (
  echo.
  echo First run: installing packages, this takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Send Claude the text above.
    pause
    exit /b 1
  )
)
echo.
node -e "try{process.loadEnvFile('.env.local')}catch{};process.exit((process.env.DATABASE_URL||'').trim()?0:1)"
if errorlevel 1 (
  echo Starting Expert Hub with the DEMO database ^(made-up data, signed in as dev@xocket.sh^).
) else (
  echo Starting Expert Hub with the REAL database ^(production^): every change is live.
  echo A red bar in the app says so. To go back to the demo data, remove the DATABASE_URL line from .env.local.
)
echo Admin at http://localhost:3000/admin, job board at http://localhost:3000 ^(this computer only^).
echo Keep this window open while you use the app. Close it to stop.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000/admin"
call npm run dev
pause
