param(
  [ValidateSet("portal", "b2b", "all")]
  [string]$App = "all",

  [switch]$NoClean
)

$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$buildsDir = Join-Path $mobileRoot "builds"
New-Item -ItemType Directory -Force -Path $buildsDir | Out-Null

$apps = @(
  @{
    Key = "portal"
    Label = "Portal/Admin"
    Source = Join-Path $mobileRoot "portal"
    Link = "C:\b2bp"
    OutputName = "portal-debug.apk"
  },
  @{
    Key = "b2b"
    Label = "Musteri B2B"
    Source = Join-Path $mobileRoot "b2b"
    Link = "C:\b2bb"
    OutputName = "b2b-debug.apk"
  }
)

function Ensure-Junction {
  param(
    [string]$Link,
    [string]$Target
  )

  if (Test-Path $Link) {
    $item = Get-Item $Link
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "$Link zaten var ama junction degil. Guvenli devam edemiyorum."
    }
    return
  }

  cmd /c "mklink /J `"$Link`" `"$Target`"" | Out-Host
}

function Build-App {
  param([hashtable]$Config)

  $androidDir = Join-Path $Config.Link "android"
  $apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
  $destPath = Join-Path $buildsDir $Config.OutputName

  Write-Host ""
  Write-Host "==> $($Config.Label) Android debug build" -ForegroundColor Cyan
  Ensure-Junction -Link $Config.Link -Target $Config.Source

  Push-Location $Config.Link
  try {
    Write-Host "Expo native config senkronize ediliyor..." -ForegroundColor DarkCyan
    & npm.cmd exec expo prebuild -- --platform android --no-install
    if ($LASTEXITCODE -ne 0) {
      throw "$($Config.Label) Expo prebuild basarisiz oldu. Exit code: $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $androidDir)) {
    throw "$androidDir bulunamadi. Once Expo native android klasoru olusturulmali."
  }

  Push-Location $androidDir
  try {
    $env:NODE_ENV = "development"
    $gradleArgs = @(":app:assembleDebug", "-x", "lint", "-x", "test")
    if (-not $NoClean) {
      $gradleArgs = @(":app:clean") + $gradleArgs
    }
    & ".\gradlew.bat" @gradleArgs
    if ($LASTEXITCODE -ne 0) {
      throw "$($Config.Label) Gradle build basarisiz oldu. Exit code: $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $apkPath)) {
    throw "APK uretildi gorunmuyor: $apkPath"
  }

  Copy-Item -Force $apkPath $destPath
  $apk = Get-Item $destPath
  Write-Host "APK hazir: $($apk.FullName) ($([Math]::Round($apk.Length / 1MB, 1)) MB)" -ForegroundColor Green
}

$selected = if ($App -eq "all") { $apps } else { $apps | Where-Object { $_.Key -eq $App } }

foreach ($config in $selected) {
  Build-App -Config $config
}

Write-Host ""
Write-Host "Android debug build tamamlandi." -ForegroundColor Green
