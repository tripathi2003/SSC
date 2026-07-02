# Keep .env.production.local, website labels, and download URLs aligned with shipped builds.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $RepoRoot "frontend\.env.production.local"
$DesktopPkg = Get-Content (Join-Path $RepoRoot "frontend\desktop\package.json") -Raw | ConvertFrom-Json
$AndroidGradle = Get-Content (Join-Path $RepoRoot "frontend\android\app\build.gradle") -Raw
$DesktopVer = $DesktopPkg.version
if ($AndroidGradle -match 'versionName\s+"([^"]+)"') {
    $AndroidVer = $Matches[1]
} else {
    $AndroidVer = $DesktopVer
}
if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile (copy from .env.production.local.example)"
}
$content = Get-Content $EnvFile -Raw
function Set-EnvLine([string]$text, [string]$key, [string]$value) {
    $pattern = "(?m)^$key=.*$"
    $line = "$key=$value"
    if ($text -match $pattern) {
        return [regex]::Replace($text, $pattern, $line)
    }
    return ($text.TrimEnd() + "`n$line`n")
}
$content = Set-EnvLine $content "REACT_APP_SSC_VERSION" $AndroidVer
$content = Set-EnvLine $content "REACT_APP_DESKTOP_VERSION" $DesktopVer
$content = Set-EnvLine $content "REACT_APP_DOWNLOAD_WIN_URL" "https://www.supersecurechat.com/downloads/SSC-Setup-$DesktopVer.exe"
$content = Set-EnvLine $content "REACT_APP_DOWNLOAD_APK_URL" "https://www.supersecurechat.com/downloads/SSC-app-release.apk"
Set-Content -Path $EnvFile -Value $content -NoNewline
Write-Host "OK: synced release versions to .env.production.local"
Write-Host "     Android/UI: $AndroidVer"
Write-Host "     Desktop:    $DesktopVer"
Write-Host "     Win URL:    SSC-Setup-$DesktopVer.exe"