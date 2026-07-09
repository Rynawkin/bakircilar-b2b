param(
  [ValidateSet("portal", "b2b", "all")]
  [string]$App = "all",

  [string]$DeviceId = ""
)

if ($DeviceId) {
  & (Join-Path $PSScriptRoot "install-android-debug.ps1") -App $App -Variant test -DeviceId $DeviceId
} else {
  & (Join-Path $PSScriptRoot "install-android-debug.ps1") -App $App -Variant test
}
exit $LASTEXITCODE
