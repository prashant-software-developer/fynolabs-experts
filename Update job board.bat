@echo off
title Expert Hub: update the job board
cd /d "%~dp0"
echo.
echo  Cleans up the job board: keeps the live roles and makes them public, adds the
echo  roles partners need now, and closes every other open job ^(applications stay^).
echo  First it shows what it would do; nothing changes until you type yes.
echo.

where node >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Node version:
node -v

node -e "const f=require('fs');try{process.exit(f.existsSync('node_modules/.bin/tsx.cmd')&&f.existsSync('node_modules/next/package.json')&&f.statSync('node_modules/.package-lock.json').mtimeMs>=f.statSync('package-lock.json').mtimeMs?0:1)}catch(e){process.exit(1)}"
if not "%ERRORLEVEL%"=="0" (
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
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo The database isn't set up on this computer yet. Run "Start Expert Hub.bat" once: it explains the steps.
  pause
  exit /b 1
)


echo.
call npm run -s jobs:board
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Something needs a look: see the lines above. Nothing was changed. Send Claude the text.
  pause
  exit /b 1
)
echo.
set /p ANSWER=Make these changes now? Type yes and press Enter: 
if /i not "%ANSWER%"=="yes" (
  echo Nothing was changed.
  pause
  exit /b 0
)
set CONFIRM_DB=yes
call npm run -s jobs:board -- --apply
set RESULT=%ERRORLEVEL%
set CONFIRM_DB=
echo.
if not "%RESULT%"=="0" (
  echo Something needs a look: see the lines above. Send Claude the text ^(it has no passwords^).
) else (
  echo Done. See the board: http://localhost:3000/admin/jobs and https://experts.fynolabs.si
)
pause
exit /b %RESULT%
