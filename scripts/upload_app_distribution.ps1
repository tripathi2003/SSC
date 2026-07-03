# Upload release APK to Firebase App Distribution (TASK N.7)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Apk = "C:\Users\smash\Desktop\SSC\APK\SSC-app-release.apk"
$AppId = "1:814078411789:android:84b1543debc1a7afc68144"
$AndroidGradle = Get-Content (Join-Path $RepoRoot "frontend\android\app\build.gradle") -Raw
if ($AndroidGradle -match 'versionName\s+"([^"]+)"') {
    $Version = $Matches[1]
} else {
    throw "Could not read versionName from frontend/android/app/build.gradle"
}

if (-not (Test-Path $Apk)) {
    throw "APK not found: $Apk - run SSC-BUILD-APK.bat first"
}
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    throw "firebase CLI not found"
}

$notes = "SSC v$Version - Android messaging fixes (sealed fallback, session persist, decrypt) - supersecurechat.com"
Write-Host "Uploading SSC v$Version to Firebase App Distribution..."
firebase appdistribution:distribute $Apk --app $AppId --release-notes $notes --groups "testers"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Retry without --groups (add testers in Firebase Console first)"
    firebase appdistribution:distribute $Apk --app $AppId --release-notes $notes
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK - Firebase App Distribution upload complete for v$Version"
    Write-Host "https://console.firebase.google.com/project/super-chat-b0992/appdistribution"
    Write-Host "Update REACT_APP_DOWNLOAD_ANDROID_BETA_URL in .env.production.local after copying the new tester link"
}