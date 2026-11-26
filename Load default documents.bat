@echo off
title Expert Hub: load the default documents
cd /d "%~dp0"
echo.
echo  Loads the two documents every expert signs in the portal: the Non-Disclosure
echo  Agreement and the Data Submission and Ownership Agreement.
echo  Running it again brings them up to date. What experts already signed never changes.
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
set CONFIRM_DB=yes
call npm run -s docs:defaults
set RESULT=%ERRORLEVEL%
set CONFIRM_DB=
echo.
if not "%RESULT%"=="0" (
  echo Something needs a look: see the lines above. Send Claude the text ^(it has no passwords^).
) else (
  echo Done. See them in the admin: http://localhost:3000/admin/documents
  echo Experts sign them on their Documents page: https://experts.fynolabs.si/me/documents
)
pause
exit /b %RESULT%
