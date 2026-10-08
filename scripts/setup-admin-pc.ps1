# Aether LMS - One-shot admin PC setup  
# Run ONCE from an Administrator PowerShell. Safe to re-run (idempotent).  
  
$ErrorActionPreference = "Stop"  
$root = Split-Path -Parent $PSScriptRoot  
Set-Location $root  
  
Write-Host ""  
Write-Host "=== Aether LMS - Admin PC Setup ===" -ForegroundColor Cyan  
Write-Host ""  
  
# 1. Install deps + build (web -> copy-public -> api). Skips kiosk .exe.  
Write-Host "[1/5] Installing dependencies and building server..." -ForegroundColor White  
pnpm install  
pnpm run build:server  
  
# 2. Scheduled task: auto-start server on boot (as SYSTEM)  
Write-Host "[2/5] Registering boot auto-start task..." -ForegroundColor White  
$taskName = "Aether LMS Server"  
$startScript = Join-Path $root "scripts\start-server.ps1"  
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue  
if ($existing) {  
    Write-Host "  -> Task already exists, skipping." -ForegroundColor Gray  
} else {  
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""  
    $trigger = New-ScheduledTaskTrigger -AtStartup  
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest  
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries  
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings  
    Write-Host "  -> Task registered." -ForegroundColor Gray  
}  
  
# 3. Firewall: allow inbound port 3000  
Write-Host "[3/5] Opening firewall port 3000..." -ForegroundColor White  
$ruleName = "Aether LMS Server (port 3000)"  
$fwRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue  
if ($fwRule) {  
    Write-Host "  -> Firewall rule already exists, skipping." -ForegroundColor Gray  
} else {  
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 | Out-Null  
    Write-Host "  -> Firewall rule added." -ForegroundColor Gray  
}  
  
# 4. PostgreSQL: set to start automatically (auto-detect service name)  
Write-Host "[4/5] Ensuring PostgreSQL auto-starts..." -ForegroundColor White  
$pg = Get-Service -Name "*postgres*" -ErrorAction SilentlyContinue | Select-Object -First 1  
if ($pg) {  
    Set-Service -Name $pg.Name -StartupType Automatic  
    if ($pg.Status -ne "Running") { Start-Service -Name $pg.Name }  
    Write-Host "  -> $($pg.Name) set to Automatic and running." -ForegroundColor Gray  
} else {  
    Write-Host "  -> No PostgreSQL service found. Install/check it manually." -ForegroundColor Yellow  
}  
  
# 5. Start the server task now and verify port 3000  
Write-Host "[5/5] Starting server and verifying..." -ForegroundColor White  
Start-ScheduledTask -TaskName $taskName  
Start-Sleep -Seconds 6  
$test = Test-NetConnection -ComputerName localhost -Port 3000 -WarningAction SilentlyContinue  
  
Write-Host ""  
Write-Host "=== Setup Summary ===" -ForegroundColor Cyan  
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
Write-Host "  Admin PC IP:     $ip"  
Write-Host "  Server URL:      http://$ip`:3000"  
Write-Host "  Admin panel:     http://localhost:3000/admin/login"  
Write-Host "  Port 3000 up:    $($test.TcpTestSucceeded)"  
Write-Host ""  
if ($test.TcpTestSucceeded) {  
    Write-Host "Server is running. Use http://$ip`:3000 as serverUrl on student PCs." -ForegroundColor Green  
} else {  
    Write-Host "Server did NOT respond on port 3000 - check the task and PostgreSQL." -ForegroundColor Red  
}  
Write-Host ""