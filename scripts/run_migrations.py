import os
import subprocess
import glob
import sys

# Load from backend/.env so dev (SSH tunnel) and prod (direct) use the right credentials.
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend', '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _k, _, _v = _line.strip().partition('=')
            if _k and not _k.startswith('#') and _k not in os.environ:
                os.environ[_k] = _v

DB_HOST     = os.environ.get('DB_HOST',     '127.0.0.1')
DB_PORT     = os.environ.get('DB_PORT',     '3307')
DB_USER     = os.environ.get('DB_USER',     'bcc_v3_app')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_NAME     = os.environ.get('DB_NAME',     'bcc_v3')

os.environ["MYSQL_PWD"] = DB_PASSWORD

# Ensure database exists and schema_migrations table is created
check_table = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "SELECT 1 FROM schema_migrations LIMIT 1"'
res = subprocess.run(check_table, shell=True, capture_output=True, text=True)

if res.returncode != 0:
    print("Creating schema_migrations table...")
    init_cmd = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < database/migrations/0000_create_schema_migrations.sql'
    subprocess.run(init_cmd, shell=True)
    log_init = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "INSERT INTO schema_migrations (filename) VALUES (\'0000_create_schema_migrations.sql\')"'
    subprocess.run(log_init, shell=True)

migration_files = sorted(glob.glob("database/migrations/*.sql"))

for filepath in migration_files:
    filename = os.path.basename(filepath)
    
    check_applied = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -N -e "SELECT COUNT(*) FROM schema_migrations WHERE filename = \'{filename}\'"'
    res = subprocess.run(check_applied, shell=True, capture_output=True, text=True)
    
    applied = res.stdout.strip()
    if applied == "1":
        print(f"SKIP   {filename} (already applied)")
        continue
        
    print(f"APPLY  {filename}")
    run_migration = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
    res_run = subprocess.run(run_migration, shell=True, capture_output=True, text=True)
    
    if res_run.returncode != 0:
        print(f"ERROR applying {filename}:")
        print(res_run.stderr)
        sys.exit(1)
        
    log_migration = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "INSERT INTO schema_migrations (filename) VALUES (\'{filename}\')"'
    subprocess.run(log_migration, shell=True)
    print(f"OK     {filename}\n")

print("=== Migration run complete — applied migrations: ===")
list_migrations = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "SELECT filename, applied_at FROM schema_migrations ORDER BY id"'
subprocess.run(list_migrations, shell=True)
