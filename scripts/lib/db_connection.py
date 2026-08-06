import os
import subprocess
from pathlib import Path
from dotenv import dotenv_values
import pymysql


def get_env_path(env_path=None):
    """
    Resolves the path to backend/.env relative to the project root.
    """
    if env_path:
        return Path(env_path)

    current_file = Path(__file__).resolve()
    project_root = current_file.parent.parent.parent
    return project_root / "backend" / ".env"


def get_db_config(env_path=None):
    """
    Loads database configuration from backend/.env using python-dotenv.
    Falls back to environment variables or defaults if keys are missing.
    """
    target_env = get_env_path(env_path)
    env_config = dotenv_values(target_env) if target_env.exists() else {}

    host = env_config.get("DB_HOST") or os.getenv("DB_HOST", "127.0.0.1")
    port = int(env_config.get("DB_PORT") or os.getenv("DB_PORT", "3306"))
    user = env_config.get("DB_USER") or os.getenv("DB_USER", "bcc_v3_app")
    password = env_config.get("DB_PASSWORD") or os.getenv("DB_PASSWORD", "")
    database = env_config.get("DB_NAME") or os.getenv("DB_NAME", "bcc_v3")

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "database": database,
    }


def get_db_connection(env_path=None, autocommit=True):
    """
    Establishes and returns a PyMySQL connection using loaded configuration.
    """
    config = get_db_config(env_path)
    connection = pymysql.connect(
        host=config["host"],
        port=config["port"],
        user=config["user"],
        password=config["password"],
        database=config["database"],
        autocommit=autocommit,
        cursorclass=pymysql.cursors.DictCursor,
    )
    return connection


def execute_sql_file(filepath, env_path=None):
    """
    Executes a SQL file directly using mysql CLI via subprocess (shell=False).
    Passes credentials securely via an isolated child-process environment (MYSQL_PWD),
    preventing password exposure in process listings (`ps`).
    """
    config = get_db_config(env_path)
    cmd = [
        "mysql",
        f"--host={config['host']}",
        f"--port={config['port']}",
        f"--user={config['user']}",
        config["database"],
    ]

    env = os.environ.copy()
    env["MYSQL_PWD"] = config["password"]

    with open(filepath, "r", encoding="utf-8") as f:
        res = subprocess.run(
            cmd,
            stdin=f,
            env=env,
            capture_output=True,
            text=True,
            shell=False,
        )

    return res
