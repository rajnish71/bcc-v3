import glob
import os
import sys

# Ensure parent directory is in Python path for importing lib
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from lib.db_connection import execute_sql_file


def main():
    seed_files = sorted(glob.glob("database/seeds/*.sql"))

    print("=== Running seeds ===")
    for filepath in seed_files:
        filename = os.path.basename(filepath)
        print(f"RUNNING {filename}...")
        res = execute_sql_file(filepath)
        if res.returncode != 0:
            print(f"ERROR running {filename}:")
            print(res.stderr)
            sys.exit(1)
        print(f"OK      {filename}\n")

    print("=== Seeds run complete ===")


if __name__ == "__main__":
    main()
