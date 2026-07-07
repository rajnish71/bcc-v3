# BCC Unified Platform V3 — Phase Roadmap

**Status:** Living document — update this file as phases complete.
**Last updated:** 2026-07-06
**Companion documents:** `MEM-006`, `MEM-007`, `TECH-STACK-FREEZE.md`,
`BCC_Unified_Platform_Specification_v3.docx`

---

## HOW TO USE THIS FILE
Single source of truth for sequencing — what is built, what is next, what is open.
Start every new session by pointing Claude here. The `.docx` spec covers *what* each
module does in depth; this file covers *status and sequencing only*.

---

## WHAT IS COMPLETE — FULL AUDIT (as of 2026-07-06)

### Infrastructure & Design
| Item | Status | Key facts |
|------|--------|-----------|
| Phase 0 — Infrastructure | ✅ COMPLETE | PM2 + Nginx + Certbot + GitHub Actions CI/CD on master |
| Phase 0.5 — Design System | ✅ COMPLETE | "Refined Editorial Luxury" frozen in `BCC V3 Design System.md` |

### Backend Modules
| Module | Status | Key facts |
|--------|--------|-----------|
| Module 01 — Identity & User Management | ✅ COMPLETE | 6 registration methods, JWT + rotating refresh, argon2, RbacGuard/RbacService, `toMysqlDatetime()` timezone fix. Phone OTP gated off. Instagram dropped. |
| Module 02 — Membership Management | ✅ COMPLETE | 7-state lifecycle, 3-layer entitlements, dual-track recognition, renewal engine, voting register, card PDF (pdf-lib), MEM-007 numbering service, Founding block trigger-locked. |
| Module 04 — Events & Activity Management | ✅ COMPLETE | Migration 0033 — 5 tables (events, event_invite_list, event_registrations, event_volunteer_slots, event_volunteers). Seeds 0008+0009: 6 event notification types + 7 RBAC permissions. |
| Module 05 — Gallery & Digital Archive | ✅ COMPLETE | Migration 0034. 15 genre tags live. Presign/confirm upload flow auth-gated. Albums CRUD. Visibility enforcement in service layer. ImageKit URL endpoint set. `GET /api/v1/gallery/tags` live. |
| Module 06 — Photographer Profiles | ✅ COMPLETE | `GET /api/v1/photographers`, `GET /api/v1/photographers/:username`. All 7 founding members return from directory endpoint. |
| Module 17 — Communication Engine | ✅ COMPLETE | 29 notification types, 54 templates (EMAIL + IN_APP). `CommunicationService.dispatch(typeKey, userId, variables)` is the single entry point. Bell API: 6 endpoints at `/api/v1/notifications/*`. MEMBERSHIP_REINSTATED + MEMBERSHIP_RENEWED fully seeded — no open stubs remain. |

### Frontend Pages
| Route | Status | Notes |
|-------|--------|-------|
| `/` | ✅ LIVE | Home (Spotlight, StatBand, Gallery Wall, Events, Tiers, Journal) |
| `/about` | ✅ LIVE | About page |
| `/activities` | ✅ LIVE | Activities listing |
| `/activities/*` | ✅ LIVE | 6 individual activity pages |
| `/showcase` | ✅ LIVE | Photo showcase |
| `/gallery/photographer` | ✅ LIVE | Photographer directory |
| `/gallery/photographer/[slug]` | ✅ LIVE | Photographer profile page |
| `/join` | ✅ LIVE | Membership landing — 3 public tiers only |
| `/auth/signin` | ✅ LIVE | Email+password + Google + Facebook sign-in |
| `/auth/register` | ✅ LIVE | Registration (MEM-006 P1 identity notice) |
| `/auth/callback` | ✅ LIVE | OAuth token receiver (hash fragment) |
| `/verify-email` | ✅ LIVE | Email verification |
| `/hub` | ✅ LIVE | Member Hub dashboard (auth-gated) |
| `/hub/membership/apply` | ✅ LIVE | Membership application (Basic/Student/Individual) |

**Total: 18 pages deployed.**

### Membership Data
| Item | Status |
|------|--------|
| Founding Block (serials 00001–00007) | ✅ COMPLETE — ACTIVE memberships, permanent numbers, trigger-locked |
| Migration Track C — legacy members | ✅ COMPLETE — migration 0035. 18 users created (16 Basic Members + 2 Registered Users). 16 BCCTempXXXXX issued (BCCTemp00001–BCCTemp00016). 312 photos linked. See data quality notes below. |
| Historical block non-legacy members (Kamal Kushlani, Lubna Rashid, Feher Murtaza, Yogesh More, Neha Zode) | 🔶 PENDING — not in legacy DB, must be created manually when ready. Accounts use same ADMIN_CREATED flow. |

---

## SCHEMA STATE (as of 2026-07-06)
| Layer | Last item |
|-------|-----------|
| Migrations | 0035 (Migration Track C) |
| Seeds | seed_0009 |
| Notable tables | users, memberships, membership_classes, member_recognitions, class_entitlements, individual_overrides, membership_number_pool, membership_number_log, membership_temp_identifiers, voting_register_snapshots, notification_types, notification_templates, notification_log, in_app_notifications, notification_preferences, events, event_invite_list, event_registrations, event_volunteer_slots, event_volunteers, photos, photo_albums, photo_album_items, photo_tags, photo_tag_assignments |

---

## MIGRATION TRACK C — DATA QUALITY NOTES
Flag for Rajnish to review before permanent number batch:

| Member | Issue |
|--------|-------|
| Meeta Athavale (meetaathavale) | Phone was '1111' in legacy — stored as NULL in V3. No bcc_member_profiles row existed in legacy. |
| Ritu Ahluwalia (rituahluwalia) | Phone was '1111' in legacy — stored as NULL in V3. No bcc_member_profiles row existed in legacy. 0 photos. |
| Dr. Sanjay Kumar Shukla (sanjaykumarshukla) | Phone '+9198959996930' has 13 digits after +91 — likely should be +919895999693. Stored as-is. |
| Sauvik Acharyya (sauvikacharyya) | 0 photos in legacy — no photos migrated. |
| afzalkhan, priyaojha | Created as Registered Users only — no membership, no BCCTemp identifier. Confirmed prior session decision. |

---

## OPEN ITEMS BACKLOG
Carry these into every session until resolved.

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | **Membership card redesign** — portrait CR80 55×87mm two-sided | High | Dedicated Module 02 revisit session. Current code builds landscape single-sided. Decision + implementation both pending. |
| 2 | **Facebook OAuth** — switch app from Development → Live in Meta Developer Console | High | Async, no code. Blocks all Facebook social login for real users. |
| 3 | **Google OAuth callback URL** — verify correct redirect URI in Google Console matches `.env` | High | Dedicated auth-fix session needed. Social login not end-to-end tested. |
| 4 | **Logo filename rename** — committed as `"BCC Default.png"` (space), referenced as `/images/bcc-logo-default.png` | Medium | One `git mv` command. Can be done in any session. |
| 5 | **`showcase.astro` dark-theme inconsistency** | Low | Deferred. |
| 6 | **5 remaining non-legacy historical members** — Kamal Kushlani, Lubna Rashid, Feher Murtaza, Yogesh More, Neha Zode | Medium | Not in legacy DB. Create via ADMIN_CREATED flow when ready. No photos to migrate. |
| 7 | **Permanent number batch** — assign BCC numbers to all BCCTemp00001–BCCTemp00016 holders | Medium | External spreadsheet → admin batch import. Open per MEM-007 Amendment 001. |

---

## MIGRATION TRACK STATE
| Track | Status |
|-------|--------|
| A — Schema discovery & field mapping | ✅ COMPLETE |
| B — Public content & portfolio assets | ✅ COMPLETE (311 photos in R2, serving via ImageKit on V3 profiles) |
| C — Membership data | ✅ COMPLETE — migration 0035. 26 users total, 23 memberships, 16 BCCTemp IDs, 312 photos. 5 non-legacy members still pending (open item #6). |
| D — Parallel operation & DNS cutover | ⏳ NOT STARTED — legacy site remains authoritative |

---

## PHASE 2b — NEXT — Contest Engine & Certificates

These are the only remaining Phase 2 modules. Nothing else blocks them.

### Module 03 — Contest Management Engine
- 15+ contest formats (monthly, open, invitational, portfolio, live, etc.)
- Submission management with eligibility enforcement (MEM-006)
- Full judging engine: blind/double-blind, multi-round, multi-criteria scoring
- Results, awards, staged release
- Entry fees → Module 11; communication triggers → Module 17

### Module 12 — Certificates & Badges
- Template builder, all certificate types (participation, achievement, membership)
- Badge library, points system, verification URLs
- **Dependency:** Membership card (Module 02 revisit, open item #1) should be
  resolved before or during this module — they share PDF generation logic.

### Module 11 — Financial Core (expand in Phase 2b)
- Membership fee collection already wired from Phase 1
- Expand: event fee collection, contest entry fees, expense recording, event P&L,
  full INR ledger, Razorpay webhook handling, receipt generation

---

## PHASE 3 — Growth (after Phase 2b complete)
- Module 09 — Community & Social Engagement
- Module 10 — Volunteer Management
- Module 07 — Exhibition Management
- Module 14 — Digital Archive (historical records import)
- Module 16 — Mobile PWA (service worker, offline, push, QR scanner, install manifest)
- Migration Track D — DNS cutover, legacy site decommission

---

## PHASE 4 — Intelligence
- Module 08 — Photography School (full LMS, mentor system, assignments, certs)
- Module 13 — Governance & Admin advanced features
- Module 15 — AI Ecosystem Phase 1 (auto-tagging, semantic search)
- Native mobile: Capacitor wrapping Astro PWA → iOS + Android

---

## PHASE 5 — Scale (Year 3+)
- Multi-tenancy groundwork
- AI Phase 2: visual search, educational feedback, renewal prediction
- Sub-groups / interest groups
- Video contests, Open Badges, Lightroom plugin

---

## CONVERSATION-SPLITTING PLAN
- This roadmap is updated at the end of every session — paste back the summary.
- Each major build step gets its own fresh conversation pointed at this file.
- **Next session:** Phase 2b — start with Module 03 (Contest Engine) or Module 12
  (Certificates & Badges) — confirm which first.
