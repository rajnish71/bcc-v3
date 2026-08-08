import os
import subprocess
import glob
import sys

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

seed_files = sorted(glob.glob("database/seeds/*.sql"))

print("=== Running seeds ===")
for filepath in seed_files:
    filename = os.path.basename(filepath)
    print(f"RUNNING {filename}...")
    run_cmd = f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME} < "{filepath}"'
    res = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR running {filename}:")
        print(res.stderr)
        sys.exit(1)
    print(f"OK      {filename}\n")

print("=== Seeds run complete ===")
