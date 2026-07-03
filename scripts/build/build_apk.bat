@echo off
setlocal
set "ROOT=%~dp0..\.."
set "YARN_CMD=yarn"
where yarn >nul 2>&1
if errorlevel 1 set "YARN_CMD=corepack yarn"

if not defined JAVA_HOME (
	for /d %%D in ("C:\Program Files\Microsoft\jdk-21*") do (
		if exist "%%D\bin\java.exe" set "JAVA_HOME=%%D"
	)
)
if not defined JAVA_HOME (
	for /d %%D in ("C:\Program Files\Microsoft\jdk-17*") do (
		if exist "%%D\bin\java.exe" set "JAVA_HOME=%%D"
	)
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%ROOT%\frontend"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\sync_release_version.ps1"
if errorlevel 1 exit /b 1
echo == Strip hosting installers from public/ (never bake APK/exe into mobile assets) ==
node scripts\strip-public-downloads.js
if errorlevel 1 exit /b 1
echo == Clean production web bundle (no source maps) ==
set GENERATE_SOURCEMAP=false
call %YARN_CMD% cap:sync
if errorlevel 1 exit /b 1
node scripts\strip-build-downloads.js
if errorlevel 1 exit /b 1
cd android
echo == Clean + release build (signed, R8, phone ABIs only) ==
call gradlew.bat clean bundleRelease assembleRelease
if errorlevel 1 exit /b 1
if not exist "C:\Users\smash\Desktop\SSC\APK" mkdir "C:\Users\smash\Desktop\SSC\APK"
copy /Y app\build\outputs\apk\release\app-release.apk C:\Users\smash\Desktop\SSC\APK\SSC-app-release.apk
copy /Y app\build\outputs\bundle\release\app-release.aab C:\Users\smash\Desktop\SSC\APK\SSC-app-release.aab
echo.
echo DONE (release — Google Play ready):
echo   APK  C:\Users\smash\Desktop\SSC\APK\SSC-app-release.apk
echo   AAB  C:\Users\smash\Desktop\SSC\APK\SSC-app-release.aab
echo Firebase App Distribution: upload SSC-app-release.apk
endlocal