@echo off
title Expert Hub
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Node version:
node -v
node -e "const f=require('fs');try{process.exit(f.statSync('node_modules/.package-lock.json').mtimeMs>=f.statSync('package-lock.json').mtimeMs?0:1)}catch(e){process.exit(1)}"
if errorlevel 1 (
  echo.
  echo Installing packages ^(first run, or after an update^). This takes a few minutes...
  call npm ci
  if errorlevel 1 (
    echo Installing packages failed. Close any other Expert Hub window and try again, or send Claude the text above.
    pause
    exit /b 1
  )
)
echo.
node -e "try{process.loadEnvFile('.env.local')}catch{};process.exit((process.env.DATABASE_URL||'').trim()?0:1)"
if errorlevel 1 (
  echo The database isn't set up on this computer yet, so Expert Hub can't start. Do this once:
  echo   1. Open Vercel, project fynolabs-experts, Storage, expert-hub ^(or ask Claude to fill it in^).
  echo   2. Copy the DATABASE_URL connection string. It starts with postgresql://
  echo   3. In this folder, open the file .env.local in Notepad, or create it, and add one line:
  echo        DATABASE_URL=the string you copied
  echo   4. Save it, close Notepad, and double-click this file again.
  echo.
  echo Keep that string private: it contains a password. Never paste it in Slack or a doc.
  echo Then run "Create my admin account.bat" once to get your login.
  pause
  exit /b 1
)
echo Checking the database tables ^(adds any new ones; never deletes anything^)...
set CONFIRM_DB=yes
call npm run -s db:migrate
if errorlevel 1 (
  set CONFIRM_DB=
  echo Setting up the database tables failed. Send Claude the text above.
  pause
  exit /b 1
)
set CONFIRM_DB=
echo.
echo Starting Expert Hub with the database ^(production^): every change is live.
echo Sign in at http://localhost:3000/signin ^(no login yet? run "Create my admin account.bat"^).
echo Job board at http://localhost:3000 ^(this computer only^).
echo Keep this window open while you use the app. Close it to stop.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000/signin"
call npm run dev
pause
