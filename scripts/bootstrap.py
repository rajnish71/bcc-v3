#!/usr/bin/env python3
"""
BCC Unified Platform V3 — Bootstrap Runner
PLATFORM-BOOT-002

Modes:
  bootstrap  — Stage 1: Schema (A) + Canonical Seeds (B) + Reference Seeds (C)
               Result: Platform Operational (empty, ready for use)

  historical — Stage 2: Historical Data Import (D)
               Assumes existing production database or restored legacy data.
               Never executes automatically.

  verify     — Category E: read-only verification queries only.
               Never modifies data.

Usage:
  python scripts/bootstrap.py --mode bootstrap
  python scripts/bootstrap.py --mode historical
  python scripts/bootstrap.py --mode verify
"""

import os
import subprocess
import glob
import sys
import json
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)

# Credentials from backend/.env — never hardcoded
_env_path = os.path.join(REPO_ROOT, 'backend', '.env')
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

os.environ['MYSQL_PWD'] = DB_PASSWORD

MANIFEST_PATH  = os.path.join(REPO_ROOT, 'database', 'bootstrap-manifest.json')
MIGRATIONS_DIR = os.path.join(REPO_ROOT, 'database', 'migrations')
SEEDS_DIR      = os.path.join(REPO_ROOT, 'database', 'seeds')


def _mysql_base():
    return f'mysql --no-defaults -h {DB_HOST} -P {DB_PORT} -u {DB_USER} {DB_NAME}'


def mysql_exec(sql):
    cmd = f'{_mysql_base()} -e "{sql}"'
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)


def mysql_file(filepath):
    cmd = f'{_mysql_base()} < "{filepath}"'
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)


def load_manifest():
    with open(MANIFEST_PATH) as f:
        return json.load(f)


def is_applied(filename):
    res = mysql_exec(
        f"SELECT COUNT(*) FROM schema_migrations WHERE filename = '{filename}'"
    )
    lines = [l.strip() for l in res.stdout.strip().split('\n') if l.strip()]
    return lines[-1] == '1' if lines else False


def mark_applied(filename):
    mysql_exec(
        f"INSERT IGNORE INTO schema_migrations (filename) VALUES ('{filename}')"
    )


def ensure_schema_migrations():
    res = mysql_exec('SELECT 1 FROM schema_migrations LIMIT 1')
    if res.returncode != 0:
        print('Initialising schema_migrations table...')
        init_path = os.path.join(MIGRATIONS_DIR, '0000_create_schema_migrations.sql')
        subprocess.run(f'{_mysql_base()} < "{init_path}"', shell=True)
        mysql_exec(
            "INSERT INTO schema_migrations (filename) VALUES "
            "('0000_create_schema_migrations.sql')"
        )


def apply_migration(filepath):
    filename = os.path.basename(filepath)
    if is_applied(filename):
        print(f'SKIP   {filename}')
        return True
    print(f'APPLY  {filename}')
    res = mysql_file(filepath)
    if res.returncode != 0:
        print(f'ERROR  {filename}:')
        print(res.stderr)
        return False
    if not is_applied(filename):
        mark_applied(filename)
    print(f'OK     {filename}')
    return True


def apply_seed(seed_name, filepath):
    tracking_key = f'seeds/{seed_name}'
    if is_applied(tracking_key):
        print(f'SKIP   {tracking_key}')
        return True
    print(f'SEED   {tracking_key}')
    res = mysql_file(filepath)
    if res.returncode != 0:
        print(f'ERROR  {tracking_key}:')
        print(res.stderr)
        return False
    mark_applied(tracking_key)
    print(f'OK     {tracking_key}')
    return True


# ─── Modes ────────────────────────────────────────────────────────────────────

def run_bootstrap(manifest):
    print('=' * 70)
    print('BOOTSTRAP MODE — Stage 1: Platform Bootstrap')
    print('Result: Platform Operational')
    print('=' * 70)
    print()

    d_set = set(manifest['migrations']['D'])
    e_set = set(manifest['migrations']['E'])
    skip_set = d_set | e_set

    ensure_schema_migrations()

    # ── Category A: Schema ────────────────────────────────────────────────────
    print('--- Category A: Schema ---')
    for filepath in sorted(glob.glob(os.path.join(MIGRATIONS_DIR, '*.sql'))):
        filename = os.path.basename(filepath)
        if filename == '0000_create_schema_migrations.sql':
            continue
        if filename in skip_set:
            cat = 'E' if filename in e_set else 'D'
            print(f'DEFER  {filename} (Category {cat})')
            continue
        if not apply_migration(filepath):
            sys.exit(1)

    print()
    # ── Category B+C: Seeds (auto-discovered from database/seeds/) ────────────
    print('--- Category B+C: Seeds ---')
    for filepath in sorted(glob.glob(os.path.join(SEEDS_DIR, '*.sql'))):
        seed_name = os.path.basename(filepath)
        if not apply_seed(seed_name, filepath):
            sys.exit(1)

    print()
    print('=' * 70)
    print('Bootstrap complete — Platform Operational')
    print('=' * 70)


def run_historical(manifest):
    print('=' * 70)
    print('HISTORICAL IMPORT MODE — Stage 2: Historical Data Import')
    print('Assumes existing production database or restored legacy data.')
    print('=' * 70)
    print()

    ensure_schema_migrations()
    e_set = set(manifest['migrations']['E'])

    print('--- Category D: Historical Data ---')
    for filename in manifest['migrations']['D']:
        if filename in e_set:
            continue
        filepath = os.path.join(MIGRATIONS_DIR, filename)
        if not os.path.exists(filepath):
            print(f'WARN   {filename} — file not found, skipping')
            continue
        if not apply_migration(filepath):
            sys.exit(1)

    print()
    print('=' * 70)
    print('Historical import complete')
    print('=' * 70)


def run_verify(manifest):
    print('=' * 70)
    print('VERIFICATION MODE — Category E: Read-only verification')
    print('No data will be modified.')
    print('=' * 70)
    print()

    for rel_path in manifest['verification']['E']:
        filepath = os.path.join(REPO_ROOT, rel_path)
        if not os.path.exists(filepath):
            print(f'WARN   {rel_path} — file not found, skipping')
            continue
        print(f'--- {rel_path} ---')
        res = mysql_file(filepath)
        if res.stdout.strip():
            print(res.stdout)
        if res.returncode != 0:
            print(f'ERROR: {res.stderr}')
        print()

    print('=' * 70)
    print('Verification complete — no data modified')
    print('=' * 70)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='BCC Unified Platform V3 — Bootstrap Runner (PLATFORM-BOOT-001)'
    )
    parser.add_argument(
        '--mode',
        choices=['bootstrap', 'historical', 'verify'],
        required=True,
        help=(
            'bootstrap: fresh installation — Schema + Canonical Seeds + Reference Seeds; '
            'historical: Stage 2 production data import — Category D only; '
            'verify: read-only Category E verification queries'
        )
    )
    args = parser.parse_args()

    manifest = load_manifest()

    if args.mode == 'bootstrap':
        run_bootstrap(manifest)
    elif args.mode == 'historical':
        run_historical(manifest)
    elif args.mode == 'verify':
        run_verify(manifest)


if __name__ == '__main__':
    main()
