# Build + deploy Firebase Hosting with release downloads (TASK N)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

& (Join-Path $PSScriptRoot "prepare_downloads.ps1")
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "prepare_downloads failed (exit $LASTEXITCODE)" }

Push-Location (Join-Path $RepoRoot "frontend")
try {
    $yarn = if (Get-Command yarn -ErrorAction SilentlyContinue) { "yarn" } else { "corepack yarn" }
    & $yarn build:firebase
    if ($LASTEXITCODE -ne 0) { throw "build:firebase failed" }
} finally {
    Pop-Location
}

Push-Location $RepoRoot
try {
    firebase deploy --only hosting
    if ($LASTEXITCODE -ne 0) { throw "firebase deploy failed" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "LIVE: https://www.supersecurechat.com"
Write-Host "APK:  https://www.supersecurechat.com/downloads/SSC-app-release.apk"
$DesktopPkg = Get-Content (Join-Path $RepoRoot "frontend\desktop\package.json") -Raw | ConvertFrom-Json
Write-Host "WIN:  https://www.supersecurechat.com/downloads/SSC-Setup-$($DesktopPkg.version).exe"