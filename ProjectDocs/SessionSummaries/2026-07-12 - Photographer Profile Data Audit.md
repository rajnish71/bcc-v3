# Photographer Profile Migration Audit
**Date:** 2026-07-12  
**Phase:** E — Feedback Stage 5  
**Scope:** V6 05 Public Photographer Profile — legacy field recovery assessment

---

## Data Fields: Recovery Status

| Field | DB Column/Table | API Returns | Frontend Shows | Status |
|---|---|---|---|---|
| Biography | `users.bio` | ✅ `bio` | ✅ About tab → Full Biography | **AVAILABLE** |
| Display photo (avatar) | `user_avatars` | ✅ `avatarUrl` | ✅ Profile hero | **AVAILABLE** |
| Cover photo | `user_cover_photos` | ✅ `coverUrl` | ✅ Cover banner | **AVAILABLE** |
| Tagline | `users.tagline` | ✅ `tagline` | ✅ Profile hero | **AVAILABLE** |
| City / State | `users.city`, `users.state` | ✅ `city`, `state` | ✅ Location row | **AVAILABLE** |
| Member since | `memberships.join_year` | ✅ `memberSince` | ✅ Rail + About | **AVAILABLE** |
| Membership class badge | `membership_classes.code` | ✅ `memberClass` | ✅ Badge | **AVAILABLE** |
| Photography genres | `users.photography_genres` (JSON) | ✅ `photographyGenres` | ✅ Rail + About | **AVAILABLE** |
| Areas of expertise | `users.areas_of_expertise` (JSON) | ✅ `areasOfExpertise` | ✅ About rail | **AVAILABLE** |
| Preferred camera system | `users.preferred_camera_system` | ✅ `preferredCameraSystem` | ✅ Rail | **AVAILABLE** |
| Camera gear (bodies/lenses) | `user_gear` | ✅ `gear` | ✅ About rail | **AVAILABLE** |
| Social handles | `user_social_handles` | ✅ `socialHandles` | ✅ Rail + About | **AVAILABLE** |
| Website URL | `users.website_url` | ✅ `websiteUrl` | ✅ About social links | **AVAILABLE** |
| Recognition (Senior/Honorary) | `member_recognitions` | ✅ `recognition` | — (not shown in UI) | **AVAILABLE — UI GAP** |
| Founding member status | computed from `membership_number` | ✅ `isFoundingMember` | ✅ Badge | **AVAILABLE** |
| **Awards** | **`user_awards` table** | **✅ Added 2026-07-12** | **✅ About rail — added 2026-07-12** | **RECOVERED** |
| **Awards HTML** | **`users.awards_html`** | **✅ Added 2026-07-12** | — (awards list preferred) | **RECOVERED (list form)** |
| **Photography society titles** | **`user_photo_titles` table** | **✅ Added 2026-07-12** | **✅ About rail — added 2026-07-12** | **RECOVERED** |

---

## Intentionally Excluded from Public Profile (Private Fields)

These fields exist in the database schema but must NOT appear on the public photographer profile page. They are accessible only through the authenticated Member Hub (V6 13).

| Field | DB Column | Reason |
|---|---|---|
| Address line 1/2/3 | `users.address_line1/2/3`, `users.pin_code` | Private KYC data |
| Blood group | `users.blood_group` | Medical data — private |
| Emergency contact name/phone/relationship | `users.emergency_contact_*` | Private personal safety data |
| Date of birth | `users.date_of_birth` | Private |
| Phone number | `users.phone` | Private |
| Email address | `users.email` | Private |
| Name title / first / middle / last | `users.name_title`, etc. | Private (full_name is public) |

---

## Data Population Status (Per Member)

| Member | Bio | Avatar | Cover | Gear | Awards | Titles | Genres |
|---|---|---|---|---|---|---|---|
| Rajnish Khare | ✅ | ✅ | ✅ | ? | — | — | ? |
| Kshitij Patle | ✅ | ✅ | ✅ | ✅ | ✅ (awards_html) | ? | ? |
| Prakash Hatvalne | ✅ | ✅ | ✅ | ✅ | ✅ (awards_html) | ? | ? |
| Robin Dutta | — | ? | ? | ✅ | — | — | ? |
| Ankit Tiwari | ? | ? | ? | — | — | — | ? |
| Rahil Khan | ? | ? | ? | — | — | — | ? |
| Dr. Anil Bhati | ? | ? | ? | — | — | — | ? |
| Others (12) | — | — | — | — | — | — | — |

**Legend:** ✅ = confirmed populated · — = not populated · ? = unknown (requires DB query)

---

## Outstanding Items (Requiring Admin Action)

These cannot be recovered programmatically — they require manual data entry in the Member Hub by the members themselves or by an admin:

1. **Bios for 15 of 18 legacy members** — Only 3–4 members have bios from Phase C/D population. The remaining members need to fill in their own biography via `/hub/profile`.

2. **Avatar photos for legacy members** — Most legacy members have no avatar uploaded. They need to upload via the Member Hub profile editor.

3. **Photography genres / areas of expertise** — Only partially populated. Members should update via `/hub/profile`.

4. **Camera gear data** — Only 3 members (kshitijpatle, prakashhatvalne, robindutta) have gear data from legacy migration. Others can add via hub.

5. **`user_awards` data quality** — The 5 seeded awards from migration 0044 are for specific members. Need verification against source records.

6. **Photography society titles** — Seeded in migration 0044 (12 rows). Need verification.

---

## API Changes Made (2026-07-12)

`GET /api/v1/photographers/:username` now returns two additional fields:

```json
{
  "awards": [
    { "name": "Award Name", "awardingBody": "Body", "year": 2023, "description": "..." }
  ],
  "awardsHtml": null,
  "photoTitles": [
    { "bodyCode": "FIAP", "bodyName": "FIAP", "titleCode": "AFIAP" }
  ]
}
```

## Frontend Changes Made (2026-07-12)

- Photographer profile About tab now shows **Awards & Distinctions** card (hidden when empty)
- Photographer profile About tab now shows **Photography Society Titles** card (hidden when empty)
- Both cards appear in the right rail above Camera Gear
