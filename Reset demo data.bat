@echo off
title Expert Hub: reset demo data
cd /d "%~dp0"
echo This wipes the local demo database (.data) and fills it with fresh demo data.
echo Stop the app first (close the Expert Hub window).
pause
call npm run db:seed -- --reset
echo Done. Start the app again with "Start Expert Hub.bat".
pause
