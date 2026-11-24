@echo off
title Expert Hub: create my admin account
cd /d "%~dp0"
echo.
echo  Create (or update) your Expert Hub admin login in the database
echo  (Neon project "expert-hub"). Your password is never saved in a file.
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
  echo The database isn't set up on this computer yet. Do this once:
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

echo.
set "ADMIN_EMAIL=prashant@xocket.sh"
set /p "ADMIN_EMAIL=Your email [prashant@xocket.sh, press Enter to keep it]: "
set "ADMIN_NAME=Prashant"
set /p "ADMIN_NAME=Your name [Prashant, press Enter to keep it]: "
echo.
echo Next you choose a password. Nothing shows on screen while you type it: that's normal.
echo Or just press Enter and a strong password is made for you ^(shown once^).
echo.

set CONFIRM_DB=yes
call npm run admin:create -- --email "%ADMIN_EMAIL%" --name "%ADMIN_NAME%"
set RESULT=%ERRORLEVEL%
set CONFIRM_DB=
echo.
if not "%RESULT%"=="0" (
  echo Something needs a look: see the lines above. Send Claude the text ^(it has no passwords^).
) else (
  echo Sign in at http://localhost:3000/signin with %ADMIN_EMAIL% and the password you just set.
  echo Start the app first with "Start Expert Hub.bat" if it isn't running.
)
pause
exit /b %RESULT%
