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
    Stage = "C:\b2bapk\portal"
    OutputName = "portal-test.apk"
    ExpectedPackage = "com.bakircilar.portal"
    ExpectedRoleMessage = "Bu uygulama personel hesaplari icindir."
  },
  @{
    Key = "b2b"
    Label = "Musteri B2B"
    Source = Join-Path $mobileRoot "b2b"
    Stage = "C:\b2bapk\b2b"
    OutputName = "b2b-test.apk"
    ExpectedPackage = "com.bakircilar.b2b"
    ExpectedRoleMessage = "Bu uygulama musteri hesaplari icindir."
  }
)

function Assert-AppIdentity {
  param(
    [hashtable]$Config,
    [string]$Root
  )

  $appJsonPath = Join-Path $Root "app.json"
  $roleScreenPath = Join-Path $Root "src\screens\RoleMismatchScreen.tsx"
  $appJson = Get-Content -Raw -LiteralPath $appJsonPath | ConvertFrom-Json
  $actualPackage = [string]$appJson.expo.android.package
  $roleScreen = Get-Content -Raw -LiteralPath $roleScreenPath

  if ($actualPackage -ne $Config.ExpectedPackage) {
    throw "$($Config.Label) paket kimligi yanlis: $actualPackage (beklenen: $($Config.ExpectedPackage))"
  }
  if (-not $roleScreen.Contains($Config.ExpectedRoleMessage)) {
    throw "$($Config.Label) rol ekrani kimligi dogrulanamadi. Yanlis uygulama bundle'i paketleniyor olabilir."
  }
}

function Sync-Staging {
  param([hashtable]$Config)

  $stageRoot = Split-Path -Parent $Config.Stage
  if (-not ($Config.Stage -like "C:\b2bapk\*")) {
    throw "Staging hedefi beklenen kok altinda degil: $($Config.Stage)"
  }

  New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

  $excludedDirs = @(
    (Join-Path $Config.Source ".expo"),
    (Join-Path $Config.Source "_expo_template_tmp"),
    (Join-Path $Config.Source "android\.gradle"),
    (Join-Path $Config.Source "android\build"),
    (Join-Path $Config.Source "android\app\build"),
    (Join-Path $Config.Source "node_modules\react-native-reanimated\android\.cxx"),
    (Join-Path $Config.Source "node_modules\expo-modules-core\android\.cxx"),
    (Join-Path $Config.Source "node_modules\react-native-screens\android\.cxx"),
    (Join-Path $Config.Source "node_modules\react-native-worklets\android\.cxx")
  )

  Write-Host "Staging sync: $($Config.Stage)" -ForegroundColor DarkCyan
  & robocopy $Config.Source $Config.Stage /E /NFL /NDL /NJH /NJS /NP /XD $excludedDirs
  if ($LASTEXITCODE -ge 8) {
    throw "$($Config.Label) staging sync basarisiz oldu. Robocopy exit code: $LASTEXITCODE"
  }

  Assert-AppIdentity -Config $Config -Root $Config.Stage
}

function Build-App {
  param([hashtable]$Config)

  $androidDir = Join-Path $Config.Stage "android"
  $apkPath = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
  $destPath = Join-Path $buildsDir $Config.OutputName

  Write-Host ""
  Write-Host "==> $($Config.Label) Android standalone test APK" -ForegroundColor Cyan
  Assert-AppIdentity -Config $Config -Root $Config.Source
  Sync-Staging -Config $Config

  Push-Location $Config.Stage
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
    $env:NODE_ENV = "production"
    $gradleArgs = @(":app:assembleRelease", "-x", "lint", "-x", "test")
    if (-not $NoClean) {
      $gradleArgs = @(":app:clean") + $gradleArgs
    }
    & ".\gradlew.bat" @gradleArgs
    if ($LASTEXITCODE -ne 0) {
      throw "$($Config.Label) standalone test APK build basarisiz oldu. Exit code: $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $apkPath)) {
    throw "Release APK uretildi gorunmuyor: $apkPath"
  }

  Copy-Item -Force $apkPath $destPath
  $apk = Get-Item $destPath
  Write-Host "Standalone test APK hazir: $($apk.FullName) ($([Math]::Round($apk.Length / 1MB, 1)) MB)" -ForegroundColor Green
}

$selected = if ($App -eq "all") { $apps } else { $apps | Where-Object { $_.Key -eq $App } }

foreach ($config in $selected) {
  Build-App -Config $config
}

Write-Host ""
Write-Host "Android standalone test APK build tamamlandi." -ForegroundColor Green
