@echo off
setlocal
set "ROOT=%~dp0..\.."
set "YARN_CMD=yarn"
where yarn >nul 2>&1
if errorlevel 1 set "YARN_CMD=corepack yarn"
cd /d "%ROOT%\frontend"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\sync_release_version.ps1"
if errorlevel 1 exit /b 1
echo == Building React bundle for desktop ==
call %YARN_CMD% build:desktop
if errorlevel 1 exit /b 1
cd desktop
echo == Installing desktop dependencies ==
call %YARN_CMD% install
if errorlevel 1 exit /b 1
echo == Building Windows installer ==
if not defined CSC_LINK set CSC_IDENTITY_AUTO_DISCOVERY=false
if defined CSC_LINK echo Signing enabled: CSC_LINK is set
call %YARN_CMD% build:win
if errorlevel 1 exit /b 1
echo.
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"`) do set "DESKTOP_VER=%%V"
if not defined DESKTOP_VER (
  echo ERROR: could not read version from desktop\package.json
  exit /b 1
)
if not exist "C:\Users\smash\Desktop\SSC" mkdir "C:\Users\smash\Desktop\SSC"
if not exist "dist\SSC-Setup-%DESKTOP_VER%.exe" (
  echo ERROR: dist\SSC-Setup-%DESKTOP_VER%.exe not found — check desktop\package.json version
  exit /b 1
)
copy /Y "dist\SSC-Setup-%DESKTOP_VER%.exe" "C:\Users\smash\Desktop\SSC\SSC-Setup-%DESKTOP_VER%.exe"
echo.
echo DONE: frontend\desktop\dist\SSC-Setup-%DESKTOP_VER%.exe
echo       C:\Users\smash\Desktop\SSC\SSC-Setup-%DESKTOP_VER%.exe
endlocal