# ============================================================================
# Energy-Pilot Local BMS Setup Script
# Restores METRO_BHAWAN.bak and configures the application
# ============================================================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Energy-Pilot Local BMS Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Configuration
$SqlInstance = "localhost"
$BackupFile = "D:\Applications\Energy-Pilot\Energy-Pilot\METRO_BHAWAN.bak"
$DatabaseName = "METRO_BHAWAN"
$RepoPath = "D:\Applications\Energy-Pilot\Energy-Pilot"

# Step 1: Check SQL Server Connection
Write-Host "`n[STEP 1] Checking SQL Server Connection..." -ForegroundColor Yellow
try {
    $TestQuery = "SELECT @@VERSION"
    $Result = sqlcmd -S $SqlInstance -Q $TestQuery -h -1 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SQL Server is accessible at: $SqlInstance" -ForegroundColor Green
    } else {
        Write-Host "❌ Could not connect to SQL Server" -ForegroundColor Red
        Write-Host "Make sure SQL Server is running and you have permission to connect" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error checking SQL Server: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Check if backup file exists
Write-Host "`n[STEP 2] Checking backup file..." -ForegroundColor Yellow
if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ Backup file not found at: $BackupFile" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✅ Backup file found: $BackupFile" -ForegroundColor Green
    $BackupSize = (Get-Item $BackupFile).Length / 1MB
    Write-Host "   Size: $([Math]::Round($BackupSize, 2)) MB" -ForegroundColor Gray
}

# Step 3: Check if database already exists
Write-Host "`n[STEP 3] Checking for existing database..." -ForegroundColor Yellow
$CheckDB = "SELECT COUNT(*) FROM sys.databases WHERE name = '$DatabaseName'"
$DbExists = sqlcmd -S $SqlInstance -Q $CheckDB -h -1 2>&1

if ($DbExists -gt 0) {
    Write-Host "⚠️  Database '$DatabaseName' already exists" -ForegroundColor Yellow
    $Response = Read-Host "Do you want to drop and recreate it? (yes/no)"
    if ($Response -eq "yes") {
        Write-Host "Dropping existing database..." -ForegroundColor Yellow
        sqlcmd -S $SqlInstance -Q "ALTER DATABASE [$DatabaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DatabaseName];" 2>&1 | Out-Null
        Write-Host "✅ Database dropped" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Using existing database '$DatabaseName'" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Database '$DatabaseName' does not exist (will be created)" -ForegroundColor Green
}

# Step 4: Restore database from backup
Write-Host "`n[STEP 4] Restoring database from backup..." -ForegroundColor Yellow
Write-Host "This may take a minute or two..." -ForegroundColor Gray

$RestoreScript = @"
RESTORE DATABASE [$DatabaseName] 
FROM DISK = N'$BackupFile'
WITH 
    FILE = 1,
    MOVE 'METRO_BHAWAN' TO 'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\$DatabaseName.mdf',
    MOVE 'METRO_BHAWAN_log' TO 'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\$DatabaseName.ldf',
    NOUNLOAD,
    REPLACE,
    STATS = 10
"@

$RestoreScript | sqlcmd -S $SqlInstance 2>&1 | Tee-Object -Variable RestoreOutput | Out-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database restored successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to restore database" -ForegroundColor Red
    Write-Host "Error details above" -ForegroundColor Red
    exit 1
}

# Step 5: Verify restored database
Write-Host "`n[STEP 5] Verifying database..." -ForegroundColor Yellow
$VerifyQuery = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES"
$Tables = sqlcmd -S $SqlInstance -d $DatabaseName -Q $VerifyQuery -h -1 2>&1
$TableCount = ($Tables | Measure-Object).Count
Write-Host "✅ Found $TableCount tables in the database" -ForegroundColor Green

# Step 6: Update .env file
Write-Host "`n[STEP 6] Updating .env configuration..." -ForegroundColor Yellow
$EnvFile = Join-Path $RepoPath ".env"
$EnvContent = @"
# Environment variables for development
NODE_ENV=development
SESSION_SECRET=metro-bhawan-demo-secret-key-2026

# SQL Server BMS Connection (METRO_BHAWAN)
BMS_SERVER=localhost
BMS_DATABASE=$DatabaseName
BMS_USER=sa
BMS_PASSWORD=

# BMS Sync Settings
BMS_SYNC_INTERVAL=2
BMS_VENDOR=loytec

# Optional: PostgreSQL for future use (commented out for now)
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/energy_pilot
"@

Set-Content -Path $EnvFile -Value $EnvContent -Encoding UTF8
Write-Host "✅ Updated .env file" -ForegroundColor Green

# Step 7: Summary
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "✅ LOCAL SETUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "`nDatabase Details:" -ForegroundColor Yellow
Write-Host "  Server: $SqlInstance"
Write-Host "  Database: $DatabaseName"
Write-Host "  Status: Ready"
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  1. npm install  (if not already installed)"
Write-Host "  2. npm run dev  (starts the application)"
Write-Host "`nThe app will be available at: http://localhost:5000" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan
