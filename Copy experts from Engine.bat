@echo off
title Expert Hub: copy experts from Engine
cd /d "%~dp0"
echo.
echo  Copy every expert record from Engine (the old jobs site's database)
echo  into the Expert Hub database (Neon project "expert-hub").
echo.
echo  Engine is only read, never changed. Safe to run again any time: new and
echo  changed records come across, nothing is copied twice, nothing is deleted.
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
  echo The new database isn't set up on this computer yet. Do this once:
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

if not exist "..\Jobs - FynoLabs\.env" (
  echo.
  echo Can't find "..\Jobs - FynoLabs\.env", the jobs site's settings file with Engine's address.
  echo It should be in the "Jobs - FynoLabs" folder next to this one. Ask Claude if it has moved.
  pause
  exit /b 1
)

if not exist logs mkdir logs
if exist "logs\copy-engine-latest.log" del "logs\copy-engine-latest.log"

echo.
echo Step 1 of 2: a dry run. It reads Engine and the new database, and changes nothing.
echo.
set CONFIRM_DB=
call npm run copy:engine -- --dry-run --source-env "..\Jobs - FynoLabs\.env" --source-key JOBS_DATABASE_URL --log-file "logs\copy-engine-latest.log"
if errorlevel 1 (
  echo.
  echo The dry run stopped, so nothing was copied. Send Claude the file logs\copy-engine-latest.log
  echo ^(it has no passwords^).
  pause
  exit /b 1
)

echo.
echo Check the numbers above. Nothing has been written yet.
set ANSWER=
set /p ANSWER=Type YES to copy into the new database: 
if /i not "%ANSWER%"=="YES" (
  echo.
  echo Stopped. Nothing was copied.
  pause
  exit /b 0
)

echo.
echo Step 2 of 2: copying. The first time takes 10 to 20 minutes (about 220 MB of CVs^).
echo Keep this window open. If it stops, just run this file again: it carries on where it stopped.
echo.
set CONFIRM_DB=yes
call npm run copy:engine -- --source-env "..\Jobs - FynoLabs\.env" --source-key JOBS_DATABASE_URL --log-file "logs\copy-engine-latest.log"
set RESULT=%ERRORLEVEL%
set CONFIRM_DB=
echo.
if not "%RESULT%"=="0" (
  echo Something needs a look: see the lines above. Engine was not changed.
  echo Send Claude the file logs\copy-engine-latest.log ^(it has no passwords^).
) else (
  echo Done. The full log is logs\copy-engine-latest.log and the report is in the logs folder.
  echo Start the app with "Start Expert Hub.bat": it now uses the new database.
)
pause
exit /b %RESULT%
