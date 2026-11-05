@echo off
title Plumbline - Reset demo data
cd /d "%~dp0"
echo.
echo  This wipes ALL complaints, users and uploads and restores the demo data.
echo  Make sure the server (start.bat window) is closed first.
echo.
set /p CONFIRM=Type YES to continue:
if /i not "%CONFIRM%"=="YES" (
  echo  Cancelled.
  pause
  exit /b 0
)
call npm run reset
echo.
echo  Done. Run start.bat to launch.
pause
