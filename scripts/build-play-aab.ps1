# Builds a Google Play–ready signed .aab (requires android/keystore.properties + simvest-release.keystore).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path 'android\keystore.properties')) {
  Write-Error 'Missing android\keystore.properties — copy android\keystore.properties.example and set passwords.'
}
npm run cap:sync:release
Set-Location android
.\gradlew.bat clean :app:bundleRelease
$aab = Resolve-Path 'app\build\outputs\bundle\release\app-release.aab'
Write-Host "`nSigned Play bundle ready:`n  $aab`n"
