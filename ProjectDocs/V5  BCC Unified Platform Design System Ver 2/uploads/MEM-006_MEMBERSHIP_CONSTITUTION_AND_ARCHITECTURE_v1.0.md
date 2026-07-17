
All projects
V3 BCC Unified Platform - Claude
BCC Unified Platform V3 — full rebuild of Bhopal Camera Club's website/membership system (Astro + NestJS + MySQL on AWS), replacing legacy bcc.bhopal.info. See PHASE_ROADMAP.md for current status.

`


Phase 1 frontend member hub development
Last message 37 minutes ago
BCC V3 platform setup and communication engine completion
Last message 45 minutes ago
Communication engine module specification
Last message 1 hour ago
BCC Unified Platform V3 Phase 1 frontend build
Last message 4 hours ago
Module 02 batch 4 post-deploy verification and Facebook OAuth setup
Last message 16 hours ago
Module 02 batch 4 post-deploy verification and Facebook OAuth setup
Last message 20 hours ago
Module 02 batch 4 post-deploy verification and Facebook OAuth setup
Last message 21 hours ago
Module 02 batch 4 post-deploy verification and Facebook OAuth setup
Last message 21 hours ago
Module 02 batch 4 deploy and post-deploy verification
Last message 21 hours ago
Module 02 batch 4 build errors: TypeScript fixes needed
Last message 21 hours ago
BCC Unified Platform V3 — Module 02 batch 3 roadmap
Last message 22 hours ago
BCC Unified Platform V3 Module 02 setup
Last message yesterday
BCC Unified Platform V3 registration and RBAC implementation
Last message 2 days ago
BCC V3 Module 01 — Identity & User Management schema & auth
Last message 2 days ago
Cost-effective hosting migration from AWS E2
Last message 2 days ago
File write access verification and setup
Last message 2 days ago
Membership wireframe and phase roadmap
Last message 2 days ago
BCC Unified Platform V3 wireframes phase 0.5
Last message 2 days ago
Project restart and status summary
Last message 3 days ago
Project context migration from personal Claude account
Last message Jun 25
Moving project from personal to work account
Last message Jun 24
Memory
Only you
Purpose & context Rajnish Khare is the project owner, Super Admin, and primary developer of the BCC Unified Platform V3 — a full digital-ecosystem rebuild for Bhopal Camera Club, replacing the legacy site at bcc.bhopal.info with a new platform at v3bcc.bhopal.info. GitHub repo: rajnish71/bcc-v3. Rajnish holds founding member serial 00001. Governing documents (priority order): MEM-006 (Membership Constitution) — frozen, authoritative MEM-007 (Numbering Constitution) — frozen, authoritative TECH-STACK-FREEZE — Astro (static frontend) + NestJS/Fastify (backend) + MySQL/Kysely (no ORM); no alternatives to be suggested PHASEROADMAP.md — governs sequencing Key constitutional constraints: MEM-006 P1: Registration creates platform identity only; membership application is a separate sequential step MEM-006 P3: RBAC fully decoupled from membership tables Public domain policy (absolute): Only Basic Member, Student Member, and Individual Member may appear on any public-facing page. Full Member, Life Member, Patron Member, and Founding Member are completely invisible on the public domain — no card, footnote, greyed placeholder, upgrade pathway language, or "other classes available" hint anywhere public. The upgrade pathway exists only inside the Member Hub for already-registered users Three-CTA distinction: Sign In, Register, and Apply for Membership are always kept as three distinct actions, never conflated Patron Member: Confirmed LIFETIME class — not renewable (governance decision, Jul 2026). Founding Member lifetime status was already settled MEM-007 MP-001: Cards require ACTIVE state and permanent membership number; temp identifiers rejected Membership number format: BCC+YYYY+MM+5-digit-serial (e.g., BCC202406 00021). Operational allocation starts at 00021. Serial block assignments (fully resolved, no longer open): Founding Block (00001–00007): 00001 Rajnish K. Khare, 00002 Anupam Khare Gupta, 00003 Divya Jangalwa, 00004 Mukesh Jangalwa, 00005 Viral Gupta, 00006 Murli Patidar, 00007 Oshin Jangalwa Historical Block (00008–00020): 00008 Syed Taha Pasha, 00009 Kamal Kushlani, 00010 Dr. Anil Bhati, 00011 Kshitij Patle, 00012 Sanjay Kumar Shukla, 00013 Robin Dutta, 00014 Rahil Khan, 00015 Sandeep Jain, 00016 Ankit Tiwari, 00017 Lubna Rashid, 00018 Feher Murtaza, 00019 Yogesh More, 00020 Neha Zode All 20 slots assigned; members start on BCCTempXXXXX and receive permanent numbers later Users to create fresh in V3 (not in legacy DB): Anupam Khare Gupta, Divya Jangalwa, Mukesh Jangalwa, Viral Gupta, Murli Patidar, Oshin Jangalwa (Founding Block); Kamal Kushlani, Lubna Rashid, Feher Murtaza, Yogesh More, Neha Zode (Historical Block). Username format: firstnamelastname lowercase. Migration policy: All legacy members migrate as Basic Members in V3; Rajnish upgrades each person manually afterward. Temp password: bcrypt-hash of Bcc2026! with force-reset on first login. Six inactive GUEST members reviewed: Afzal Khan and Priya Ojha retained as Registered Users; Rahul Kahar, Prakash Writer, Salil Jain, and Anil Guest discarded as test data. Membership class badge colours: Basic #5C5876, Student #1A9DAE, Individual #3E5A48, Family #D9733A, Senior #6F8F3C, Honorary #C8327A, Life #A8843C, Patron and Founding #8A6A2E. Recognition badges are separate, shown simultaneously; maximum one active recognition badge per member. Infrastructure: Single AWS EC2 instance (bhopal-prod-01, 52.66.167.85, Ubuntu 24.04, ~1.9GB RAM), project root /var/www/bcc-v3, local Windows clone at E:\WebProjects\BCC-V3. GitHub Actions CI/CD on push to master via restricted forced-command SSH deploy key. PM2 for backend process management, Nginx serving Astro static output, Certbot SSL for v3bcc.bhopal.info. MySQL runs as bccv3app user. Cloudflare R2 bucket bccuploads (ImageKit endpoint duynda7oq) for all photo assets — 311 portfolio photos verified present. A second site (bhopal.info, PHP Laravel) is cohosted on the same instance; RAM ceiling is a real constraint when planning concurrent load. Design system ("Refined Editorial Luxury"): Warm ivory #FAF8F4 background, white #FFFFFF card surfaces, dark ink #141210 text, gold-only accents (#C9A961/#A8843C), zero border radius on photos, no glassmorphism, 1360px content width, 8px spacing base, 96px nav condensing to 64px after 80px scroll. Five flat nav links: Home · About · Activities · Showcase · Journal. Guest rail: "Sign In" text + single gold gradient "Become a Member" CTA. Logo files: BCCDefault.png (colourful aperture mark with wordmark), favicon.png. Nav/footer reference path: /images/bcc-logo-default.png. Note: logo filename has a space in the committed file ("BCC Default.png") — mismatch with reference path, deferred fix. Canonical routes: /activities/, /join/, /gallery/photographer/. Photo grid: justified aspect-ratio-preserving Flickr-style algorithm, standard across all photo grids. Footer: FIP trust badge + social strip, four columns (Brand/Navigate/Explore/Guidelines), copyright bar — single Footer.astro component across all pages. Showcase (not "Gallery") naming consistent with legacy site. --- Current state Completed modules: Module 01 (Identity & User Management): Live. Six registration methods, RbacGuard/RbacService, CommunicationModule/EmailService (Resend). Auth: JWT short-lived access tokens + rotating opaque refresh tokens in MySQL (no Redis). Password hashing: argon2. No role row for baseline access (absence of userroles row = baseline). Timezone fix applied globally via toMysqlDatetime() helper (MySQL runs IST, JS was writing UTC). Facebook app domain updated to v3bcc.bhopal.info; app must be switched from Development to Live mode in Meta Developer Console. Phone/WhatsApp OTP gated off (PHONEOTPENABLED=false). Instagram social login explicitly dropped. Module 02 (Membership Management): Complete. MEM-007 numbering service, seven-state lifecycle machine, three-layer entitlement engine, dual-track recognition engine (AUTO reports eligibility only, never auto-assigns), renewal engine (12-month term + 60-day grace, stored in classentitlements due to 0009 trigger). Voting register (§02.11): append-only AGM snapshots in votingregistersnapshots, eligibility = ACTIVE INDIVIDUAL constitutional classes only (votingeligible=1), quorum = ceil(eligiblecount/3) stored immutably. Digital membership card (§02.7): pdf-lib, business-card-sized PDF, class badge colours, QR encodes verify URL using cardverifytoken (22-char base64url opaque slug, ~128-bit entropy). Card verify: public unauthenticated GET /membership/verify/:token. Senior Member AUTO-recognition threshold set at 7 years (temporarily, pending revert to 10). Tenure computed from joinyear/joinmonth. Grace-lapse = reapply required (documented interpretation of spec 02.8). Patron Member confirmed lifetime (migration 0025, 0009 trigger dropped and recreated). Module 17 (Communication Engine): Complete. Three migrations (0030–0032): notificationtypes, notificationtemplates, notificationlog, inappnotifications. 27 Phase 1 notification types seeded, 27 EMAIL templates, 23 INAPP templates. CommunicationService is the single dispatch engine: template resolution, mustache-style variable substitution, opt-out gating against notificationpreferences, email shell wrapping, notificationlog lifecycle (QUEUED→SENT/FAILED/SKIPPED), in-app writes with 90-day expiry. All existing emailService.send() callers in registration.service, membership-lifecycle.service, application-workflow.service refactored to route through CommunicationService.dispatch(). NotificationModule with NotificationService and NotificationController providing six self-service REST endpoints for notification bell and preference management, wired into AppModule. Phase 1 frontend (public pages): Built and deployed. Design tokens, global CSS, BaseLayout, Nav, Footer, PhotoCard, MemberBadge, SectionHeader, and pages: index, showcase, photographers (/gallery/photographer/), activities, join (/join/). ProjectDocs/ cleaned from git history; added to .gitignore. Schema state: 30 rows in schemamigrations (0001–0032, accounting for predecessors). Migration column is filename, not migrationname. Open items: notification.controller.ts, notification.module.ts, and updated app.module.ts were written server-side (Module 17 session) — must be copied locally and committed to git before next CI/CD deploy Two TODO stubs in lifecycle.service: MEMBERSHIPRENEWED and MEMBERSHIPREINSTATED — pending type row and template seeds Logo filename mismatch ("BCC Default.png" vs /images/bcc-logo-default.png) — deferred showcase.astro dark-theme inconsistency — deferred Facebook OAuth app: needs to be switched from Development to Live mode in Meta Developer Console Rajnish needs RESENDAPIKEY + EMAILFROMADDRESS confirmed in .env Card design: current code builds landscape single-sided PDF; original Canva mockup specifies CR80 Portrait with two sides — layout decision pending from Rajnish before implementation --- Key learnings & principles Constitutional/governance: Constitutional rules (MEM-006 class protection, MEM-007 number immutability) are enforced at the database layer via MySQL triggers, not just application code Do not re-attempt Selectable<> typing for Generated<ColumnType<Date, ...>> fields in this Kysely version — use the toDate(value: unknown): Date runtime cast pattern immediately at response-mapping sites cardverifytoken (opaque, 22-char base64url) solves the sequential membershipnumber guessability problem for public verify URLs Renewal engine settings stored in classentitlements (not class rows directly) due to the 0009 constitutional trigger blocking direct class row updates Kysely/MySQL type patterns: DATETIME columns typed as ColumnType<Date, string, string> require Date objects in WHERE comparisons, not toMysqlDatetime() strings toMysqlDatetime() helper is the canonical fix for the IST/UTC timezone mismatch MySQL error 3780 (foreign key type incompatibility): foreign key columns must match the referenced column type exactly — BIGINT for users.id (which is BIGINT NOT NULL AUTOINCREMENT) Build/deploy: TypeScript errors from Permissions (non-existent) vs RequirePermissions (correct) export pdf-lib's drawRectangle() does not support borderRadius; use drawSvgPath() for rounded shapes runmigrations.sh uses set -euo pipefail — failed migration causes immediate exit before INSERT into schemamigrations, so fix in-place and rerun is safe without manual cleanup sed -i 's/old/new/' filepath is reliable for targeted in-place server-side edits Frontend: The initial frontend build used the wrong design system (dark glassmorphic); the correct system is "Refined Editorial Luxury" — always verify against BCCV3DesignSystem.md and design-tokens.md, not placeholder token files ProjectDocs/ must stay in .gitignore --- Approach & patterns Aggressive batching: Rajnish's explicit preference — complete multiple slices in one deploy cycle rather than one at a time Reconnaissance before coding: Full server-side read of existing module structure, .env state, migration history, and scaffolding before writing new code Session-starter prompts: Each major module gets a clean session-starter prompt encoding ground truth, current state, scope, and open items — Rajnish pastes into a new conversation per module Git operations: Rajnish runs all git commands locally (no git MCP access). PowerShell on Windows — line continuation uses backtick (` `), not backslash. Single-line commands preferred over multi-line for git operations Verification discipline: Confirm deploy success via pm2 jlist restarttime increment and git log, not just deploy.log tail (GitHub Actions can complete while PM2 restart is still pending). deploy.log unicode checkmark characters cause charmap errors — not a build failure indicator Server-side file delivery fallback: When filesystem MCP times out, write to Claude sandbox via bashtool, base64-encode, then pipe via echo ... | base64 -d > /path/to/file on server. This is immune to heredoc quoting issues with TypeScript backticks/template literals writefile over editfile: For rewrites >~30 lines or files with backtick-heavy content, use writefile with full file content — editfile can fail silently or partially apply on complex anchors --- Tools & resources MCP servers: bcc-aws-live: runcommand executes as ubuntu user with passwordless sudo (full root-equivalent). Available tools: healthcheck, runcommand, restartnginx, memorycheck, diskusage, readfile, listdirectory — no writefile filesystem: Scoped to E:\WebProjects\BCC-V3 on Windows. Tools: writefile, editfile, readfile, listdirectory, createdirectory, movefile, searchfiles — no deletefile (test files must be manually removed by Rajnish) Reliable operational commands: PM2 status: pm2 jlist | python3 -c "import json,sys; d=json.load(sys.stdin); [print(p['name'], p['pm2env']['status'], 'restarts:', p['pm2env']['restarttime']) for p in d]" MySQL (V3): mysql -u bccv3app -p$(grep DBPASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2) bccv3 with -N flag to suppress column headers when parsing programmatically; pipe stderr through 2>/dev/null to suppress password-on-CLI warning MySQL (legacy): mysql -u bhopal -pMeera2103@ bcc Migration runner requires sourcing .env first: set -a && source backend/.env && set +a && export MYSQLPWD="${DBPASSWORD}" && mysql ... Schema migrations column: filename (not migrationname) — SELECT filename FROM schemamigrations ORDER BY filename DESC LIMIT 5 R2 access: boto3, endpoint https://85f30658f17a33a60f68615a94a4b281.r2.cloudflarestorage.com, bucket bccuploads, region auto; use paginator pattern to retrieve all objects Non-ASCII characters (em-dashes, box-drawing) in heredoc strings cause silent truncation or UnicodeDecodeError — all source files must be ASCII-clean; em-dashes in SQL comments → double hyphens Git conflict recovery: git reset --hard origin/master External services: Email: Resend (RESENDAPIKEY, EMAILFROMADDRESS in .env`) Auth: Google OAuth (registered), Facebook OAuth (App ID: 2105926763673297 — same as Client ID; app needs Live mode) Assets: Cloudflare R2 + ImageKit PDF generation: pdf-lib (pure JS, no native binaries)

Last updated 3 hours ago

Instructions
This project is the BCC Unified Platform V3 — a full digital-ecosystem rebuild for Bhopal Camera Club, replacing the legacy site at bcc.bhopal.info. ALWAYS TREAT AS GROUND TRUTH, IN THIS ORDER: 1. MEM-006 (Membership Constitution) and MEM-007 (Numbering Constitution) — FROZEN/AUTHORITATIVE. Don't reinterpret silently — if something in either doc is ambiguous, say so explicitly rather than picking an interpretation. 2. TECH-STACK-FREEZE — Astro (frontend) + NestJS/Fastify (backend) + MySQL/Kysely, no ORM. This decision is closed — don't suggest Laravel, Next.js, Docker-first, or other stacks. 3. PHASE_ROADMAP.md — current phase status and sequencing. Check this before assuming what is or isn't already built. INFRASTRUCTURE FACTS: - Single EC2 instance, Ubuntu 24.04, ~1.9GB RAM — be RAM-conscious, avoid suggesting additional standing processes. - bcc-v3 lives at /var/www/bcc-v3 on the server, deployed via GitHub Actions on push to master (auto build + PM2 restart). - Legacy site (separate DB, separate app) lives at /var/www/bcc.bhopal.info — read-only reference for migration/design, never modify. - Two SSH identities exist: `ubuntu` (manual terminal work, git, sudo) and `bhopal` (used by the local MCP server tools). TOOL/ACCESS PATTERN: - `ec2-tools` MCP: read_file / list_directory / health_check / restart_nginx are unrestricted reads. `write_file` is hard-scoped to /var/www/bcc-v3/ only. There is no command-execution tool — anything needing sudo, npm install, git operations, or DB writes must be given to the user as exact commands to run, never assumed already done. - Don't read credential files (.env, .pem keys) unless there's a genuine functional need to see the actual value. Prefer giving the user a `source`-based command pattern over reading secrets directly. WORKING NORMS FROM THIS PROJECT SO FAR: - Verify, don't assume — terminal paste-back is frequently garbled by scrollback truncation; confirm real server state via the read-only MCP tools before declaring a step complete. - Each major build step (a new module, a migration track, the wireframe) gets its own conversation — reference PHASE_ROADMAP.md instead of re-explaining history.

Files
3% of project capacity used

Bootstrap.md
35 lines

md



CLAUDE.md
37 lines

md



BCC V3 Design System.md
419 lines

md



design-tokens.md
92 lines

md



BCC Shared Layout Components.dc.html
548 lines

html



TECH-STACK-FREEZE.md
22 lines

md



PHASE_ROADMAP.md
149 lines

md



BCC_Unified_Platform_Specification_v3.docx
1,638 lines

docx



MEM-007_MEMBERSHIP_NUMBERING_CONSTITUTION_v1.0.md
339 lines

md



MEM-006_MEMBERSHIP_CONSTITUTION_AND_ARCHITECTURE_v1.0.md
586 lines

md


MEM-006_MEMBERSHIP_CONSTITUTION_AND_ARCHITECTURE_v1.0.md


# [V2][MISSION-008A]

# MEM-006

# MEMBERSHIP CONSTITUTION AND ARCHITECTURE v1.0

Status: APPROVED

Status: FROZEN

Status: AUTHORITATIVE

Mission:
MISSION-008A — Implementation Execution

Track:
TRACK-004A — Membership Constitutional Review & Ratification

Authority:
Human Authority

Architecture Authority:
ChatGPT

Classification:
Constitutional Architecture

Date:
2026-06-23

---

# PURPOSE

This document establishes the authoritative Membership Constitution and Membership Architecture for BCC Unified Platform V2.

This document supersedes all prior academic membership proposals and serves as the constitutional authority for:

* Membership Architecture
* Membership Governance
* Membership Classification
* Recognition Architecture
* Membership Entitlements
* Membership Implementation

This document shall be used as the authoritative reference for:

* Database Architecture
* Technical Architecture
* Membership Foundation Implementation
* Migration Planning
* Administrative Interfaces
* Future Governance Reviews

---

# CONSTITUTIONAL PRINCIPLES

## Principle 1

Identity is independent of Membership.

A Registered User is not automatically a Member.

Membership is established through a separate membership process.

---

## Principle 2

Membership is independent of Recognition.

Recognition does not create Membership.

Membership does not automatically create Recognition.

---

## Principle 3

Membership is independent of RBAC.

Administrative permissions are governed exclusively through RBAC.

Membership classes shall not grant administrative permissions.

Recognition shall not grant administrative permissions.

---

## Principle 4

Governance authority shall remain separate from operational authority.

Voting rights and constitutional participation derive from constitutional membership classes.

Operational permissions derive from RBAC.

---

## Principle 5

Membership classes shall remain constitutionally governed.

The constitutional layer shall remain intentionally small and stable.

---

# MEMBERSHIP DOMAIN MODEL

The Membership Domain consists of:

```text
Identity
    ↓
Membership
    ↓
Recognition
    ↓
Entitlements
```

Governance and RBAC remain independent overlays.

---

# IDENTITY ARCHITECTURE

## Registered User

A Registered User represents an authenticated platform identity.

Registration creates:

* User Account
* Identity Record
* Authentication Relationship

Registration does NOT create:

* Membership
* Recognition
* Governance Authority

---

## Identity Rule

All Members are Registered Users.

Not all Registered Users are Members.

---

# MEMBERSHIP CLASSIFICATION MODEL

Membership classifications are divided into three categories:

1. Constitutional Membership Classes
2. Operational Membership Classes
3. Group Membership Types

---

# CONSTITUTIONAL MEMBERSHIP CLASSES

Constitutional Membership Classes represent formal governance-aware membership classifications.

These classes are protected by constitutional authority.

---

## Full Member

Characteristics:

* Renewable
* Voting Eligible
* Governance Eligible

Purpose:

Represents the primary constitutional membership class for active governance participation.

---

## Life Member

Characteristics:

* Lifetime Membership
* Voting Eligible
* Governance Eligible

Purpose:

Represents permanent constitutional membership.

---

## Patron Member

Characteristics:

* Constitutional Membership
* Voting Eligible
* Governance Eligible

Purpose:

Represents premium constitutional membership supporting the organization.

Renewal and tenure policies remain configurable through governance.

---

## Founding Member

Characteristics:

* Constitutional Membership
* Voting Eligible
* Governance Eligible
* Closed Membership Class

Purpose:

Represents the original founding membership cohort.

No new Founding Members may be created.

---

# CONSTITUTIONAL PROTECTION RULE

Constitutional Membership Classes:

* Cannot be created by administrators.
* Cannot be deleted by administrators.
* Cannot be modified through configuration.
* Cannot gain or lose voting rights through configuration.

Any change requires:

* Constitutional Authority
* Architecture Review
* Implementation Authorization

---

# OPERATIONAL MEMBERSHIP CLASSES

Operational Membership Classes support participation and platform operations.

These classes are configuration-driven.

They are not constitutional classes.

---

## Basic Member

Purpose:

Entry-level participation class.

---

## Student Member

Purpose:

Student participation class.

---

## Individual Member

Purpose:

Standard individual participation class.

---

# OPERATIONAL CLASS RULES

Operational Membership Classes:

* May be configured.
* May evolve through governance-approved configuration.
* Do not create constitutional authority.
* Do not create voting authority.

---

# GROUP MEMBERSHIP ARCHITECTURE

Group Memberships are not Membership Classes.

Group Memberships are not Recognition Classes.

Group Memberships are not Constitutional Classes.

Group Memberships represent organizational membership holders.

---

# GROUP MEMBERSHIP TYPES

## Family Membership

Membership owned by a Family Entity.

---

## Corporate Membership

Membership owned by a Corporate Entity.

---

## Institutional Membership

Membership owned by an Institutional Entity.

---

# GROUP MEMBERSHIP PRINCIPLE

A Group Membership belongs to the Group.

It does not belong to the individual participants.

Example:

```text
Corporate Membership
        ↓
Organization
        ↓
Delegates
```

Delegates remain individual identities.

The membership belongs to the organization.

---

# RECOGNITION ARCHITECTURE

Recognition exists independently of Membership Classes.

Recognition acknowledges distinction, contribution, longevity, mentorship, and achievement.

Recognition does not create governance authority.

Recognition does not create voting authority.

---

# DUAL-TRACK RECOGNITION MODEL

Recognition consists of:

1. Automatic Recognition Track
2. Governance Recognition Track

---

# AUTOMATIC RECOGNITION TRACK

Assigned through system qualification rules.

Classes:

* Senior Member
* Honorary Senior Member

Qualification criteria remain configurable.

---

# GOVERNANCE RECOGNITION TRACK

Assigned through governance action.

Classes:

* Honorary Member
* Honorary Mentor
* Honorary Grandmaster

All assignments require auditability.

---

# SINGLE ACTIVE RECOGNITION RULE

A Member may hold at most one active recognition at any time.

---

# RECOGNITION PRECEDENCE RULE

Governance Recognition supersedes Automatic Recognition.

When Governance Recognition becomes active:

* Governance Recognition becomes Active Recognition.
* Automatic Recognition becomes Historical Recognition.

---

# HISTORICAL RECOGNITION LEDGER

Recognition transitions shall be non-destructive.

Historical recognitions must be preserved.

The ledger shall maintain:

* Recognition
* Start Date
* End Date
* Reason
* Transition History

---

# MEMBERSHIP LIFECYCLE

Membership lifecycle governance remains governed by previously approved lifecycle architecture.

Lifecycle states:

* PENDING
* APPROVED
* ACTIVE
* SUSPENDED
* EXPIRED
* TERMINATED
* REJECTED

No lifecycle simplification is authorized.

---

# ENTITLEMENT ARCHITECTURE

Entitlements are resolved dynamically.

The entitlement formula is:

```text
Membership Class
+
Active Recognition
+
Individual Overrides
```

This formula is constitutionally frozen.

---

# ENTITLEMENT RESOLUTION ORDER

Step 1

Membership Class Entitlements

↓

Step 2

Active Recognition Modifiers

↓

Step 3

Individual Overrides

↓

Final Entitlements

---

# GOVERNANCE ARCHITECTURE

Governance participation derives exclusively from Constitutional Membership Classes.

---

# VOTING ELIGIBLE CLASSES

* Full Member
* Life Member
* Patron Member
* Founding Member

---

# NON-VOTING CLASSES

* Basic Member
* Student Member
* Individual Member

Group Membership Types do not create voting authority.

Recognition does not create voting authority.

RBAC does not create voting authority.

---

# RBAC SEPARATION RULE

RBAC remains fully decoupled from:

* Membership
* Recognition
* Governance Participation

Administrative authority is governed exclusively through RBAC.

---

# IMPLEMENTATION DIRECTIVES

All future implementation shall follow this architecture.

Database Architecture shall conform to this document.

Technical Architecture shall conform to this document.

Membership Foundation Implementation shall conform to this document.

Migration Architecture shall conform to this document.

---

# TRACK-004A RATIFICATION OUTCOME

Constitutional Review:
COMPLETE

Conflict Resolution:
COMPLETE

Human Authority Review:
COMPLETE

Ratification Result:
RATIFIED

Implementation Readiness:
READY

TRACK-005 Authorization Recommendation:
APPROVED

---

# FREEZE DECLARATION

MEM-006

Membership Constitution and Architecture v1.0

Status:
APPROVED

Status:
FROZEN

Status:
AUTHORITATIVE

This document becomes the constitutional authority for Membership Architecture within BCC Unified Platform V2.

All future membership implementation, database design, technical architecture, and governance reviews shall inherit this document as the authoritative baseline.
 
