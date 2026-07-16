# BCC Unified Platform V3 — Next Session Starter
## Project identity
Full digital-ecosystem rebuild for Bhopal Camera Club.
Replacing legacy site at bcc.bhopal.info. Target domain: v3bcc.bhopal.info.
GitHub repo: rajnish71/bcc-v3. Server: bhopal-prod-01 (52.66.167.85).
Project root: /var/www/bcc-v3.

## Ground-truth hierarchy (priority order)
1. MEM-006 — Membership Constitution (frozen)
2. MEM-007 — Numbering Constitution (frozen)
3. TECH-STACK-FREEZE — Astro (frontend, static/Nginx) + NestJS/Fastify (backend)
   + MySQL/Kysely (no ORM). Stack is CLOSED.
4. PHASE_ROADMAP.md — phase status and sequencing.

## Infrastructure
- Single AWS EC2, Ubuntu 24.04, ~1.9GB RAM.
- Deploy: GitHub Actions CI/CD on push to master (npm run build + PM2 restart).
- PM2 runs backend as ubuntu user. MCP SSH user is ubuntu.
- MySQL V3 DB: bcc_v3. Legacy DB (read-only reference): bcc.
- Local clone: E:\WebProjects\BCC-V3 (Windows, filesystem MCP).

## MCP tools available
- bcc-aws-live: run_command (executes as ubuntu, passwordless sudo),
  read_file, list_directory, health_check, disk_usage.
- filesystem: write_file, read_file, list_directory, create_directory
  at E:\WebProjects\BCC-V3.
- Git operations (pull/push/commit) run locally by the user via PowerShell.
  Line-continuation in PowerShell uses backtick (`), NOT backslash.

## Reliable operational patterns
- PM2 status: pm2 jlist | python3 -c "import json,sys; d=json.load(sys.stdin);
  [print(p['name'], p['pm2_env']['status'], 'restarts:', p['pm2_env']['restart_time']) for p in d]"
- MySQL: mysql -u bcc_v3_app -p$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2) bcc_v3
- Error log: tail -40 /home/ubuntu/.pm2/logs/bcc-v3-backend-error.log
- schema_migrations column is filename (not migration_name)


Refer uploaded files : 
Bootstrap.md
SOURCE_INDEX.md
CLAUDE.md

Repository Locations :

Project Root
E:\WebProjects\BCC-V3

Authoritative Documentation
E:\WebProjects\BCC-V3\ProjectDocs

Engineering References
E:\WebProjects\BCC-V3\docs

Frontend
E:\WebProjects\BCC-V3\frontend

Backend
E:\WebProjects\BCC-V3\backend

Sanity Studio
E:\WebProjects\BCC-V3\studio

