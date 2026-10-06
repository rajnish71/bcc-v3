# PROFILE-ARCH-001 — Photographer Profile Completion & Directory Eligibility

**Status:** FROZEN — approved by Human Authority (Rajnish), 2026-10-06
**Version:** 1.0
**Authority rank:** Subordinate to MEM-006, MEM-007, TECH-STACK-FREEZE, PHASE_ROADMAP and MEM-008. It amends none of them.
**Scope:** Module 06 — Photographer Profiles & Portfolios (public Photographer Directory listing and the Members Hub profile-completion indicator).

---

## 1. Purpose

This document freezes:

- the definition of **profile completion**
- the **public Photographer Directory listing rule** built on it

It defines policy only. It does not change membership state, entitlements, profile visibility, photographs, portfolio selection or profile data.

---

## 2. Profile completion model

Profile completion consists of exactly **seven** equally weighted, binary elements: 1 = complete, 0 = incomplete. There is no partial credit.

| # | Element | Storage | Complete when |
|---|---|---|---|
| 1 | Bio / About | `users.bio` (Hub Profile rich-text editor, HTML) | `N(stripTags(users.bio)) !== ''` |
| 2 | Location — City | `users.city` | `N(users.city) !== ''` |
| 3 | Camera Gear | `user_gear`, `users.preferred_camera_system` | at least one `user_gear` row satisfying the public-profile equipment render predicate, **or** `preferred_camera_system` is non-null and in the write-path validator's accepted value set |
| 4 | Social / Website | `user_social_handles`, `users.website_url` | at least one `user_social_handles` row with `N(handle) !== ''` on a platform the public profile renders, **or** `N(website_url) !== ''` and it passes the existing write-path URL validator |
| 5 | Cover Photo | `user_cover_photos` | an active cover row (`is_active = 1`) exists |
| 6 | Photography Genres | `users.photography_genres` | the stored value, read through the existing mechanism, contains at least one element that normalises to non-empty and satisfies the existing genre validation rules |
| 7 | Tagline | `users.tagline` (max 120) | `N(users.tagline) !== ''` |

There is no minimum character count. A single meaningful character is sufficient.

### 2.1 Normalisation `N(x)`

All text checks use one function:

1. null → empty
2. decode HTML entities
3. treat all Unicode whitespace as whitespace, explicitly including U+00A0 (non-breaking space)
4. trim

For Bio, HTML tags are stripped before `N` is applied. HTML-only content, such as `<p>&nbsp;</p>`, is incomplete.

### 2.2 Element details (as found in the implementation, 2026-10-06)

- **Camera Gear: accepted camera systems.** The write-path validator (`UpdateProfileDto`) accepts exactly `Nikon`, `Canon`, `Sony`, `Fujifilm`, `OM System`, `Other`.
  - None of these means "none" or absence. `Other` means a different camera system.
  - Stored values outside this set (legacy free text) are incomplete.
- **Camera Gear: equipment rows.** The public profile renders equipment rows of type `BODY`, `LENS` and `ACCESSORY`, which is the whole `gear_type` set.
- **Social: rendered platforms.** The public profile renders every write-path platform: `INSTAGRAM`, `FLICKR`, `YOUTUBE`, `FIVE_HUNDRED_PX`, `WEBSITE`, `FACEBOOK`, `X_TWITTER`, `TIKTOK`, `LINKEDIN`.
- **Website: URL validator.** The validator is class-validator `@IsUrl({})`.
- **Genres: storage and validation.**
  - Stored as a MySQL `JSON` array, which mysql2 parses automatically.
  - Validated on write as `@IsArray`, `@ArrayMaxSize(10)`, `@IsString({ each: true })`.
  - Elements that are not strings never count.
  - A stored value that is not an array is incomplete.

### 2.3 Threshold

Profile completion must be **at least 50%**. With seven equally weighted elements, this requires **4 of 7**.

The normative test uses integer arithmetic only:

```
2 * completed_count >= 7        (equivalently completed_count >= 4)
```

Eligibility is never derived from a rounded percentage, a floating-point value or a frontend value.

A percentage may be displayed for orientation as `floor(100 * completed_count / 7)`. It has no bearing on eligibility.

### 2.4 Excluded from completion

Never counted:

- **Identity and naming:** Display Name, First Name, Last Name, Email, Username
- **Membership:** class, status, number, badges; roles
- **Account settings:** security and password fields, privacy settings, notification settings
- **Personal and private data:** date of birth, blood group, emergency contact, private address/KYC data
- **Photographs:** profile photograph, portfolio photographs
- **Other profile fields:** Photography Experience, State, Areas of Expertise, Favourite Subjects, Awards / Distinctions

The profile photograph and portfolio photographs are separate directory conditions (§3). They are never part of the completion count.

### 2.5 Single source of truth

- **One calculation.** The completion calculation exists once, server-side, in Module 06.
- **Consumers.**
  - Photographer Directory eligibility.
  - The Members Hub completion indicators, which only display the backend result.
- **No duplicates.** No second formula may exist, including in frontend code.
- **Not stored.** Completion is computed from current data and is never persisted.

---

## 3. Public Photographer Directory listing rule

```
LISTED(u) =
      EXISTING_DIRECTORY_GATES(u)
  AND HAS_VALID_PROFILE_PHOTO(u)
  AND 2 * PROFILE_COMPLETED_COUNT(u) >= 7
  AND PUBLICLY_ELIGIBLE_PORTFOLIO_COUNT(u) >= 5
```

The three new conditions are additive. Existing gates are unchanged.

- **Existing directory gates**, as implemented on 2026-10-06:
  - user `status = ACTIVE`, not deleted, `username` present
  - `profile_visibility = PUBLIC` (so founding members 00002–00007 stay permanently PRIVATE and excluded)
  - an `ACTIVE` membership with a membership class
- **HAS_VALID_PROFILE_PHOTO.** This is the established public avatar definition: a `user_avatars` row with `size_variant = 'ORIGINAL'` and a non-empty `r2_key`. It is the same row every public surface renders as the profile photograph. Initials, placeholders, cover photos and portfolio photographs never qualify.
- **PUBLICLY_ELIGIBLE_PORTFOLIO_COUNT.** This counts photographs that are `ACTIVE`, `PUBLIC` and `show_in_portfolio`, and that the deployed MEM-008 exposure policy exposes (`PortfolioExposureService` / `exposedPhotoPredicate`). That policy enforces entitlements, plan caps, `portfolio_selected`, and the over-cap fail-closed rule. Basic Member behaviour stays governed by MEM-008, with no exception.
- **Query correctness.** Eligibility is applied server-side, inside the directory query, to both the total count and the row query. Totals, pagination, ordering and filters stay consistent.

---

## 4. Public profile route independence

- **Route.** `/photographers/:username` does not depend on directory eligibility. Existing visibility and access rules alone decide whether a profile is reachable.
- **Static pages and sitemap.** Static profile pages and sitemap entries are generated from the public-profile population (`GET /api/v1/photographers/profile-paths`), not from the eligibility-gated directory list.

---

## 5. Out of scope

- Reminder emails and notifications
- Scheduled jobs and background workers
- Admin reminder panels
- Stored completion scores or any new column

Each of these needs separate authorization.
