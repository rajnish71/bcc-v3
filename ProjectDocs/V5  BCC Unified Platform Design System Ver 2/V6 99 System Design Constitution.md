# V6 99 — BCC Unified Platform · System Design Constitution
**Visual Authority · July 2026 · Supersedes all V5 design documents**

---

## Preamble

This document is the permanent visual constitution of the BCC Unified Platform. It has the same standing as an Architecture Freeze document. Every V6 wireframe, every component specification, and every future design decision must reconcile against this document first.

Where a V6 page design appears to diverge from these principles, this constitution takes precedence. Where this document is silent, the closest analogous principle applies. Where no analogy exists, the design authority must be consulted before proceeding.

This document does not describe implementation. It describes intent, rationale, and the immovable constraints of the visual language.

---

## 1. Design Philosophy

### 1.1 Refined Editorial Luxury

The BCC Unified Platform is governed by a single, named visual identity: **Refined Editorial Luxury**. This is not a mood board description — it is the canonical identifier for the system. It resolves a three-way synthesis:

- **From Leica Editorial:** Structural skeleton. Hairline rules, asymmetric editorial grid, exhibition-label captions, typographic restraint. Photography is presented as prints in a portfolio box — never as web thumbnails.
- **From Apple Luxury:** Material finish. Warm ivory satin surfaces, soft layered depth, one metallic-gold CTA per view, gentle light gradients. The interface recedes so photography leads.
- **From Photography Magazine:** Photography density. Full-bleed image moments, justified member gallery grids, category plates. Photography at approximately 70% visual share across public pages.

### 1.2 Why This Language Works

The BCC platform exists to celebrate photography — not to showcase web design. The Refined Editorial Luxury language succeeds because it is structurally invisible. Its typographic restraint, warm neutral surfaces, and hairline geometry create a gallery-like silence that allows photographs to assert full authority. The single gold accent per view prevents visual competition with the photographs themselves.

This is not a minimalist aesthetic — it is a disciplined one. Every element that appears on screen has earned its presence by serving the photography.

### 1.3 Longevity Mandate

The design system is built to hold for a 5–10 year horizon. This means:
- No trend-dependent effects (glassmorphism fades, extreme gradients, heavy drop shadows)
- No framework-specific visual patterns
- No decorative elements that exist for novelty alone
- Foundation is typography and hairlines, not effects
- Gloss used only as seasoning: one gradient CTA, one satin nav surface, soft shadows at ≤ 3 levels

---

## 2. Brand Personality

The BCC platform speaks with the voice of a serious, respected photography institution — not a social media platform and not a corporate tool.

| Dimension | BCC Voice | Not This |
|---|---|---|
| Tone | Considered, confident, warm | Casual, promotional, cold |
| Imagery language | Exhibition captions | Social media alt text |
| Typography posture | Editorial restraint | Aggressive hierarchy |
| Interaction | Purposeful, unhurried | Animated for attention |
| Empty states | Dignified, inviting | Apologetic, humorous |
| Error states | Clear, respectful | Alarming, technical |

The platform earns trust through consistency, not persuasion.

---

## 3. Visual Hierarchy

### 3.1 Hierarchy Levels

The system defines four levels of visual hierarchy, applied consistently across all pages:

1. **Primary** — The photograph. Always. The photograph is the content. Everything else is infrastructure.
2. **Secondary** — Page-level headings (Outfit, large, tight tracking). These establish context, not content.
3. **Tertiary** — Body copy (Inter, 16px, generous leading). Editorial reading comfort.
4. **Quaternary** — Labels, captions, EXIF data (JetBrains Mono, small, uppercase). Data layer — never competes.

### 3.2 Hierarchy Rules

- One H1 per page. Always.
- Section headings use Outfit with negative letter-spacing. They feel weighted, not decorative.
- Exhibition labels (uppercase, tracked, monospaced) announce without dominating.
- Body copy never exceeds 680px column width. Reading comfort over spatial fill.
- Statistics are visually quiet — data, not decoration.

### 3.3 The Gold Rule

There is one gold CTA per view. One. This rule is non-negotiable.

The gold gradient (`#C9A961→#A8843C`) is the rarest element in the system. Its scarcity is what gives it authority. When the user sees gold, they understand: this is the primary action. Placing two gold elements in a single view destroys this signal permanently.

---

## 4. Grid Philosophy

### 4.1 Layout Container

All public page content is contained within a maximum width of **1140px**, centered, with **48px horizontal padding** on desktop. Header and footer use **1280px** with **40px padding**.

The container is not a cage — it is a frame. Content within the frame is organized asymmetrically when the editorial composition demands it.

### 4.2 Column System

The system uses contextual column grids, not a fixed 12-column grid. Column patterns per context:

- **Full editorial:** 1 column, max 680px (long-form text)
- **Two-column content:** 2/3 main + 1/3 sidebar
- **Three-column cards:** Equal thirds, gap 24px
- **Hub shell:** 240px left rail + fluid main content, gap 48px
- **Photographer profile:** 260px sticky left rail + flex:1 main
- **Gallery:** Justified rows (no fixed columns) — width is a function of natural aspect ratio

### 4.3 Photography Grid — Justified Layout

The justified gallery is the canonical display format for photographs. It works as follows:

- Images are arranged in rows sharing a **target row height** (240px for Showcase, 220px for Portfolio)
- Each image's display width is proportional to its natural aspect ratio
- No image is cropped or letterboxed
- Gap between images: **2px**, dark (#141210)
- Panoramas receive a full-width row at natural ratio
- Very tall portrait images may be grouped with another image to share a row

This layout is the visual manifestation of the platform's photography philosophy: every photograph is presented as its maker intended.

---

## 5. Page Composition

### 5.1 Page Structure

Every public page follows this compositional spine:

```
SiteHeader (fixed, session-aware)
  ↓
Page Hero / Opening Section
  ↓
Primary Content Zone
  ↓
Supporting Content Zone(s)
  ↓
SiteFooter
```

The SiteHeader is always present. The SiteFooter is always identical. Neither is modified per page.

### 5.2 Section Openers

Section headings within a page use the exhibition-label pattern:
- A monospaced gold number or kicker (JetBrains Mono, 13px, gold)
- The section title in Outfit at H2 weight
- A subheading in Inter 16px/300 if the section requires editorial setup
- Maximum body width: 680px

### 5.3 Content Width Philosophy

Long-form text (biography, descriptions, editorial copy) never spans the full 1140px container. It is constrained to 680px. This is not a conservative choice — it is an editorial one. Narrow measure improves reading comfort and creates the white space that gives the layout its luxury character.

The remaining space is not wasted. It is silence.

---

## 6. Vertical Rhythm

### 6.1 Section Spacing

- First section after document cover: **96px** top padding
- All subsequent sections: **120px** top padding
- Page bottom margin: **120–160px**
- Within a section, between major components: **48px**
- Within a component, between elements: **24–32px**
- Between inline elements: **8–16px**

### 6.2 The Spacing Scale

The system uses an **8px base unit**. Every spacing value is a multiple of 8. There are no half-multiples (no 12px, no 20px, no 28px) except where optical correction demands it (e.g., 6px for tight badge padding).

```
--s-1:  8px    Inline gap, tight padding
--s-2:  16px   Element internal padding
--s-3:  24px   Between related elements
--s-4:  32px   Between distinct elements
--s-6:  48px   Section internal spacing
--s-8:  64px   Major section gaps
--s-12: 96px   Section top padding (first)
--s-16: 128px  Section top padding (standard: 120px is 15×8)
```

### 6.3 Rhythm Rationale

Consistent vertical rhythm creates a sense of editorial calm. Pages that violate rhythm — mixing 20px, 28px, 36px gaps randomly — feel nervous and unresolved. The BCC system produces calm through regularity.

---

## 7. White-Space Philosophy

White space in this system is not empty space — it is the material that frames photographs. The wider the margin around a photograph, the more the eye reads it as art rather than content.

Rules:
- Never fill all available horizontal space with content
- Body text columns are narrow by design (680px max)
- Cards do not expand to fill containers — they define themselves
- Section intros use maximum 680px, even on a 1140px container
- The 460px of remaining horizontal space is a deliberate compositional choice

The system resists the instinct to fill. When in doubt, leave it open.

---

## 8. Typography Hierarchy

### 8.1 Type Stack

Three typefaces. No others.

| Family | Role | Weights Used |
|---|---|---|
| **Outfit** | Headings, display, UI labels | 300, 400, 500, 600, 700, 800 |
| **Inter** | Body copy, navigation, UI text | 300, 400, 500, 600, italic 400 |
| **JetBrains Mono** | Labels, EXIF, data, code, kickers | 400, 500 |

### 8.2 Type Scale

| Token | Size | Line Height | Weight | Tracking | Family |
|---|---|---|---|---|---|
| `--text-display` | clamp(56px, 7vw, 96px) | 0.95 | 700 | −0.03em | Outfit |
| `--text-h1` | clamp(36px, 4vw, 52px) | 1.05 | 700 | −0.025em | Outfit |
| `--text-h2` | clamp(26px, 3vw, 34px) | 1.15 | 600 | −0.015em | Outfit |
| `--text-h3` | 22px | 1.25 | 600 | −0.01em | Outfit |
| `--text-h4` | 17–20px | 1.3 | 600 | 0 | Outfit |
| `--text-body-lg` | 18px | 1.7 | 300 | 0 | Inter |
| `--text-body` | 16px | 1.75 | 400 | 0 | Inter |
| `--text-body-sm` | 14px | 1.7 | 400 | 0 | Inter |
| `--text-ui` | 13px | 1.6 | 500 | 0 | Inter |
| `--text-caption` | 12px | 1.6 | 400 | 0 | Inter |
| `--text-label` | 11px | 1.4 | 600 | 0.18em | JetBrains Mono + uppercase |
| `--text-micro` | 10px | 1.4 | 600 | 0.14em | Inter + uppercase |
| `--text-mono` | 12–13px | 1.8 | 400–500 | 0.04–0.06em | JetBrains Mono |

### 8.3 Heading Negative Tracking

Large headings use aggressive negative letter-spacing (−0.025em to −0.03em). This is intentional. At large sizes, default tracking creates excessive whitespace between characters. Negative tracking tightens the heading into a single visual unit — it reads as a block, not a series of letters. This is characteristic of editorial typography at scale.

### 8.4 Exhibition Labels

The exhibition label is the system's distinctive micro-typographic element:
- JetBrains Mono
- 10–11px
- Uppercase
- Letter-spacing 0.14–0.22em
- Color: `--gold-600` (#A8843C) or `--ink-400` (#8B8378)

These appear as section kickers, EXIF labels, and data field headers. They function like wall labels in a gallery — announcing without intruding.

---

## 9. Colour Philosophy

### 9.1 Surface System

The surface system is warm, not neutral. Whites and near-whites carry a subtle warm cast inherited from natural light, archival paper, and analogue photography.

```
--surface-0:  #FFFFFF    Pure white — used sparingly (cards, modals)
--surface-1:  #FAF8F4    Satin ivory — primary elevated surface
--surface-2:  #F4F0E8    Warm parchment — secondary surface, table rows
--background: #F2EFE9    Page background — the base of everything
```

These four surfaces are close in value but distinct in context. Layering them creates soft depth without contrast noise.

### 9.2 Ink System

```
--ink-900:  #141210    Primary text — near-black with warm undertone
--ink-700:  #37322C    Secondary dark text
--ink-600:  #57514B    Body copy, nav text, secondary content
--ink-400:  #8B8378    Muted text, placeholders, inactive labels
--ink-200:  #D8D2C6    Borders, dividers (not hairlines)
```

The ink palette has a warm undertone throughout. `#141210` is not cold black — it contains warmth. This keeps text in harmony with the warm surface palette.

### 9.3 Accent System

**Gold** is the primary accent. It is used for:
- The single primary CTA per view (gold gradient)
- Active nav underlines
- Exhibition-label kickers
- Founding member badges
- Data field accents in spec documents
- The Admin role accent (gold-on-dark)

```
--gold-light:    #C9A961    Light gold — kicker text, icon accents
--gold-600:      #A8843C    Medium gold — active states, labels, borders
--gold-gradient: linear-gradient(135deg, #C9A961, #A8843C)
```

**Forest green** is the secondary accent. It is used for:
- Member/active status indicators
- Membership tier backgrounds
- Forest-gradient avatars for Member/Editor/Moderator roles
- Positive status badges

```
--forest-600:  #3E5A48    Forest green — membership, active states
--forest-deep: #2A3E32    Deep forest — gradient partner
```

### 9.4 Hairline System

```
--hairline:       #E7E1D6    Standard hairline — section borders, card edges
--hairline-soft:  #F0EBE0    Soft hairline — table rows, within-card dividers
```

Hairlines are used liberally. They are the structural skeleton of the editorial layout — defining columns, separating sections, and framing content. They must never be thicker than 1px.

### 9.5 Dark Surface (Footer, Hero Overlays)

```
--dark-0:  #141210    Deepest dark — footer Row 1, hero overlays
--dark-1:  #1A1816    Dark — footer Row 2
--dark-2:  #2A2420    Card dark surfaces, code blocks
```

### 9.6 Semantic Status Colours

```
--status-active-bg:   #E8EFE9    Green wash background
--status-active-text: #3E5A48    Forest text
--status-pending-bg:  #FBF0E8    Amber wash background
--status-pending-text:#8C6830    Amber text
--status-danger-text: #A3493B    Danger/deprecated text
--status-danger-bg:   #FDF5F5    Danger wash background
```

### 9.7 Why No Blues, Purples, or Bright Colours

The palette is intentionally warm and desaturated. Blue or purple accents would compete with the photographs. The warm gold and forest green are chosen because they harmonise with the warm ivory surfaces and because they carry cultural associations (gold = prestige, forest = nature/outdoors) that reinforce the photography club identity.

---

## 10. Iconography Principles

- **No icon libraries.** Icons are typographic or SVG primitives only.
- Aperture circles, thin-line camera references, and geometric forms are the permitted decorative vocabulary.
- Icon-like elements (arrows, carets, bullets) use typographic characters (→ ▾ — ·) or simple SVG.
- The aperture motif (decorative spinning element, `data-gsap="aperture-spin"`) is the only branded decorative icon.
- Navigation dropdowns use the ▾ character at 10px, opacity 0.6.
- Status dots are 5–7px filled circles in the relevant status colour.

---

## 11. Photography Presentation Principles

### 11.1 The Natural Aspect Ratio Rule — Non-Negotiable

Every photograph is displayed at its original, unmodified aspect ratio. This is the most important technical rule in the system.

**Prohibited in all contexts:**
- `object-fit: cover`
- Fixed aspect-ratio containers that crop photographs
- Any server-side or client-side cropping of editorial photographs

**Permitted exceptions** (these are UI elements, not photographs):
- Cover banners on photographer profile pages (16:5, object-fit:cover — this is a banner, not an editorial photograph)
- Avatar images (circular crop — this is a UI element, not a photograph)
- **Hero Spotlight component** (16:9, object-fit:cover — administrator-curated spotlight; not member gallery photography)
- **Editorial Feature Image component** (16:9, object-fit:cover — administrator-curated editorial band; not member gallery photography)

### 11.2 Context Strategy

| Context | Layout | Target Height |
|---|---|---|
| Showcase / Gallery feed | Justified rows | 240px |
| Photographer portfolio | Justified rows | 220px |
| Hero Spotlight (canonical) | 16:9 container-width boxed · object-fit:cover | — |
| Editorial Feature Image (canonical) | 16:9 container-width boxed · object-fit:cover | — |
| Event card cover | Natural ratio, 100% width | — |
| Lightbox / detail view | Natural ratio, contain, dark surround | max 70vh |
| Panoramas (any context) | Full row, natural ratio | — |

### 11.3 Hero Spotlight — Canonical Shared Component

The Hero Spotlight is a frozen, reusable shared component used across the platform. Its specification is non-negotiable.

**Canonical specification:**
- Container-width (respects `max-width: 1140px` — not full-bleed by default)
- Fixed `aspect-ratio: 16/9` on the container
- `object-fit: cover` on the image (UI component exception — administrator-curated, not member gallery photography)
- Responsive: 16:9 maintained at all viewport widths
- Caption card: bottom-left overlay — editorial metadata only. Single text link `View in Showcase →`. No CTA buttons.
- Image selection: administrator-selectable. CMS filters to 16:9 photographs only.

**CMS implementation requirement:** The uploaded photo record must store `width` and `height` of the final uploaded image. Aspect ratio is derived from these values. Dimensions must come from the **final uploaded image** — not the photographer's original RAW file. Photographers crop before uploading; the uploaded image is the authoritative composition.

**Pages using Hero Spotlight:** Home (`/`), Showcase, Journal, Activities, Projects, and all applicable sub-pages.

### 11.4 Editorial Feature Image — Canonical Shared Component

Distinct from the Hero Spotlight. A large editorial band with an overlay text panel and CTAs.

**Canonical specification:**
- Container-width · `aspect-ratio: 16/9` · `object-fit: cover`
- Left text panel at 50% width with gradient overlay
- CTA buttons permitted (this is an editorial conversion moment, not a photograph showcase)
- Image selection: **independent** of the Hero Spotlight. Same 16:9 CMS filter.
- Reusable across pages.

| | Hero Spotlight | Editorial Feature Image |
|---|---|---|
| Caption style | Small card, bottom-left | Full left-panel overlay |
| CTAs | None (text link only) | Yes (primary + secondary) |
| Aspect ratio | 16:9 | 16:9 |
| Selection | Admin-selectable, independent | Admin-selectable, independent |

### 11.5 Photography States

- **Loading:** Satin shimmer on `--surface-2` at the natural ratio of the expected image. No spinners.
- **Missing image:** `--surface-2` plate + monogram logo at 12% opacity + exhibition-label kicker.
- **Hover:** Caption bar slides up from bottom of frame (0.4s cubic). No scale transform.
- **Mobile:** Justified grid collapses to 2-column, then 1-column natural-ratio stack. Hover captions become persistent labels.

### 11.6 Lightbox

- Background: `#0A0908` (near-black, slightly warm)
- Photograph at natural ratio, max-height 70vh
- Portrait images sit narrower with dark sides
- No caption overlay on lightbox — caption appears below the photograph
- Navigation: overlaid arrows, Esc to close, keyboard arrow navigation

### 11.7 Why This Matters

A photography club platform that crops its members' photographs is committing a fundamental act of disrespect toward the work it exists to celebrate. The natural aspect ratio rule is not a technical preference — it is a values statement.

---

## 12. Motion Principles

All animation is declared via `data-gsap` attributes on HTML elements. A single motion controller binds all scroll-triggered effects. Motion is purposeful, not decorative.

### 12.1 Motion Vocabulary

| Hook | Behaviour | Duration / Ease |
|---|---|---|
| `data-gsap="reveal"` | Fade + 24px rise on scroll into view, once | 0.7s · power2.out |
| `data-gsap="stagger"` | Children cascade with 80ms stagger | 0.6s · power2.out |
| `data-gsap="image-reveal"` | Clip-path wipe bottom-up + 1.06→1.0 scale settle | 1.1s · expo.out |
| `data-gsap="parallax-soft"` | Background drifts at 0.92× scroll speed | scrub · linear |
| `data-gsap="counter"` | Numbers count up when StatBand enters viewport | 1.4s · power1.inOut |
| `data-gsap="header-condense"` | Transparent→dark-glass, logo condenses | 0.35s · power3.out |
| `data-gsap="aperture-spin"` | Infinite slow rotation — decorative | 40s · linear · infinite |

### 12.2 Header Scroll Behaviour

The SiteHeader condenses after **60px** of scroll:
- Surface: `rgba(255,255,255,0.97)` → `rgba(20,18,16,0.92)`
- Backdrop filter: none → `blur(14px) saturate(180%)`
- Height: 96px → 64px
- Logo height: 56px → 44px
- Logo filter: none → `brightness(0) invert(1)` (white)

### 12.3 Reduced Motion

All transforms and opacity transitions must respect `prefers-reduced-motion`. When reduced motion is set: disable all transforms, retain opacity transitions only. No exceptions.

---

## 13. Interaction Principles

### 13.1 Hover States

- Navigation items: colour transition to `--ink-900`, no underline except active
- Active nav item: 2px `--gold-600` bottom border
- Cards: `--e-2` elevation on hover
- Photographs: caption bar slides up from bottom (no scale transform — scale transforms on photographs feel wrong)
- Buttons: opacity and shadow modulation, no shape change
- Inline text links: `--gold-600` underline on hover

### 13.2 Focus States

All interactive elements must have visible focus states (2px `--gold-600` outline, 2px offset). Never remove outlines without replacement.

### 13.3 Click / Active States

Button active state reduces shadow. No invert. No jarring colour change. The feedback is subtle — confident interfaces don't need dramatic active states.

### 13.4 Coming Soon States

Navigation items for unreleased features (Contests, Exhibitions, Photography School) are rendered at **opacity 0.45** with `cursor: default`. They are never hidden. Visibility of upcoming features drives membership conversion.

---

## 14. Responsive Philosophy

### 14.1 Breakpoints

```
≤480px    Mobile portrait
481–768px Tablet / mobile landscape
769–900px Small desktop / large tablet
901–1280px Desktop
>1280px   Large desktop (container caps at 1140/1280px)
```

### 14.2 Hub-Specific Breakpoints

```
≥1200px   240px left rail visible
641–1199px Top tab bar replaces rail
≤640px    Horizontal-scroll mobile tab bar
```

### 14.3 Responsive Principles

- Content collapses gracefully — never truncates or overflows
- Photography always at natural ratio at all breakpoints
- Typography uses `clamp()` for fluid scaling
- Navigation collapses to hamburger drawer at ≤900px
- Logo scales: 56px desktop → 44px condensed → 34px mobile
- Footer grid: 4-column → 2-column (≤768px) → 1-column (≤480px)
- The Hub never stacks its navigation above content on mobile — horizontal tab scroll is preferred

### 14.4 Mobile Photography

On mobile, the justified gallery grid collapses to:
- 2-column natural-ratio stack at ≤768px
- 1-column stack at ≤480px
Target row height reduces proportionally on narrow viewports.

---

## 15. Accessibility Principles

- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text and UI components
- All interactive elements: minimum 44×44px touch target
- Focus states: visible, distinctive (2px gold outline)
- Images: meaningful alt text on all photographs; empty alt on decorative elements
- `prefers-reduced-motion`: all animations respect this
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<footer>`, `<section>`, `<article>` used correctly
- ARIA labels on icon-only buttons
- Form labels are never placeholder text alone

---

## 16. Dark / Light Mode

The BCC Unified Platform is a **single-mode system: light mode only**. There is no dark mode variant.

Rationale: The warm ivory surface system is integral to the Refined Editorial Luxury identity. A dark mode would require a completely different colour system and would undermine the warm, satin-surface aesthetic that distinguishes the platform. The footer, hero overlays, and lightbox provide dark surfaces when contextually appropriate without requiring a full mode switch.

This decision may be revisited at a future governance review, but requires a full design system update — not a token swap.

---

## 17. Consistency Rules

### 17.1 What Must Never Vary

- The SiteHeader — identical across all pages, session-resolved only
- The SiteFooter — identical across all pages, no variants
- The gold CTA rule — one per view
- The photography natural-ratio rule — no exceptions for editorial photographs
- The type stack — no third-party fonts introduced
- The spacing scale — no arbitrary values outside the 8px system
- The border-radius system — photography is never rounded

### 17.2 What May Vary by Context

- Section background (white / ivory / parchment — from the surface palette only)
- Hero image per page or project
- Project-specific colour within the ProjectHero section only (not beyond it)
- Column layouts per page type
- Statistics values and content

### 17.3 Canonical Patterns

Where a visual pattern appears on two or more V6 pages in the same form, it is a canonical pattern. Canonical patterns must not be reinvented per page — they must be implemented identically. Canonical patterns include:

- Section opener (mono number + Outfit H2 + Inter body, 680px max)
- StatBand (horizontal band, 4–5 statistics, animated counter on scroll)
- Justified gallery grid
- Exhibition-label kicker
- Dark hero overlay (dark surface + gold kicker + Outfit display)
- Card anatomy (white surface + 1px hairline + 24–32px padding)
- Status badge (small, all-caps, 2px r-1 radius)

---

## 18. Future Governance

### 18.1 Amendment Process

This constitution may only be amended by:
1. A documented design authority review
2. Reconciliation against all existing V6 page designs
3. A superseding version document (this document becomes V6 99.1, etc.)
4. An explicit supersession statement

### 18.2 Component Specification Process

New component specifications must:
1. Reference this constitution as their visual authority
2. Reference `V6 98 token.css` for all design values
3. Reference `V6 97 Design Pattern Library` for visual precedents
4. Not introduce new colours, fonts, spacing values, or radius values without a constitution amendment

### 18.3 What Future Pages Must Not Do

- Introduce new accent colours
- Introduce new typefaces
- Use `object-fit: cover` on editorial photographs
- Place more than one gold CTA per view
- Modify the SiteHeader or SiteFooter
- Introduce shadows above Level 3 (e-3)
- Use border-radius > 2px on cards or buttons
- Round any photograph

### 18.4 V5 Supersession

This document, together with V6 98 and V6 97, permanently supersedes all V5 design documents. No V5 design document may be referenced in any V6 specification.

---

*V6 99 · BCC Unified Platform · System Design Constitution · July 2026*
*Design Authority: Refined Editorial Luxury · Status: FROZEN*
