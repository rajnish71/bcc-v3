# EVENT-ARCH-001

# EVENTS & ACTIVITY MANAGEMENT ARCHITECTURE FREEZE v1.1

## Activity Domain — Activity Core Architecture and Domain Boundaries

Document Status:

RECONCILED v1.1 — for Human Authority adoption (Module 04 Masterplan S3;
adoption required before S4)

Document ID:
EVENT-ARCH-001

Version:
1.1

Reconciliation Date:
2026-10-01

Classification:
Backend + Data Architecture — Module 04 Activity Domain (Activity Core) and
Activity Domain boundaries

Related Documents:

* MEM-006 — Membership Constitution and Architecture v1.0 (FROZEN — constitutional authority; not modified)
* MEM-007 — Membership Numbering Constitution v1.0 (FROZEN — not modified)
* MEM-008 — Membership Plans, Benefits & Lifecycle Constitution v1.0 (Approved / Frozen / Authoritative — not modified)
* TECH-STACK-FREEZE.md (FROZEN — not modified)
* MODULE-04-MASTERPLAN-001 v1.1 — `ProjectDocs/Plans/MODULE-04-MASTERPLAN-001_v1.1.md` (Human Authority approved)
* PHASE_ROADMAP v2.9 Module 04 Amendment — `ProjectDocs/Plans/PHASE_ROADMAP-v2.9-MODULE04-AMENDMENT (1).md` (Human Authority approved; applied to `Governance/PHASE_ROADMAP.md` as roadmap v3.0 — see Revision History)
* PAY-001 — Financial Contribution and Transaction Architecture v1.0 (Approved / Frozen)
* PHOTO-ARCH-001 — Photo Asset Architecture Freeze v1.0 (Approved / Frozen)
* PHOTO-ARCH-002 — Photo Storage and Delivery Architecture Freeze v1.0 (Approved / Frozen)
* IDENTITY-ARCH-001 — Identity Architecture Freeze v1 (Approved / Frozen)
* ADMIN-ARCH-001 — unadopted, not authoritative (PHASE_ROADMAP Track 0.3); does not govern Module 04 (§12)
* PHASE_ROADMAP.md — sequencing authority
* CONTEST-ARCH-001 — future; owns detailed Contest Engine architecture (§15)
* EXHIBITION-ARCH-001 — future; owns detailed Exhibition Engine architecture (§15)

---

# PURPOSE

Establish the canonical architecture for **Activity Core** — the existing
Module 04 `events` module — covering every BCC Activity, operational or
historical, open or restricted, and its integration boundaries with
Identity, Membership, the Financial Engine, Communication and the Canonical
Photo model.

Since v1.1 this document also establishes the **Activity Domain**
boundary: Activity Core, Module 03 Contest Engine and Module 07 Exhibition
Engine are separate peer modules. This document defines their boundaries
and dependencies only. It does not design the Contest or Exhibition
schemas; those belong to CONTEST-ARCH-001 and EXHIBITION-ARCH-001.

---

# SCOPE

In scope: Activity definition, Activity Type classification, Activity
lifecycle, participation eligibility, registration, capacity/waitlist,
attendance/check-in, historical and archived Activity records, Activity-
domain audit, and the ownership boundaries listed in §14 and §15.

Out of scope: Contest identity, entries, judging and results (Module 03 —
CONTEST-ARCH-001); Exhibition identity, works, curation and showings
(Module 07 — EXHIBITION-ARCH-001); expanded volunteer management (Module
10 — dormant per HA-14); certificates/badges (Module 12); settlement,
expiry processing, refund processing and receipts (Financial Engine /
PAY-001 / Module 11); message delivery (Communication Engine / Module 17);
photo identity and storage (PHOTO-ARCH-001/002); field-level provenance
tooling.

---

# AUTHORITY

This document is subordinate to, and must not reinterpret, in this order:

1. MEM-006 (FROZEN)
2. MEM-007 (FROZEN)
3. MEM-008 (FROZEN / AUTHORITATIVE)
4. TECH-STACK-FREEZE (FROZEN)
5. PHASE_ROADMAP (sequencing authority)
6. MODULE-04-MASTERPLAN-001 v1.1 (adopted)
7. This document (EVENT-ARCH-001 v1.1)
8. Existing implementation

PAY-001, PHOTO-ARCH-001/002 and IDENTITY-ARCH-001 govern their own
domains; where Module 04 integrates with them, their rules prevail at the
boundary. No constitutional or frozen document is modified by this
reconciliation.

---

# TERMINOLOGY

**Activity Domain** — the umbrella comprising three peer modules: Activity
Core, Contest Engine (Module 03) and Exhibition Engine (Module 07). It is an
organizational grouping, not an entity, table or parent record.

**Activity** — the canonical unit Activity Core governs (implemented as the
`events` table). An Activity is not the parent of a Contest or an
Exhibition.

**Activity Type** — classification on the Activity row (`event_type`), not a
separate entity, and never a behavioural switch for Contest or Exhibition.

**Historical Activity** — an Activity with `is_historical = 1` (§6).

**Archived Activity** — an Activity with `is_archived = 1` (§5). Archived is
independent of historical.

**Membership Class**, **Group Membership** — as defined by MEM-006.
**Entitlement** — as defined by MEM-008 (configurable benefits).

**Financial Obligation**, **Financial Contribution**, **Settlement**,
**Financial Transaction**, **Receipt**, **Expired**, **Refunded** — defined
by PAY-001, consumed not redefined here.

**Canonical Photo**, **Container** — defined by PHOTO-ARCH-001, consumed not
redefined here.

---

# 1. RESOLUTION OF MEM-006 PARTICIPATION AMBIGUITY

*(Unchanged in substance from v1.0; terminology aligned to MEM-008.)*

MEM-006 Principle 1 reads in full: *"Identity is independent of
Membership. A Registered User is not automatically a Member. Membership is
established through a separate membership process."* It says nothing
about activity participation rights.

**Human Authority ruling (adopted):** MEM-006 neither grants nor prohibits
Activity participation; its silence is intentional scope separation. No
MEM-006 amendment is needed or justified.

**Binding principle:**
> Membership defines membership. Module 04 defines who is eligible to
> participate in a particular Activity, using authoritative Identity and
> Membership data and, where MEM-008 defines one, the member's resolved
> entitlement.

**Correction applied to Specification §04.1:**
> *Participation eligibility is an Activity-level configuration owned by
> Module 04, not a constitutional grant. MEM-006 establishes only that
> Identity and Membership are independent; it does not itself authorize
> or restrict Activity participation. Module 04 consumes Identity (is this
> an authenticated Registered User?), Membership (does this individual hold
> an applicable, active membership record, and of what Membership Class?)
> and MEM-008 entitlements (where MEM-008 defines the benefit) to evaluate
> the eligibility rule configured on each Activity.*

---

# 2. CANONICAL ACTIVITY MODEL

One canonical entity — the single `events` table (migration 0033; no
per-type tables). It carries: identity and slug, Activity Type, lifecycle
state, dates/time (Asia/Kolkata semantics), location, capacity, fee
configuration (obligation trigger only, §7), eligibility configuration
(§4), cover photo reference (§8), historical fields (§6) and the archive
flag (§5).

Activity Core is the existing `events` module. This document does not
authorize a new directory, route family, table family, `event.*`
permission-prefix rename, or `EVENT_REGISTRATION` rename.

No type-specific nullable columns are added to `events` for Contest or
Exhibition purposes. There is no `events.engine` column.

---

# 3. ACTIVITY TYPE MODEL

Classification on the Activity row, not a domain entity. As-built:
`event_type ENUM('PHOTOWALK','BIRD_WALK','WORKSHOP','SEMINAR','TOUR',
'MEETUP','TRAINING','CONSERVATION','EXHIBITION_EVENT','GOVERNANCE',
'AWARD_CEREMONY','ONLINE','COLLABORATIVE','OTHER')` — no `event_types`
table, no subtype tables, no per-type workflow branching.

`EXHIBITION_EVENT` and `AWARD_CEREMONY` classify an *Activity* (for
example an exhibition opening or a prize-giving gathering). They do not
represent, create or drive an Exhibition or a Contest. Contest and
Exhibition are **not** Activity Types and must never be implemented
through `event_type`. Where an Exhibition or Contest is genuinely related
to an Activity, the Exhibition/Contest holds a nullable reference to the
Activity (§15) — never the reverse.

An Activity Type registry is not built before the required PHASE H
taxonomy slice is adopted.

---

# 4. PARTICIPATION ELIGIBILITY MODEL

| Layer | Owns | Provides |
|---|---|---|
| Identity | Module 01 (IDENTITY-ARCH-001) | Is this an authenticated Registered User? |
| Membership | Module 02 (MEM-006/007/008) | Does this individual hold an applicable, active membership record? Which Membership Class? Constitutional class? |
| Entitlement | Module 02 (MEM-008 configurable entitlements) | Resolved entitlements for this member (e.g. Members-only access, student-specific activity eligibility, priority registration, Activity discount) |
| Activity Eligibility | Module 04 | Given this Activity's configured rule, does this specific Registered User qualify? |

**4.1 Account required (HA-03).** Participation requires an authenticated
Registered User. There is no guest/no-account participation. Identity-less
`GUEST` registration has been removed at the API layer; legacy `GUEST`
rows remain as data only and no new ones are created.

**4.2 Individual membership record (HA-09).** Group Memberships confer no
Membership Class and no eligibility by themselves (MEM-006: Group
Memberships are not Membership Classes). Eligibility is determined through
the individual's own membership record and its applicable Membership
Class/entitlements. Eligibility is rechecked when a person is promoted
from a waitlist.

**4.3 Explicit class lists plus resolved entitlement (HA-10).** Activity
eligibility is configured per Activity by explicit Membership Class lists,
and evaluation also requires the member's resolved MEM-008 entitlement
wherever MEM-008 defines one, including:

* Members-only Activity access
* student-specific Activity eligibility
* priority registration

Discount percentages are read from MEM-008 entitlement configuration and
are never hard-coded (MEM-008 "Configurable Benefits" and "Configurable
Entitlement Architecture"). The MEM-008 exclusion of outstation tours and
trips from certain discounts is likewise applied from configuration; how
an Activity is identified as an outstation tour/trip is resolved in S5
against MEM-008 configuration and the PHASE H taxonomy slice, not
hard-coded here.

**4.4 As-built modes.** As-built `eligibility_mode` values — `OPEN`,
`MEMBERS_ONLY`, `SPECIFIC_CLASSES` (explicit `allowed_class_ids`),
`INVITE_ONLY`, `CONSTITUTIONAL_MEMBERS_ONLY` — are retained until the
`EligibilityPolicy` extraction and approved eligibility modes (Masterplan
S6, Track-7 gated). The as-built `MEMBER_DISCOUNTED` fee mode is inert and
rejected at the API layer; Activity discounts are delivered only through
entitlement configuration (S5).

**4.5 Governance Activities.** `CONSTITUTIONAL_MEMBERS_ONLY` (used for
`event_type='GOVERNANCE'`) derives from constitutional Membership Classes
under MEM-006 Principle 4 (voting rights and constitutional participation
derive from constitutional membership classes). It is not a MEM-008
entitlement and is not configurable to include non-constitutional classes.

**4.6 Public domain policy (MEM-006).** Public Activity surfaces must not
name constitutional Membership Classes (Full, Life, Patron, Founding) in
eligibility labels or anywhere else. Public eligibility wording for such
Activities uses neutral language.

**4.7 No permissions from membership.** Eligibility is a participation
rule, not an administrative permission. Administrative permissions derive
only from RBAC (MEM-006 Principle 3); no permission is derived from
Membership Class or Recognition.

---

# 5. LIFECYCLE MODEL

Lifecycle: `DRAFT → PUBLISHED → {CANCELLED | COMPLETED}` — exactly four
states. **No new Activity lifecycle states are introduced.**

| Concept | Treatment |
|---|---|
| Registration open/closed | Date/config (registration-window fields), evaluated at request time — not a state |
| In progress | Derived at read time from `starts_at`/`ends_at` vs. now — not a state |
| Historical | `is_historical` flag (§6) — not a state |
| Archived | `is_archived` flag — not a state |
| Registration `PENDING_PAYMENT` | A registration status (§10), not an Activity lifecycle state |

**5.1 Lifecycle guards (G1 / Masterplan §9).**

1. Registration is rejected at or after the Activity's `starts_at`.
2. Activity cancellation is rejected for `COMPLETED`, `CANCELLED` and
   historical Activities (HA-08). A `COMPLETED` or historical Activity can
   never be cancelled.
3. The Activity-cancellation guard is separate from, and not satisfied by,
   the admin registration-cancellation permission (§12).
4. `PUBLISHED → DRAFT` unpublish is allowed only with zero active
   registrations.
5. Lifecycle transitions record timestamps and actors; consequential
   actions record a reason where required (§16).
6. Auto-complete is deferred until the approved in-process job runner
   (HA-11, Masterplan S6).

**5.2 Archive semantics.** `is_archived` is an independent flag layered on
a terminal lifecycle state. Archiving is presentation/curation, not a
lifecycle transition, and is distinct from historical status:

* a historical Activity is not automatically archived;
* an archived Activity is not thereby historical.

**5.3 Timezone.** Activity dates/times have explicit Asia/Kolkata
semantics. Per-Activity or per-Contest timezones are not supported unless
separately authorized.

---

# 6. HISTORICAL ACTIVITY MODEL

**Reconciled to HA-02 and the as-built implementation (migration 0102).**
v1.0's `record_mode ENUM('OPERATIONAL','HISTORICAL')` discriminator is
withdrawn; the authoritative mechanism is the explicit `is_historical`
flag.

**Mechanism (as-built unless stated):**

- `is_historical TINYINT(1) NOT NULL DEFAULT 0` on the canonical Activity
  row. No separate entity.
- Relaxed write-path validation for historical Activities: `starts_at` may
  be NULL only for a historical Activity; non-historical Activities always
  require an exact `starts_at`.
- Date uncertainty without false precision: exact (`starts_at`), partial
  (`historical_year` + optional `historical_month`) or unknown (all NULL),
  with an optional free-text `historical_date_note`.
- Provenance is Activity-level: free-text `historical_source_note`.
  Field-level provenance remains deferred.
- Publishing a historical Activity places it directly in `COMPLETED`
  (HA-02: an Activity may become historical when published to
  `COMPLETED`). Historical Activities are never cancellable (HA-08).
- No registration, financial obligation, waitlist or attendance is created
  for a historical Activity; Activity Core's service layer refuses them.
- Photos use the same Activity↔Photo relationship as operational
  Activities (§8) — no parallel mechanism.
- Public display renders a historical Activity with no registration CTA
  and no capacity/fee UI.
- `is_historical` is distinct from `is_archived` (§5.2).

**Historical participants.** v1.0's relaxed "name-only participant row with
no `user_id`" is withdrawn as inconsistent with HA-03 (no no-account
participation). Recording historical participants who have no platform
account is not authorized by this version; it requires a separate Human
Authority decision if a real need arises.

---

# 7. FINANCIAL INTEGRATION

PAY-001 is the sole financial architecture. Canonical flow (not redesigned
here):

```
Activity business rule → Financial Obligation → Financial Contribution
→ Settlement → Financial Transaction → Receipt
```

**As-built (migrations 0107/0108; commits 56ce7d8, a96179e, c348405):**
every Activity registration row gets one Financial Contribution with
business identifier `EVENT_REGISTRATION`, `business_reference_id =
event_registrations.id` and a deterministic idempotency key.

| Case | Behaviour |
|---|---|
| FREE Activity | Zero-value Contribution via the standard path — no bypass |
| Paid Activity | Registration enters `PENDING_PAYMENT` (holds a seat); the Contribution is made payable |
| Settlement success | Registration becomes `REGISTERED` only on the Financial Engine's `CONTRIBUTION_COMPLETED`; Module 04 never self-marks paid |
| Settlement failure/abandon | Registration stays pending; PAY-001 state is the only financial truth |
| Re-registration | A new Contribution per attempt |
| Idempotency | Deterministic idempotency key on Contribution creation (PAY-001) |
| `fee_paid_paise` | Legacy column; neither written nor read; not a source of truth |

**7.1 Payment hold (HA-05).** `payment_due_at` governs the payment hold on
a `PENDING_PAYMENT` registration. PAY-001 owns payment state; hold expiry
must use PAY-001 `EXPIRED` (PAY-001: expiry *policy* is set by the Business
Module, expiry *processing* is performed by the Financial Engine). A
promoted waitlist offer receives its own deadline. Payment-hold expiry is
conditional on Financial Engine expiry processing (Track 3 F-003). Module
04 must not invent a payment-expiry workaround, a local expiry state or a
Module-04-side expiry processor. `payment_due_at` is a target field, not
yet built.

**7.2 Refunds (HA-04).** Module 04 decides that a refund is owed; PAY-001
processes it (PAY-001: Refund Decision = Business Module, Refund Processing
= Financial Engine).

* Refund eligibility is governed by a per-Activity refund window (target
  configuration, S5).
* Organizer cancellation of an Activity produces a full refund of every
  completed positive-value Contribution where applicable (as-built).
* Participant self-refund is not permitted after Activity start.
* No partial Activity refunds.

**7.3 Provider boundary.** Activity Core, Contest Engine and Exhibition
Engine never call Razorpay or any Settlement Provider. Provider execution,
webhooks, settlement, expiry processing and refund execution remain in the
Financial Engine (PAY-001 / Module 11). Module 11 does not host an "Event
Fees engine"; Activity fees are obligations initiated by Activity Core and
processed through PAY-001.

Business identifiers across the Activity Domain: `EVENT_REGISTRATION`
(Activity Core), `CONTEST_ENTRY` (Contest Engine), `EXHIBITION_PARTICIPATION`
(Exhibition Engine, only where an Exhibition participation fee is enabled;
default free — HA-12). No new payment state is invented.

---

# 8. PHOTO INTEGRATION

Canonical Photo architecture (PHOTO-ARCH-001/002) governs. Activities
reference Canonical Photos; they never own them.

**Target model (Masterplan S4 — photo reconciliation):**

- `events.cover_photo_id` — nullable real FK into the Canonical Photo
  table; the Activity cover reference ("Activity Covers" per PHOTO-ARCH-001).
  Not yet built.
- `event_photos` — real-FK relationship table owning Activity↔Photo
  gallery relationships (Container/reference pattern). Not yet built.
- `photos.source_event_id` — provenance only ("taken at this Activity"),
  not gallery membership. The as-built Activity gallery (commit a1a75e9)
  currently derives gallery membership from `source_event_id`; this is
  reconciled to `event_photos` in S4.
- `events.banner_r2_key` — confirmed violation of PHOTO-ARCH-001 (root
  cause: migration 0033 predates `photos` in 0034). Retired after S4
  reconciliation and must not be resurrected or reused.

**Prohibited:**

- polymorphic photo/container reference tables (e.g. a generic
  `container_type` + `container_id` photo link);
- module-specific photo identities or duplicate uploads;
- stored print derivatives (PHOTO-ARCH-002 Principle 5: dynamic derivatives
  are never permanently stored); a photographer-prepared print edit is a
  new Canonical Photo;
- blind-judging or entry codes derived from membership numbers, user IDs or
  photo IDs (Contest/Exhibition must use opaque judging projections/codes).

**Contest/Exhibition photos.** Contest and Exhibition maintain their own
real-FK photo references in their own tables (§15).

**Retention prerequisite (HA-06).** Photos referenced by judged, awarded or
selected Contest/Exhibition work require the adopted retention treatment
(retention protection with a minimal historical display snapshot where
required). PHOTO-ARCH-002 Principle 13 currently defines Hard Delete with
removal of all Container references and an unconditional owner right to
delete. A PHOTO-ARCH-001/002 amendment or Human Authority ruling
reconciling HA-06 with Principle 13 is therefore a **prerequisite for
Contest/Exhibition implementation**. It is not a prerequisite for G1 and is
not decided by this document.

---

# 9. COMMUNICATION INTEGRATION

As-built compliant: notification type-keys dispatched through the single
`CommunicationService.dispatch(typeKey, userId, variables)` entry point; no
hand-rolled delivery. Communication Engine (Module 17) owns delivery.

Activity Core uses approved communication integration only. **No generic
Module 04 event bus** is introduced; a bus without a real consumer is
prohibited. Reminders and change notifications are sequenced work (S5/S6),
with scheduled reminders depending on the approved in-process job runner
(HA-11).

---

# 10. REGISTRATION MODEL

- Registration type: `MEMBER`-path registrations by authenticated
  Registered Users only (HA-03). `GUEST` is a legacy enum value; no new
  `GUEST` rows are created.
- Registration statuses (as-built): `REGISTERED`, `WAITLISTED`,
  `PENDING_PAYMENT`, `CANCELLED`, `ATTENDED`, `NO_SHOW`. `PENDING_PAYMENT`
  is a registration-lifecycle status ("seat held, awaiting PAY-001
  settlement"), not a financial state.
- Capacity: `NULL` = unlimited; otherwise checked against seat-holding
  statuses (`REGISTERED`, `ATTENDED`, `PENDING_PAYMENT`).
- Waitlist: synchronous promotion on cancellation; eligibility is
  rechecked on promotion (HA-09); a promoted paid offer receives its own
  payment deadline (HA-05).
- Priority registration: delivered from MEM-008 entitlement configuration
  (§4.3), not hard-coded.
- Registration after Activity start is rejected (§5.1).
- Invite list: per-Activity `event_invite_list` for `INVITE_ONLY`.

**10.1 Check-in.**

- Check-in is allowed only for `REGISTERED` participants
  (`REGISTERED → ATTENDED`).
- Undo check-in restores `REGISTERED`.
- Check-in and undo execute under the Activity-level lock to preserve
  capacity/state consistency.
- Check-in requires its RBAC grant (`event.registration.checkin`).

**10.2 Volunteer subsystem.** Tables are retained; capability is dormant
and deactivated at the API layer (HA-14).

Minor acknowledged gap (unchanged): no `registration_required: false`
concept for a pure announcement Activity — low urgency.

---

# 11. MEMBERSHIP INTEGRATION

Activity Core consumes from Membership (Module 02): the individual's
membership record `lifecycle_state`, `owner_type`, `membership_class_id`,
`membership_classes.type`, and resolved MEM-008 entitlements. It creates
and modifies none of them.

MEM-008 is Approved/Frozen/Authoritative and governs Activity-related
benefits (Members-only access, student-specific Activity eligibility,
priority registration, Activity discounts) through its configurable
entitlement system. v1.0's statement that "MEM-08 (PROPOSED) remains
excluded from eligibility logic" is withdrawn.

Activity Core never derives eligibility from a Group Membership itself
(HA-09) and never derives permissions from Membership Class or Recognition
(MEM-006 Principle 3).

---

# 12. ADMINISTRATION

**ADMIN-ARCH-001.** PHASE_ROADMAP Track 0.3 (✅ CLOSED) records that
ADMIN-ARCH-001 exists in the working tree but is unadopted and not
authoritative; if ever adopted, it is module-scoped to Member Management.
Its own Out-of-Scope section excludes events/activities administration.
ADMIN-ARCH-001 does not govern Module 04. (The v1.0 "status conflict" is
resolved by Track 0.3.)

**RBAC surface.** Activity administration uses the existing `event.*`
permission keys (`event.create`, `event.update_any`, `event.publish`,
`event.cancel_any`, `event.view_registrations`,
`event.registration.checkin`, `event.volunteer.manage` — dormant).

**Admin registration cancellation** requires `event.registration.manage`
(G1). As-built it is guarded by the read permission
`event.view_registrations`; G1 corrects this. `event.registration.manage`
authorizes cancelling a participant's registration; it does not authorize
cancelling an Activity (`event.cancel_any`, subject to §5.1 guards).

No generic scoped RBAC system is created. No permission is derived from
Membership Class or Recognition.

Admin responsibilities — scoped, not UI-designed — remain governed by this
document: Activity list/create/edit/publish/unpublish/cancel/complete,
historical record creation/editing, archive management, registration and
participant management, capacity/waitlist, attendance/check-in and undo,
financial status (read-only view from the Financial Engine), Activity
monitoring and communication requests. A partial admin surface exists
(`/hub/admin/activities`, commit a1a75e9).

---

# 13. MONITORING

Attendance counts, capacity/waitlist counts and per-Activity revenue
reporting are read-side responsibilities of Activity Core, sourced from
its own registration/attendance rows plus a read-only view of Financial
Engine data. No new owning entity.

---

# 14. OWNERSHIP MATRIX

| Domain | Activity Core (Mod 04) | Contest Engine (Mod 03) | Exhibition Engine (Mod 07) | Identity | Membership | Financial Engine | Communication | Photo Architecture |
|---|---|---|---|---|---|---|---|---|
| Activity definition/lifecycle | **OWNER** | NOT OWNER (may reference) | NOT OWNER (may reference) | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |
| Activity Type classification | **OWNER** | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |
| Activity eligibility rule | **OWNER** | NOT OWNER | NOT OWNER | CONSUMED | CONSUMED (record, class, entitlement) | NOT OWNER | NOT OWNER | NOT OWNER |
| Activity registration/waitlist/attendance | **OWNER** | NOT OWNER | NOT OWNER | CONSUMED | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |
| Historical/archived Activity record | **OWNER** | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | CONSUMED |
| Activity-domain audit | **OWNER** | own history | own history | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |
| Contest identity/entries/judging/results | NOT OWNER | **OWNER** | NOT OWNER (read published results) | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |
| Exhibition identity/works/curation/showings | NOT OWNER | NOT OWNER | **OWNER** | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |
| Financial obligation decision / refund decision | **OWNER** (Activity) | **OWNER** (Contest) | **OWNER** (Exhibition) | NOT OWNER | NOT OWNER | executes | NOT OWNER | NOT OWNER |
| Contribution/settlement/expiry/refund processing/receipt | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | **OWNER** | NOT OWNER | NOT OWNER |
| Message delivery | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | **OWNER** | NOT OWNER |
| Photo identity/storage | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | **OWNER** |
| Photo references | **OWNER** (`cover_photo_id`, `event_photos`) | **OWNER** (own FK refs) | **OWNER** (own FK refs) | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | **OWNER** (photo) |
| Membership state / RBAC grants | NOT OWNER | NOT OWNER | NOT OWNER | RBAC: Module 01 | **OWNER** (membership) | NOT OWNER | NOT OWNER | NOT OWNER |
| Certificates/badges | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER — Module 12 |
| Artwork sales | NOT OWNER | NOT OWNER | NOT OWNER (HA-13) | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER | NOT OWNER |

---

# 15. ACTIVITY DOMAIN BOUNDARIES — CONTEST AND EXHIBITION

**15.1 Structure (HA-01).**

```text
ACTIVITY DOMAIN
├── Activity Core      existing Module 04 events module
├── Module 03          Contest Engine
└── Module 07          Exhibition Engine
```

Activity Core, Contest Engine and Exhibition Engine are **peers**. Activity
is not a parent entity of Contest or Exhibition.

**15.2 Dependency rules.**

- Activity Core never imports, references or branches on Contest or
  Exhibition.
- Contest and Exhibition may depend on Activity Core and may hold nullable
  references to an Activity where one is genuinely related (e.g. an
  opening Activity or award ceremony).
- Exhibition may consume published Contest result data through a
  read-oriented interface.
- No cross-module transaction spans business ownership.
- The shared kernel is intentionally minimal: eligibility evaluation only
  (`EligibilityPolicy`, S6).
- No generic polymorphic submission/container abstraction is shared across
  the engines.

**15.3 Contest Engine (Module 03).** First-class identity; own URL/domain
identity; own lifecycle; own persistence; own audit history; own API
boundary; own entry/submission model. **Contest entries are not
`event_registrations`.** Contest financial obligations use PAY-001
(`CONTEST_ENTRY`). Detailed architecture belongs to **CONTEST-ARCH-001**,
which must be adopted before any Contest implementation. Junior/minor-
specific Contest rules are deferred (HA-15).

**15.4 Exhibition Engine (Module 07).** First-class identity; own URL/domain
identity; own lifecycle; own persistence; own audit history; own API
boundary; own submission model. **Exhibition submissions are not
`event_registrations`.** Participation fees are configurable and default
to free (HA-12). Artwork sales are outside the Exhibition Engine (HA-13).
Detailed architecture belongs to **EXHIBITION-ARCH-001**, which must be
adopted before any Exhibition implementation.

**15.5 Public attribution and archive exposure.**

- Public attribution shows the public attribution name; a profile link is
  shown only when the photographer profile is public (HA-16).
- Public Contest/Exhibition archives must respect MEM-008 privacy/exposure
  rules (HA-07). The exact archive exposure model is established by
  CONTEST-ARCH-001 / EXHIBITION-ARCH-001 and the photo retention ruling
  (§8), not by this document.

**15.6 Other future modules.** Activity Core integrates with, but never
absorbs, Module 10 (Volunteer Management — dormant), Module 12
(Certificates & Badges — consumes published Contest/Exhibition read APIs)
and Module 14 (cross-domain archive navigation). The obsolete Membership
Card dependency is removed from the Contest/Exhibition dependency chain
unless independently confirmed as real (HA-18); Membership certificates
may retain a legitimate Membership Card dependency.

---

# 16. AUDIT

Activity Core maintains an append-only Activity-domain audit sink (S2)
capturing actor and, where required, reason for at minimum:

- Activity lifecycle actions (publish, unpublish, cancel, complete) and
  lifecycle timestamps/actors
- registration status changes, including admin registration cancellation
  (actor + reason)
- waitlist promotion
- check-in and undo check-in
- refund-decision signals
- eligibility, capacity and fee changes and other administrative changes
- invitations

Contest and Exhibition maintain their own domain histories. Membership and
financial audit trails remain owned by their respective domains.

---

# 17. DATA MODEL STATUS & IMPLEMENTATION GAPS

| Concept | Classification | Status |
|---|---|---|
| Activity | Entity (`events`) | Exists |
| Activity Type | Attribute (`event_type`) | Exists |
| Activity eligibility | Attribute/config | Exists (as-built modes); `EligibilityPolicy` S6 |
| Activity registration | Entity (`event_registrations`) | Exists |
| Attendance | Registration status | Exists; check-in guard/undo G1 |
| Activity ↔ Financial Contribution | Relationship (PAY-001) | ✅ Implemented (0107/0108) |
| Historical Activity | Attribute (`is_historical` + historical fields) | ✅ Implemented (0102) |
| Archive | Attribute (`is_archived`) | Not built (G1/S2) |
| Registration window | Attribute (dates) | Not built (G1/S2) |
| Lifecycle timestamps/actors | Attributes | Not built (G1/S2) |
| Activity-domain audit | Append-only sink | Not built (G1/S2) |
| Payment hold | `payment_due_at` + PAY-001 `EXPIRED` | Not built (S5; depends on F-003) |
| Refund window | Per-Activity config | Not built (S5) |
| Activity cover | `events.cover_photo_id` FK | Not built (S4) |
| Activity gallery | `event_photos` | Not built (S4); currently via `source_event_id` |
| Field-level provenance | — | Deferred |

**Gaps closed since v1.0:** PAY-001 wiring; historical Activity support;
public `/activities` reads the live Events API; partial admin Activities
surface; Module 04 backend specs (`events.*.spec.ts`).

**Open gaps (target already defined here):** G1 guards and audit (§5.1,
§10.1, §12, §16); photo reconciliation (§8); payment hold and refund window
(§7); MEM-008 Activity entitlements (§4.3); `EligibilityPolicy`; in-process
job runner with MySQL advisory lock (HA-11); real MySQL integration tests
in CI.

---

# 18. IMPLEMENTATION SEQUENCE

Sequencing is governed by PHASE_ROADMAP and MODULE-04-MASTERPLAN-001 v1.1:

| Stage | Content | Gate |
|---|---|---|
| S0 | Operational prerequisites | Rajnish |
| **G1 = S1 + S2** | Registration-after-start guard; cancellation guard; `event.registration.manage`; check-in REGISTERED-only + lock; check-in undo; admin-cancel notification; Activity audit + actor/reason; lifecycle timestamps/actors; registration-window fields; historical/archive/unpublish guards; tests | Existing Module 04 reconciliation exemption |
| S3 | Adopt this document (v1.1) and the roadmap amendment | Before S4 |
| S4 | Photo reconciliation (§8) | Reconciliation exemption; after S3 |
| S5 | Activity Core completion incl. MEM-008 benefits, refund window, payment hold (F-003-conditional) | Track 7 closure (new capability) |
| S6 | `EligibilityPolicy`, approved eligibility modes, job runner, MySQL CI, PAY-001 `EXPIRED`/refund verification, R2 key-format verification for blind judging, PHASE H slice | Track 7 closure |
| S7–S9 | CONTEST-ARCH-001 → Contest Engine (Module 03 / Phase 2b) | Own architecture gate |
| S10–S11 | EXHIBITION-ARCH-001 → Exhibition Engine (Module 07 / Phase 3) | Own architecture gate |

---

# 19. VALIDATION CHECKLIST

- [ ] EVENT-ARCH-001 v1.1 adopted by Human Authority (before S4)
- [x] PHASE_ROADMAP updated with the Module 04 Activity Domain amendment
- [x] Specification §04.1 wording correction recorded (§1)
- [x] Historical Activity implemented via `is_historical` (0102)
- [x] Activity registrations produce a real Financial Contribution (0107)
- [x] `/activities` calls the live API
- [ ] G1 guards, permission, check-in undo and audit implemented with tests
- [ ] `is_archived`, registration window, lifecycle timestamps/actors
- [ ] `cover_photo_id` + `event_photos`; `banner_r2_key` retired
- [ ] Photo retention ruling (HA-06 vs PHOTO-ARCH-002 P13) before Contest/Exhibition
- [ ] Lifecycle remains exactly four states

---

# 20. EXPLICIT DO-NOT-BUILD

- Contest as `event_type`; Exhibition as `event_type`; Contest/Exhibition behaviour keyed from `event_type`
- `events.engine`; type-specific nullable columns on `events`
- Contest entries in `event_registrations`; Exhibition submissions in `event_registrations`
- generic polymorphic submission/container tables; polymorphic photo/container references
- generic scoped RBAC
- a Module 04 event bus
- new Activity lifecycle states
- stored print derivatives
- a new standing service/process (HA-11: in-process runner only)
- permissions derived from Membership Class or Recognition
- entry/judging codes derived from membership numbers, user IDs or photo IDs
- per-Contest (or per-Activity) timezone unless separately authorized
- Exhibition-owned artwork sales
- guest/no-account participation
- eligibility derived from Group Membership itself
- hard-coded discount percentages or entitlement decisions
- Module 04 calls to Razorpay or any Settlement Provider; Module 04 payment-expiry workaround
- `banner_r2_key` resurrection
- Activity Type registry before the PHASE H taxonomy slice
- votes as reactions; awards inside Recognition

---

# FINAL DECISION GATE

EVENT-ARCH-001 is reconciled to MEM-006, MEM-007, MEM-008, TECH-STACK-
FREEZE, PAY-001, PHOTO-ARCH-001/002, IDENTITY-ARCH-001 and MODULE-04-
MASTERPLAN-001 v1.1. G1 (S1 + S2) proceeds under the existing Module 04
reconciliation exemption. S4 requires adoption of this version. Contest/
Exhibition implementation additionally requires CONTEST-ARCH-001 /
EXHIBITION-ARCH-001 and the photo retention ruling (§8).

**READY FOR G1**

---

Revision History

v1.1 (2026-10-01) — Reconciliation
Reason: reconcile v1.0 to MODULE-04-MASTERPLAN-001 v1.1 (Human Authority
approved, decisions HA-01 – HA-18), to MEM-008 (now Approved/Frozen), and to
the as-built implementation, before Module 04 G1 work.
Source authorities: MEM-006, MEM-007, MEM-008, TECH-STACK-FREEZE,
MODULE-04-MASTERPLAN-001 v1.1, PHASE_ROADMAP v2.9 Module 04 amendment,
PAY-001, PHOTO-ARCH-001/002, IDENTITY-ARCH-001, PHASE_ROADMAP Track 0.3.
Material changes: Activity Domain structure and Contest/Exhibition
boundaries (§15); `record_mode` replaced by `is_historical`, historical vs
archived separated (§5–§6); guest participation removed (§4, §10);
MEM-008 entitlements and HA-09/HA-10 eligibility (§4, §11); lifecycle and
check-in guards, `event.registration.manage` (§5, §10, §12); payment hold,
`EXPIRED` and refund rules (§7); photo boundary and retention prerequisite
(§8); audit (§16); ADMIN-ARCH-001 status resolved per Track 0.3 (§12);
implementation status refreshed (§17); do-not-build list (§20).
No constitutional or frozen document was modified. The file name retains
its v1.0 label; the authoritative version is the one recorded in this
header.

v1.0 (PROPOSED)
Initial draft — consolidated the Module 04 Pre-Freeze Reconciliation
Report, the participation-eligibility ruling, the historical-activity
requirement and the PHASE_ROADMAP Module 04 entry.

---

EVENT-ARCH-001 — Events & Activity Management Architecture Freeze v1.1

Subordinate to MEM-006, MEM-007, MEM-008, TECH-STACK-FREEZE and
MODULE-04-MASTERPLAN-001 v1.1; PAY-001, PHOTO-ARCH-001/002 and
IDENTITY-ARCH-001 prevail at their integration boundaries.

END OF DOCUMENT
