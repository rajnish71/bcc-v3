BCC Unified Platform V3 — Next Session Starter
Project identity
Full digital-ecosystem rebuild for Bhopal Camera Club.
Replacing legacy site at bcc.bhopal.info. Target domain: v3bcc.bhopal.info.
GitHub repo: rajnish71/bcc-v3. Server: bhopal-prod-01 (52.66.167.85).
Project root: /var/www/bcc-v3.
Ground-truth hierarchy (priority order)

MEM-006 — Membership Constitution (frozen)
MEM-007 — Numbering Constitution (frozen)
TECH-STACK-FREEZE — Astro (frontend, static/Nginx) + NestJS/Fastify (backend)

MySQL/Kysely (no ORM). Stack is CLOSED.



PHASE\_ROADMAP.md — phase status and sequencing.

Infrastructure

Single AWS EC2, Ubuntu 24.04, \~1.9GB RAM.
Deploy: GitHub Actions CI/CD on push to master (npm run build + PM2 restart).
PM2 runs backend as ubuntu user. MCP SSH user is ubuntu.
MySQL V3 DB: bcc\_v3. Legacy DB (read-only reference): bcc.
Local clone: E:\\WebProjects\\BCC-V3 (Windows, filesystem MCP).

MCP tools available

bcc-aws-live: run\_command (executes as ubuntu, passwordless sudo),
read\_file, list\_directory, health\_check, disk\_usage.
filesystem: write\_file, read\_file, list\_directory, create\_directory
at E:\\WebProjects\\BCC-V3.
Git operations (pull/push/commit) run locally by the user via PowerShell.
Line-continuation in PowerShell uses backtick (`), NOT backslash.

Reliable operational patterns

PM2 status: pm2 jlist | python3 -c "import json,sys; d=json.load(sys.stdin);
\[print(p\['name'], p\['pm2\_env']\['status'], 'restarts:', p\['pm2\_env']\['restart\_time']) for p in d]"
MySQL: mysql -u bcc\_v3\_app -p$(grep DB\_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2) bcc\_v3
Error log: tail -40 /home/ubuntu/.pm2/logs/bcc-v3-backend-error.log
schema\_migrations column is filename (not migration\_name)



## Authoritative Project Documents



Bootstrap:

E:\\WebProjects\\BCC-V3\\ProjectDocs\\Bootstrap.md



Environment:

E:\\WebProjects\\BCC-V3\\backend\\.env



Architecture:

E:\\WebProjects\\BCC-V3\\ProjectDocs\\BCC\_Unified\_Platform\_Specification\_v3.md

E:\\WebProjects\\BCC-V3\\ProjectDocs\\TECH-STACK-FREEZE.md

E:\\WebProjects\\BCC-V3\\ProjectDocs\\PHASE\_ROADMAP.md

E:\\WebProjects\\BCC-V3\\ProjectDocs\\legacysystemdesign.md

E:\\WebProjects\\BCC-V3\\ProjectDocs\\CLAUDE.md



Governance:

E:\\WebProjects\\BCC-V3\\ProjectDocs\\MEM-006\_MEMBERSHIP\_CONSTITUTION\_AND\_ARCHITECTURE\_v1.0.md

E:\\WebProjects\\BCC-V3\\ProjectDocs\\MEM-007\_MEMBERSHIP\_NUMBERING\_CONSTITUTION\_v1.0.md



Design:

E:\\WebProjects\\BCC-V3\\ProjectDocs\\BCC V3 Design System.md

E:\\WebProjects\\BCC-V3\\ProjectDocs\\V3b BCC Unified Platform Wireframe



Frontend authority:

\- BCC V3 Design System.md

\- V3b BCC Unified Platform Wireframe/\*



## Mandatory Execution Rules



1\. Bootstrap.md is authoritative.

2\. Never redesign architecture.

3\. Never introduce new technologies.

4\. Never modify governance.

5\. Never perform coding unless explicitly authorized.

6\. Audit first, then reconcile, then propose.

7\. Report evidence, not assumptions.

8\. If uncertain, stop and ask.

9\. Existing V3 implementation takes precedence over AI assumptions.

10\. Legacy database is the source of truth for migration reconciliation.

