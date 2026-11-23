@echo off
title Expert Hub: copy the FynoLabs admin
cd /d "%~dp0"
echo.
echo  Copy everything from the FynoLabs admin (fynolabs.si/admin: experts, pipelines,
echo  companies, contacts, calendar, referrals, projects, emails, messages, analytics)
echo  into the Expert Hub database (Neon project "expert-hub").
echo.
echo  FynoLabs is only read, never changed. Safe to run again any time: new and changed
echo  records come across, nothing is copied twice, nothing is deleted, and edits made
echo  in Expert Hub are kept.
echo.

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

node -e "try{process.loadEnvFile('.env.local')}catch{};process.exit((process.env.DATABASE_URL||'').trim()?0:1)"
if errorlevel 1 (
  echo.
  echo The Expert Hub database isn't set up on this computer yet. Do this once:
  echo   1. Open https://neon.tech with the FynoLabs admin account and open the project "expert-hub".
  echo   2. Press Connect, keep the main branch, and copy the connection string. It starts with postgresql://
  echo   3. In this folder, open the file .env.local in Notepad, or create it, and add one line:
  echo        DATABASE_URL=the string you copied
  echo   4. Save it, close Notepad, and double-click this file again.
  echo.
  echo Keep that string private: it contains a password. Never paste it in Slack or a doc.
  pause
  exit /b 1
)

node -e "try{process.loadEnvFile('.env.local')}catch{};process.exit((process.env.FYNOLABS_SYNC_TOKEN||'').trim().length>=16?0:1)"
if errorlevel 1 (
  call npm run -s token:new
  echo.
  echo One-time setup: the FynoLabs side needs two secrets before the first copy.
  echo   1. Open lovable.dev, open the FynoLabs project, then Cloud, then Secrets.
  echo   2. Add a secret named HUB_SYNC_TOKEN. Its value: open .env.local in this folder in
  echo      Notepad and copy what comes after FYNOLABS_SYNC_TOKEN= ^(the whole line after the = sign^).
  echo   3. Add a secret named HUB_DATABASE_URL. Its value: what comes after DATABASE_URL= in
  echo      the same file ^(the expert-hub connection string^).
  echo   4. Make sure the main site has been pushed ^(git push in "Main Website - FyonLabs"^), so
  echo      Lovable deploys the new function hub-sync.
  echo   5. Then double-click this file again.
  echo.
  echo Both values are passwords: never paste them in Slack, a doc or a chat.
  pause
  exit /b 1
)

if not exist logs mkdir logs
if exist "logs\copy-fynolabs-latest.log" del "logs\copy-fynolabs-latest.log"

echo.
echo Step 1 of 2: a dry run. It only counts: nothing is copied or changed.
echo.
set CONFIRM_DB=
call npm run sync:fynolabs -- --dry-run --log-file "logs\copy-fynolabs-latest.log"
if errorlevel 1 (
  echo.
  echo The dry run stopped, so nothing was copied. Send Claude the file logs\copy-fynolabs-latest.log
  echo ^(it has no passwords^).
  pause
  exit /b 1
)

echo.
echo Check the numbers above. Nothing has been copied yet.
set ANSWER=
set /p ANSWER=Type YES to copy into the Expert Hub database: 
if /i not "%ANSWER%"=="YES" (
  echo.
  echo Stopped. Nothing was copied.
  pause
  exit /b 0
)

echo.
echo Step 2 of 2: copying. The first time takes a few minutes ^(about 35,000 analytics rows and 17 MB of CVs^).
echo Keep this window open. If it stops, just run this file again: it carries on where it stopped.
echo.
set CONFIRM_DB=yes
call npm run sync:fynolabs -- --log-file "logs\copy-fynolabs-latest.log"
set RESULT=%ERRORLEVEL%
set CONFIRM_DB=
echo.
if not "%RESULT%"=="0" (
  echo Something needs a look: see the lines above. FynoLabs was not changed.
  echo Send Claude the file logs\copy-fynolabs-latest.log ^(it has no passwords^).
) else (
  echo Done. The full log is logs\copy-fynolabs-latest.log and the report is in the logs folder.
)
pause
exit /b %RESULT%
