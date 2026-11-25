@echo off
title Expert Hub: create a test expert account
cd /d "%~dp0"
echo.
echo  Create (or update) a test expert login, to try the expert side of Expert Hub
echo  (profile, onboarding, applying to jobs, applications). The email needs no real
echo  mailbox: it is marked as confirmed. The password is never saved in a file.
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
set "EXPERT_EMAIL=test.expert@example.com"
set /p "EXPERT_EMAIL=Test expert's email [test.expert@example.com, press Enter to keep it]: "
set "EXPERT_NAME=Test Expert"
set /p "EXPERT_NAME=Name on the expert record [Test Expert, press Enter to keep it]: "
echo.
echo Next you choose a password. Nothing shows on screen while you type it: that's normal.
echo Or just press Enter and a strong password is made for you ^(shown once^).
echo.

set CONFIRM_DB=yes
call npm run -s expert:create -- --email "%EXPERT_EMAIL%" --name "%EXPERT_NAME%"
set RESULT=%ERRORLEVEL%
set CONFIRM_DB=
echo.
if not "%RESULT%"=="0" (
  echo Something needs a look: see the lines above. Send Claude the text ^(it has no passwords^).
) else (
  echo Sign in at http://localhost:3000/signin with %EXPERT_EMAIL% and that password.
  echo Use a private window, so your admin sign-in stays as it is.
  echo Start the app first with "Start Expert Hub.bat" if it isn't running.
)
pause
exit /b %RESULT%
