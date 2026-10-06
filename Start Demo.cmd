@echo off
title StationClipboard Inspection Portal (DEMO)
cd /d "%~dp0"
netstat -ano -p tcp | findstr /r /c:":4710 .*LISTENING" >nul && (
  echo Port 4710 is already in use, probably by an Inspection Portal window that is still open.
  echo Close that window, or end its node.exe in Task Manager, then run this again.
  pause
  exit /b 1
)
node server\ensure-build.mjs || (
  echo.
  echo Build failed. Fix the errors above, then run this again.
  pause
  exit /b 1
)
echo Sign in with Organization ID "demo", any username, password "demo".
start "" http://localhost:4710
node server\index.mjs --demo
pause
