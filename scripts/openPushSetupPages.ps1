# Opens the exact browser pages for push setup (Windows).
Start-Process 'https://console.firebase.google.com/'
Start-Sleep -Seconds 1
Start-Process 'https://dashboard.render.com/u/settings#api-keys'
$folder = Join-Path $PSScriptRoot '..\setup-input'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
explorer.exe $folder
Write-Host "Opened Firebase, Render API keys, and setup-input folder."
Write-Host "Follow PUSH_SETUP_START_HERE.md in the project root."
