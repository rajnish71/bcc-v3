# BCC Unified Platform V3 — Phase Roadmap

**Status:** Living document — update this file as phases complete.
**Last updated:** 2026-06-25
**Companion documents:** `MEM-006-CONSTITUTIONAL-AUTHORITY.md`, `MEM-007-NUMBERING-AUTHORITY.md`,
`TECH-STACK-FREEZE.md` (all in this same `/docs` folder), and
`BCC_Unified_Platform_Specification_v3.docx` (full module-by-module functional spec).

## How to use this document
This file is the single source of truth for *sequencing* — what gets built when,
and why. The `.docx` spec covers *what* each module does in depth. If starting a
new conversation for a major step, point Claude at this file plus the relevant
constitutional doc(s) for that step.

---

## Phase 0 — Infrastructure Foundation — ✅ COMPLETE (2026-06-24/25)

Built on `bhopal-prod-01` (Ubuntu 24.04, shared with `bcc.bhopal.info` legacy site
and `bhopal.info`). Live at `https://v3bcc.bhopal.info`.

**Key decisions that deviated from the original plan, and why:**
- **PM2 instead of Docker Compose** for the backend — server has only ~1.9GB RAM;
  running NestJS + Astro + Meilisearch + Redis as separate containers risked
  memory pressure. Astro is pure static output (no running Node process at all),
  cutting the live Node footprint to just one PM2-managed process.
- **GitHub-hosted Actions runner, not self-hosted** — same RAM reasoning. A
  persistent self-hosted runner agent would be another standing process; instead
  a GitHub-hosted runner SSHes in only when triggered.
- **Restricted, single-purpose SSH key for deploys** — the GitHub Actions
  deploy key can *only* run `scripts/deploy.sh` (enforced via a forced command
  in `authorized_keys`), nothing else, even if the key itself ever leaked.
- **Scoped MCP write access** — Claude has a custom `write_file` tool (via the
  `ec2-tools` MCP server) hard-restricted to paths under `/var/www/bcc-v3/`
  only. No write/delete access anywhere else on the server, no command
  execution at all — builds, restarts, and DB writes still go through a human.
- **Constitutional rules enforced at the DB layer, not just app code** —
  `membership_classes` rows of type `CONSTITUTIONAL` cannot be UPDATEd or
  DELETEd via any path through MySQL (trigger-enforced). `membership_number`
  and `number_serial` cannot be changed once set (trigger-enforced). This is
  Claude's engineering judgment applied to MEM-006/007's "FROZEN/AUTHORITATIVE"
  language — flag if this is more rigidity than intended.

**What's live:**
- MySQL `bcc_v3`, dedicated app user, fully isolated from `bcc`/`bcc_v2`
- NestJS + Fastify backend, health-checked, DB-connected, PM2-managed
- Astro frontend, static build, GSAP installed, design tokens placeholder
  (**not yet** the real legacy design system — see Phase 0.5)
- Nginx + Let's Encrypt SSL for `v3bcc.bhopal.info`, API reverse-proxied at `/api/v1/`
- 10 SQL migrations: full MEM-006/007 schema (users, membership_classes,
  group entities/delegates, memberships, member_recognitions, entitlement
  tables, audit log, numbering tables, constitutional triggers)
- GitHub Actions CI/CD: push to `master` → auto build + deploy, verified working

**⚠️ Open decision requiring your confirmation before real membership data is
entered (changing it later means altering a column the constitution says must
never change):**
`membership_number` is currently composed as `BCC` + join-year + join-month +
5-digit pool serial (e.g. `BCC20260600021`). This is **Claude's interpretation**
reconciling MEM-007 Section 4 (plain serials) with Section 5 (BCC+YYYY+MM+serial)
— the source document doesn't fully resolve this itself. Confirm or correct.

**Other flagged assumptions (non-blocking, but worth a real governance answer):**
- Founding Member renewal/lifetime policy — not specified in MEM-006, defaulted to non-renewable/non-lifetime
- Patron Member renewal — defaulted to renewable pending an actual governance decision
- Who specifically gets serials `00001`–`00007` (Founding) and `00008`–`00020`
  (Historical block) — this is a committee decision, not a technical one

---

## Phase 0.5 — Design Foundation — 🔶 NEXT

Legacy site (`bcc.bhopal.info`) already has a genuinely thorough design system
— "Aperture, Focus & Light" — built with Claude Design: dark glassmorphic UI,
amber/cyan accents, full type scale, GSAP animation specs, component folder
convention. Located at `/var/www/bcc.bhopal.info/branding/BCC Design System/`
(`systemdesign.md`, `bcc-tokens.js`, plus `.jsx` page mockups for home/about/
activities/blog/join-us).

Sequence (per your explicit instruction — wireframe before high-fidelity tool):
1. **Full-site wireframe** — every page/module in the platform, low-fidelity,
   informed by the legacy design system's structure and the 17-module spec.
2. **Review wireframe** with you.
3. **Connect Claude Design** to this project for high-fidelity execution,
   carrying the legacy token system (or a deliberate evolution of it) into
   `bcc-v3/frontend`.

---

## Legacy Migration Track — runs ALONGSIDE Phases 1–3, not as one sequential block

Source: `bcc.bhopal.info`'s MySQL database (same EC2 instance, different DB/user
— credentials in that site's own `.env`, never need to be read by Claude since
there's no SQL-execution tool; all DB inspection goes through you running
commands, same pattern as `bcc_v3`). Membership data structure differs from
MEM-006/007 and needs explicit field mapping — not a direct copy.

Split into sub-tracks so "migrate early" doesn't mean "migrate before the
target schema can hold the data correctly":

- **Track A — Discovery & Field Mapping** — 🔶 CAN START NOW, no dependency.
  Inventory legacy schema (tables, row counts, content types), inventory
  portfolio/gallery assets and their storage location, produce a field-mapping
  document (legacy column → MEM-006/007 column, with explicit handling for
  anything that doesn't map cleanly).
- **Track B — Public Content & Portfolio Assets** — Phase 1 timeframe. Lower
  structural complexity than membership (mostly text + images), doesn't depend
  on the membership engine — genuinely the earliest real data that can move.
- **Track C — Membership Data** — Phase 1–2, *after* the NestJS membership
  module has working CRUD against the schema built in Phase 0, and after the
  Founding/Historical serial assignment governance decision (above) is made.
  This is the one that most needs care — legacy structure differs from
  MEM-006/007's constitutional model.
- **Track D — Parallel Operation & Cutover** — legacy site stays live and
  authoritative until V3's equivalent module is verified correct against real
  migrated data; only then does DNS/traffic actually move.

---

## Phase 1 — Foundation (Months 1–3)
Identity & User Management, Membership Management (full MEM-006/007),
Public Discovery Zone, Basic Gallery System, Communication Engine (Module 17),
New Member Onboarding. + Migration Tracks A and B running alongside.

## Phase 2a — Events & Gallery (Months 5–8)
Events & Activity Management, Photography Profiles & Portfolios, Photo Gallery
expansion. + Migration Track C begins once Module 02 is solid.

## Phase 2b — Contest Engine & Certificates (Months 8–12)
Contest Management System (15 formats, blind judging, scoring), Certificates &
Recognition.

## Phase 3 — Growth (Months 12+)
Photography School, Exhibition Management, Financial Operations (incl. expense
recording), Physical-Digital Bridge (QR check-in), Club Intelligence Dashboard.
+ Migration Track D (cutover) targeted once the relevant V3 modules are proven.

## Phase 4 — Intelligence
AI-Assisted Tagging, AI search enhancement, Critique & Feedback Module, Mobile
App (Capacitor wrapping the Astro PWA), Digital Archive.

---

## Conversation-splitting plan (your stated preference)
- **This roadmap** lives here, updated as phases close — reference it directly
  in any new conversation rather than re-pasting history.
- **Each major step** (e.g. "NestJS membership module", "full-site wireframe",
  "legacy schema discovery") gets its own fresh conversation, pointed at this
  file plus whichever constitutional doc is directly relevant.
