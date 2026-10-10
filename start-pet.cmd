@echo off
setlocal
cd /d "%~dp0"
title Desktop Pet

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js and try again.
  pause
  exit /b 1
)
for /f "delims=" %%A in ('node -p "process.arch"') do set "NODE_ARCH=%%A"
if /i "%NODE_ARCH%"=="ia32" (
  echo This project needs 64-bit Node.js, but 32-bit Node.js was found.
  echo Please install the x64 version of Node.js, then run this file again.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js and try again.
  pause
  exit /b 1
)

set "ELECTRON_SKIP_BINARY_DOWNLOAD="
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "npm_config_ignore_scripts=false"

if not exist "node_modules\electron\install.js" (
  call npm.cmd install --ignore-scripts=false --foreground-scripts
  if errorlevel 1 goto failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Downloading the Electron runtime. Please wait...
  node "node_modules\electron\install.js"
  if errorlevel 1 goto failed
)
if not exist "node_modules\electron\dist\electron.exe" goto failed

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Desktop Pet could not start. Please share the error shown above.
pause
exit /b 1
