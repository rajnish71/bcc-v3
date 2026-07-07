# BCC Unified Platform Design System

**Version:** 2.0 | **Date:** June 2026 | **Status:** Implementation Ready

---

## 1. Visual Direction

### Recommended Aesthetic: Refined Editorial Luxury

A hybrid approach combining:
- **From Leica Editorial (A):** Structural skeleton — hairline rules, asymmetric editorial grid, exhibition-label captions, restraint
- **From Apple Luxury (B):** Material finish — warm ivory satin surfaces, soft layered depth, one metallic-gold CTA per view, gentle light gradients
- **From Contemporary Magazine (C):** Photography density — full-bleed image moments, category plates, contact-sheet grids for member work

**Rationale:** Keeps photography at ~70% visual share, uses gloss only as seasoning (one gradient CTA, one satin nav surface, soft shadows ≤ 3 levels), holds up over a 5–10 year horizon because foundation is typography + hairlines, not effects.

---

## 2. Color Palette

### Core Surfaces & Ink

| Token | Hex | Use |
|-------|-----|-----|
| `--surface-0` | `#FFFFFF` | Maximum contrast backgrounds |
| `--surface-1` | `#FAF8F4` | Primary background, safe area |
| `--surface-2` | `#F4F0E8` | Secondary surfaces, warm depth |
| `--ink-900` | `#141210` | Primary text, strongest contrast |
| `--ink-600` | `#57514B` | Body text, reading comfort |
| `--ink-400` | `#8B8378` | Tertiary labels, micro-copy |

### Accent Colors

| Token | Hex | Use |
|-------|-----|-----|
| `--gold-gradient` | `#C9A961 → #A8843C` | Primary CTA, membership card spine |
| `--gold-600` | `#A8843C` | Secondary accent, labels |
| `--forest-600` | `#3E5A48` | Avatar backgrounds, states |
| `--hairline` | `#E7E1D6` | Borders, dividers |

### Category Accents (Membership Tiers)

| Tier | Hex | Use |
|------|-----|-----|
| Student Member | `#1A9DAE` | Left spine + footer hairline |
| Individual Member | `#3E5A48` | Left spine + footer hairline |
| Family Member | `#D9733A` | Left spine + footer hairline |
| Senior Member | `#6F8F3C` | Left spine + footer hairline |
| Honorary Member | `#C8327A` | Left spine + footer hairline |
| Life Member | `#A8843C` | Left spine + footer hairline |
| Patron Member | `#8A6A2E` | Left spine + footer hairline |

---

## 3. Typography System

### Typefaces

| Family | Weight | Use |
|--------|--------|-----|
| **Outfit** | 300, 400, 500, 600, 700, 800 | Display, headings, emphasis |
| **Inter** | 300, 400, 500, 600 (+ italic) | Body, UI labels, conditions |
| **JetBrains Mono** | 400, 500, 600 | Data, codes, micro-labels |

### Type Scale

| Token | Size | Weight | Use | Line Height |
|-------|------|--------|-----|-------------|
| `--text-display` | clamp(56px, 7vw, 96px) | 700 | Hero headlines | 0.95 |
| `--text-h1` | clamp(36px, 4vw, 52px) | 700 | Section headers | 1.05 |
| `--text-h2` | clamp(26px, 3vw, 34px) | 600 | Subsections | 1.15 |
| `--text-h3` | 21px | 600 | Card titles | 1.25 |
| `--text-body` | 16px | 400 | Editorial text | 1.75 |
| `--text-label` | 11px | 600 | Kickers, exhibition labels | 0.18em tracking |

**Minimums:** Body never below 16px; labels 10px; micro-data 7.5px only on print at 300dpi.

---

## 4. Spacing & Rhythm

### 8px Base Grid

| Token | Value | Use |
|-------|-------|-----|
| `--s-1` | 8px | Micro spacing, icon gaps |
| `--s-2` | 16px | Internal padding, gutters |
| `--s-3` | 24px | Component spacing |
| `--s-4` | 32px | Section padding |
| `--s-6` | 48px | Large sections |
| `--s-8` | 64px | Hero spacing |
| `--s-12` | 96px | Page padding top/bottom |
| `--s-16` | 128px | Full bleed margins |

---

## 5. Border Radius & Elevation

### Radius (Restrained)

| Token | Value | Use |
|-------|-------|-----|
| `--r-0` | 0 | Images, cards (square heritage) |
| `--r-1` | 2px | Buttons, CTAs |
| `--r-2` | 8px | Input fields |
| `--r-full` | 999px | Avatars |

**Photography is never rounded.** Square frames signal print heritage.

### Elevation (3 Levels Max)

| Token | Value | Use |
|-------|-------|-----|
| `--e-1` | 0 1px 2px rgba(20,18,16,.04) | Cards, subtle depth |
| `--e-2` | 0 8px 32px rgba(20,18,16,.07) | Cards on hover, modals |
| `--e-3` | 0 24px 64px rgba(20,18,16,.14) | Hero imagery only |

---

## 6. Component Library

### Core Components

#### SiteHeader.astro
- **Props:** `session: Session|null`, `navItems: NavItem[]`, `condensed: boolean`
- **States:** 4 auth-driven states (Guest, Member, Committee, Admin)
- **Variants:** Rest (96px) / Scrolled (64px), with logo height transition (56px → 44px)
- **Mobile:** Drawer + persistent action chip
- **Navigation:** 5 main routes (Home, About, Activities, Journal, Join)

#### HeroShowcase.astro
- **Props:** `photos: Photo[]`, `headline: string`, `kicker: string`, `cta: Link`
- **Variants:** Single / Crossfade rotation / Split editorial
- **Responsive:** 16:9 desktop, 4:5 mobile
- **Empty:** Surface-2 plate + oversized monogram + headline persists

#### GalleryGrid.astro
- **Props:** `photos: Photo[]`, `columns: 2|3|4`, `ratio: "4:5"|"1:1"`, `filters: Category[]`
- **Responsive:** 4 → 2 → 1 columns
- **Aspect:** 4:5 (contact-sheet style) with `object-fit: cover`
- **Hairline grid:** 1px ink borders on --surface-2 plate

#### PhotoCard.astro
- **Props:** `photo: Photo`, `showCaption: boolean`, `aspectMode: "cover"|"letterbox"`
- **Hover:** 1.03 scale + caption slide-up (600ms)
- **Mobile:** Caption always visible
- **Never darkened:** max 14% darken on hover

#### EventCard.astro / EventRow.astro
- **Props:** `event: Event`, `layout: "card"|"row"`, `userState: RegState`
- **States:** Registered / Open / Waitlist / Past
- **Responsive:** Row → Card stack on mobile

#### MembershipTiers.astro
- **Props:** `plans: Plan[]`, `selectedId: string`, `onSelect: handler`
- **Featured plan:** Flag via `plan.featured`, soft gold gradient header
- **Responsive:** 3 cols → Swipe-snap mobile

#### JournalCard.astro
- **Props:** `post: Post`, `featured: boolean`
- **Featured variant:** 50/50 split (image left, content right)
- **Standard variant:** Stacked (image top)
- **Responsive:** 3 → 1 cols

#### StatBand.astro
- **Props:** `stats: Stat[]` (value, label, sublabel)
- **Animation:** Counter via `data-gsap="counter"` on scroll
- **Empty state:** Hidden entirely (never show zeros)

---

## 7. Photography & Image Handling

### Per-Context Aspect Ratios

| Context | Ratio | Mode | Notes |
|---------|-------|------|-------|
| Gallery grid cells | 4:5 | cover | Contact-sheet aesthetic |
| Hero / full-bleed | 16:9 | cover + focal point | Maximum visual share |
| Event cards | 3:2 | cover | Landscape events |
| Lightbox / detail | Any | contain | Never crop |
| Panoramas | Variable | letterbox on --ink-900 | Silent graceful fallback |

### Image Fallbacks

- **Missing image:** --surface-2 plate + 12% opacity monogram + exhibition label
- **Loading:** Satin shimmer on --surface-2 (no spinners)
- **Hover:** Scale 1.03 (600ms) + caption bar slides up; never darken >14%
- **Mobile:** Grids collapse; hover states become persistent captions

---

## 8. Header State Machine

### Four Role-Based States

#### Guest (Public)
- **Primary CTA:** "Become a Member" (single gold gradient)
- **Secondary:** "Sign In" (text-only)
- **Nav:** Discovery routes only (Home, About, Activities, Journal)
- **Condition:** `{!session && <GuestActions/>}`

#### Member
- **Primary CTA:** "Member Hub" (satin gold outline)
- **Avatar:** Green gradient circle with initials
- **Nav:** Plus member-gated items (unchanged discovery nav)
- **Condition:** `{session?.role === "member" && <MemberActions/>}`

#### Committee
- **Committee Tools:** Pinned in nav (gold-dotted bullet)
- **Avatar:** Distinct color
- **Inherits:** All Member features
- **Condition:** `{session?.role === "committee" && <CommitteeActions/>}`

#### Admin
- **Admin Console:** Replaces Committee Tools (full moderation/CMS)
- **Avatar:** Distinct color (ink-900 bg with gold monogram)
- **Never public:** Console link only in drawer
- **Condition:** `{session?.role === "admin" && <AdminActions/>}`

### Responsive Collapse
- **Desktop:** Fixed nav, all states visible
- **Mobile:** Drawer (hamburger), persistent action chip outside drawer (Join for guests, avatar for members)

---

## 9. Motion & Animation System

All motion respects `prefers-reduced-motion` by disabling transforms (opacity-only fallback).

### GSAP Hooks (ScrollTrigger + Data Attributes)

| Hook | Behavior | Timing | Use Cases |
|------|----------|--------|-----------|
| `data-gsap="reveal"` | Fade + 24px rise on scroll, once | 0.7s power2.out | All sections |
| `data-gsap="stagger"` | Children cascade (80ms stagger) | 0.6s power2.out | Grids, nav, stats |
| `data-gsap="image-reveal"` | Clip-path wipe bottom-up + settle | 1.1s expo.out | Hero, featured photos |
| `data-gsap="parallax-soft"` | Background drifts at 0.92x scroll | scrub, linear | Full-bleed bands |
| `data-gsap="counter"` | Numbers count up on viewport entry | 1.4s power1.inOut | StatBand |
| `data-gsap="header-condense"` | Header 96→64px after 80px scroll | 0.35s power3.out | SiteHeader |

---

## 10. Membership Card System

### Credential Format: CR80 Portrait

**Dimensions:** 53.98 × 85.60 mm | **Aspect:** 0.6306 (locked)

### Front Side

1. **Identity lockup:** Aperture monogram + BHOPAL / CAMERA CLUB
2. **Member photograph:** Full-width, square corners, 4:5-ish frame
3. **Name + category chip:** Outfit 700, auto-stepping (22→19→17px), outlined chip with accent dot
4. **Credential block:** Membership no., issue date, valid-thru (mono, unambiguous)
5. **Verification footer:** Ink bar + QR on white quiet-zone tile
6. **Category spine:** 4px accent edge (only tier signal)

### Back Side

1. **Verification block:** Large QR + "Scan to verify membership"
2. **Club office:** Full registered address (Inter 400 for readability)
3. **Contact:** Website, email, phone (collapse if missing)
4. **Conditions of use:** Non-transferable, must produce on request
5. **Authorised signature:** Ink footer with signatory, title, repeat membership no.

### Seven Tiers (One System)

Every tier uses identical layout; tier is signalled **only** by accent colour (spine + footer hairline). Grayscale printing degrades gracefully.

### Real-World Resilience

- **Missing photo:** Warm plate + 22% opacity monogram + "PHOTO PENDING" label
- **Long name:** Auto-step font size (never reduce data readability)
- **Long ID:** Mono, ellipsis-clamped to one line
- **No email/phone:** Row collapses gracefully

### Output Formats

| Format | Resolution | Use |
|--------|-----------|-----|
| PDF | Vector, CMYK | Professional PVC printing |
| PNG | 300dpi transparent | Web, wallet apps |
| JPG | 300dpi sRGB, q90 | Email, preview |
| A4 Print | 3 × 3 crop marks + 2mm bleed | Home duplex printing |
| Mobile | Digital wallet (Apple/Google) | iOS & Android wallets |

---

## 11. Page Architecture & Routes

### Site Structure (Astro Component Trees)

#### Home `/`
```
BaseLayout
  SiteHeader {session}
  HeroShowcase {featuredPhotos[]}
  StatBand {clubStats[]}
  GalleryGrid {recentPhotos[], cols:4}
  EventRow ×3 {upcomingEvents[]}
  MembershipTiers {plans[]}
  JournalCard ×3 {recentPosts[]}
  SiteFooter {nav, social[]}
```

#### About `/about`
```
BaseLayout
  SiteHeader
  PageHero {missionStatement}
  PillarGrid {pillars[]}
  Timeline {milestones[]}
  AffiliationBand {registrations[]}
  LeadershipGrid {committee[]}
  SiteFooter
```

#### Activities `/activities`
```
BaseLayout
  SiteHeader
  PageHero {title}
  FilterTabs {categories[]} → Photowalk, Workshop, Exhibition
  EventCard grid {events[]}
  EmptyState (if no events)
  SiteFooter
```

#### Join `/join`
```
BaseLayout
  SiteHeader
  PageHero {title, intro}
  MembershipTiers {plans[]} (interactive selection)
  ApplicationForm {formSchema}
    StepIndicator (3 steps)
    FormStep ×3
    SuccessState
  SiteFooter
```

#### Journal `/journal`
```
BaseLayout
  SiteHeader
  PageHero {title}
  JournalCard featured {featuredPost}
  JournalCard grid {posts[]}
  Pagination
  SiteFooter
```

#### Journal Detail `/journal/[slug]`
```
BaseLayout
  SiteHeader
  ArticleHeader {post.meta}
  ArticleHero {post.heroImage}
  ArticleBody {post.content}
    PullQuote, InlineFigure
  AuthorCard {post.author}
  RelatedPosts {related[]}
  SiteFooter
```

#### Member Hub `/hub` (Auth Required)
```
AuthLayout (role >= member)
  SiteHeader {session}
  HubSidebar {hubNav[]}
  HubOverview {member, stats, events}
  MyGallery {memberPhotos[]}
  ProfileSettings {member}
```

#### Sign In `/signin`
```
MinimalLayout
  BrandBar {logo}
  AuthCard
    SignInForm
    ForgotPassword link
    Join prompt
```

---

## 12. Dynamic Data Requirements

### Zero Hardcoded Content

Every component reads from CMS collections:

| Collection | Use | Typical Fields |
|------------|-----|----------------|
| `membershipPlans[]` | Tiers, pricing | name, price, features, featured |
| `clubStats[]` | Homepage band | value, label, sublabel |
| `recentPhotos[]` | Gallery grid | image, title, photographer, category |
| `upcomingEvents[]` | Home + Activities | date, time, title, venue, type, image |
| `recentPosts[]` | Journal preview | title, category, author, date, image |
| `posts[]` | Journal full list | title, category, author, date, image, meta |
| `pillars[]` | About section | title, body, number |
| `milestones[]` | Timeline | year, title, body |
| `committee[]` | Leadership grid | name, initials, role, bio |
| `featuredPhotos[]` | Hero carousel | image, photographer, title, type |

---

## 13. Accessibility & Resilience

### WCAG AA Compliance

- **Contrast pairs verified:** --ink-900 on surfaces (≥ 7:1), --ink-600 on light (≥ 4.5:1)
- **Focus rings:** 2px outline on active states (visible outlines)
- **Reduced motion:** All transforms disabled; opacity-only fallback
- **Text scaling:** Responsive font sizing via `clamp()` (no fixed 12px)
- **Mobile hit targets:** ≥ 44px on touch surfaces

### Fallback Patterns

- **Missing image:** Elegant plate + monogram (never broken image)
- **Missing data fields:** Rows collapse gracefully (no empty states)
- **Missing translations:** English fallback always present
- **Network slow:** Progressive image loading via fade-in

---

## 14. Performance Targets

- **Core Web Vitals:** LCP <2.5s, FID <100ms, CLS <0.1
- **Image strategy:** AVIF/WebP via Astro Image, max 3 elevation levels (no heavy shadows)
- **Motion:** GSAP only on interaction layer; main content paints synchronously
- **Fonts:** Google Fonts (preconnect), subsetting to Latin + common diacritics

---

## 15. Design Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Brand Alignment | 9.0 | Logo anchor + gold accent; improve: animated logo mark |
| Photography Showcase | 9.0 | 70/30 share, square frames, letterbox pano mode; improve: lightbox gestures spec |
| Community Engagement | 8.5 | Member Hub terminology, event states; improve: comment/reaction patterns (phase 2) |
| Dynamic Data Compatibility | 9.5 | Typed contracts, zero hardcoded content, empty states everywhere |
| Astro Implementation | 9.0 | Component trees, auth state contracts, tokens.css-first |
| Mobile Experience | 8.0 | Responsive headers/grids/tiers; improve: native mobile filters, bottom-sheet nav |
| Accessibility | 8.0 | AA contrast, reduced-motion contract; improve: focus-ring spec, skip links |
| Performance | 8.5 | Hairlines not shadows, 3 elevation caps, AVIF/WebP, GSAP on interaction only |
| Maintainability | 9.0 | Token-driven, 8 core components cover all routes, gloss isolated |
| Long-Term Scalability | 8.5 | Typography + hairline foundation ages well; role system extends without header redesign |

**Overall Readiness: 8.7 / 10** — Ready for Antigravity 2.0 handoff

---

## 16. Implementation Workflow

### Order of Work

1. **Tokens first:** Write `tokens.css` with all CSS custom properties (colors, spacing, type scales)
2. **SiteHeader:** Implement four-state contract, nav logic, scroll-condense
3. **Component library:** 8 core components (Hero, Gallery, Events, Tiers, Journal, Stats, Card, PhotoCard)
4. **Routes:** Wire CMS collections to each page blueprint
5. **Motion & polish:** Add ScrollTrigger hooks, refine hover/focus states
6. **Mobile responsive:** Test 4→2→1 grid collapse, drawer nav, touch targets
7. **Testing & refinement:** A/A testing on hero imagery, performance audit

### Stack Target

- **Framework:** Astro (SSR + static generation)
- **Styling:** Vanilla CSS (tokens.css)
- **Animation:** GSAP 3+ (ScrollTrigger)
- **Data:** CMS collections (100% dynamic, zero hardcoded)

---

## 17. Future Extensions

### Planned Phase 2

- Comment & reaction patterns on member galleries
- Advanced mobile lightbox with native gestures
- Apple & Google Wallet pass generation from card template
- Event accreditation badges (reusing card layout tokens)
- Social sharing cards (Open Graph image generation)

---

## Rationale & Vision

The BCC Unified Platform is **photography-first, community-warm, and credible.** It reads as a respected institution, never corporate or austere. The visual language is built on typography and hairlines, not effects, ensuring longevity across a 5–10 year horizon. Grayscale printing degradation is graceful because hierarchy lives in type weight and spacing, not colour alone. The membership card system is a credential, not a badge — warm, elegant, and verifiable at a glance.

**Every design decision serves the photography and the community.**

---

*Prepared for handoff to Antigravity 2.0 · June 2026*
