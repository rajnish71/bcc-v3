import os
import subprocess
import glob
import sys

DB_HOST = "127.0.0.1"
DB_PORT = "3307"
DB_USER = "bcc_v3_app"
DB_PASSWORD = "zAkuexH3yylvsguMNXwfeFXf"
DB_NAME = "bcc_v3"

os.environ["MYSQL_PWD"] = DB_PASSWORD

# Ensure database exists and schema_migrations table is created
check_table = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "SELECT 1 FROM schema_migrations LIMIT 1"'
res = subprocess.run(check_table, shell=True, capture_output=True, text=True)

if res.returncode != 0:
    print("Creating schema_migrations table...")
    init_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < database/migrations/0000_create_schema_migrations.sql'
    subprocess.run(init_cmd, shell=True)
    log_init = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "INSERT INTO schema_migrations (filename) VALUES (\'0000_create_schema_migrations.sql\')"'
    subprocess.run(log_init, shell=True)

migration_files = sorted(glob.glob("database/migrations/*.sql"))

for filepath in migration_files:
    filename = os.path.basename(filepath)
    
    check_applied = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -N -e "SELECT COUNT(*) FROM schema_migrations WHERE filename = \'{filename}\'"'
    res = subprocess.run(check_applied, shell=True, capture_output=True, text=True)
    
    applied = res.stdout.strip()
    if applied == "1":
        print(f"SKIP   {filename} (already applied)")
        continue
        
    print(f"APPLY  {filename}")
    run_migration = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
    res_run = subprocess.run(run_migration, shell=True, capture_output=True, text=True)
    
    if res_run.returncode != 0:
        print(f"ERROR applying {filename}:")
        print(res_run.stderr)
        sys.exit(1)
        
    log_migration = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "INSERT INTO schema_migrations (filename) VALUES (\'{filename}\')"'
    subprocess.run(log_migration, shell=True)
    print(f"OK     {filename}\n")

print("=== Migration run complete — applied migrations: ===")
list_migrations = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "SELECT filename, applied_at FROM schema_migrations ORDER BY id"'
subprocess.run(list_migrations, shell=True)
