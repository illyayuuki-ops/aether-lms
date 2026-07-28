# Aether LMS - Start the server on the ADMIN PC
# This runs the API + website. All kiosk PCs connect to this machine.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Load .env from api-server if present
$envFile = Join-Path $root "artifacts\api-server\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgresql://postgres:030306@localhost:5432/aether_lms"
}

$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:HOST = "0.0.0.0"

Write-Host ""
Write-Host "=== Aether LMS Server ===" -ForegroundColor Cyan
Write-Host "Database: $($env:DATABASE_URL -replace ':[^:@]+@', ':***@')"
Write-Host "Listening: http://0.0.0.0:3000  (all network PCs can connect)"
Write-Host ""
Write-Host "Librarian panel: http://localhost:3000/admin/login"
Write-Host "Press Ctrl+C to stop"
Write-Host ""

# Build if dist doesn't exist
$distIndex = Join-Path $root "artifacts\api-server\dist\index.mjs"
if (-not (Test-Path $distIndex)) {
    Write-Host "Building server first..." -ForegroundColor Yellow
    pnpm --dir artifacts/api-server run build
}

node "$root\artifacts\api-server\dist\index.mjs"
