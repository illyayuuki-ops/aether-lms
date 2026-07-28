# Aether LMS — Create database tables in PostgreSQL
# Run this ONCE on the admin PC (where PostgreSQL lives)

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl) {
    $DatabaseUrl = "postgresql://postgres:030306@localhost:5432/aether_lms"
    Write-Host "Using default DATABASE_URL. Edit this script or set DATABASE_URL env var if different." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Aether LMS — Database Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create the database (if it doesn't exist yet)
Write-Host "[1/2] Creating database 'aether_lms' (skip if already exists)..." -ForegroundColor White
$createDbSql = "SELECT 'CREATE DATABASE aether_lms' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aether_lms')\gexec"
Write-Host "  Run this in DBeaver or psql if needed:" -ForegroundColor Gray
Write-Host "  CREATE DATABASE aether_lms;" -ForegroundColor Gray
Write-Host ""

# Step 2: Push schema
Write-Host "[2/2] Creating tables (students, sessions, admins, pc_settings)..." -ForegroundColor White
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$env:DATABASE_URL = $DatabaseUrl
pnpm --dir lib/db run push

Write-Host ""
Write-Host "Done! Tables are ready." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run: pnpm run start:server   (starts the app on admin PC)"
Write-Host "  2. Open browser: http://localhost:3000/admin/login"
Write-Host "  3. Login: admin / admin123  (change password after first login)"
Write-Host ""
