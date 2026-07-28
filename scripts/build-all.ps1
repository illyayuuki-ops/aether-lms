# Aether LMS - Build everything for school deployment
# Run on the admin PC (needs Node.js + pnpm installed)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "=== Aether LMS - Full Build ===" -ForegroundColor Cyan
Write-Host ""

# 1. Build React frontend into api-server/public
Write-Host "[1/3] Building website (React)..." -ForegroundColor White
$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:BASE_PATH = "/"
pnpm --dir artifacts/library-system run build

$srcPublic = Join-Path $root "artifacts\library-system\dist\public"
$destPublic = Join-Path $root "artifacts\api-server\public"
if (Test-Path $destPublic) { Remove-Item $destPublic -Recurse -Force }
Copy-Item $srcPublic $destPublic -Recurse
Write-Host "  -> Copied to artifacts/api-server/public" -ForegroundColor Gray

# 2. Build API server
Write-Host "[2/3] Building API server..." -ForegroundColor White
pnpm --dir artifacts/api-server run build

# 3. Build kiosk .exe (optional - needs electron deps)
Write-Host "[3/3] Building kiosk installer (.exe)..." -ForegroundColor White
if (-not (Test-Path (Join-Path $root "artifacts\kiosk-electron\node_modules"))) {
    pnpm --dir artifacts/kiosk-electron install
}
pnpm --dir artifacts/kiosk-electron run build

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Outputs:" -ForegroundColor Cyan
Write-Host "  Server:  artifacts/api-server/dist/"
Write-Host "  Kiosk:   artifacts/kiosk-electron/release/"
Write-Host ""
Write-Host "To run the server:  .\scripts\start-server.ps1"
Write-Host "Install kiosk .exe on each student PC, then set the admin IP in config."
Write-Host ""
