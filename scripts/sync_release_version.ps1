# Keep .env.production.local + user-facing docs aligned with shipped builds.
param(
    [switch]$DryRun
)

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

if ((-not (Test-Path $EnvFile)) -and (-not $DryRun)) {
    throw "Missing $EnvFile (copy from .env.production.local.example)"
}

$ChangedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
function RepoPath([string]$path) {
    return $path.Replace($RepoRoot, "").TrimStart('\', '/').Replace("\", "/")
}
function Register-Change([string]$path) {
    [void]$ChangedFiles.Add((RepoPath $path))
}
function Write-IfChanged([string]$path, [string]$nextContent) {
    if (-not (Test-Path $path)) { return }
    $current = Get-Content $path -Raw
    if ($nextContent -ne $current) {
        Register-Change $path
        if (-not $DryRun) {
            Set-Content -Path $path -Value $nextContent -NoNewline
        }
    }
}
function Replace-Regex([string]$text, [string]$pattern, [string]$replacement) {
    return [regex]::Replace($text, $pattern, $replacement)
}
function Set-EnvLine([string]$text, [string]$key, [string]$value) {
    $pattern = "(?m)^$key=.*$"
    $line = "$key=$value"
    if ($text -match $pattern) {
        return Replace-Regex $text $pattern $line
    }
    return ($text.TrimEnd() + "`n$line`n")
}

if (Test-Path $EnvFile) {
    $envContent = Get-Content $EnvFile -Raw
    $envContent = Set-EnvLine $envContent "REACT_APP_SSC_VERSION" $AndroidVer
    $envContent = Set-EnvLine $envContent "REACT_APP_DESKTOP_VERSION" $DesktopVer
    $envContent = Set-EnvLine $envContent "REACT_APP_DOWNLOAD_WIN_URL" "https://www.supersecurechat.com/downloads/SSC-Setup-$DesktopVer.exe"
    $envContent = Set-EnvLine $envContent "REACT_APP_DOWNLOAD_APK_URL" "https://www.supersecurechat.com/downloads/SSC-app-release.apk"
    Write-IfChanged $EnvFile $envContent
} elseif ($DryRun) {
    Write-Host "DRY RUN: skipped missing frontend/.env.production.local"
}

$DocPatches = @(
    @{
        Path = Join-Path $RepoRoot "README.md"
        Patterns = @(
            @{ Pattern = 'Android v\d+\.\d+\.\d+\s*·\s*Windows v\d+\.\d+\.\d+'; Replacement = "Android v$AndroidVer · Windows v$DesktopVer" }
            @{ Pattern = 'SSC-Setup-\d+\.\d+\.\d+\.exe'; Replacement = "SSC-Setup-$DesktopVer.exe" }
            @{ Pattern = 'v\d+\.\d+\.\d+\sAPK\s\+\sv\d+\.\d+\.\d+\sWindows'; Replacement = "v$AndroidVer APK + v$DesktopVer Windows" }
        )
    }
    @{
        Path = Join-Path $RepoRoot "CONTRIBUTING.md"
        Patterns = @(
            @{ Pattern = 'Android v\d+\.\d+\.\d+\s*·\s*Windows v\d+\.\d+\.\d+'; Replacement = "Android v$AndroidVer · Windows v$DesktopVer" }
        )
    }
    @{
        Path = Join-Path (Join-Path $RepoRoot "docs") "KNOWN_ISSUES.md"
        Patterns = @(
            @{ Pattern = '\*\*Android APK:\*\*\s*v\d+\.\d+\.\d+\s*·\s*\*\*Windows desktop:\*\*\s*v\d+\.\d+\.\d+'; Replacement = "**Android APK:** v$AndroidVer · **Windows desktop:** v$DesktopVer" }
            @{ Pattern = 'SSC-Setup-\d+\.\d+\.\d+\.exe'; Replacement = "SSC-Setup-$DesktopVer.exe" }
        )
    }
    @{
        Path = Join-Path (Join-Path $RepoRoot "test_reports") "Q64_DEVICE_MATRIX.md"
        Patterns = @(
            @{ Pattern = '\*\*Release candidate:\*\*\s*`\d+\.\d+\.\d+`'; Replacement = ('**Release candidate:** `' + $DesktopVer + '`') }
        )
    }
    @{
        Path = Join-Path (Join-Path $RepoRoot "device-matrix") "RELEASE_CANDIDATE.json"
        Patterns = @(
            @{ Pattern = '"release_candidate_version"\s*:\s*"\d+\.\d+\.\d+"'; Replacement = "`"release_candidate_version`": `"$DesktopVer`"" }
        )
    }
)

foreach ($doc in $DocPatches) {
    if (-not (Test-Path $doc.Path)) { continue }
    $next = Get-Content $doc.Path -Raw
    foreach ($patch in $doc.Patterns) {
        $next = Replace-Regex $next $patch.Pattern $patch.Replacement
    }
    Write-IfChanged $doc.Path $next
}

if ($DryRun) {
    Write-Host "DRY RUN: sync_release_version would update $($ChangedFiles.Count) file(s):"
    foreach ($file in ($ChangedFiles | Sort-Object)) {
        Write-Host " - $file"
    }
    exit 0
}

Write-Host "OK: synced release versions to env + docs"
Write-Host "     Android/UI: $AndroidVer"
Write-Host "     Desktop:    $DesktopVer"
Write-Host "     Win URL:    SSC-Setup-$DesktopVer.exe"