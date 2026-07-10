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

# Step 1: Recreate database
print("Recreating database...")
recreate_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u root -p"Meera2103@" -e "DROP DATABASE IF EXISTS bcc_v3; CREATE DATABASE bcc_v3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON bcc_v3.* TO \'bcc_v3_app\'@\'localhost\'; GRANT ALL PRIVILEGES ON bcc_v3.* TO \'bcc_v3_app\'@\'127.0.0.1\'; GRANT ALL PRIVILEGES ON bcc_v3.* TO \'bcc_v3_app\'@\'%\'; FLUSH PRIVILEGES;"'
subprocess.run(recreate_cmd, shell=True)

# Step 2: Ensure schema_migrations table is created
print("Creating schema_migrations...")
init_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < database/migrations/0000_create_schema_migrations.sql'
subprocess.run(init_cmd, shell=True)
log_init = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "INSERT INTO schema_migrations (filename) VALUES (\'0000_create_schema_migrations.sql\')"'
subprocess.run(log_init, shell=True)

# Step 3: Run migrations 0001 to 0034
migration_files = sorted(glob.glob("database/migrations/*.sql"))
for filepath in migration_files:
    filename = os.path.basename(filepath)
    if filename in ["0000_create_schema_migrations.sql", "0035_migration_track_c_legacy_members.sql", "0036_journal_schema.sql", "0037_create_contact_messages.sql"]:
        continue
        
    print(f"APPLYING {filename}...")
    run_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
    res = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR: {res.stderr}")
        sys.exit(1)
        
    log_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "INSERT INTO schema_migrations (filename) VALUES (\'{filename}\')"'
    subprocess.run(log_cmd, shell=True)

# Step 4: Insert admin user Rajnish Khare (user_id=1)
print("Seeding Admin User (Rajnish Khare)...")
admin_sql = (
    "INSERT INTO users "
    "(id, uuid, email, phone, password_hash, full_name, status, username, "
    "city, state, country, registration_method, force_password_reset, created_by, "
    "created_at, updated_at) "
    "VALUES "
    "(1, UUID(), 'admin@bhopal.info', '+919826010001', "
    "'$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y', "
    "'Rajnish Khare', 'ACTIVE', 'rajnishkhare', "
    "'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 0, NULL, NOW(), NOW())"
)
insert_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} -e "{admin_sql}"'
res = subprocess.run(insert_cmd, shell=True, capture_output=True, text=True)
if res.returncode != 0:
    print(f"ERROR inserting admin: {res.stderr}")
    sys.exit(1)

# Step 5: Run remaining migrations 0035, 0036, 0037
for num in ["0035", "0036", "0037"]:
    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename.startswith(num):
            print(f"APPLYING {filename}...")
            run_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
            res = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)
            if res.returncode != 0:
                print(f"ERROR: {res.stderr}")
                sys.exit(1)

# Step 6: Run seeds
print("Running seeds...")
seed_files = sorted(glob.glob("database/seeds/*.sql"))
for filepath in seed_files:
    filename = os.path.basename(filepath)
    print(f"SEEDING {filename}...")
    run_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
    res = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR: {res.stderr}")
        sys.exit(1)

print("=== DEV DB SETUP COMPLETE ===")
