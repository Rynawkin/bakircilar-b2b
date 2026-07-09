param(
  [ValidateSet("portal", "b2b", "all")]
  [string]$App = "all",

  [ValidateSet("test", "debug")]
  [string]$Variant = "test",

  [string]$DeviceId = ""
)

$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$buildsDir = Join-Path $mobileRoot "builds"

$apps = @(
  @{
    Key = "portal"
    Label = "Portal/Admin"
    DebugApk = Join-Path $buildsDir "portal-debug.apk"
    TestApk = Join-Path $buildsDir "portal-test.apk"
  },
  @{
    Key = "b2b"
    Label = "Musteri B2B"
    DebugApk = Join-Path $buildsDir "b2b-debug.apk"
    TestApk = Join-Path $buildsDir "b2b-test.apk"
  }
)

function Get-AdbCommand {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "adb bulunamadi. Android Platform Tools PATH'e ekli olmali."
  }
  return $cmd.Source
}

function Get-ConnectedDevices {
  param([string]$Adb)

  $lines = & $Adb devices
  return $lines |
    Select-Object -Skip 1 |
    ForEach-Object { ($_ -split "\s+")[0..1] -join " " } |
    Where-Object { $_ -match "\S+\s+device$" } |
    ForEach-Object { ($_ -split "\s+")[0] }
}

function Install-App {
  param(
    [hashtable]$Config,
    [string]$Adb,
    [string]$TargetDevice
  )

  $apkPath = if ($Variant -eq "debug") { $Config.DebugApk } else { $Config.TestApk }
  $buildScript = if ($Variant -eq "debug") { "build-android-debug.ps1" } else { "build-android-test-apk.ps1" }

  if (-not (Test-Path $apkPath)) {
    throw "$($Config.Label) APK bulunamadi: $apkPath. Once mobile/scripts/$buildScript calistirin."
  }

  Write-Host "==> $($Config.Label) kuruluyor ($Variant)" -ForegroundColor Cyan
  if ($TargetDevice) {
    & $Adb -s $TargetDevice install -r $apkPath
  } else {
    & $Adb install -r $apkPath
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$($Config.Label) APK kurulumu basarisiz oldu. Exit code: $LASTEXITCODE"
  }
}

$adb = Get-AdbCommand
$devices = Get-ConnectedDevices -Adb $adb

if ($DeviceId) {
  if (-not ($devices -contains $DeviceId)) {
    throw "Istenen cihaz bulunamadi: $DeviceId. Bagli cihazlar: $($devices -join ', ')"
  }
  $targetDevice = $DeviceId
} elseif ($devices.Count -eq 1) {
  $targetDevice = $devices[0]
} elseif ($devices.Count -gt 1) {
  throw "Birden fazla cihaz bagli. -DeviceId parametresi verin. Bagli cihazlar: $($devices -join ', ')"
} else {
  throw "Bagli Android cihaz/emulator yok. USB debugging acik cihaz baglayin veya emulator baslatin."
}

$selected = if ($App -eq "all") { $apps } else { $apps | Where-Object { $_.Key -eq $App } }

foreach ($config in $selected) {
  Install-App -Config $config -Adb $adb -TargetDevice $targetDevice
}

Write-Host ""
Write-Host "Android kurulum tamamlandi: $targetDevice" -ForegroundColor Green
