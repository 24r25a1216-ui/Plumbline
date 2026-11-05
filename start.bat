@echo off
title Plumbline - Server
cd /d "%~dp0"

if not exist "node_modules" (
  echo  Dependencies are missing. Run setup.bat first.
  pause
  exit /b 1
)
if not exist "web\dist\index.html" (
  echo  Web build is missing. Run setup.bat first.
  pause
  exit /b 1
)

echo.
echo  Starting Plumbline on http://localhost:4000
echo  (demo data is created automatically on the very first start)
echo  Keep this window open while using the app. Close it to stop the server.
echo.

REM Open the browser a few seconds after the server starts
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:4000"

call npm start
pause
