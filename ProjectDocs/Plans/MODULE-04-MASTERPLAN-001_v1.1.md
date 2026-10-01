# BCC Unified Platform V3 — Module 04 Masterplan & Execution Plan

**Version:** 1.1
**Status:** HUMAN AUTHORITY APPROVED — READY FOR ADOPTION
**Date:** 2026-10-01


**Document:** MODULE-04-MASTERPLAN-001
**Version:** 1.0
**Status:** PROPOSED FREEZE — HUMAN AUTHORITY APPROVED
**Date:** 2026-10-01

## 1. Authority

This masterplan is subordinate to, and must not reinterpret:

1. MEM-006 — Membership Constitution — FROZEN/AUTHORITATIVE
2. MEM-007 — Membership Numbering Constitution — FROZEN/AUTHORITATIVE
3. TECH-STACK-FREEZE — FROZEN
4. PHASE_ROADMAP — AUTHORITATIVE sequencing
5. Adopted module architecture documents
6. Existing implementation

The approved Module 04 architecture reconciliation is the basis for this execution plan.

## 2. Master Architecture Decision

Module 04 evolves into one **Activity Domain** containing three separate NestJS modules:

```text
ACTIVITY DOMAIN
├── Activity Core      modules/activity
├── Contest Engine     modules/contest
└── Exhibition Engine  modules/exhibition
```

These are separate domain modules, not three behaviors of one generic Activity entity.

### Boundary rules

- Activity Core, Contest Engine and Exhibition Engine are peers.
- Contest and Exhibition may hold nullable references to Activity where an Activity is genuinely related.
- Activity Core never imports or branches on Contest or Exhibition.
- Contest and Exhibition may depend on Activity Core.
- Exhibition may consume published Contest result data through a read-oriented interface.
- No cross-module transaction spanning business ownership.
- No generic polymorphic container/submission abstraction.
- No `events.engine`.
- No Contest or Exhibition behavior keyed from `event_type`.
- Contest entries are never `event_registrations`.
- Exhibition submissions are never `event_registrations`.
- Each engine owns its own tables, lifecycle, APIs, audit history and domain rules.
- Shared kernel is intentionally minimal: eligibility evaluation only.

## 3. Human Authority Decisions — CLOSED

The following decisions are approved:

- **HA-01:** Activity Domain umbrella with separate Activity Core, Contest Engine and Exhibition Engine.
- **HA-02:** Historical Activities are explicitly supported; historical records can be represented as finalized historical Activities.
- **HA-03:** No guest/no-account participation.
- **HA-04:** Activity refunds are governed by a per-Activity refund window; organizer cancellation produces full refund; no self-refund after start; no partial Activity refunds.
- **HA-05:** Payment holds use `payment_due_at` and PAY-001 `EXPIRED`; promoted waitlist offers receive their own deadline.
- **HA-06:** Referenced judged/awarded/selected photos receive retention protection with a minimal historical display snapshot where required.
- **HA-07:** Public archives must respect MEM-008 exposure/privacy boundaries.
- **HA-08:** COMPLETED or historical Activities cannot be cancelled.
- **HA-09:** Group Memberships confer no Membership Class and no eligibility by themselves. Eligibility is determined through the individual's own membership record and its applicable Membership Class/entitlements. Eligibility is rechecked when a person is promoted from a waitlist.
- **HA-10:** Activity, Contest and Exhibition eligibility is configured per entity by explicit membership-class lists, and evaluation also requires the member's resolved MEM-008 entitlement wherever MEM-008 defines one, including Members-only access, student-specific activities and priority registration. Discount percentages are read from entitlement configuration and are never hard-coded.
- **HA-11:** Scheduling uses an in-process runner with a MySQL advisory lock; no new standing service is introduced.
- **HA-12:** Exhibition participation fees are configurable and default to free.
- **HA-13:** Artwork sales remain outside Exhibition Engine.
- **HA-14:** Volunteer capability remains dormant.
- **HA-15:** Junior/minor-specific Contest rules are deferred.
- **HA-16:** Public attribution name is shown; profile linking occurs only when the profile is public.
- **HA-17:** Frozen MEM-006 is not modified for project-knowledge cleanup; any credential/security cleanup is handled separately.
- **HA-18:** Obsolete Membership Card dependency is removed from the Module 04/engine dependency chain if no longer real.

## 4. Activity Core Scope

**Identity rule:** Activity Core is the existing `events` module. This masterplan does not authorize a new directory, route, table family, `event.*` permission prefix, or `EVENT_REGISTRATION` rename.

Activity Core owns:

- Activity identity, slug and classification
- dates, time and location
- explicit Asia/Kolkata timezone semantics
- organizer/staff assignment
- DRAFT/PUBLISHED/CANCELLED/COMPLETED lifecycle
- eligibility configuration/evaluation
- registration and capacity
- waitlist and promotion
- invite list
- attendance and check-in/NO_SHOW
- Activity communications
- cancellation/refund decision signals
- PAY-001 Activity registration financial trigger
- cover/gallery photo references
- historical/archive handling
- Activity-domain audit trail

Activity Core does not own:

- Contest entries, judging or awards
- Exhibition works or curation
- photo identity/storage
- financial provider execution
- membership state
- RBAC grants
- certificates

## 5. Contest Engine Scope

Contest Engine owns:

- contest identity, slug and type
- rules and categories
- eligibility
- entry window and entry limits
- contest entries
- 1..N canonical photo references
- anonymous judging codes
- blind/double-blind judging
- judges and recusals
- append-only scores
- rounds
- disqualification/withdrawal
- duplicate detection
- ties
- moderation
- versioned result sets
- awards
- embargo/publication
- Contest-specific audit history
- Contest financial obligations through PAY-001

Day-one relational model:

`contests`
`contest_categories`
`contest_rounds`
`contest_eligible_classes`
`contest_entries`
`contest_entry_photos`
`contest_payment_batches`
`contest_judges`
`contest_judge_recusals`
`contest_scores`
`contest_award_definitions`
`contest_result_sets`
`contest_results`

## 6. Exhibition Engine Scope

Exhibition Engine owns:

- exhibition identity, slug, type and theme
- curators
- eligibility/open calls
- works/submissions
- curation and selection
- showings
- opening Activity reference
- sections
- captions and sequence
- attribution
- online exhibition page/archive
- Exhibition-specific audit history

Venue/print logistics are later-stage capabilities.

Artwork sales are outside this engine.

## 7. Financial Boundary

PAY-001 remains the sole financial architecture.

Activity, Contest and Exhibition business modules must not call payment providers directly.

Identifiers:

- `EVENT_REGISTRATION` — Activity registrations
- `CONTEST_ENTRY` — Contest entries
- `EXHIBITION_PARTICIPATION` — only where an Exhibition participation fee is actually enabled

No new payment state is invented. Payment expiry uses PAY-001 `EXPIRED` after verification.

PAY-001 outbox recovery remains a separate remediation concern.

## 8. Photo Boundary

- `events.cover_photo_id` is the Activity cover reference.
- `event_photos` owns Activity photo relationships.
- `photos.source_event_id` remains provenance, not membership.
- `banner_r2_key` is retired after reconciliation.
- Contest and Exhibition maintain their own real-FK photo references.
- No polymorphic photo-container reference table.
- Blind judging must use opaque judging projections/codes.
- Stored print derivatives are not created.
- A photographer-prepared print edit is a new Canonical Photo.
- Photo deletion/history follows HA-06 and the applicable Photo Architecture ruling.

## 9. Activity Lifecycle Guards

Before further Module 04 development:

1. Registration is rejected at/after `starts_at`.
2. Admin cancellation cannot operate on COMPLETED, CANCELLED or historical Activities.
3. Admin cancellation requires `event.registration.manage`.
4. Check-in accepts REGISTERED only and is protected by the Activity lock.
5. Undo check-in restores REGISTERED.
6. All consequential actions capture actor and reason where required.
7. PUBLISHED → DRAFT unpublish is allowed only with zero active registrations.
8. No new Activity lifecycle states are introduced.
9. Auto-complete is deferred until the approved job-runner stage.

## 10. Audit Boundary

Activity Domain gets an append-only audit sink covering at minimum:

- lifecycle changes
- registration status changes
- waitlist promotion
- cancellation
- check-in/undo
- refund-decision signals
- eligibility/capacity/fee changes
- invitations

Contest and Exhibition maintain their own domain histories.

Membership and financial audit trails remain owned by their respective domains.

## 11. Execution Gates

### S0 — Operational prerequisite

Owner: Rajnish

- resolve stale Activity rows operationally
- secure governance/project files as required
- keep frozen constitutional documents unchanged
- apply the approved roadmap/masterplan freeze

### S1 — Activity Core safety remediation

Owner: Claude Code

- registration time guard
- cancellation guard
- admin cancellation permission
- check-in guard/lock and required grant
- correct admin-cancel notification
- tests for the above

### S2 — Activity audit/lifecycle foundation

Owner: Claude Code

- Activity-domain audit table and actor capture
- lifecycle timestamps/actors
- registration-window fields
- historical/archive handling
- unpublish guard
- unit tests

### S3 — Governance/document adoption

Owner: Rajnish + Claude AI drafting/review

- adopt EVENT-ARCH-001 v1.1 as the reconciled Activity Domain architecture **before S4**
- update PHASE_ROADMAP
- preserve authority ordering

### S4 — Photo reconciliation

Owner: Claude Code

- cover photo FK
- event photo relationships
- provenance reconciliation
- retire legacy banner storage reference

### S5 — Activity Core completion

- implement/verify MEM-008 activity benefits: priority registration, configured activity discounts (excluding outstation tours/trips where MEM-008 excludes them), and student-specific activity eligibility; no benefit is hard-coded
Owner: Claude Code

- refund-window implementation
- verify PAY-001 `EXPIRED` and refund behavior **before implementing payment-hold expiry**; expiry is conditional on Financial Engine expiry processing (Track 3 F-003)
- staff assignment
- NO_SHOW
- waitlist promotion
- change notifications
- remaining Activity admin/self-service/exports as sequenced

### S6 — Cross-domain foundations

**Track 7 gate:** S5 new capabilities and S6 are feature/governance work and do not proceed until Track 7 closes.

Owner: Claude Code

- extract EligibilityPolicy
- implement approved eligibility modes
- implement in-process job runner with MySQL advisory lock
- reminders/expiry processing as appropriate
- real MySQL integration tests in CI
- verify PAY-001 EXPIRED and refund behavior
- verify R2 key format for blind judging
- complete PHASE H taxonomy slice required by engines

### S7 — Contest architecture freeze

**Roadmap position:** Module 03 remains Phase 2b; Contest implementation follows the Module 04 Activity Core/G2 gates.

Owner: Claude AI → Rajnish adoption

- create/adopt CONTEST-ARCH-001
- verify all Contest boundaries against this masterplan
- no Contest implementation before architecture adoption

### S8 — Contest Engine MVP

Owner: Claude Code

Implement the approved MUST Contest capabilities and their admin/public surfaces.

### S9 — Contest integration

- Module 12 certificates consume Contest read APIs
- communication uses approved dispatch/type keys
- no Contest logic added to Activity Core

### S10 — Exhibition architecture freeze

**Roadmap position:** Module 07 remains Phase 3.

Owner: Claude AI → Rajnish adoption

- create/adopt EXHIBITION-ARCH-001
- verify Exhibition boundaries against this masterplan
- no Exhibition implementation before architecture adoption

### S11 — Exhibition Engine MVP

Owner: Claude Code

Implement the approved MUST Exhibition capabilities and their admin/public surfaces.

## 12. Deferred

The following remain deferred unless separately authorized:

- recurring/series Activities
- complex approval workflows
- feedback systems
- advanced analytics
- QR/walk-in workflows
- sponsor management
- junior/minor Contest policy
- venue/physical logistics expansion
- Exhibition artwork commerce
- live Contest leaderboard
- Contest video/live-streaming
- per-contest timezone

## 13. Explicit DO-NOT-BUILD List

- exhibition submissions in `event_registrations`
- permissions derived from membership class or recognition
- entry/judging codes derived from membership numbers, user IDs or photo IDs

Do not build:

- Contest/Exhibition behavior through `event_type`
- `events.engine`
- type-specific nullable columns on `events`
- Contest entries inside `event_registrations`
- shared generic submission/container tables
- polymorphic photo/container references
- Activity Type registry before the required PHASE H taxonomy work
- new Activity lifecycle states
- stored print derivatives
- Exhibition-owned sales
- votes as reactions
- awards inside Recognition
- generic scoped RBAC
- a Module 04 event bus without a real consumer
- a new backend/service process solely for Module 04
- provider access from business modules

## 14. Freeze Gate

This masterplan is considered frozen when:

1. this document is adopted;
2. PHASE_ROADMAP is amended to match it;
3. EVENT-ARCH-001 v1.1 is adopted before S4;
4. no implementation begins from an older Module 04 sequence;
5. any future change follows the project's normal change-control process.

Until this gate is complete, implementation work must not begin.
