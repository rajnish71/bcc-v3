# Claude Project Instructions — Reference Copy

**Purpose:** This is a version-controlled copy of the "Instructions" field configured
in the Claude.ai Project settings for BCC Unified Platform V3. The live copy lives in
Claude.ai's UI (Settings → this Project → Instructions); this file exists so the
instructions are tracked, diffable, and recoverable like everything else in this repo.

**If you update the Project Instructions in Claude.ai, update this file to match.**

---

This project is the BCC Unified Platform V3 — a full digital-ecosystem rebuild
for Bhopal Camera Club, replacing the legacy site at bcc.bhopal.info.

ALWAYS TREAT AS GROUND TRUTH, IN THIS ORDER:
1. MEM-006 (Membership Constitution) and MEM-007 (Numbering Constitution) —
   FROZEN/AUTHORITATIVE. Don't reinterpret silently — if something in either
   doc is ambiguous, say so explicitly rather than picking an interpretation.
2. TECH-STACK-FREEZE — Astro (frontend) + NestJS/Fastify (backend) +
   MySQL/Kysely, no ORM. This decision is closed — don't suggest Laravel,
   Next.js, Docker-first, or other stacks.
3. PHASE_ROADMAP.md — current phase status and sequencing. Check this before
   assuming what is or isn't already built.

INFRASTRUCTURE FACTS:
- Single EC2 instance, Ubuntu 24.04, ~1.9GB RAM — be RAM-conscious, avoid
  suggesting additional standing processes.
- bcc-v3 lives at /var/www/bcc-v3 on the server, deployed via GitHub Actions
  on push to master (auto build + PM2 restart).
- Legacy site (separate DB, separate app) lives at /var/www/bcc.bhopal.info —
  read-only reference for migration/design, never modify.
- Two SSH identities exist: `ubuntu` (manual terminal work, git, sudo) and
  `bhopal` (used by the local MCP server tools).

TOOL/ACCESS PATTERN:
- `ec2-tools` MCP: read_file / list_directory / health_check / restart_nginx
  are unrestricted reads. `write_file` is hard-scoped to /var/www/bcc-v3/
  only. There is no command-execution tool — anything needing sudo, npm
  install, git operations, or DB writes must be given to the user as exact
  commands to run, never assumed already done.
- Don't read credential files (.env, .pem keys) unless there's a genuine
  functional need to see the actual value. Prefer giving the user a
  `source`-based command pattern over reading secrets directly.

WORKING NORMS FROM THIS PROJECT SO FAR:
- Verify, don't assume — terminal paste-back is frequently garbled by
  scrollback truncation; confirm real server state via the read-only MCP
  tools before declaring a step complete.
- Each major build step (a new module, a migration track, the wireframe)
  gets its own conversation — reference PHASE_ROADMAP.md instead of
  re-explaining history.

---

## Project description (for reference)

> BCC Unified Platform V3 — full rebuild of Bhopal Camera Club's website/membership
> system (Astro + NestJS + MySQL on AWS), replacing legacy bcc.bhopal.info.
> See PHASE_ROADMAP.md for current status.

## Project files (Claude.ai Project uploads, as of 2026-06-25)
- MEM-006_MEMBERSHIP_CONSTITUTION_AND_ARCHITECTURE_v1_0.md
- MEM-007_MEMBERSHIP_NUMBERING_CONSTITUTION_v1_0.md
- BCC_Unified_Platform_Specification_v3.docx
- PHASE_ROADMAP.md
- systemdesign.md (legacy design system)
- bcc-tokens.js (legacy design tokens)
