# BCC Unified Platform V3 — Claude Code Instructions

> \*\*This file is the operating contract for Claude Code on this repository.\*\*
> Read it completely before touching any file. It overrides any assumptions
> from training data.

\---

## 1\. Ground-Truth Hierarchy

Obey in this exact priority order. Never reinterpret silently — if something
is ambiguous, STOP and say so before proceeding.

1. **MEM-006** `ProjectDocs/MEM-006\_MEMBERSHIP\_CONSTITUTION\_AND\_ARCHITECTURE\_v1.0.md`
2. **MEM-007** `ProjectDocs/MEM-007\_MEMBERSHIP\_NUMBERING\_CONSTITUTION\_v1.0.md`
3. **TECH-STACK-FREEZE** `ProjectDocs/TECH-STACK-FREEZE.md`
4. **PHASE\_ROADMAP** `ProjectDocs/PHASE\_ROADMAP.md`
5. **HUB-ARCH-001** `ProjectDocs/Architecture/HUB\_COMPONENT\_ARCHITECTURE\_FREEZE\_v1.0.md` — authenticated Member Hub frontend composition
6. **PHOTO-ARCH-001** `ProjectDocs/Architecture/PHOTO-ASSET-ARCHITECTURE_FREEZE_v1.0.md`
7. **This file** — operational rules for Claude Code

\---

## 2\. Repository Layout

```
/
├── frontend/          Astro — pages, components, layouts, public assets
├── backend/           NestJS/Fastify — modules, controllers, services, DTOs, guards
├── database/          SQL migration files (0001\_\*.sql … 0037\_\*.sql)
├── ProjectDocs/       Authoritative documentation (read-only reference)
├── infra/             Nginx config, GitHub Actions workflow
└── scripts/           One-time utilities, seed scripts
```

**Claude Code works inside `frontend/`, `backend/`, `database/`, `infra/`,
and `scripts/` only.**  


**ProjectDocs are governance documents.**



**Claude Code must NEVER modify them unless the task explicitly instructs it to reconcile or update governance documentation.**



**When modifying ProjectDocs:**



**• preserve hierarchy**

**• preserve numbering**

**• preserve constitutional authority**

**• never redesign documents**

**• never rewrite governance unless explicitly instructed.**





\---

## 3\. Frozen Tech Stack — No Exceptions

|Layer|Technology|Notes|
|-|-|-|
|Frontend|Astro (static output)|Served by Nginx|
|Backend|NestJS + Fastify adapter|Port 3001, PM2|
|Query builder|Kysely|No ORM — raw typed queries|
|Database|MySQL 8 (`bcc\_v3`)|Migrations tracked in `schema\_migrations`|
|File storage|Cloudflare R2 (`bccuploads`)|boto3 / S3-compatible|
|CDN|ImageKit (`duynda7oq`)||
|Email|Resend|Domain `bcc.bhopal.info`|

**Forbidden:** Next.js, Prisma, TypeORM, Sequelize, GraphQL as primary API,
Docker-first architecture, microservices, any additional standing process.

\---

## 4\. Hard-Wired Infrastructure Facts

These have been learned through debugging. Violating them breaks prod.

### 4.1 Global Prefix REMOVED

`app.setGlobalPrefix('api/v1')` was permanently removed from `main.ts`.  
Every controller declares `api/v1/` in its own `@Controller()` decorator.  
**Never re-add `setGlobalPrefix`.** It will break every endpoint.

### 4.2 Port

Backend runs on **port 3001**. Never use 3000 in:

* `getStaticPaths()` build-time fetches
* curl test commands
* Nginx proxy\_pass rules

### 4.3 Nginx / OAuth Redirect

Nginx issues a 301 adding a trailing slash to `/auth/callback`, which strips
hash fragments. OAuth tokens use the `#at=\&rt=\&new=` hash pattern. Fastify v5
redirects must use an explicit status argument (`reply.redirect(url, 302)`).

### 4.4 Astro Style Scoping

Astro scopes `<style>` selectors with data attributes that runtime-created DOM
nodes never receive. Use `:global()` wrappers for styles applied to elements
created by JavaScript at runtime.

### 4.5 Astro Build-time Fetches

All `getStaticPaths()` and top-level `fetch()` calls in `.astro` files must
target `http://localhost:3001`. If routing through Nginx, add
`-H "Host: v3bcc.bhopal.info"`.

\---

## 5\. Critical Code Patterns

### 5.1 CommunicationService.dispatch()

Signature: **`dispatch(typeKey: string, userId: number, variables)`**  
`typeKey` FIRST, `userId` SECOND. This order is easily reversed — do not guess.

### 5.2 Kysely Datetime from DTOs

ISO 8601 strings from request bodies must be converted before insert:

```ts
toMysqlDatetime(new Date(dto.startDate))
```

Never pass raw ISO strings into `ColumnType<Date>` columns.

### 5.3 Kysely Selectable Date Fields

`Generated<ColumnType<Date, string, string>>` does not collapse to `Date`
through `Selectable<>` in this project's Kysely version.  
Use a runtime helper `toDate(value: unknown): Date` at response-mapping sites.
Do not retry `Selectable` typing for these fields.

### 5.4 Update DTOs

`@nestjs/mapped-types` is not installed. `PartialType(CreateDto)` cannot be
used. All update DTOs must declare fields explicitly with `@IsOptional()`.

### 5.5 BIGINT FK

`users.id` is `BIGINT`. Any foreign key referencing it must be `BIGINT`, not
`INT UNSIGNED`.

### 5.6 Argon2 in SQL Heredocs

Bash expands `$argon2id`, `$v`, `$m` as shell variables even inside heredocs.
Write seed/migration SQL with argon2 hashes via Node.js inline script with
mysql2 parameterized queries, not raw heredoc SQL.

### 5.7 MySQL JSON Columns

mysql2 auto-parses `JSON` columns before application code receives them.
Calling `JSON.parse()` on an already-parsed value throws SyntaxError.
Prefer `TEXT` for columns the application parses itself. See migration
`0037\_events\_tags\_text.sql` for the established pattern.

### 5.8 Activities Page Scripts

Activities page scripts are inlined directly in `dist/activities/index.html`,
not extracted to `dist/\_astro/`. Verify built output there.

\---

## 6\. Database Conventions

```sql
-- Check applied migrations
SELECT filename FROM schema\_migrations ORDER BY filename DESC LIMIT 10;

-- Migration filename format
0038\_description\_snake\_case.sql

-- Access pattern (from server)
mysql -u bcc\_v3\_app -p$(grep DB\_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2) bcc\_v3
```

Migration files live in `database/`. Filename column in `schema\_migrations`
is `filename`, NOT `migration\_name`.

\---

## 7\. Membership Constitutional Constraints

These are absolute. No business logic may violate them.

### MEM-006 — Public Domain Policy

* Constitutional class names (Full, Life, Patron, Founding Member) are **hidden**
on all join/membership workflow pages.
* Only **Basic, Student, Individual** appear on public marketing surfaces.
* Upgrade pathway exists only inside the Member Hub, never on public pages.
* Constitutional class *badges* are permitted on photographer profile pages only.

### MEM-006 — Three Distinct CTAs

Sign In · Register · Apply for Membership are always three separate actions.
Never conflate them. Registration creates a platform identity only — it is not
membership application.

### MEM-006 — RBAC Decoupling

RBAC is fully decoupled from membership tables. Role assignment never derives
automatically from membership class.

### MEM-007 — Membership Number Format

Format: `BCC{YYYY}{MM}{SSSSS}` — 14 characters, no space.  
Example: `BCC20191100021`  
`membership\_number` is write-once and immutable once assigned.  
Non-founding members get `BCCTempXXXXX` at activation.  
Sequential auto-allocation begins only after manual batch spreadsheet closes
and `membership\_number\_pool.last\_allocated\_serial` is updated.

### Founding Block (COMPLETE — trigger-locked)

Serials 00001–00007 are fully assigned. Do not modify founding member records.  
Serials 00002–00007: `profile\_visibility = PRIVATE`. Permanent. Never change
to MEMBERS\_ONLY or PUBLIC without explicit written instruction from Rajnish.

### Patron Member

Patron is a **lifetime class**, not renewable. Treat identically to Founding
Member in any renewal logic — skip renewal prompts entirely.

\---

## 8\. Deployment Pipeline

```
git push origin master
  → GitHub Actions: npm run build (Astro) + tsc compile check
  → scp dist/ to /var/www/bcc-v3/frontend/dist/
  → PM2 restart bcc-v3-backend
```

**The deploy script uses `set -euo pipefail`.** Uncommitted server-side file
modifications block `git pull` with a merge conflict. Always commit or reset
before deploying.

Confirm clean deploy by comparing PM2 `pm\_uptime` (Unix epoch ms) against
`/var/www/bcc-v3/deploy.log` timestamp.

\---

## 9\. Useful Operational Commands

```bash
# PM2 status (safe, no ANSI decode issues)
pm2 jlist | python3 -c "
import json,sys
d=json.load(sys.stdin)
\[print(p\['name'], p\['pm2\_env']\['status'], 'restarts:', p\['pm2\_env']\['restart\_time']) for p in d]
"

# PM2 error log
tail -40 /home/ubuntu/.pm2/logs/bcc-v3-backend-error.log

# API smoke test
curl -s http://localhost:3001/api/v1/gallery/feed?limit=1 | python3 -m json.tool

# Build check (run from /var/www/bcc-v3/frontend)
npm run build 2>\&1 | tail -20

# TypeScript compile check (run from /var/www/bcc-v3/backend)
npx tsc --noEmit
```

\---

## 10\. Design System (Frontend Work)

Design authority: `ProjectDocs/DesignSystem/V6/V6\_00\_BCC\_Design\_Principles\_dc.html`

|Token|Value|
|-|-|
|Background|`#FAF8F4` warm ivory|
|Card surface|`#FFFFFF`|
|Primary text|`#141210` dark ink|
|Gold accent|`#C9A961` / `#A8843C`|
|Content width|1360px|
|Photo border radius|0 (never rounded)|

**Fonts:** Outfit (headings) · Inter (body/UI) · JetBrains Mono (data/credentials)  
**One gold CTA per view maximum** — `--gold-gradient` is reserved for the
single primary action per page.  
No glassmorphism. No hardcoded content — all values from API.

\---

## 11\. What Claude Code Should and Should Not Do

### ✅ Proceed autonomously

* Read any file in the repo
* Edit frontend `.astro`, `.ts`, `.css` files
* Edit backend `.ts` files (controllers, services, DTOs, guards)
* Write new SQL migration files in `database/`
* Run `npm run build`, `tsc --noEmit`, `curl` smoke tests
* Run `pm2 status`, tail error logs
* Stage and commit changes with descriptive messages
* Apply migrations with the mysql command pattern above

### ⚠️ Ask before proceeding

* Any operation touching founding member records (users 1–7)
* Production DB `UPDATE` or `DELETE` (not just `INSERT`)
* Changing `profile\_visibility` on any user
* Modifying `membership\_number` on any record
* Changing Nginx config or PM2 ecosystem file
* Anything involving `.env` values

### 🚫 Never do

* Re-add `app.setGlobalPrefix()` to `main.ts`
* Add a new technology or dependency not in TECH-STACK-FREEZE
* Modify files in `ProjectDocs/`
* Change founding member `profile\_visibility` from PRIVATE
* Expose constitutional class names on public-facing pages
* Write `PartialType(CreateDto)` in update DTOs
* Use port 3000 for backend calls
* Implement `frontend/src/layouts/HubLayout.astro` or `frontend/src/pages/hub/*` without reading HUB-ARCH-001 first
* Violate the component architecture defined in HUB-ARCH-001

\---

## 12\. Session Start Checklist

When starting a new task, Claude Code should:

1. Read this file (`CLAUDE.md`) — you're doing it now ✓
2. Read `ProjectDocs/PHASE\_ROADMAP.md` for current phase status
3. Identify the specific files affected by the task
4. Read those files before writing any code
5. Confirm the task does not violate any constraint in Section 7 or 11
6. Execute, then run the relevant smoke test
7. Report what changed and what the smoke test returned

**Audit first. Code second. Smoke test third.**

