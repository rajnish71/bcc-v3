# scripts/run_migrations.ps1
# Applies every .sql file in database/migrations/ in filename order, skipping
# any already recorded in schema_migrations. Safe to re-run at any time.

$DB_HOST = "127.0.0.1"
$DB_PORT = "3307"
$DB_USER = "bcc_v3_app"
$DB_PASSWORD = "zAkuexH3yylvsguMNXwfeFXf"
$DB_NAME = "bcc_v3"

$env:MYSQL_PWD = $DB_PASSWORD

Write-Host "=== Applying migrations ==="
Write-Host ""

$migrations = Get-ChildItem "database/migrations/*.sql" | Sort-Object Name

# We will create the schema_migrations table first if it doesn't exist
# We do this by executing 0000_create_schema_migrations.sql directly
Write-Host "Checking schema_migrations table..."
$testCmd = 'mysql -h ' + $DB_HOST + ' -P ' + $DB_PORT + ' -u ' + $DB_USER + ' ' + $DB_NAME + ' -e "SELECT 1 FROM schema_migrations LIMIT 1"'
$testRes = cmd /c $testCmd 2>$null
if ($lastExitCode -ne 0) {
    Write-Host "Creating schema_migrations table..."
    $initCmd = 'mysql -h ' + $DB_HOST + ' -P ' + $DB_PORT + ' -u ' + $DB_USER + ' ' + $DB_NAME + ' < "database/migrations/0000_create_schema_migrations.sql"'
    cmd /c $initCmd
}

foreach ($file in $migrations) {
    $filename = $file.Name
    
    # Check if migration was already applied
    $checkCmd = 'mysql -h ' + $DB_HOST + ' -P ' + $DB_PORT + ' -u ' + $DB_USER + ' ' + $DB_NAME + ' -e "SELECT COUNT(*) FROM schema_migrations WHERE filename = ''' + $filename + '''"'
    $res = cmd /c $checkCmd 2>$null
    
    if ($res -like "*1*") {
        Write-Host "SKIP   $filename (already applied)"
        continue
    }
    
    Write-Host "APPLY  $filename"
    # Execute SQL file
    $cmd = 'mysql -h ' + $DB_HOST + ' -P ' + $DB_PORT + ' -u ' + $DB_USER + ' ' + $DB_NAME + ' < "' + $file.FullName + '"'
    cmd /c $cmd
    
    # Log applied migration
    $logCmd = 'mysql -h ' + $DB_HOST + ' -P ' + $DB_PORT + ' -u ' + $DB_USER + ' ' + $DB_NAME + ' -e "INSERT INTO schema_migrations (filename) VALUES (''' + $filename + ''')"'
    cmd /c $logCmd
    Write-Host "OK     $filename"
    Write-Host ""
}

Write-Host "=== Migration run complete — applied migrations: ==="
$listCmd = 'mysql -h ' + $DB_HOST + ' -P ' + $DB_PORT + ' -u ' + $DB_USER + ' ' + $DB_NAME + ' -e "SELECT filename, applied_at FROM schema_migrations ORDER BY id"'
cmd /c $listCmd

Remove-Item env:MYSQL_PWD
