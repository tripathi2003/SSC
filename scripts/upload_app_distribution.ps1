# Upload release APK to Firebase App Distribution (TASK N.7)
$ErrorActionPreference = "Stop"
$Apk = "C:\Users\smash\Desktop\SSC\APK\SSC-app-release.apk"
$AppId = "1:814078411789:android:84b1543debc1a7afc68144"
$Version = "1.0.20"

if (-not (Test-Path $Apk)) {
    throw "APK not found: $Apk - run SSC-BUILD-APK.bat first"
}
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    throw "firebase CLI not found"
}

$notes = "SSC v$Version - supersecurechat.com"
Write-Host "Uploading to Firebase App Distribution..."
firebase appdistribution:distribute $Apk --app $AppId --release-notes $notes --groups "testers"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Retry without --groups (add testers in Firebase Console first)"
    firebase appdistribution:distribute $Apk --app $AppId --release-notes $notes
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK - copy tester invite link from Firebase Console"
    Write-Host "https://console.firebase.google.com/project/super-chat-b0992/appdistribution"
    Write-Host "Set REACT_APP_DOWNLOAD_ANDROID_BETA_URL in .env.production.local and redeploy hosting"
}