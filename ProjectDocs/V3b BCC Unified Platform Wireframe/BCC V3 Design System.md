# BCC Unified Platform Design System

**Version:** 3.0 | **Date:** July 2026 | **Status:** APPROVED — Source of Truth

> **Authority:** Tokens and design philosophy from `design-tokens.md` + `design-system-final.md` (both frozen). Layout patterns and component structure from V3 wireframes. No further design exploration — this document governs all V3 wireframes and implementation.

---

## 1. Design Philosophy — "Refined Editorial Luxury"

| Source concept | What it contributes |
|---|---|
| Leica Editorial | Structural skeleton: hairline rules, asymmetric editorial grid, exhibition-label captions, restraint |
| Apple Luxury | Material finish: warm ivory satin surfaces, soft layered depth, ONE metallic-gold CTA per view, gentle light gradients |
| Photography Magazine | Photography density: full-bleed image moments, category plates, high image share |

Foundation is **typography + hairlines, not effects** — chosen for a 5–10 year lifespan.

---

## 2. Brand Positioning

> "India's premier photography community."

**BCC is:** photography community · learning organization · cultural institution · exhibition platform · member-driven club.  
**BCC is not:** camera manufacturer · retailer · agency · solo portfolio · software platform.

Tone: prestigious, sophisticated, modern, visual, confident, timeless.

---

## 3. Design Principles

1. **Photography first — 70/30.** Photography ≈70% visual attention; UI ≈30%. The UI frames photographs; never competes.
2. **No camera-product imagery.** Gear close-ups and flat-lays are banned. Allowed: member photographs, photowalks, wildlife, heritage, street, nature, exhibitions, photographers at work.
3. **Credit the maker.** Lead with photographs; always attribute by name. Recognition is a primary product of the site.
4. **One gold CTA per view.** Gold gradient reserved for the single primary action visible at any time (normally "Become a Member").
5. **Square photo frames.** Photography is never border-radiused — square frames echo print heritage. Radius only for inputs and avatar circles.
6. **Restrained gloss.** Satin nav surface, soft shadows (3 elevation levels max), one gradient CTA. No glassmorphism, neon, heavy gradients, dark themes, or SaaS aesthetics.
7. **Dynamic data only.** No hardcoded names, events, statistics, plans, dates, or categories. Every component is a typed contract over CMS collections.
8. **Designed for real-world member photography** — variable quality, mixed orientations, panoramas, phone shots.

---

## 4. Color Palette

### Surfaces

| Token | Value | Use |
|---|---|---|
| `--surface-0` | `#FFFFFF` | Cards, header, mats, label plates |
| `--surface-1` | `#FAF8F4` | Page background, alternating sections |
| `--surface-2` | `#F4F0E8` | Recessed plates (gallery wall, footer), image fallback |
| `--surface-deep` | `#141210` | Dark bands, filmstrips, image-grid gaps |
| `--image-backdrop` | `#1A1816` / `#2A2622` | Behind loading/letterboxed images |

### Ink

| Token | Value | Use |
|---|---|---|
| `--ink-900` | `#141210` | Headlines, primary text |
| `--ink-600` | `#57514B` | Body text, secondary |
| `--ink-400` | `#8B8378` | Captions, meta, labels |
| `--ink-inverse` | `#FAF8F4` | Text on dark |

### Accent

| Token | Value | Use |
|---|---|---|
| `--gold-500` | `#C9A961` | Hairline accents, active underlines, dividers |
| `--gold-600` | `#A8843C` | Kickers, links, chips |
| `--gold-gradient` | `linear-gradient(135deg, #C9A961, #A8843C)` | THE primary CTA (one per view), featured plates |
| `--forest-600` | `#3E5A48` | Avatar plates, success/positive, photowalk tags |
| `--forest-gradient` | `linear-gradient(135deg, #3E5A48, #2A3E32)` | Initials avatar plates |

### Lines

| Token | Value | Use |
|---|---|---|
| `--hairline` | `#E7E1D6` | All borders/dividers (1px) |
| `--hairline-soft` | `#F0EBE0` | Inner-card dividers |
| `--hairline-strong` | `#D8D2C6` | Input borders, secondary buttons |

### Activity Tag Colors

| Activity | Background | Text |
|---|---|---|
| Photowalk | `#E8EFE9` | `#3E5A48` |
| Workshop | `#F5EDD8` | `#8C6830` |
| Exhibition | `#141210` | `#FAF8F4` |

> **Wireframe mapping:** Wireframes use flat amber #F5A82A and dark #222 as lo-fi stand-ins. These are NOT production values. Map to tokens above in all hi-fi implementation.

---

## 5. Typography

### Typefaces

| Family | Weights | Use |
|---|---|---|
| **Outfit** | 300–800 | All headings, display, emphasis |
| **Inter** | 300–600 + italic | Body, UI labels, conditions |
| **JetBrains Mono** | 400, 500, 600 | Annotations, EXIF data, credential labels only |

### Type Scale

| Token | Spec |
|---|---|
| `--text-display` | Outfit 700 · clamp(56px, 7vw, 96px) · lh 0.95 · ls −0.035em |
| `--text-h1` | Outfit 700 · clamp(36px, 4vw, 52px) · lh 1.05 · ls −0.025em |
| `--text-h2` | Outfit 600–700 · clamp(26px, 3vw, 34px) · lh 1.15 · ls −0.015em |
| `--text-h3` | Outfit 600 · 21px · lh 1.25 |
| `--text-body` | Inter 400 · 16px · lh 1.75 |
| `--text-small` | Inter 400 · 13–14px · lh 1.65 |
| `--text-label` | Inter 600 · 11px · uppercase · ls 0.18em |
| `--text-mono` | JetBrains Mono 400 · 10–12px · ls 0.06em |

**Minimums:** body ≥ 14px web; never below 12px anywhere.

---

## 6. Button System

### Variants

| Variant | Background | Border | Text | Radius | Use |
|---|---|---|---|---|---|
| **Primary Gold** | `--gold-gradient` | none | `--ink-inverse` | 2px | ONE per view — "Become a Member", main CTA |
| **Primary Dark** | `--ink-900` | none | `--ink-inverse` | 2px | Secondary primary actions |
| **Outline Gold** | transparent | 1.5px `--gold-600` | `--gold-600` | 2px | Member actions — "Member Hub", "Register →" |
| **Outline Ink** | transparent | 1.5px `--hairline-strong` | `--ink-600` | 2px | Secondary — "Details", "View All" |
| **Ghost / Text link** | none | none | `--ink-600` | — | Inline, underline-border style |

**Gold CTA shadow:** `0 2px 10px rgba(168,132,60,.3)` + `inset 0 1px 0 rgba(255,255,255,.25)` (satin highlight).

### Sizing

| Size | Padding | Font |
|---|---|---|
| Large | 12px 32px | Inter 500 13px |
| Default | 9px 20px | Inter 500 11px |
| Small | 5px 14px | Inter 500 10px |

### Chips / Pills

Border: 1px `--hairline`; border-radius: `--r-full`; padding: 3px 12px; font: Inter 600 10px; letter-spacing: 0.06em; uppercase. Active chip: 3px `--gold-500` top bar.

---

## 7. Spacing & Layout

### 8px Base Grid

`--s-1: 8px` · `--s-2: 16px` · `--s-3: 24px` · `--s-4: 32px` · `--s-6: 48px` · `--s-8: 64px` · `--s-12: 96px` · `--s-16: 128px`

Section vertical rhythm: 96–112px desktop · 64px mobile.  
Content max-width: **1360px** · gutter: 48px desktop / 20px mobile.

---

## 8. Border Radius

| Token | Value | Use |
|---|---|---|
| `--r-0` | 0 | Images, cards, mats — photography NEVER rounded |
| `--r-1` | 2px | Buttons, plates |
| `--r-2` | 8px | Inputs |
| `--r-full` | 999px | Avatars, filter chips |

---

## 9. Elevation

| Token | Value | Use |
|---|---|---|
| `--e-1` | `0 1px 2px rgba(20,18,16,.04)` | Cards, mats |
| `--e-2` | `0 8px 32px rgba(20,18,16,.07)` | Hover lift, condensed header |
| `--e-3` | `0 24px 64px rgba(20,18,16,.14)` | Hero imagery & label plates ONLY |

---

## 10. Borders

- 1px `--hairline` everywhere
- 2px `--ink-900` emphasis rules (timeline top rule only)
- 2px `--gold-500` active-nav underline
- 3px `--gold-500` top bar for active genre plates

---

## 11. Motion Tokens

| Token | Value | Use |
|---|---|---|
| `--m-fast` | 0.2s ease | Hovers |
| `--m-med` | 0.35s cubic-bezier(0.4, 0, 0.2, 1) | Header condense |
| `--m-reveal` | 0.7s power2.out | GSAP section reveal |
| `--m-image` | 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) | Image scale hover |
| `--m-stagger` | 80ms | Between staggered children |

`prefers-reduced-motion`: disable ALL transforms; opacity-only fades.

### GSAP Hooks

| Hook | Behavior | Token |
|---|---|---|
| `data-gsap="reveal"` | Fade + 24px rise, once on scroll | `--m-reveal` |
| `data-gsap="stagger"` | Children cascade | `--m-stagger` |
| `data-gsap="image-reveal"` | Clip-path wipe bottom-up | 1.1s expo.out |
| `data-gsap="parallax-soft"` | Background drifts 0.92× scroll | scrub, linear |
| `data-gsap="counter"` | Numbers count up on entry | 1.4s power1.inOut |
| `data-gsap="header-condense"` | Header 96→64px after 80px scroll | `--m-med` |
| `data-gsap="aperture-spin"` | Slow continuous rotation | linear, infinite |

---

## 12. Breakpoints

| Token | Value | Notes |
|---|---|---|
| `--bp-sm` | 640px | 1-col grids, drawer nav |
| `--bp-md` | 900px | 2-col grids, tablet header |
| `--bp-lg` | 1200px | Full grids |
| `--bp-max` | 1360px | Content max-width |

---

## 13. Navigation (Frozen)

**Five nav links:** Home · About · Activities · Showcase · Journal  
**Right rail (Guest):** "Sign In" (text) + **"Become a Member"** (gold CTA)  
**Right rail (Member):** Avatar (`--forest-gradient`) + "Member Hub" (outline gold)

- "Join" is NOT a nav link — the gold CTA owns that intent
- "Showcase" approved over Gallery / Photographers / Portfolios / Collections
- "Member Hub" approved over Dashboard / Portal / My BCC / Member Area

### Header Condensing

- Rest: 96px · logo 56px
- Scrolled (after 80px): 64px · logo 44px · never below 38px mobile

### Role States

| Role | Primary CTA | Avatar |
|---|---|---|
| Guest | "Become a Member" (gold gradient) | None |
| Member | "Member Hub" (outline gold) | `--forest-gradient` initials circle |
| Committee | Committee Tools pinned | Distinct color |
| Admin | Admin Console | `--ink-900` bg + gold monogram |

---

## 14. Homepage Hierarchy (Frozen)

1. **BCC Spotlight hero** — single monumental member photo, museum label plate (title, member, originating activity). Committee-curated, no fixed cadence. Label: "BCC Spotlight" — never "Photograph of the Month".
2. **StatBand** — dynamic club statistics with GSAP counter.
3. **Gallery Wall — "Our members, on the wall."** Justified grid, max one frame per photographer, photographer-name-first labels, links to `/gallery/photographer/[slug]`. Footnote: "Your frame could hang here — Become a Member" → /join.
4. **Upcoming Events** — EventRow ×3, next 3 from API.
5. **Full-bleed photo band** — heritage series, soft parallax.
6. **Membership tiers** — 3 public plans from `membershipPlans[]`.
7. **Journal preview** — JournalCard ×3.

---

## 15. Information Architecture (Frozen)

| Route | Page |
|---|---|
| `/` | Home |
| `/about` | About |
| `/activities` | Activities (filterable: Photowalks / Workshops / Exhibitions) |
| `/showcase` | Showcase — photography discovery hub |
| `/gallery/photographer/[slug]` | Photographer Portfolio |
| `/join` | Join (tiers + 3-step application) |
| `/journal` | Journal index |
| `/journal/[slug]` | Journal detail |
| `/signin` | Sign In |
| `/hub` | Member Hub (auth-gated) |

---

## 16. Photography & Image Handling

### Aspect Ratios by Context

| Context | Ratio | Mode |
|---|---|---|
| Gallery Wall (home/showcase) | Original | Justified row — no cropping |
| Hero / full-bleed | 16:9 | cover + focal point |
| Event cards | 3:2 | cover |
| Photographer profile hero | 3:4 | cover |
| Lightbox / detail | Any | contain — never crop |
| Panoramas | Variable | letterbox on `--image-backdrop` |

### Fallbacks

- **Missing image:** `--surface-2` plate + 12% opacity monogram + exhibition label
- **Loading:** Shimmer on `--surface-2` — no spinners
- **Hover:** Scale 1.03 (`--m-image`) + caption slide-up; max 14% darken
- **Mobile:** Hover states become persistent captions

---

## 17. Component Patterns (from V3 Wireframes)

### Gallery Wall — Justified Grid
- Algorithm: Flickr-style justified layout — original aspect ratios preserved; rows fill full content width with 8px gaps; row height varies
- No `object-fit: cover` cropping
- Mobile fallback: 2-column standard grid

### Event List (Home)
- Hairline-divided rows; date as large Outfit 700 number + month label
- Row: date · photo (3:2) · details · action
- Category chips use activity tag colors above
- Source: next 3 upcoming from API, ascending

### Membership Tiers (Public)
- 3 classes only on public pages: Basic · Student · Individual
- Full/Life/Patron/Founding shown only inside Member Hub (upgrade pathway)
- Preceded by 3-step flow diagram: Register Free → Apply for Membership → Start Participating

### Contest Strip
- Conditionally rendered — absent from DOM entirely when no active submission window
- No empty state on public page

### Annotation Conventions (Wireframes)
- **Amber circle badge ①②…** — annotation callout; references Annotation Key below each wireframe
- **Dashed border** — content placeholder boundary (not a hi-fi treatment)
- **Grey fills #C8C8C8–#D0D0D0** — image/media placeholder
- **Grey bars #E4E4E4–#EBEBEB** — body copy placeholder
- **"⚙ ADMIN-TOGGLED"** — section absent from DOM when off
- **"hi-fi: [desc]"** — describes hi-fi colour replacing wireframe grey

---

## 18. Membership Card System

**Format:** CR80 Portrait — 53.98 × 85.60 mm | Aspect 0.6306 (locked)

**Front:** Identity lockup · Member photo (4:5, square corners) · Name + category chip · Credential block (JetBrains Mono) · QR verification footer · 4px tier accent spine

**Back:** Large QR · Club address · Contact · Conditions · Authorised signature

**Tier signal:** Accent colour on spine + footer hairline + chip only.

**Output formats:** PDF (CMYK vector) · PNG 300dpi · JPG 300dpi · A4 3×3 with crop marks · Apple/Google Wallet (Phase 2)

---

## 19. Dynamic Data Collections

| Collection | Key Fields |
|---|---|
| `membershipPlans[]` | name, price, features, featured |
| `clubStats[]` | value, label, sublabel |
| `recentPhotos[]` | image, title, photographer, category, aspect |
| `upcomingEvents[]` | date, time, title, venue, type, image, eligibility |
| `activeContest` | name, theme, deadline, eligibility (null = section hidden) |
| `spotlightPhoto` | image, title, photographer, activityOrigin |
| `recentPosts[]` | title, category, author, date, readTime |
| `photographers[]` | name, slug, bio, specialisation, tier, photos[] |
| `showcasePhotos[]` | image, title, photographer, category, month, reactions |

---

## 20. Accessibility

- **Contrast:** `--ink-900` on surfaces ≥ 7:1; `--ink-600` on light ≥ 4.5:1
- **Focus rings:** `outline: 2px solid #A8843C; outline-offset: 3px`
- **Skip links:** `<a href="#main-content">` visible on focus
- **Reduced motion:** Disable ALL transforms; opacity-only fades
- **Hit targets:** ≥ 44×44px on all interactive elements

---

## 21. Performance Targets

| Metric | Target |
|---|---|
| LCP | < 2.5s |
| INP | < 100ms |
| CLS | < 0.1 |
| Images | AVIF/WebP |
| Elevation | 3 levels max |
| GSAP | Interaction layer only |
| Fonts | preconnect + Latin subset |

---

## 22. Stack

| Layer | Technology |
|---|---|
| Framework | Astro (SSR + static generation) |
| Styling | Vanilla CSS — `tokens.css` |
| Animation | GSAP 3+ (ScrollTrigger) |
| Gallery layout | Flickr justified-layout |
| Data | CMS collections — 100% dynamic |

---

## 23. Wireframe Files

| File | Route |
|---|---|
| BCC Home Wireframe.dc.html | `/` |
| BCC Events Wireframe.dc.html | `/activities` |
| BCC Membership Wireframe.dc.html | `/join` |
| BCC Showcase Wireframe.dc.html | `/showcase` |
| BCC Photographers Wireframe.dc.html | `/gallery/photographer` |
| BCC Photographer Profile Wireframe.dc.html | `/gallery/photographer/[slug]` |

---

*BCC Unified Platform V3 Design System · July 2026*  
*Tokens frozen per `design-tokens.md` + `design-system-final.md`. Layout patterns from V3 wireframes.*
