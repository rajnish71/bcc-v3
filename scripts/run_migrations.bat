@echo off
setlocal enabledelayedexpansion

set DB_HOST=127.0.0.1
set DB_PORT=3307
set DB_USER=bcc_v3_app
set DB_PASSWORD=zAkuexH3yylvsguMNXwfeFXf
set DB_NAME=bcc_v3

set MYSQL_PWD=%DB_PASSWORD%

echo === Applying migrations ===

rem Ensure schema_migrations exists by applying 0000 first if needed
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% %DB_NAME% -e "SELECT 1 FROM schema_migrations LIMIT 1" >nul 2>nul
if errorlevel 1 (
    echo Creating schema_migrations table...
    mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% %DB_NAME% < database\migrations\0000_create_schema_migrations.sql
    mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% %DB_NAME% -e "INSERT INTO schema_migrations (filename) VALUES ('0000_create_schema_migrations.sql')"
)

for /f "tokens=*" %%f in ('dir /b /on database\migrations\*.sql') do (
    set applied=0
    for /f %%a in ('mysql -h !DB_HOST! -P !DB_PORT! -u !DB_USER! !DB_NAME! -N -e "SELECT COUNT[*] FROM schema_migrations WHERE filename = '%%f'"') do set applied=%%a
    
    if "!applied!"=="0" (
        echo APPLY %%f
        mysql -h !DB_HOST! -P !DB_PORT! -u !DB_USER! !DB_NAME! < database\migrations\%%f
        if errorlevel 1 (
            echo ERROR applying %%f
            exit /b 1
        )
        mysql -h !DB_HOST! -P !DB_PORT! -u !DB_USER! !DB_NAME! -e "INSERT INTO schema_migrations [filename] VALUES ['%%f']"
        echo OK %%f
        echo.
    ) else (
        echo SKIP %%f
    )
)

echo === Migrations complete ===
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% %DB_NAME% -e "SELECT filename, applied_at FROM schema_migrations ORDER BY id"
set MYSQL_PWD=
