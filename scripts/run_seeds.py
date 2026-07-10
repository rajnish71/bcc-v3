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

seed_files = sorted(glob.glob("database/seeds/*.sql"))

print("=== Running seeds ===")
for filepath in seed_files:
    filename = os.path.basename(filepath)
    print(f"RUNNING {filename}...")
    run_cmd = f'mysql -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
    res = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR running {filename}:")
        print(res.stderr)
        sys.exit(1)
    print(f"OK      {filename}\n")

print("=== Seeds run complete ===")
