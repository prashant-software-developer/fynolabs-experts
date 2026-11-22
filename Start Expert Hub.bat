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
echo Starting Expert Hub on http://localhost:3000 (demo data, signed in as dev@xocket.sh).
echo Keep this window open while you use the app. Close it to stop.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
call npm run dev
pause
