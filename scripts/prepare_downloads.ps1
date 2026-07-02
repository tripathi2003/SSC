# Copy release binaries into frontend/public/downloads for Firebase Hosting (TASK N.4 / Q.4)
# Run before: yarn build:firebase  /  firebase deploy --only hosting

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Dest = Join-Path $RepoRoot "frontend\public\downloads"
$DesktopDest = Join-Path $Dest "desktop"

$DesktopPkg = Get-Content (Join-Path $RepoRoot "frontend\desktop\package.json") -Raw | ConvertFrom-Json
$Version = $DesktopPkg.version

$ApkCandidates = @(
    (Join-Path $RepoRoot "frontend\android\app\build\outputs\apk\release\app-release.apk"),
    "C:\Users\smash\Desktop\SSC\APK\SSC-app-release.apk"
)
$WinCandidates = @(
    (Join-Path $RepoRoot "frontend\desktop\dist\SSC-Setup-$Version.exe"),
    "C:\Users\smash\Desktop\SSC\SSC-Setup-$Version.exe"
)
$LatestYmlSrc = Join-Path $RepoRoot "frontend\desktop\dist\latest.yml"

function Resolve-FirstExistingPath([string[]]$Candidates) {
    foreach ($path in $Candidates) {
        if (Test-Path $path) { return $path }
    }
    return $null
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
New-Item -ItemType Directory -Force -Path $DesktopDest | Out-Null

$ApkSrc = Resolve-FirstExistingPath $ApkCandidates
if (-not $ApkSrc) {
    Write-Warning "APK not found. Build with SSC-BUILD-APK.bat first."
} else {
    Copy-Item -Force $ApkSrc (Join-Path $Dest "SSC-app-release.apk")
    $mb = [math]::Round((Get-Item $ApkSrc).Length / 1MB, 1)
    Write-Host "OK: APK copied from $ApkSrc (${mb} MB)"
}

$WinSrc = Resolve-FirstExistingPath $WinCandidates
$DesktopFolder = "C:\Users\smash\Desktop\SSC"
if (-not $WinSrc) {
    Write-Warning "Windows installer not found. Build with SSC-BUILD-DESKTOP-WIN.bat first."
} else {
    New-Item -ItemType Directory -Force -Path $DesktopFolder | Out-Null
    $winName = "SSC-Setup-$Version.exe"
    Copy-Item -Force $WinSrc (Join-Path $Dest $winName)
    Copy-Item -Force $WinSrc (Join-Path $DesktopDest $winName)
    Copy-Item -Force $WinSrc (Join-Path $DesktopFolder $winName)
    foreach ($stale in @($Dest, $DesktopDest, $DesktopFolder)) {
        Get-ChildItem $stale -Filter "SSC-Setup-*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne $winName } |
            Remove-Item -Force
    }
    $mbWin = [math]::Round((Get-Item $WinSrc).Length / 1MB, 1)
    Write-Host "OK: Windows installer copied from $WinSrc (${mbWin} MB)"
    Write-Host "OK: Desktop SSC folder: $(Join-Path $DesktopFolder $winName)"
}

if (-not (Test-Path $LatestYmlSrc)) {
    Write-Warning "latest.yml not found: $LatestYmlSrc - run desktop yarn build:win to generate electron-updater feed"
} else {
    Copy-Item -Force $LatestYmlSrc (Join-Path $DesktopDest "latest.yml")
    Write-Host "OK: latest.yml copied to desktop feed"
}

Write-Host "Downloads folder: $Dest"
Write-Host "Desktop update feed: $DesktopDest"