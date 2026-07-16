# Temporary Development Seed Data

This directory contains static development records representing realistic camera club data for the City of Lakes (Bhopal). 

These collections are consumed **exclusively** by the Service Layer (`src/lib/services/`).

## Contents

- Exactly 35 records across 7 files:
  - `activities.ts` (5 records)
  - `photowalks.ts` (5 records)
  - `workshops.ts` (5 records)
  - `contests.ts` (5 records)
  - `featuredActivities.ts` (5 records)
  - `journal.ts` (5 records)
  - `photoSeries.ts` (5 records)
- Centralized image path constants mapping locally under `public/images/seed/` in `images.ts`.

All records contain stable ID properties, slugs, and a flag set to `isSeedData: true`.

---

## Removal & Migration Strategy

When the live backend engines (Event Engine, Contest Engine, Workshop Engine, Journal Engine, Photo Series Engine) are completed, this entire folder can be deleted safely:

1. **Delete** this folder: `src/data/seed/`
2. **Re-implement** the Service files under `src/lib/services/` to fetch data from the live backend API repositories rather than local imports.
3. **No UI components or page files need changes** because they depend solely on the permanent interfaces and async contracts exported by the Service Layer.
