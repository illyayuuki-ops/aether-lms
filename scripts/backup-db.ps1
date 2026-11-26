# backup-db.ps1 — safe PostgreSQL backup for Aether LMS
#
# Writes a timestamped pg_dump OUTSIDE the repository so it can never be
# committed (dumps contain real student data and must stay out of git).
#
# Usage (on the server PC):
#   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -Database aether_lms -BackupDir D:\backups
#
# Requires pg_dump on PATH (ships with PostgreSQL; on Windows it lives in
# C:\Program Files\PostgreSQL\<version>\bin).

param(
  [string]$Database  = "aether_lms",
  [string]$BackupDir = "$HOME\aether-lms-backups",
  [string]$PgHost    = "localhost",
  [string]$PgPort    = "5432",
  [string]$PgUser    = "postgres"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump was not found on PATH. Add C:\Program Files\PostgreSQL\<version>\bin to PATH and retry."
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file  = Join-Path $BackupDir "$Database-$stamp.sql"

Write-Host "Backing up '$Database' to $file ..."
# -Fp plain SQL, so it can be restored with psql -f when needed.
& pg_dump -h $PgHost -p $PgPort -U $PgUser -Fp -f $file $Database

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE."
}

$sizeMb = [math]::Round((Get-Item $file).Length / 1MB, 2)
Write-Host "Done: $file ($sizeMb MB)"

# Keep only the 14 most recent backups.
Get-ChildItem $BackupDir -Filter "$Database-*.sql" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 14 |
  ForEach-Object {
    Write-Host "Removing old backup: $($_.Name)"
    Remove-Item $_.FullName -Force
  }

Write-Host ""
Write-Host "IMPORTANT: this folder is outside the repo on purpose."
Write-Host "Never copy these .sql files into the project directory."
