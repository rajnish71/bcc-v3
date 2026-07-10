BCC Unified Platform · Functional Specification v3.0 (Tech Stack Frozen) · June 2026
 
| **BHOPAL CAMERA CLUB** UNIFIED PLATFORM Complete Functional Specification *Version 3.0 — Technology Stack Frozen Edition* Membership Architecture: MEM-006 FROZEN AUTHORITATIVE  ·  MEM-007 FROZEN AUTHORITATIVE 10-Year Horizon · Modular · Scalable · Mobile-Ready · June 2026 |
| --- |
 
This document is the complete functional specification for the BCC Unified Platform V2. It adopts two constitutional documents as its governing foundation:
 
*MEM-006 (Membership Constitution and Architecture v1.0) — governing identity separation, membership classification, recognition, entitlements, governance, and voting rights.*
 
*MEM-007 (Membership Numbering Constitution v1.0) — governing membership number permanence, uniqueness, non-reuse, sequential allocation, founding reservations, and historical continuity.*
 
*Both documents are APPROVED, FROZEN, and AUTHORITATIVE. Their rules are not configurable. They flow through every domain of this platform.*
 
*HUB-ARCH-001 (Hub Component Architecture Freeze v1.0) — governing authenticated Member Hub frontend composition, component hierarchy, authentication ownership, RBAC model, and component communication. All Hub page implementation shall conform to this architecture. See `Architecture/HUB_COMPONENT_ARCHITECTURE_FREEZE_v1.0.md`.*

*PHOTO-ARCH-001 is the authoritative architectural document governing all photographic assets and reusable media references.*
 
| CONSTITUTIONAL DOCUMENT — MEM-006  ·  MODULE CONST  **MEM-006 CONSTITUTIONAL FOUNDATION** *The five principles and domain model that govern all membership architecture in this platform* |
| --- |
 
MEM-006 is FROZEN and AUTHORITATIVE. Every module in this specification inherits these principles. They cannot be overridden by configuration, by admin action, or by future implementation decisions without full constitutional review.
 
**The Five Constitutional Principles**
 
| **No.** | **Principle** | **Architectural Consequence** |
| --- | --- | --- |
| **P1** | **Identity is independent of Membership** | A Registered User exists with a full platform identity. No membership is implied or granted by registration. Membership is a separate process with its own workflow, approval, and lifecycle. |
| **P2** | **Membership is independent of Recognition** | Recognition does not create membership. Membership does not automatically create recognition. They are parallel tracks that interact only through the Entitlement Resolution formula. |
| **P3** | **Membership is independent of RBAC** | Administrative permissions are governed exclusively through RBAC. No membership class — constitutional or operational — grants any administrative permission. A Life Member with no RBAC role has zero admin access. |
| **P4** | **Governance authority is separate from operational authority** | Voting rights and constitutional participation derive exclusively from Constitutional Membership Classes. RBAC roles do not confer voting rights. Recognition does not confer voting rights. |
| **P5** | **Membership classes are constitutionally governed** | The constitutional layer is intentionally small and stable. Constitutional classes cannot be created, deleted, or modified through admin configuration. Any change requires constitutional authority, architecture review, and implementation authorization. |
 
**The Membership Domain Model**
 
This is the constitutionally defined layered model. Implementation must follow this exact hierarchy:
 
| **LAYER 1 — IDENTITY** Registered User. Created at registration. Exists regardless of membership status. **LAYER 2 — MEMBERSHIP** Membership Class (Constitutional or Operational) or Group Membership Type. Established through separate membership process. Not automatic. **LAYER 3 — RECOGNITION** Auto Track (Senior, Honorary Senior) or Governance Track (Honorary Member, Honorary Mentor, Honorary Grandmaster). Single active at any time. Independent of Membership Class. **LAYER 4 — ENTITLEMENTS** Dynamically resolved: Base(Membership Class) + Modifiers(Active Recognition) + Individual Overrides. This formula is constitutionally frozen. *RBAC and Governance Participation are independent overlays — not layers of this model.* |
| --- |
 
**Complete Classification Reference**
 
This is the complete authority table of all membership classes and types as defined by MEM-006:
 
| **Class / Type** | **Category** | **Voting Eligible** | **Governance Eligible** | **Admin-Configurable** | **Notes** |
| --- | --- | --- | --- | --- | --- |
| Full Member | Constitutional | **YES** | **YES** | NO — Protected | Primary constitutional class for active governance participation. Renewable. |
| Life Member | Constitutional | **YES** | **YES** | NO — Protected | Permanent constitutional membership. No renewal required. |
| Patron Member | Constitutional | **YES** | **YES** | NO — Protected | Premium constitutional class. Renewal policies configurable through governance only. |
| Founding Member | Constitutional | **YES** | **YES** | NO — Closed | Closed class. No new Founding Members. Cannot be created by administrators. |
| Basic Member | Operational | NO | NO | **YES** | Entry-level participation class. Configuration-driven. |
| Student Member | Operational | NO | NO | **YES** | Student participation class. Configuration-driven. |
| Individual Member | Operational | NO | NO | **YES** | Standard individual participation class. Configuration-driven. |
| Family Membership | Group Type | NO — Entity | NO — Entity | **YES** | Belongs to family entity. Delegates are individual users. Voting rights not inherited. |
| Corporate Membership | Group Type | NO — Entity | NO — Entity | **YES** | Belongs to corporate entity. Delegates are individual users. |
| Institutional Membership | Group Type | NO — Entity | NO — Entity | **YES** | Belongs to institutional entity. Delegates are individual users. |
 
**Recognition Architecture Reference**
 
| **Recognition Class** | **Track** | **Assignment Mode** | **Supersedes** | **Single Active Rule** |
| --- | --- | --- | --- | --- |
| Senior Member | AUTO Track | System-triggered: tenure ≥ 5yr + portfolio ≥ 10 photos (configurable) | Nothing — lowest precedence | Yes |
| Honorary Senior Member | AUTO Track | System-triggered: tenure ≥ 10yr + portfolio ≥ 25 photos (configurable) | Supersedes Senior Member | Yes |
| Honorary Member | GOVERNANCE Track | Manual — governance/admin action with audit log | Supersedes any AUTO recognition | Yes |
| Honorary Mentor | GOVERNANCE Track | Manual — governance/admin action with audit log | Supersedes any AUTO recognition | Yes |
| Honorary Grandmaster | GOVERNANCE Track | Manual — governance/admin action with audit log — highest honour | Supersedes all other recognition | Yes |
 
*SINGLE ACTIVE RULE (MEM-006): A Member may hold at most one active recognition at any time. When a Governance Recognition is bestowed, any active Automatic Recognition is deactivated and moved to the Historical Recognition Ledger. The ledger is non-destructive — no recognition record is ever deleted.*
 
**Entitlement Resolution Formula — Constitutionally Frozen**
 
*This formula is constitutionally frozen by MEM-006 and cannot be modified by configuration, admin action, or implementation decision: Resolved Entitlements = Base(Membership Class) + Modifiers(Active Recognition) + Individual Overrides. Resolution order is fixed: Class first, Recognition second, Overrides third.*
 
**Membership Lifecycle States — No Simplification Authorised**
 
| **State** | **Description** | **Transitions To** | **Notes** |
| --- | --- | --- | --- |
| PENDING | Application submitted, awaiting review | APPROVED, REJECTED | Initial state for all new applications |
| APPROVED | Application approved, awaiting activation | ACTIVE | Payment collection or admin activation moves to ACTIVE |
| ACTIVE | Full membership benefits active | SUSPENDED, EXPIRED, TERMINATED | Normal operational state |
| SUSPENDED | Membership temporarily suspended | ACTIVE, TERMINATED | Disciplinary or administrative action. Benefits suspended. |
| EXPIRED | Renewal deadline passed without renewal | ACTIVE (on renewal), TERMINATED | Grace period may apply per class configuration |
| TERMINATED | Membership permanently ended | None — terminal state | Requires explicit governance action or constitutional cause |
| REJECTED | Application rejected | None — applicant may re-apply as new application | Rejection reason must be recorded |
 
*MEM-006 DIRECTIVE: No lifecycle simplification is authorised. All seven states must be implemented exactly as specified. No states may be merged, removed, or bypassed.*
 
**MEM-007 — Membership Numbering Constitution Summary**
 
MEM-007 governs the identity and permanence of Membership Numbers. It is constitutionally separate from MEM-006 but operates within the same constitutional framework. Full implementation is in Module 02.6.
 
| **No.** | **Principle** | **Architectural Consequence** |
| --- | --- | --- |
| **MP-001** | **Permanence** | Once assigned, a Membership Number never changes. Class upgrades, renewals, suspensions, expiry, and termination do not alter the number. It is a lifetime identifier. |
| **MP-002** | **Uniqueness** | A number belongs to exactly one membership record. No two records — past or present, active or terminated — may share a number. |
| **MP-003** | **Non-Reuse** | Numbers are never recycled. Termination, resignation, death, or expiry does not release a number back into the pool. The numbering pool only ever grows. |
| **MP-004** | **Sequential Allocation** | Single unified pool. No separate sequence per membership class. Operational allocation starts at 00021. System-only after migration — no manual allocation. |
| **MP-005** | **Historical Continuity** | Pre-platform member records are normalised into the BCC numbering format preserving original joining year and month. Founding Member serials 00001–00007 and Historical Block 00008–00020 are permanently reserved. |
 
| **Reserved Block** | **Serials** | **Rule** |
| --- | --- | --- |
| Founding Member Reservation | 00001 – 00007 | Exclusively for Founding Members. Permanent. Cannot be released or reassigned to any other class. |
| Historical Allocation Block | 00008 – 00020 | For formative-era members who were not Founding Members. Unused numbers remain permanently reserved — never released to operational allocation. |
| Operational Allocation | 00021 onwards | System-managed sequential allocation. Fully automatic after migration completion. |
| Pre-incorporation format | BCC201911XXXXX | Members joining before October 2019. Year frozen to joining year. |
| Historical format (known yr+mo) | BCCYYYYMMXXXXX | Year and month preserved from original records. |
| Historical format (year only) | BCCYYYY01XXXXX | Month defaults to 01 when original month unknown. |
| Temporary identifier | BCCTempXXXXX | Migration/onboarding only. Not a Membership Number. Retired on permanent number assignment. |
 
| MODULE 01  **IDENTITY ****&**** USER MANAGEMENT** *The foundational layer — every person on the platform begins here, regardless of membership* |
| --- |
 
*MEM-006 P1: Identity is independent of Membership. A Registered User is not automatically a Member. Registration creates: User Account, Identity Record, Authentication Relationship. Registration does NOT create Membership, Recognition, or Governance Authority.*
 
**01.1  What Registration Creates**
 
- User account with unique user_id
 
- Identity record: email, phone, display name, profile
 
- Authentication relationship (credentials, sessions, OAuth tokens)
 
- A role of 'Registered User' with baseline platform access
 
- Nothing else — no membership, no recognition, no voting right, no admin access
 
**01.2  Registration Methods**
 
- Email + password with email verification
 
- Phone number + OTP (India-first — WhatsApp OTP option)
 
- Social login: Google, Facebook, Instagram
 
- Magic link (passwordless — email a sign-in link)
 
- Admin-created account (coordinator creates account for a member)
 
- Invitation-based: receive invite link, complete registration
 
**01.3  Profile Management**
 
- Full name, display name, username (unique, URL-safe)
 
- Profile photograph — auto-cropped to multiple sizes
 
- Bio, city, state, country
 
- Date of birth (drives Senior Member auto-recognition eligibility checks)
 
- Photography experience level (self-declared)
 
- Camera gear list: bodies, lenses, accessories
 
- Social handles: Instagram, Flickr, 500px, YouTube, website
 
- Language preference: Hindi / English
 
- Notification preferences per channel and per event type
 
- Privacy controls: profile visibility, portfolio visibility, activity visibility
 
- Account deletion: data export first, then soft-delete with 30-day grace
 
**01.4  Session ****&**** Security**
 
- Multi-factor authentication: TOTP apps, SMS OTP, email OTP
 
- Biometric login for mobile: fingerprint, Face ID via Capacitor
 
- Active session management: view and revoke sessions by device
 
- Login history: device, IP, location, timestamp
 
- Suspicious login detection and alert
 
- Account lockout after repeated failed attempts, with unlock workflow
 
- Admin: suspend, ban, reinstate — all with audit log and reason
 
- PDPB-aligned data export and erasure on request
 
**01.5  RBAC — Roles ****&**** Permissions**
 
*MEM-006 P3: RBAC is fully decoupled from Membership and Recognition. Administrative roles are assigned independently of membership class. A Life Member with no RBAC role has zero admin access. A Basic Member with an assigned RBAC role can have full admin access.*
 
- System roles: Super Admin, Platform Admin
 
- Operational roles: Coordinator, Membership Manager, Event Manager, Finance Manager, Contest Manager, Exhibition Curator, Content Editor, Moderator, School Mentor, Judge
 
- Roles are additive: a user may hold multiple roles simultaneously
 
- Role assignment is time-scoped: Judge role for Contest #14 only, not permanent
 
- Permission matrix is fully configurable from admin panel
 
- All role assignments and changes are audit-logged with actor and reason
 
- Role assignment UI: admin panel CRUD interface — assign/revoke roles per user, enforced at NestJS Guard layer
 
**01.6  Registered User Capabilities (Non-Member)**
 
A Registered User who has not completed membership has the following baseline platform access:
 
- Browse all public content: gallery, events calendar, contest listings, exhibition archive
 
- Register and participate in activities explicitly open to non-members
 
- Submit contest entries for contests explicitly open to non-members
 
- Access foundation-level school lessons marked as publicly accessible
 
- Maintain a basic profile
 
- Receive platform communications they have opted into
 
- All actions above are subject to module-level configuration. Coordinators can open or restrict any activity to members-only.
 
| CONSTITUTIONAL DOCUMENT — MEM-006  ·  MODULE 02  **MEMBERSHIP MANAGEMENT** *Constitutional governance of the BCC membership — implementing MEM-006 in full* |
| --- |
 
This module implements MEM-006 in its entirety. Every feature in this module is derived from or governed by MEM-006. The membership management system is the authoritative source of membership state for all other modules.
 
**02.1  Constitutional Class Implementation**
 
*The four Constitutional Classes (Full, Life, Patron, Founding) cannot be created, deleted, or modified through the admin interface. They are seeded at database initialisation and thereafter protected. Any admin attempt to modify them must be rejected by the system.*
 
- Full Member: renewable, annual or configurable-period fee, voting eligible, governance eligible
 
- Life Member: one-time fee or governance waiver, no renewal, permanent, voting eligible, governance eligible
 
- Patron Member: premium class, voting eligible, governance eligible, renewal terms configurable through governance only
 
- Founding Member: CLOSED — no new assignments possible. System rejects any creation attempt. Existing founding members maintained. Display-only class for historical record.
 
*CONSTITUTIONAL PROTECTION: The admin panel must not expose Create, Edit, or Delete controls for Constitutional Classes. These are read-only records — the NestJS service layer rejects any mutation attempt with a 403 Forbidden response and logs the attempt to the audit trail.*
 
**02.2  Operational Class Implementation**
 
*Operational Classes (Basic, Student, Individual) are configuration-driven. Administrators can adjust entitlements, fees, eligibility criteria, and terms through the admin panel. They cannot grant voting rights or governance participation — those are constitutionally reserved.*
 
- Basic Member: entry-level, configurable fee (may be free), limited entitlements
 
- Student Member: requires student ID verification, age or institution validation, discounted fee
 
- Individual Member: standard participation class, configurable fee and entitlements
 
- All operational classes: configurable renewal period, fee, and entitlement set
 
- Operational class configuration is versioned — changes take effect for new memberships, not existing ones, unless explicitly migrated
 
**02.3  Group Membership Implementation**
 
*MEM-006 GROUP PRINCIPLE: A Group Membership belongs to the Group entity, not to individual participants. Delegates are individual Registered Users who receive access through the group**'**s membership. The Group entity is the membership holder.*
 
- Family Membership: one family entity, configurable number of family member delegates
 
- Primary holder: designated adult, manages delegates
 
- Delegates: linked individual accounts, inherit family membership entitlements
 
- Delegate addition/removal managed by primary holder or coordinator
 
- Corporate Membership: corporate entity with company profile, designated delegates
 
- Company admin manages delegate list within their allocation
 
- Delegates are employees — individual Registered User accounts
 
- Company admin cannot grant voting rights to delegates — none exist at group level
 
- Institutional Membership: educational or civic institution, delegate-based like corporate
 
- All group types: group-level invoice and payment, group-level renewal, group-level reporting
 
- Group entity has its own profile page separate from delegate profiles
 
**02.4  Application Workflow**
 
- Online application form — fields configurable per class
 
- Document upload: ID proof, student ID, corporate registration certificate, as applicable
 
- Application fee collection: online payment via Razorpay (UPI, cards, net banking) or manual (cash recorded by coordinator)
 
- Auto-screening: check for duplicate accounts, verify minimum age, validate documents
 
- Coordinator review: application dashboard in admin panel — approve, request clarification, reject
 
- Multi-stage approval for constitutional classes: coordinator → committee → final approval
 
- Applicant portal: track application status, respond to clarifications, upload additional documents
 
- Communication at each stage: email + WhatsApp + SMS with status and next step
 
- Rejection: reason recorded, communicated to applicant, re-application allowed after 30 days
 
- Bulk import: CSV/Excel upload for migrating existing member records
 
**02.5  Lifecycle State Engine**
 
The seven-state lifecycle machine governs every membership record. All state transitions are logged.
 
| **Transition** | **Trigger** | **Actor** | **Side Effects** |
| --- | --- | --- | --- |
| → PENDING | Application submitted | System (automatic) | Application confirmation email. Coordinator notified. |
| PENDING → APPROVED | Coordinator / committee approves | Coordinator or Admin | Approval email. Fee invoice generated if not pre-paid. Membership number reserved. |
| PENDING → REJECTED | Coordinator / committee rejects | Coordinator or Admin | Rejection email with reason. Reason stored in audit log. |
| APPROVED → ACTIVE | Payment confirmed or manual activation | System / Coordinator | Membership number issued (MEM-007). Membership card generated. Welcome email via Module 17. Entitlements activated. |
| APPROVED — payment failure | Razorpay webhook fails or times out | System (automatic) | Membership stays in APPROVED state. pending_payment_id cleared. Member notified via Module 17 to retry. No membership number assigned yet — MEM-007 number assignment only triggers on successful ACTIVE transition. |
| APPROVED — duplicate payment attempt | Member submits payment twice | System (idempotency check) | Second payment rejected using Razorpay idempotency key. Only one payment processed. First success triggers ACTIVE. Duplicate charge refunded automatically. |
| ACTIVE → SUSPENDED | Disciplinary or administrative action | Coordinator or Admin with reason | Benefits suspended. Member notified. Reason and actor logged. |
| SUSPENDED → ACTIVE | Suspension lifted | Coordinator or Admin | Benefits restored. Member notified. |
| ACTIVE → EXPIRED | Renewal deadline passed | System (scheduled job) | Reminder sequence triggered. Grace period begins. Benefits may be partially restricted. |
| EXPIRED → ACTIVE | Member renews during grace period | System / Member / Coordinator | Full benefits restored. New expiry date calculated. |
| ANY → TERMINATED | Governance decision or constitutional cause | Admin with governance authority | All benefits terminated. Record preserved permanently. Re-admission requires new application. |
 
**02.6  Membership Numbering — MEM-007 Constitutional Rules**
 
*MEM-007 is APPROVED, FROZEN, and AUTHORITATIVE. Membership numbers are permanent constitutional identifiers. The five governing principles are: MP-001 Permanence, MP-002 Uniqueness, MP-003 Non-Reuse, MP-004 Sequential Allocation, MP-005 Historical Continuity. No future implementation may introduce multiple numbering pools, manual allocation workflows, reusable numbering, or editable permanent numbering without a formally approved amendment to MEM-007.*
 
**Numbering Principles (MP-001 through MP-005)**
 
- MP-001 PERMANENCE: Once assigned, a Membership Number shall never change — regardless of class upgrade, renewal, suspension, expiry, or any other lifecycle event
 
- MP-002 UNIQUENESS: A Membership Number belongs to one membership record only — no number may appear on more than one membership record at any time or in any state
 
- MP-003 NON-REUSE: Membership Numbers are never recycled — termination, expiration, suspension, resignation, or death does not release a number back into circulation
 
- MP-004 SEQUENTIAL ALLOCATION: Numbers are allocated sequentially from a single unified numbering pool — membership class does not create a separate numbering sequence
 
- MP-005 HISTORICAL CONTINUITY: Numbering preserves historical continuity wherever practical during migration and onboarding
 
**Unified Numbering Pool ****&**** Format**
 
- Single pool for all membership classes — Full, Life, Patron, Founding, Basic, Student, Individual, Group delegates all draw from the same sequence
 
- Format: BCC + YYYY + MM + 5-digit serial — e.g. BCC202406 00021
 
- YYYY = original year of joining (frozen — migration must not alter this)
 
- MM = original month of joining, or 01 when historical month is unavailable
 
- Serial = zero-padded 5-digit sequential number from the unified pool
 
**Reserved Number Allocations (Permanent — Cannot Be Released)**
 
| **Serial Range** | **Reservation** | **Rule** |
| --- | --- | --- |
| 00001 – 00007 | Founding Member Reservation | Permanently reserved exclusively for Founding Members. These seven serials cannot be assigned to any non-Founding Member under any circumstance. Unused slots remain permanently reserved. |
| 00008 – 00020 | Historical Allocation Block | Reserved for individuals associated with BCC during its formative years who were not Founding Members but whose historical continuity warrants preservation. Unused numbers in this range remain permanently reserved — they are never released to operational allocation. |
| 00021 onwards | Operational Sequential Allocation | All permanent membership allocations from 00021 onwards proceed sequentially and automatically. No manual selection permitted after migration completion. |
 
**Pre-Incorporation ****&**** Historical Number Formats**
 
- Members joining prior to legal incorporation (October 2019): BCC201911XXXXX — year frozen to joining year, month defaults to 11
 
- Historical records with known year but unknown month: BCCYYYY01XXXXX — 01 as default month placeholder
 
- Historical records with known year and month: BCCYYYYMMXXXXX — exact values preserved
 
- The joining year component is frozen to the member's original year of joining — migration activities shall not alter this value
 
**Temporary Onboarding Identifiers**
 
- Format: BCCTempXXXXX — issued only during migration, onboarding, or transitional operations
 
- Temporary identifiers are NOT Membership Numbers — they carry no constitutional authority
 
- Retirement rule: upon assignment of a permanent number, BCCTempXXXXX is immediately retired
 
- After retirement: temporary identifiers must not remain active, displayed, searchable, or authoritative in any system view
 
- After migration completion: temporary identifier format shall cease to be used entirely
 
**Allocation Trigger ****&**** System Authority**
 
- ALLOCATION TRIGGER: permanent number is assigned as the final step of membership activation — specifically the APPROVED → ACTIVE lifecycle transition
 
- Application review, payment processing, approval workflows, and temporary identifiers do NOT trigger permanent number assignment
 
- System allocates the next available sequential number automatically — no human selection, no manual override
 
- Manual number selection is prohibited. Manual number assignment is prohibited. Manual number modification is prohibited.
 
- After migration completion, administrative authority over number allocation ceases entirely — the system is the sole authority
 
**Immutability Enforcement**
 
- Database: membership_number column is write-once — application layer rejects any UPDATE after initial INSERT
 
- No admin panel control exposes an edit field for membership_number on any existing record
 
- Audit log records the number assignment event — actor = system, timestamp, membership_id
 
- Number cannot be reset even by Super Admin — system-level constraint, not just UI restriction
 
**Migration Governance**
 
- Historical migration allocation is a one-time activity — founding reservations, historical block, and legacy record normalisation
 
- During migration only: approved administrative processes may assign founding reservations, historical block numbers, and normalise pre-platform records
 
- After migration completion: permanent numbering becomes fully system-managed with no administrative override capability
 
**02.7  Digital Membership Card**
 
- Digital card generated automatically on APPROVED → ACTIVE transition
 
- Card content: member's full name, membership number (permanent), membership class, validity period, QR code
 
- QR code links to member's public profile — enables third-party verification
 
- Physical card: print-ready PDF at standard business card dimensions
 
- Card on renewal: new card generated with updated validity — membership number remains identical (MP-001)
 
- Card display: membership number shown exactly as assigned — no reformatting, no masking
 
- Wallet integration (Phase 2): Apple Wallet and Google Wallet pass format
 
**02.8  Renewal Management**
 
- Renewal window: configurable per class (e.g., open 60 days before expiry)
 
- Automated reminder sequence: 60 days, 30 days, 14 days, 7 days, expiry day, 7 days post-expiry
 
- Online renewal: member pays and renewal processes automatically
 
- Manual renewal: coordinator records payment and activates renewal
 
- Grace period: configurable per class — member in expired state but benefits partially active
 
- Non-renewal: EXPIRED → TERMINATED after configurable grace period if not renewed
 
- Early renewal: allowed — new term begins at end of current term, not from renewal date
 
- Membership freeze: request to pause membership for a period (illness, travel) — governance approval
 
**02.9  Recognition Engine (MEM-006 Dual-Track)**
 
**AUTO Track**
 
- Senior Member trigger: configurable rule, e.g. tenure ≥ 5 years AND active portfolio ≥ 10 approved photos
 
- Honorary Senior Member trigger: configurable rule, e.g. tenure ≥ 10 years AND portfolio ≥ 25 photos
 
- Evaluation: scheduled daily job checks all active members against trigger criteria
 
- On trigger: AUTO recognition created, member notified, profile updated
 
- Criteria are configurable via admin panel — but the AUTO/MANUAL track separation is constitutional
 
**GOVERNANCE Track**
 
- Honorary Member, Honorary Mentor, Honorary Grandmaster
 
- Assignment: coordinator or admin selects member, chooses recognition class, enters reason
 
- All governance recognition assignments require a mandatory reason field — stored in audit log
 
- Confirmation step: cannot be assigned accidentally — requires explicit confirmation
 
- No auto-trigger — exclusively manual human decision
 
**Single Active Rule Enforcement**
 
- Database constraint: only one recognition record per member may have status = ACTIVE
 
- On Governance Track assignment: system automatically sets any active AUTO recognition to HISTORICAL
 
- Historical Recognition Ledger: member_recognition_history table — records every recognition with start_date, end_date, reason, transition_type
 
- Ledger is append-only: no recognition record is ever deleted
 
- Member profile shows: current active recognition + historical recognition timeline
 
- Recognition can be revoked: moves to HISTORICAL with reason, member notified
 
**02.10  Entitlement Resolution Engine**
 
*CONSTITUTIONALLY FROZEN FORMULA (MEM-006): Resolved Entitlements = Base(Membership Class) + Modifiers(Active Recognition) + Individual Overrides. This resolution order is fixed and cannot be changed by configuration.*
 
- Entitlement definitions stored in database: class_entitlements table, recognition_modifiers table, individual_overrides table
 
- Resolution happens at runtime: computed by NestJS EntitlementService, results cached in-process or via Redis (infrastructure decision), invalidated on any membership/recognition change
 
- Entitlement dimensions include: photo_upload_daily_limit, contest_participation, event_discount_pct, school_access_level, exhibition_eligibility, voting_rights, governance_participation, portfolio_public, member_directory_visible
 
- Admin panel: visual entitlement matrix editor — set values per class, set modifiers per recognition class
 
- Individual overrides: per-user key-value overrides (e.g. max_gallery_photos:100, allow_school:false)
 
- Override types: GRANT (add an entitlement not in class) or REVOKE (remove an entitlement from class)
 
- All overrides are logged with actor, reason, and expiry date
 
**02.11  Voting Rights Management**
 
*MEM-006 VOTING ELIGIBLE CLASSES: Full Member, Life Member, Patron Member, Founding Member ONLY. Basic Member, Student Member, Individual Member — NOT eligible. Group Membership Types — NOT eligible (entity-level, no individual voting). Recognition — does NOT confer voting rights. RBAC — does NOT confer voting rights.*
 
- Voting eligibility is computed from membership class — not from entitlement configuration
 
- Voting register: auto-generated list of all ACTIVE members in voting-eligible classes
 
- Quorum calculation: system computes quorum based on current voting-eligible member count
 
- Voting register export: PDF for AGM, verifiable snapshot with timestamp
 
- Voting eligibility is ACTIVE-state only: SUSPENDED, EXPIRED members are not voting eligible
 
**02.12  Reporting ****&**** Governance**
 
- Membership register: full list, filterable by class, state, recognition, join date, renewal status
 
- Membership statistics dashboard: class distribution, growth over time, renewal rates, churn rates
 
- At-risk report: members approaching expiry who have not initiated renewal
 
- Constitutional compliance report: voting-eligible count, quorum thresholds, class distribution
 
- Annual membership report: auto-generated PDF for AGM — member count by class, recognition count, new members, lapsed members, financial summary
 
- Audit log view: every membership state transition, recognition assignment, override — filterable, exportable
 
| MODULE 03  **CONTEST MANAGEMENT ENGINE** *A complete photography competition platform — any format, any scale, any configuration* |
| --- |
 
**03.1  Participant Eligibility Framework (MEM-006 Aligned)**
 
Every contest defines its own eligibility. The platform enforces this against the resolved membership state at time of submission.
 
| **Eligibility Setting** | **Who Can Enter** | **Entitlement Check** |
| --- | --- | --- |
| Open to All | Any Registered User (member or not) | No membership check — open entry |
| Members Only | Any user with ACTIVE membership in any class | membership.state = ACTIVE |
| Constitutional Members Only | Full, Life, Patron, Founding Members | membership.class IN constitutional AND state = ACTIVE |
| Specific Classes | Configurable list of eligible classes | membership.class IN (configured list) AND state = ACTIVE |
| Invitational | Specific users on invite list | user_id IN invite_list |
| Student Only | Student Members only | membership.class = Student AND state = ACTIVE |
| Non-Members Only | Registered Users who are not members | membership = NULL or state != ACTIVE (outreach contest) |
 
**03.2  Contest Types ****&**** Formats**
 
- Monthly club contest — recurring, configurable theme, configurable eligibility
 
- Open competition — public entry, fee-based, large scale, thousands of participants
 
- Invitational — selected participants only, invite-code or manual invite list
 
- Junior contest — age-gated (under 18), separate category
 
- Student contest — Student Member class only
 
- Series contest — same theme over multiple months, cumulative scoring across rounds
 
- Tournament-style — qualifying round → semi-final → final, with automatic advancement rules
 
- Peer-judged — members vote for each other's work, no expert panel
 
- Expert-judged — assigned judge panel, blind or double-blind scoring
 
- Hybrid — peer-vote shortlist, then expert panel final
 
- Photowalk contest — photos submitted must have been taken on a specific club walk
 
- Retrospective contest — photos from a defined past period only
 
- Live contest — photos taken and submitted on-site during an event, real-time leaderboard
 
- Portfolio contest — 5–10 cohesive images judged as a set, not individually
 
- Video contest (Phase 3) — short films, timelapses, reels
 
**03.3  Contest Configuration**
 
- Name, description (rich text), banner image, contest rules document
 
- Eligibility setting (per 03.1 above)
 
- Submission window: start/end date-time with timezone
 
- Judging window: separate from submission window
 
- Results stages: shortlist date, final results date, public announcement
 
- Submissions per participant: 1, 3, 5, or configurable maximum
 
- Categories: single, or multiple independent categories each with own awards
 
- Entry fee: free / flat / per-submission / per-category — member discounts by class
 
- Technical requirements: min resolution, aspect ratio, max file size, allowed formats
 
- Photo metadata policy: EXIF required / EXIF stripped / GPS removed
 
- Watermark policy: allowed / not allowed / auto-stripped on upload
 
- Post-processing policy: RAW only / JPEG / HDR / composites — stated and logged
 
- AI-generated image policy: explicitly declared and stored per contest
 
- Anonymous submission: names hidden from judges until results published
 
- Duplicate detection: hash-based, warn if same image used in multiple contests
 
- Previously-won image flag: alert if image won in a prior contest
 
**03.4  Submission Management**
 
- Web upload: drag-and-drop, batch upload up to configured maximum
 
- Mobile upload: from camera roll via PWA or native app
 
- Resumable uploads for large files
 
- EXIF extraction: camera make/model, lens, focal length, aperture, ISO, shutter, GPS, date
 
- Geotag validation (if location restriction enabled)
 
- Duplicate check on upload: perceptual hash comparison
 
- Submission receipt: confirmation email with submission number and preview
 
- Participant dashboard: view own entries, edit within window, withdraw before deadline
 
- Withdrawal: allowed up to end of submission window, fee refund per policy
 
- Moderation queue: all submissions reviewed by moderator before entering judging (if enabled)
 
- Admin: view all submissions, flag, disqualify with mandatory reason
 
**03.5  Judging Engine**
 
- Judge assignment: by category or globally, scoped to this contest only (RBAC)
 
- Blind judging: participant names and profiles hidden from judges throughout
 
- Double-blind: judges also anonymous to each other during active scoring
 
- Conflict of interest declaration: judges declare any relationship with participants
 
- Recusal: judge can recuse from specific entries after declaration
 
- Scoring modes (configurable per contest):
 
- Star rating: 1–5 stars per image
 
- Numeric score: 0–100, configurable range
 
- Rank ordering: drag to rank all images in category
 
- Accept / Reject binary: for shortlisting rounds
 
- Multi-criteria scoring: Composition, Technical Quality, Theme Adherence, Emotional Impact — each weighted
 
- Comment-only round: feedback phase before scoring
 
- Multi-round judging: preliminary → shortlist → final, each with own scoring mode
 
- Minimum judges per image: configurable — e.g. every image must be scored by at least 3 judges
 
- Score aggregation: average / median / drop-highest-lowest / weighted by judge seniority
 
- Tie-breaking rules: configurable — higher technical score / re-judge / admin decision
 
- Judging progress tracker: % images scored per judge, deadline countdown
 
- Score audit log: every score with judge_id, image_id, score, timestamp — admin-only visibility
 
**03.6  Results, Awards ****&**** Certificates**
 
- Award positions: Gold, Silver, Bronze, Special Mention, Honourable Mention — configurable
 
- Per-category awards and special awards (Best Newcomer, Best Local Subject, Club Choice)
 
- Staged release: shortlist → top 10 → winners — each with own publish date
 
- Embargo: results sealed until publication datetime
 
- Social sharing cards: auto-generated image with winner's photo and name for sharing
 
- Prize management: prize description, delivery tracking, acknowledgement
 
- Points: contest participation and wins credit points to member's platform score
 
- Certificates: participation, shortlist, Gold/Silver/Bronze, Special Mention — auto-generated PDF
 
- Certificate template: admin-editable — fields, background, fonts, positions — managed via admin panel
 
- Verification: unique code on each certificate, verifiable at public URL
 
- Contest archive: every past contest permanently browsable with all submissions and results
 
| MODULE 04  **EVENTS ****&**** ACTIVITY MANAGEMENT** *End-to-end management of every BCC activity — open to all or members-only, your choice* |
| --- |
 
**04.1  Eligibility Model (MEM-006 Aligned)**
 
*MEM-006 P1 applied to events: Registered Users (non-members) can participate in activities. Events can be configured as open to all, members-only, or restricted to specific membership classes. The platform enforces the configured eligibility against the user**'**s resolved membership state.*
 
| **Event Eligibility Setting** | **Who Can Register** |
| --- | --- |
| Open to All | Any Registered User — member or not. Non-members register with name, email, phone. |
| Members Only | Any user with ACTIVE membership in any class. |
| Specific Classes | Configurable list — e.g. Full + Life only for an advanced tour. |
| Invite Only | Specific user list — coordinator sends invitations. |
| Constitutional Members Only | Full, Life, Patron, Founding Members — for governance events like AGM. |
 
**04.2  Event Types**
 
- Photowalks: regular, heritage, night, monsoon, bird, street, industrial
 
- Bird walks: specialist, early morning, seasonal migration walks
 
- Workshops: technical skill, post-processing, storytelling, printing, editing
 
- Seminars: guest speakers, industry experts, panel discussions, Q&A
 
- Tours: domestic day-trip, domestic multi-day, international, lodging-inclusive
 
- Meetups: informal, cafe critique, review sessions, social
 
- Training programs: structured multi-session courses with attendance tracking
 
- Conservation activities: nature documentation, community service, habitat photography
 
- Exhibitions (linked to Exhibition module)
 
- Governance events: AGM (Constitutional Members eligibility enforced automatically)
 
- Award ceremonies: linked to contest module results
 
- Online events: webinars, virtual photowalks, online critiques (Zoom/Meet link managed by platform)
 
- Collaborative events: joint activities with partner organisations
 
**04.3  Event Configuration**
 
- Name, description (rich text), banner, cover photo, event rules
 
- Event type classification and genre tags
 
- Single-occurrence or recurring (weekly/monthly/custom)
 
- Date, time, duration, timezone
 
- Location: address, maps pin, landmark description, meeting point photo
 
- Capacity: unlimited or capped with waitlist
 
- Fee: free / flat / member-discounted / tiered by membership class
 
- Eligibility setting (per 04.1 above)
 
- Volunteer slots: number needed, role descriptions, skills required
 
- What to bring: gear recommendation list
 
- Difficulty level: beginner-friendly / intermediate / advanced
 
- Weather dependent: mark as such, enable cancellation trigger
 
- Age restriction: all ages / 18+ / family-friendly
 
**04.4  Registration, Check-in ****&**** Post-Event**
 
- One-click registration for logged-in users
 
- Guest registration for non-members: name, email, phone — no account required
 
- Fee collection at registration: online payment or pay-at-event option
 
- Confirmation: email + SMS + WhatsApp with event details and calendar file
 
- Waitlist: auto-notify when slot opens
 
- Cancellation by participant: with/without refund per configurable window
 
- Cancellation by organiser: mass notification, automatic refund trigger
 
- QR code check-in: participant shows QR from app or email, volunteer scans with phone camera
 
- Walk-in registration: on-site, with immediate payment collection
 
- Attendance report: real-time count, who's present, who's absent
 
- Certificate trigger: attendance automatically queues participation certificate generation
 
- Post-event gallery: participants submit best shots from the event
 
- Post-event report: field report written in markdown, published to journal
 
- Feedback survey: sent to all attendees, responses aggregated
 
- Revenue report: total collected, expenses, net — linked to Financial module
 
| MODULE 05  **PHOTOGRAPHY GALLERY ****&**** DIGITAL ARCHIVE** *BCC**'**s permanent visual memory — every photograph, forever* |
| --- |
 
**05.1  Upload ****&**** Storage**
 
- Supported formats: JPEG, PNG, TIFF, HEIC, WebP, RAW (NEF, CR2, CR3, ARW, ORF, DNG)
 
- RAW: extract JPEG preview for display, store original for member download
 
- Batch upload: up to 100 images per session
 
- Resumable uploads for large files
 
- Storage: Cloudflare R2 (bccuploads bucket) — S3-compatible, zero egress fees
 
- CDN delivery: ImageKit (ik.imagekit.io/duynda7oq/) — serves optimised sizes
 
- Auto-generated sizes: thumbnail (200px), medium (800px), large (1600px), display-watermarked, original
 
- EXIF extraction: camera, lens, exposure settings, GPS, date — stored in metadata
 
- GPS strip option: member can choose to remove location from public EXIF
 
- Duplicate detection: perceptual hash — warn before accepting
 
**05.2  Organisation, Tagging ****&**** Discovery**
 
- Albums: member-created, named, drag-and-drop ordered
 
- Auto-albums: by event, by contest, by camera, by date range
 
- Tags: member-applied + AI-suggested (Phase 4)
 
- Genre taxonomy: Wildlife, Bird, Street, Portrait, Landscape, Architecture, Macro, Night, Travel, Aerial, Underwater, Abstract, Documentary, Sport
 
- Subject vocabulary: structured, searchable, admin-maintained taxonomy
 
- Location tags: city, landmark, national park — geocoded from GPS where available
 
- Equipment auto-tagged from EXIF: camera body, lens model
 
- Season, time of day: auto-calculated from EXIF datetime and GPS
 
- Visibility per photo: public / members only / private / unlisted
 
- Watermark: auto-applied to public versions — position, opacity, text or logo, configurable
 
- Download control: configurable per photo and per user class
 
**05.3  Entitlement-Driven Access (MEM-006 Aligned)**
 
| **Action** | **Public Visitor** | **Registered User** | **Operational Member** | **Constitutional Member** |
| --- | --- | --- | --- | --- |
| View public photos | YES | YES | YES | YES |
| View members-only photos | NO | NO | YES | YES |
| Upload photos | NO | Configurable | YES (within class limits) | YES (higher limits) |
| Download originals | NO | NO | Configurable | YES |
| Submit to gallery from contest | NO | If contest open to all | YES | YES |
| Have photos on Members Wall | NO | NO | YES | YES |
 
**05.4  Institutional Archive**
 
- Historical photo import: bulk upload of pre-platform BCC archive photos
 
- Legacy metadata: event name, approximate date, photographer (if known)
 
- Decade-based archive browsing
 
- Foundational photo sets: BCC's first walks, first exhibitions
 
- Digitisation log: track which physical albums have been digitised
 
| MODULE 06  **PHOTOGRAPHER PROFILES ****&**** PORTFOLIOS** *Every BCC photographer**'**s professional digital home* |
| --- |
 
**06.1  Profile ****&**** Portfolio**
 
- Public profile URL: bcc.bhopal.info/photographers/username
 
- Profile shows membership class badge and active recognition badge
 
- Portfolio: curated selection — distinct from full photo library
 
- Featured photo: signature image displayed prominently
 
- Portfolio series: named thematic collections within the portfolio
 
- Achievements display: contest awards, exhibitions, school certifications, badges
 
- Portfolio layout selector: grid, masonry, single-column, slideshow
 
- Portfolio PDF export: auto-generated print-quality PDF
 
- Password-protected portfolio option: for work-in-progress sharing
 
*MEM-006 application: Profile badges accurately reflect constitutional class (Full, Life, Patron, Founding), operational class (Basic, Student, Individual), or group delegate status. Recognition badge shows active recognition track. No badge inflation — only accurate status display.*
 
**06.2  Achievements ****&**** Points**
 
- Contest history: all participations, results, awards won — linked to Contest module
 
- Exhibition history: exhibitions participated in
 
- Event attendance history: all events attended, volunteer history
 
- School certifications earned
 
- Platform points tally: cumulative score from all activities
 
- Badges: visual achievement markers, ordered by rarity on profile
 
| MODULE 07  **EXHIBITION MANAGEMENT** *Digital and physical exhibitions — curation to permanent archive* |
| --- |
 
**07.1  Exhibition Types**
 
- Annual club exhibition: flagship event, curated from member submissions
 
- Theme exhibitions: single-theme curated show
 
- Member solo exhibition: spotlight on one photographer
 
- Group exhibition: curated group of 5–10 photographers
 
- Contest exhibition: winning and shortlisted images from a contest
 
- Digital-only exhibition: online gallery, no physical component
 
- Physical exhibition support: print-ready catalog, label cards, wall layout
 
- Travelling exhibition: same set at multiple venues over time
 
- Collaborative: with partner organisations or other camera clubs
 
- Retrospective: historical photos and archive material
 
**07.2  Submission, Curation ****&**** Archive**
 
- Open call: configurable eligibility, deadline, file requirements
 
- Curator dashboard: review all submissions, shortlist, compare, arrange sequence
 
- Selection notification: accepted / shortlisted / not selected with message
 
- Digital exhibition microsite: full-bleed images, artist statements, immersive mode
 
- Exhibition catalog: downloadable PDF — multiple layout templates
 
- Physical exhibition: print-ready files at correct resolution, label cards auto-generated
 
- Label cards: photo title, artist name, membership year, print size — auto-generated
 
- Permanent archive: every past exhibition browsable — digital memory of BCC's exhibition history
 
| MODULE 08  **PHOTOGRAPHY SCHOOL ****&**** LEARNING PLATFORM** *Structured education from first photograph to master practitioner* |
| --- |
 
**08.1  Access Policy (MEM-006 Aligned)**
 
| **Content Type** | **Public Visitor** | **Registered User** | **Operational Member** | **Constitutional Member** |
| --- | --- | --- | --- | --- |
| Foundation lessons (public) | YES | YES | YES | YES |
| Intermediate lessons | NO | NO | YES | YES |
| Advanced lessons | NO | NO | Class-dependent | YES |
| Assignments & submission | NO | NO | YES | YES |
| Mentor access | NO | NO | YES | YES |
| Certifications | NO | NO | YES | YES |
 
*Foundation lessons are intentionally open to non-members — the school is a membership acquisition tool. The value of advanced content, mentorship, and certification drives conversion from Registered User to Member.*
 
**08.2  Curriculum ****&**** Learning**
 
- Learning paths: Foundations → Intermediate → Advanced → Specialist, by level
 
- Genre tracks: Wildlife, Portrait, Street, Landscape, Architecture, Night, Bird, Travel, Documentary, Macro
 
- Skill tracks: Exposure, Composition, Light, Colour, Post-Processing, Storytelling, Ethics, Printing
 
- Lesson types: text, video, photo essay, interactive (before/after sliders, histogram tool), PDF download
 
- Prerequisites: lesson B unlocks only after lesson A completed
 
- Quizzes: multiple choice at module end, image identification, practical challenges
 
- Assignments: photo briefs with submission, self-assessment, peer review (moderated), mentor review
 
- Progress tracking: dashboard per learner, completion %, streak tracking
 
- Certifications: module completion, path completion, genre specialist — all verifiable at public URL
 
- Mentor system: assignment, matching by specialty, feedback SLA, mentor performance tracking
 
- Placement: entry assessment quiz recommends starting path — override allowed
 
| MODULE 09  **COMMUNITY ****&**** SOCIAL ENGAGEMENT** *The living BCC photographer community* |
| --- |
 
**09.1  Member Directory (MEM-006 Aligned)**
 
- Searchable directory of ACTIVE members — state enforcement by Entitlement Resolution
 
- Registered Users (non-members) not in directory by default — opt-in configurable
 
- Suspended and Expired members not visible in directory
 
- Founding Members shown with founding member badge — permanent historical recognition
 
- Filter by: membership class, recognition, city, genre, experience level, equipment
 
- Privacy controls: members can hide from directory while remaining active
 
**09.2  Activity Feed, Messaging ****&**** Recognition**
 
- Club feed: new photos (curated), new members joining, upcoming events, contest results
 
- Direct messaging: member-to-member, platform-contained
 
- Admin broadcast: to all members, filtered by class or state
 
- WhatsApp integration: optional linking of platform notifications
 
- Member of the Month, Photographer of the Year, Volunteer of the Month — admin-selected
 
- Recognition wall: public display of award-winners and spotlights
 
- Leaderboards: points, contest wins, school completions — annual and all-time
 
- Sub-groups (Phase 3): Bird Photography Group, Street Photography Collective, etc.
 
| MODULE 10  **VOLUNTEER MANAGEMENT** *Powering BCC operations through member and non-member contribution* |
| --- |
 
*MEM-006 P1 applied to volunteers: Volunteering is open to any Registered User — membership is not required to contribute. Volunteer recognition and points accumulate on the user**'**s platform record regardless of membership status.*
 
**10.1  Volunteer System**
 
- Any Registered User can register as a volunteer — membership not required
 
- Volunteer profile: skills, availability, transport availability
 
- Event volunteer slots: created by organiser with role description and skills required
 
- Application and confirmation workflow
 
- QR-based check-in for volunteers at events (separate QR from attendees)
 
- Hours logging: volunteer hours recorded per event
 
- Points system: configurable points per hour, per role, per event type
 
- Volunteer recognition: certificates, leaderboard, monthly/annual recognition
 
- For members: volunteer hours can be considered in membership upgrade applications
 
- Volunteer reliability score: showed-up / no-show rate — visible to coordinators
 
| MODULE 11  **FINANCIAL OPERATIONS ****&**** LEDGER** *Complete money management — INR-only, Razorpay as payment gateway* |
| --- |
 
*CURRENCY CONSTRAINT: The BCC platform is strictly INR-only. All fees, payments, refunds, and ledger entries are denominated in Indian Rupees. This constraint is enforced at the application validation layer and at the database column level (bcc_ledger_transactions). No multi-currency support is planned.*
 
**11.1  Payment Collection**
 
- Primary gateway: Razorpay — UPI, net banking, credit/debit cards, wallets
 
- UPI QR: for offline collection with manual reconciliation
 
- Manual payment recording: cash/cheque payments entered by coordinator
 
- Fee types: membership fee, renewal fee, upgrade fee, event registration, contest entry, school course
 
- Instalment plans: split large payments (e.g. tour fee in 3 instalments)
 
- Coupon/promo codes: percentage discount, flat discount, free entry
 
- Early-bird pricing: discounted price until a date, then full price
 
- Member discounts: configurable by membership class — entitlement-driven
 
- Payment receipt: auto-generated, emailed, downloadable PDF (GST-compliant if applicable)
 
**11.2  Expense Recording**
 
- Expense categories: Venue, Printing, Awards & Trophies, Travel, Equipment, Speaker Fees, Marketing, Miscellaneous
 
- Expense entry fields: category, amount (INR), description, date, payment method (cash/bank transfer/UPI/card)
 
- Activity link: optionally link expense to a specific event, contest, or exhibition — enables per-activity P&L
 
- Receipt upload: PDF or image — stored in Cloudflare R2, linked to expense record
 
- Recorded by: coordinator who entered the expense — stored in audit trail
 
- Approval threshold: expenses above configurable amount require Finance Manager approval before appearing in reports
 
- Chart of accounts: expense categories map to Tally-compatible account heads — configured in admin panel
 
- Bulk entry: CSV import for batch expense entry (e.g. after a multi-day tour)
 
**11.3  Refunds ****&**** Reporting**
 
- Central ledger: bcc_ledger_transactions table — all transactions in one place
 
- Transaction types: income (membership, events, contests), expense (venue, printing, awards), refund, adjustment
 
- Refund policy: configurable per activity type — auto-refund on event cancellation
 
- Partial refund support — refund to original method or platform credit
 
- Outstanding dues: members with unpaid fees flagged in dashboard
 
- Income statement: revenue vs expense by period
 
- Event P&L: revenue vs expense per event
 
- Annual financial report: auto-generated PDF for AGM
 
- Tally export: Tally-compatible format for Indian accounting
 
- GST invoices: GST-compliant invoice generation if BCC is GST-registered
 
| MODULE 12  **CERTIFICATES, BADGES ****&**** RECOGNITION ENGINE** *A complete digital achievement system* |
| --- |
 
**12.1  Certificate System**
 
- Template builder: drag-and-drop field placement — fields, background, fonts, colours
 
- Fields: recipient name, achievement, date, contest/event name, certificate number, QR code
 
- Certificate types: participation, achievement (awards), recognition, official membership, organisational appointment
 
- Batch generation and email dispatch after contest results or event completion
 
- Verification: unique code per certificate, verifiable at public URL
 
- Archive: all certificates stored in member profile permanently
 
**12.2  Badges ****&**** Points**
 
- 50+ defined badge types: auto-awarded by system when condition met, or manually by admin
 
- Badge tiers: bronze / silver / gold for progressive achievement
 
- Points per action: photo upload, contest entry, win, event attendance, school completion, volunteer hours
 
- Lifetime points vs annual points (annual resets, lifetime accumulates)
 
- Points leaderboard: annual and all-time, visible to all members
 
- Open Badges standard (Phase 4): verifiable, shareable on LinkedIn
 
| MODULE 13  **GOVERNANCE, ADMINISTRATION ****&**** MODERATION** *Platform control — with MEM-006 constitutional boundaries enforced* |
| --- |
 
*MEM-006 P3 + P4: The admin panel enforces the constitutional boundary between RBAC (operational authority) and Membership/Recognition (governance authority). Admins cannot grant voting rights through RBAC. Admins cannot modify Constitutional Membership Classes. These constraints are enforced at the NestJS Guard and Service layer — not just the UI.*
 
**13.1  Feature Flag Management**
 
- Module toggle: enable/disable entire modules (Contest, School, Exhibition, Volunteer, etc.)
 
- Feature-level toggles within modules
 
- Beta features: enable for specific users or RBAC roles only
 
- Scheduled toggles: activate a feature at a specific datetime
 
- Module state is read by Astro frontend on startup — navigation auto-adjusts to active feature flags
 
**13.2  Admin Boundaries (MEM-006 Enforcement)**
 
- Constitutional Class admin resource: read-only — no Create, Edit, Delete controls exposed
 
- Operational Class admin resource: full CRUD — but voting_eligible and governance_eligible fields are locked to FALSE and non-editable
 
- Recognition Track admin resource: AUTO track criteria configurable; GOVERNANCE track assignment requires mandatory reason field
 
- Voting rights cannot be granted via RBAC assignment — the permission does not exist in the RBAC system
 
- Entitlement matrix editor: can edit class entitlements — but constitutional governance fields are protected
 
**13.3  Content Management ****&**** Communication**
 
- Homepage content: featured photo, featured story, event highlights — all admin-controlled
 
- Static pages: About, History, Contact, Rules — rich text editor
 
- Blog/Journal: full CMS — articles, field reports, tutorials, member interviews
 
- Announcements: banner messages, pop-up notices, email + SMS + WhatsApp blasts
 
- SEO: meta title, meta description, Open Graph image per page
 
- Email templates: fully customisable, variable substitution (member name, event details, etc.)
 
- WhatsApp templates: pre-approved message templates for Business API
 
- Bulk communications: to all members, filtered by class, state, recognition, activity
 
- Delivery tracking: open rate, click rate, delivery status
 
- Campaign archive: history of all bulk communications
 
**13.4  Moderation Workflow**
 
Content moderation follows a defined state machine. All actions are audited. Appeals are supported.
 
| **State** | **Description** | **Actor** | **Next States** |
| --- | --- | --- | --- |
| REPORTED | A registered user has flagged content (photo, comment, profile) | Any registered user | UNDER_REVIEW |
| UNDER_REVIEW | Moderator has accepted the report and is actively reviewing | Moderator (RBAC role) | RESOLVED_KEPT, RESOLVED_REMOVED, ESCALATED |
| ESCALATED | Moderator has escalated to Coordinator for decision | Coordinator | RESOLVED_KEPT, RESOLVED_REMOVED |
| RESOLVED_KEPT | Content reviewed and found acceptable — no action taken | Moderator or Coordinator | APPEALED (if reporter disagrees — rare) |
| RESOLVED_REMOVED | Content removed. Content creator notified with reason via Module 17 | Moderator or Coordinator | APPEALED |
| APPEALED | Content creator contests a RESOLVED_REMOVED decision | Content creator (self-service) | APPEAL_UPHELD, APPEAL_REJECTED |
| APPEAL_UPHELD | Coordinator overturns removal — content restored | Coordinator | Terminal |
| APPEAL_REJECTED | Coordinator confirms removal — decision stands | Coordinator | Terminal (repeat violations may trigger account review) |
 
- SLA: moderator must move REPORTED → UNDER_REVIEW within 48 hours — overdue items flagged in admin dashboard
 
- Reporter notification: reporter informed of outcome (not the moderator's internal notes)
 
- Repeat reporter: if same user files 5+ reports found invalid, reporter flagged for coordinator review
 
- Auto-hold: configurable threshold — if content receives 3+ reports before moderator review, it is auto-hidden pending review
 
- Moderation log: every state transition, actor, timestamp, reason — immutable, part of audit trail
 
- Anonymous report option: reporter identity not revealed to content creator
 
**13.5  System Configuration**
 
- Club Year: configurable start month and end month — default January–December. All annual reports, points resets, award eligibility cycles, and AGM voting register snapshots derive from this setting.
 
- Grace period per membership class: configurable number of days after expiry before TERMINATED
 
- Renewal window per class: how many days before expiry renewal becomes available
 
- Recognition AUTO track criteria: tenure threshold and portfolio count threshold — configurable per recognition class
 
- Entitlement defaults per class: configurable in entitlement matrix editor
 
- Notification timing: configurable days for renewal reminders (default: 60, 30, 14, 7, 0, -7)
 
- Payment gateway settings: Razorpay key ID, webhook secret — stored encrypted
 
- Feature flags: per-module toggle — changes take effect immediately without redeployment
 
- Upload limits: max file size, daily upload count per class — configurable
 
- Approval thresholds: expense amounts requiring Finance Manager approval
 
**13.6  Audit Log**
 
- Full audit log: every significant action — who, what, when, from where
 
- Covers: membership state transitions, recognition assignments, entitlement overrides, RBAC changes, financial actions, moderation actions, content publications
 
- Immutable: audit log cannot be edited or deleted by any user including Super Admin
 
- Filterable: by user, module, date range, action type
 
- Exportable: PDF or CSV for committee review
 
- Retention: configurable per action type, minimum 7 years for financial audit entries
 
| MODULE 14  **DIGITAL ARCHIVE ****&**** INSTITUTIONAL MEMORY** *Preserving BCC**'**s history for the next generation* |
| --- |
 
- Founding records: constitution, founding member list, establishment documents
 
- AGM minutes: structured format, searchable, annually updated
 
- Committee composition by year: office bearers, terms, transitions
 
- Policy and rule changes: effective dates, reasons, constitutional review references
 
- Every BCC event since founding: documented, with photos and participant records
 
- Every past exhibition: catalog, works shown, venue, outcomes
 
- Every past contest: results, winners, photos (where available)
 
- Publications and newsletters: uploaded and archived
 
- Press coverage: links to and scans of newspaper/magazine coverage
 
- Legacy photo import: bulk upload of pre-platform BCC archive
 
- Chronological timeline: scroll through BCC's complete history
 
- Member contribution: members can add recollections to historical events (moderated)
 
| MODULE 17  **COMMUNICATION ENGINE** *Cross-cutting infrastructure — every notification, every channel, one service* |
| --- |
 
The Communication Engine is platform infrastructure, not a user-facing feature. It is the single service through which all platform notifications, alerts, broadcasts, and receipts are dispatched. Every other module calls this service — it is never called directly by the user. Built in Phase 1 before any module that generates notifications.
 
*Architecture: NestJS CommunicationService — a dedicated module within the NestJS monolith. All other NestJS modules inject CommunicationService and call dispatch methods. No module sends its own emails, SMS, or WhatsApp messages directly.*
 
**17.1  Notification Type Taxonomy**
 
| **Type** | **Description** | **Examples** |
| --- | --- | --- |
| TRANSACTIONAL | One-to-one, triggered by a specific user action or system event. High priority. Always delivered. | Membership approval, payment receipt, password reset, OTP, certificate dispatch, membership card |
| LIFECYCLE | Triggered by membership or system lifecycle transitions. High priority. | Renewal reminders (60/30/14/7 day), expiry notice, suspension notice, recognition award, number assignment confirmation |
| ALERT | Time-sensitive operational alert. High priority. | Contest submission deadline (24hr), event cancellation, waitlist slot opened, payment failure |
| BROADCAST | One-to-many, sent by coordinator or admin to a segment. Normal priority. | Monthly newsletter, event announcement, contest launch, exhibition opening, AGM notice |
| DIGEST | Aggregated summary sent on a schedule. Low priority. | Weekly activity digest, monthly points summary |
 
**17.2  Channel Priority ****&**** Delivery Order**
 
- Channel priority order for TRANSACTIONAL and LIFECYCLE types: in-platform notification first → WhatsApp → email → SMS
 
- Channel priority for ALERT: WhatsApp first (highest open rate in India) → email → in-platform → SMS
 
- Channel priority for BROADCAST: email first → WhatsApp → in-platform → SMS
 
- Member can configure per-channel opt-out per notification type — except OTPs and payment receipts (mandatory)
 
- Mandatory notifications: OTPs, payment receipts, security alerts — cannot be opted out, always delivered on all channels where contact is verified
 
- WhatsApp Business API: pre-approved message templates for each notification type — template management in admin panel
 
- Fallback: if primary channel fails, system attempts next channel in priority order
 
- Delivery tracking: per-notification status (QUEUED → SENT → DELIVERED → FAILED) stored in notification_log table
 
**17.3  Template Management**
 
- Template library: one template per notification type per channel per language (Hindi/English)
 
- Template fields: subject (email), body, variable substitution tokens — e.g. {{member_name}}, {{membership_number}}, {{event_name}}, {{deadline_date}}
 
- Template editor in admin panel: rich text for email body, plain text for SMS/WhatsApp (WhatsApp template must match pre-approved format)
 
- Language selection: member's language preference drives template selection — defaults to English
 
- Template versioning: changes create new version — old notifications reference the version active at send time
 
- Preview: admin can preview rendered template with sample variable values before activating
 
**17.4  Dispatch Architecture (NestJS)**
 
- CommunicationService.dispatch(userId, notificationType, variables) — primary call signature
 
- Service resolves: user contact details, channel preferences, opt-out status, language preference
 
- Service selects: correct template per channel per language
 
- Service queues: dispatch jobs to background queue (Bull/BullMQ on Redis) for async delivery
 
- Queue workers: separate worker process handles actual delivery — decoupled from request lifecycle
 
- Retry logic: failed deliveries retried with exponential backoff (3 attempts before FAILED status)
 
- Rate limiting: bulk broadcasts throttled to avoid gateway rate limits — configurable sends-per-minute
 
- Idempotency: duplicate dispatch calls for same (userId, notificationType, correlationId) are deduplicated
 
**17.5  Broadcast ****&**** Campaign Management**
 
- Broadcast: coordinator selects segment (all members / by class / by state / by recognition / custom filter) and sends message
 
- Scheduled send: write now, send at a future datetime
 
- Campaign archive: every broadcast stored with: segment definition, message content, send time, delivery stats
 
- Delivery statistics: sent count, delivered count, open rate (email), click rate (email), failed count
 
- Suppression list: users who have hard-bounced or formally opted out — never included in any broadcast
 
- Unsubscribe handling: one-click unsubscribe in all email footers — logs to suppression list automatically
 
**17.6  In-Platform Notification Centre**
 
- Notification bell in header: unread count badge
 
- Notification panel: list of recent notifications with read/unread state, timestamp, action link
 
- Mark as read: individual or mark-all-read
 
- Notification types shown: all types listed in 17.1 — in-platform is always the first delivery channel
 
- Retention: in-platform notifications retained for 90 days, then archived
 
- Push integration (Phase 2): PWA push notifications via FCM — member consents to push on first visit
 
| MODULE 15  **AI ECOSYSTEM** *Intelligent assistance woven through the entire platform — Phase 4 onward* |
| --- |
 
- Auto-tagging: genre, subject, mood, technique suggestions from image content
 
- Scene detection: wildlife, portrait, street, bird, landscape — auto-classification
 
- Similar image finder: visually similar images in the archive
 
- Duplicate detection: perceptual hashing across all uploads
 
- NSFW detection: flag inappropriate images before moderation review
 
- Semantic search: search by concept, mood, story rather than exact tags
 
- Visual search: upload an image to find similar images
 
- Recommendation engine: events and photographers based on member interests and history
 
- Educational AI: advisory feedback on assignment submissions — composition, exposure, focus
 
- Learning path recommendation: suggest next lesson based on progress
 
- Content assistance: help editors draft announcements, event descriptions, contest themes
 
- Renewal risk prediction: flag members likely to lapse based on activity patterns
 
- Fraud detection: flag unusual submission patterns in contests
 
| MODULE 16  **MOBILE APP ****&**** PWA** *BCC in every photographer**'**s pocket — from photowalk to AGM* |
| --- |
 
**16.1  PWA (Day One)**
 
- Installable on iOS and Android home screen
 
- Push notifications: contest deadlines, event reminders, approval notices, recognition awards
 
- Offline access: cached event details, member profile, school lessons
 
- Camera integration: capture and upload directly from PWA
 
- QR scanner: check in to events via browser camera — no separate app required
 
**16.2  Native App (Capacitor — Phase 2)**
 
- Same codebase as web — Capacitor wraps Astro PWA for iOS and Android (approved per Mobile Readiness Constitution)
 
- Native push notifications via FCM (Android) and APNs (iOS)
 
- Native camera: full resolution capture, gallery access
 
- Native share sheet: share photos to Instagram, WhatsApp directly from app
 
- Background sync: queue uploads when offline, sync when connected
 
- Biometric login: fingerprint and Face ID
 
- App Store and Play Store listing: BCC as a searchable, installable app
 
| MODULE TECH  **TECHNOLOGY BLUEPRINT** *FINAL_TECHNOLOGY_STACK_FREEZE — Astro + NestJS/Fastify + Kysely/MySQL — FROZEN AUTHORITATIVE* |
| --- |
 
*FINAL_TECHNOLOGY_STACK_FREEZE — FROZEN / AUTHORITATIVE. Technology selections below are locked by MISSION-007A. No future mission may redefine them. Changes require Human Authority Approval + Formal Change Control + MM-001 Override Authorization.*
 
**FROZEN TECHNOLOGY STACK**
 
| **Layer** | **Status** | **Technology** | **Role in BCC Platform** |
| --- | --- | --- | --- |
| Frontend | FROZEN | Astro (TypeScript, Hybrid SSG/SSR) | Public-facing pages: gallery, events calendar, contest listings, photographer profiles, exhibition archive, homepage. SSG for static content (SEO-critical, fast delivery). SSR selective for authenticated member pages. Vanilla CSS + Design Token system. GSAP v3 for animations. Capacitor wraps Astro PWA for future native iOS/Android apps. |
| Backend | FROZEN | NestJS + Fastify adapter (TypeScript, Modular Monolith) | All business logic, domain services, API endpoints. Modular Monolith architecture — one deployable unit, internally modular. Fastify adapter for performance. TypeScript throughout. Hosts: EntitlementService, MembershipService, ContestService, EventService, GalleryService, SchoolService, FinancialService, CommunicationService, AuthService, RecognitionService. Mobile backend prohibited as separate service — this backend serves web and mobile identically. |
| Database | FROZEN | MySQL (AWS RDS compatible) | Single relational database. Schema authority is database-first. Migration strategy: controlled SQL migration scripts — no ORM-generated migrations. bcc_ledger_transactions preserved and extended. All MEM-006 and MEM-007 constitutional tables defined in controlled SQL. |
| Query Layer | FROZEN | Kysely (TypeScript query builder) | Type-safe SQL query builder. No ORM. Raw SQL permitted for complex queries. Kysely provides compile-time type safety without hiding SQL. Schema changes driven by SQL migration scripts, Kysely types updated to match. |
| API | FROZEN | REST / JSON over HTTPS / /api/v1 | OpenAPI 3.x contract. Swagger documentation. Typed client generation required — Astro frontend and future mobile clients consume generated typed clients. All endpoints versioned under /api/v1/. Error envelope standardised across all endpoints. |
| Authentication | DEFERRED | Session + JWT Hybrid OR JWT + Refresh Token | Authentication architecture deferred. Approved candidates: Session + JWT Hybrid, JWT + Refresh Token Architecture. Selected option will be applied uniformly across web and mobile. Decision must be made before Phase 1 implementation begins. |
| Image Storage | FROZEN | Cloudflare R2 (bccuploads bucket) | Original and pre-compressed assets. S3-compatible API. Zero egress fees. Existing bucket, endpoint, and access keys retained. |
| Image Processing & CDN | FROZEN | ImageKit.io | Derived assets, optimisation, CDN delivery. Points to Cloudflare R2 as origin. Existing ImageKit ID and endpoint retained. Original assets remain in R2; derived/optimised versions served via ImageKit CDN. |
| Infrastructure | FROZEN | Docker + Nginx + Linux (AWS compatible) | Containerised services. Nginx reverse proxy. Linux host. AWS-compatible cloud infrastructure. Kubernetes deferred — not required for current stage. |
| CI/CD | FROZEN | Git + GitHub + GitHub Actions | Repository model: /frontend /backend /database /docs /infra /scripts /uploads /archives. Monorepo structure. GitHub Actions for build, test, and deploy pipelines. |
| Payments | Architecture-defined | Razorpay | INR-only gateway. UPI, net banking, credit/debit cards, wallets. Integrated in NestJS FinancialService. No ORM-level integration — direct Razorpay SDK in service layer. |
| Email | Architecture-defined | Resend | Transactional and bulk email. Called from NestJS CommunicationService. |
| SMS / WhatsApp | Architecture-defined | MSG91 / Interakt | WhatsApp Business API. OTPs, event reminders, contest results, renewal alerts. India-first communication channel. |
| Push Notifications | Architecture-defined | Firebase Cloud Messaging (FCM) | PWA and native Capacitor app push notifications. |
| Real-time | Architecture-defined | WebSocket (NestJS Gateway) | NestJS has native WebSocket gateway support. Live contest scoreboards, event capacity counters, notification delivery. No separate WebSocket server required. |
| PDF Generation | Architecture-defined | Puppeteer or PDFKit (Node.js native) | Certificates, membership cards, exhibition catalogs, financial reports. Node.js-native — no PHP dependencies. |
| Search | Architecture-defined | Meilisearch (self-hosted) | Member directory, photo discovery, event search. REST API consumed by NestJS SearchService. Self-hosted on VPS. |
| AI Services | Architecture-defined | OpenAI API / Anthropic API | Phase 4+ AI features: auto-tagging, semantic search, educational feedback. Called from NestJS AIService. |
 
**Technology Authority Rules**
 
*TECHNOLOGY AUTHORITY RULE (MISSION-007A): MISSION-008 and all future missions may define implementation patterns. MISSION-008 and all future missions may NOT redefine technology selections. Technology selection authority concluded with MISSION-007A. Changes require: Human Authority Approval + Formal Change Control + MM-001 Override Authorization.*
 
**Forbidden Architectures**
 
- Microservices — FORBIDDEN
 
- Polyrepo Architecture — FORBIDDEN
 
- Heavy ORM Dependency — FORBIDDEN (Kysely is a query builder, not an ORM)
 
- GraphQL as Primary API — FORBIDDEN (REST is the API standard)
 
- Multiple Frontend Frameworks — FORBIDDEN (Astro is the sole frontend framework)
 
- Dedicated Mobile Backend — FORBIDDEN (shared NestJS backend serves web and mobile identically)
 
- Kubernetes Requirement — FORBIDDEN for current stage (deferred)
 
- Event Mesh Architecture — FORBIDDEN
 
- Premature Distributed Systems — FORBIDDEN
 
**Repository Structure**
 
| **Path** | **Contents** |
| --- | --- |
| /frontend | Astro application — all frontend pages, components, layouts, design tokens, GSAP animations |
| /backend | NestJS application — all modules, services, controllers, guards, DTOs, Kysely queries |
| /database | SQL migration scripts, schema definitions, seed data (constitutional classes, founding reservations) |
| /docs | OpenAPI specifications, architecture decisions, constitutional documents (MEM-006, MEM-007, TECH FREEZE) |
| /infra | Docker compose files, Nginx configuration, GitHub Actions workflows |
| /scripts | Migration utilities, data import scripts, one-time maintenance scripts |
| /uploads | Local development upload staging (not committed — gitignored) |
| /archives | Historical data exports, legacy records for import |
 
**AI Tooling Ecosystem**
 
| **Tool** | **Role** |
| --- | --- |
| ChatGPT | Architecture Authority |
| Claude | Documentation Authority |
| Antigravity | Implementation Authority |
| MCP | Integration Layer |
 
**New Database Tables Required by MEM-006 ****&**** MEM-007**
 
| **Table** | **Governing Document** | **Purpose** | **Key Columns** |
| --- | --- | --- | --- |
| users | MEM-006 | Identity layer — Registered Users | user_id, email, phone, display_name, created_at |
| memberships | MEM-006 + MEM-007 | Membership records — one per membership application | membership_id, user_id, class_id, state, start_date, expiry_date, membership_number (write-once) |
| membership_classes | MEM-006 | Class definitions — constitutional classes seeded, protected | class_id, name, category (CONSTITUTIONAL/OPERATIONAL), voting_eligible, governance_eligible, configurable |
| membership_number_pool | MEM-007 | Single authoritative numbering pool — tracks next available serial | pool_id, last_allocated_serial, founding_reserved (00001–00007), historical_reserved (00008–00020), operational_start (00021) |
| membership_number_log | MEM-007 | Immutable record of every number assignment — audit trail | log_id, membership_id, assigned_number, assigned_at, assigned_by (system), joining_year, joining_month, format_type (OPERATIONAL/HISTORICAL/FOUNDING/TEMP) |
| membership_temp_identifiers | MEM-007 | Temporary onboarding identifiers — BCCTempXXXXX — retired on permanent assignment | temp_id, membership_id, temp_number, issued_at, retired_at, permanent_number_assigned |
| group_memberships | MEM-006 | Group entity membership records | group_id, group_type, entity_name, membership_id |
| group_delegates | MEM-006 | Individuals linked to group memberships | delegate_id, group_id, user_id, role |
| member_recognitions | MEM-006 | Active and historical recognition records | recognition_id, membership_id, recognition_class, track (AUTO/GOVERNANCE), status (ACTIVE/HISTORICAL), start_date, end_date, reason |
| class_entitlements | MEM-006 | Base entitlements per membership class | class_id, entitlement_key, entitlement_value |
| recognition_modifiers | MEM-006 | Entitlement modifiers per recognition class | recognition_class, entitlement_key, modifier_type (GRANT/MODIFY), modifier_value |
| individual_overrides | MEM-006 | Per-user entitlement overrides | override_id, user_id, entitlement_key, override_type (GRANT/REVOKE), value, reason, expires_at |
| membership_audit_log | MEM-006 | Immutable log of all membership actions | log_id, actor_id, target_user_id, action_type, old_state, new_state, reason, created_at |
 
*MEM-006 DIRECTIVE: The membership_classes table must have a seeded, protected record for each of the four Constitutional Classes. A database trigger or application-layer guard must prevent UPDATE or DELETE on rows where category = **'**CONSTITUTIONAL**'**. The Founding Member class must additionally have a system-enforced constraint preventing new membership records referencing this class_id.*
 
*MEM-007 DIRECTIVE: The memberships.membership_number column is WRITE-ONCE. A database trigger must reject any UPDATE to this column after initial assignment. The membership_number_pool table has exactly one row — it is the single authoritative counter. Founding reservation serials 00001–00007 and historical block 00008–00020 must be pre-seeded as RESERVED in the pool at initialisation and cannot be claimed by the operational sequential allocator. The membership_temp_identifiers table must enforce retirement — retired_at and permanent_number_assigned must be populated atomically with the permanent number assignment. No BCCTemp identifier may remain active after its permanent number is assigned.*
 
| MODULE ROAD  **PHASED BUILD ROADMAP** *Realistic phasing for a solo practitioner — constitutional foundation first, features second* |
| --- |
 
**Module Dependency Matrix**
 
This matrix governs phase sequencing. A module cannot be built until all modules it depends on are complete.
 
| **Module** | **Depends On** | **Depended On By** | **Phase** |
| --- | --- | --- | --- |
| 01 Identity & User Management | None — foundational | All modules (every user interaction requires identity) | Phase 0/1 |
| 02 Membership Management | Module 01 (identity), Module 11 partial (payment collection) | All modules (entitlement resolution), Module 12 (membership card certificates) | Phase 1 |
| 11 Financial — Core | Module 01 (identity for payment attribution) | Module 02 (membership fees), Module 04 (event fees), Module 03 (contest fees) | Phase 1 partial |
| 17 Communication Engine | Module 01 (user contact details) | Module 02 (lifecycle notifications), Module 04 (event reminders), Module 03 (contest alerts), Module 11 (payment receipts) | Phase 1 |
| 04 Events Management | Module 01, Module 02 (eligibility), Module 11 (fee collection), Module 17 (comms) | Module 12 (event certificates), Module 10 (volunteer slots) | Phase 2a |
| 05 Gallery & Archive | Module 01, Module 02 (entitlements for upload limits/visibility) | Module 06 (portfolio draws from gallery), Module 03 (contest submissions) | Phase 2a |
| 03 Contest Engine | Module 01, Module 02 (eligibility), Module 05 (photo submission), Module 11 (entry fees), Module 17 (comms) | Module 12 (contest certificates) | Phase 2b |
| 12 Certificates & Badges | Module 02 (membership card), Module 03 (contest certs), Module 04 (event certs), Module 08 (school certs) | None — terminal module | Phase 2b |
| 06 Photographer Profiles | Module 01, Module 02, Module 05 (gallery source), Module 03 (contest history), Module 12 (badges) | Module 09 (directory links to profiles) | Phase 3 |
| 07 Exhibition Management | Module 01, Module 02, Module 05 (photo source), Module 12 (exhibition certificates) | Module 14 (exhibition archive) | Phase 3 |
| 09 Community | Module 01, Module 02, Module 06 (member directory) | None — engagement layer | Phase 3 |
| 10 Volunteer Management | Module 01, Module 04 (event slots) | Module 12 (volunteer recognition) | Phase 3 |
| 14 Digital Archive | Module 05 (photo import), Module 04 (event history), Module 03 (contest history), Module 07 (exhibition history) | None — terminal archive | Phase 3 |
| 16 Mobile PWA | All frontend modules must be mobile-responsive first | Module 16 formalises PWA manifest, offline caching, push integration | Phase 3 |
| 08 Photography School | Module 01, Module 02 (access control), Module 05 (assignment photo upload), Module 12 (school certificates) | None — education layer | Phase 4 |
| 13 Governance & Admin (advanced) | All modules must exist before advanced admin features are meaningful | None | Phase 4 |
| 15 AI Ecosystem | Module 05 (photo corpus), Module 08 (school content), Module 02 (member data) | Phase 4+ feature enhancement across all modules | Phase 4+ |
 
**Phase-by-Phase Roadmap**
 
*Timeline assumes solo practitioner with part-time capacity alongside client work. Phases are sequential — no phase begins until the prior phase is verified complete. Timeline is indicative, not contractual.*
 
| **Phase** | **Name** | **Timeline** | **What Gets Built** | **Key Decisions Required Before Start** |
| --- | --- | --- | --- | --- |
| Phase 0 | Foundation & Infrastructure | Weeks 1–6 | Monorepo setup (/frontend /backend /database /docs /infra /scripts). Docker + Nginx configuration. MySQL instance (AWS RDS or equivalent). NestJS project scaffold with Fastify adapter. Astro project scaffold. GitHub Actions CI/CD pipeline. Domain routing (api.bcc.bhopal.info → NestJS, bcc.bhopal.info → Astro). SQL migration tooling. OpenAPI tooling and typed client generation pipeline. Meilisearch self-hosted. MEM-006 + MEM-007 constitutional tables seeded. Founding Member reservation serials allocated (governance decision). Authentication architecture selected (Session+JWT or JWT+Refresh). | 1. Authentication architecture decision. 2. Founding Member serial assignments (00001–00007) — governance committee. 3. Historical block eligibility (00008–00020) — committee. 4. Club Year definition (start month/end month). 5. Admin panel approach (Astro SSR admin section, or separate lightweight admin tool). |
| Phase 1 | Identity, Membership & Communication | Months 2–5 | Module 01: Identity & User Management — complete. Module 02: Membership Management — complete (MEM-006 full implementation, lifecycle state machine, entitlement resolution engine, recognition engine AUTO + GOVERNANCE, MEM-007 number allocation). Module 11 partial: payment collection for membership fees (Razorpay integration, INR ledger, receipts). Module 17: Communication Engine — complete (email via Resend, SMS/WhatsApp via MSG91/Interakt, notification types taxonomy, templates Hindi/English, delivery tracking, opt-out). Payment failure handling (APPROVED state with pending_payment_id, webhook retry, idempotency). Digital membership card PDF generation. Admin panel: full membership lifecycle management. | Authentication decision must be finalised. Data migration plan for existing members must be executed: import existing records, assign historical numbers, normalise formats. |
| Phase 2a | Events & Gallery | Months 5–8 | Module 04: Events & Activity Management — complete (all event types, registration engine, QR check-in, fee collection linked to Module 11, volunteer slots, post-event gallery, communication triggers). Module 05: Gallery & Digital Archive — complete (upload pipeline to Cloudflare R2, ImageKit delivery, EXIF extraction, tagging, entitlement-driven visibility). Module 11 expanded: event fee collection, expense recording, event P&L. Financial ledger complete. Moderation workflow for gallery (Module 13 partial). | R2 bucket configuration verified. ImageKit origin mapping verified. File upload size limits and daily limits defined per membership class. |
| Phase 2b | Contest Engine & Certificates | Months 8–12 | Module 03: Contest Management Engine — complete (all contest types, submission management, full judging engine, blind/double-blind modes, multi-round, multi-criteria scoring, results and awards). Module 12: Certificates & Badges — complete (template builder, all certificate types, badge library, points system, verification URLs). Communication triggers from contest events wired to Module 17. | Contest fee structure defined. Judge RBAC roles scoped. Certificate template designs agreed. |
| Phase 3 | Portfolio, Exhibition, Community & Mobile | Months 12–18 | Module 06: Photographer Profiles & Portfolios. Module 07: Exhibition Management. Module 09: Community & Social Engagement. Module 10: Volunteer Management. Module 14: Digital Archive (initial import of historical records). Module 16: Mobile PWA (service worker, offline caching, push notifications, QR scanner, install manifest). Data migration: historical events and contests imported to archive. | Exhibition print specifications agreed. PWA manifest and icons prepared. |
| Phase 4 | Education, Intelligence & Native App | Months 18–28 | Module 08: Photography School — full LMS (curriculum, mentor system, assignments, certifications). Module 13: Governance & Admin advanced features (Club Intelligence Dashboard, advanced reporting, moderation workflow complete). Module 15: AI Ecosystem Phase 1 (auto-tagging, semantic search). Native mobile app: Capacitor wraps Astro PWA → iOS and Android builds → App Store and Play Store submission. | School curriculum content must be authored. Mentor recruitment and onboarding. App Store developer accounts. |
| Phase 5 | Scale & Intelligence | Year 3+ | Multi-tenancy groundwork (club_id on all tables — must be added in Phase 0 even if unused). AI Phase 2: visual search, educational feedback, renewal risk prediction. Sub-groups/interest groups within BCC. Video contests. Advanced analytics dashboard. Open Badges (LinkedIn-shareable). Lightroom plugin integration. | Multi-tenancy commercial model decision. |
 
**API Conventions (Contract Standard)**
 
*These conventions are frozen for the lifetime of /api/v1/. All NestJS controllers and all Astro API client calls must conform. Typed client is generated from the OpenAPI 3.x spec — deviating from these conventions breaks the generated client.*
 
- Base URL: /api/v1/ — all endpoints versioned here
 
- Transport: JSON over HTTPS only — no HTTP in production
 
- Authentication: Bearer token in Authorization header — scheme TBD (Session+JWT or JWT+Refresh per Phase 0 decision)
 
- Response envelope: { data: T | T[], meta: { pagination? }, errors: null } on success
 
- Error envelope: { data: null, errors: [{ code: string, message: string, field?: string }] } on failure
 
- Pagination: cursor-based for collections > 100 items — { next_cursor, prev_cursor, total_count } in meta
 
- Resource naming: plural nouns, kebab-case — /api/v1/members, /api/v1/membership-classes, /api/v1/contest-submissions
 
- HTTP methods: GET (read), POST (create), PATCH (partial update), DELETE (remove) — no PUT
 
- Error codes: machine-readable strings — MEMBERSHIP_NOT_FOUND, ENTITLEMENT_DENIED, NUMBER_IMMUTABLE — not just HTTP status
 
- OpenAPI spec lives in /docs/openapi.yaml — source of truth for typed client generation
 
- Typed client generated per build — Astro frontend imports generated client, never raw fetch
 
**Data Migration Governance**
 
*Historical migration is a one-time activity per MEM-007. It must complete before Phase 1 goes live. The migration does not block Phase 0 infrastructure work.*
 
- Existing data inventory: audit current bcc.bhopal.info data — member names, emails, join dates, event history
 
- Migration priority: members first (Phase 1) → events (Phase 2a) → contests (Phase 2b) → exhibitions (Phase 3)
 
- Migration tooling: SQL import scripts in /scripts — versioned, idempotent, reversible
 
- Founding Member serial assignment: committee resolution required — who gets 00001 through 00007, documented in /docs
 
- Historical block (00008–00020): eligibility criteria, list of names, committee approval — documented in /docs
 
- Temporary identifiers: all existing members assigned BCCTempXXXXX during import, retired on permanent number assignment
 
- De-duplication: email-based de-duplication, coordinator reviews ambiguous cases before import
 
- Old site: remains live until Phase 1 is verified complete — parallel operation, no forced cutover
 
- Rollback: if migration fails, old site continues — new system does not go live until migration is verified
 
- Club Year: configured in System Settings before any annual report or points reset runs
 
**Closing — The Constitutional Commitment**
 
The BCC Unified Platform is built on a constitutional foundation. MEM-006 is not a feature specification — it is the law of the platform. Every module in this document has been written to inherit, enforce, and respect MEM-006's five principles and their architectural consequences.
 
*MEM-006 and MEM-007 are APPROVED, FROZEN, and AUTHORITATIVE. The FINAL_TECHNOLOGY_STACK_FREEZE is FROZEN and AUTHORITATIVE. All implementation decisions, database designs, service architectures, and feature developments must inherit these documents as the authoritative baseline.*
 
The platform is designed to carry BCC from a few hundred members to many thousands — through every photowalk, every contest, every exhibition, every AGM, and every photograph that a BCC member ever takes.
 
*Version 3.0 — FINAL_TECHNOLOGY_STACK_FREEZE Adopted — June 2026*
 
	Bhopal Camera Club © 2026  |  Confidential*	For internal planning use only*