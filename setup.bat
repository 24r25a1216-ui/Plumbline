@echo off
setlocal EnableDelayedExpansion
title Plumbline - Setup
cd /d "%~dp0"

echo.
echo  =====================================================
echo    Plumbline - Multi-Domain Grievance System : SETUP
echo  =====================================================
echo.

REM ---- 1. Node.js 22.13+ is required (uses the built-in node:sqlite) ----
where node >nul 2>&1
if errorlevel 1 goto :install_node
goto :check_version

:install_node
echo  [1/4] Node.js not found. Installing Node.js LTS via winget...
where winget >nul 2>&1
if errorlevel 1 (
  echo.
  echo  winget is not available on this PC.
  echo  Please install Node.js LTS manually from https://nodejs.org
  echo  then run setup.bat again.
  pause
  exit /b 1
)
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo  Node.js installation failed. Install it from https://nodejs.org and re-run setup.bat
  pause
  exit /b 1
)
REM Make the freshly installed node visible in this window
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js was installed. Please CLOSE this window and run setup.bat again.
  pause
  exit /b 0
)

:check_version
for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set NODE_MAJOR=%%a
  set NODE_MINOR=%%b
)
set NODE_OK=0
if !NODE_MAJOR! GTR 22 set NODE_OK=1
if !NODE_MAJOR! EQU 22 if !NODE_MINOR! GEQ 13 set NODE_OK=1
if !NODE_OK! EQU 0 (
  echo  Node.js !NODE_MAJOR!.!NODE_MINOR! is too old. Version 22.13 or newer is required.
  echo  Upgrading via winget...
  winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  Please CLOSE this window and run setup.bat again.
  pause
  exit /b 0
)
for /f %%v in ('node -v') do echo  [1/4] Node.js %%v found.

REM ---- 2. Configuration ----
if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo  [2/4] Created .env from .env.example
) else (
  echo  [2/4] .env present.
)
findstr /b /c:"JWT_SECRET=" ".env" >nul 2>&1
if errorlevel 1 (
  for /f %%s in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do echo JWT_SECRET=%%s>> ".env"
  echo        Generated a secure JWT_SECRET.
)

REM ---- 3. Dependencies ----
echo  [3/4] Installing dependencies (this can take a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  npm install failed. Check your internet connection and run setup.bat again.
  pause
  exit /b 1
)

REM ---- 4. Build the web app ----
echo  [4/4] Building the web interface...
call npm run build
if errorlevel 1 (
  echo  Build failed. See the messages above.
  pause
  exit /b 1
)

echo.
echo  =====================================================
echo    Setup complete.
echo    Double-click  start.bat  to launch Plumbline.
echo    Demo logins are in CREDENTIALS.txt
echo  =====================================================
echo.
pause
