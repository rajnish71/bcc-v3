import glob
import os
import sys

# Ensure parent directory is in Python path for importing lib
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from lib.db_connection import execute_sql_file, get_db_connection


def main():
    conn = get_db_connection()

    # Ensure schema_migrations table exists
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT COUNT(*) AS cnt 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'
        """)
        table_exists = cursor.fetchone()["cnt"] > 0

    if not table_exists:
        print("Creating schema_migrations table...")
        init_file = os.path.join("database", "migrations", "0000_create_schema_migrations.sql")
        res = execute_sql_file(init_file)
        if res.returncode != 0:
            print("ERROR creating schema_migrations table:")
            print(res.stderr)
            sys.exit(1)

        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO schema_migrations (filename) 
                VALUES ('0000_create_schema_migrations.sql')
                ON DUPLICATE KEY UPDATE filename = filename
            """)

    migration_files = sorted(glob.glob("database/migrations/*.sql"))

    for filepath in migration_files:
        filename = os.path.basename(filepath)

        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) AS cnt FROM schema_migrations WHERE filename = %s",
                (filename,),
            )
            applied = cursor.fetchone()["cnt"]

        if applied > 0:
            print(f"SKIP   {filename} (already applied)")
            continue

        print(f"APPLY  {filename}")
        res_run = execute_sql_file(filepath)

        if res_run.returncode != 0:
            print(f"ERROR applying {filename}:")
            print(res_run.stderr)
            sys.exit(1)

        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO schema_migrations (filename) VALUES (%s)",
                (filename,),
            )
        print(f"OK     {filename}\n")

    print("=== Migration run complete — applied migrations: ===")
    with conn.cursor() as cursor:
        cursor.execute("SELECT filename, applied_at FROM schema_migrations ORDER BY id")
        rows = cursor.fetchall()
        print(f"{'filename':<60} {'applied_at'}")
        print("-" * 85)
        for row in rows:
            print(f"{row['filename']:<60} {row['applied_at']}")

    conn.close()


if __name__ == "__main__":
    main()
