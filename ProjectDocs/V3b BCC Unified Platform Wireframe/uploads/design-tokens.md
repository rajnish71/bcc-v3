# BCC Design Tokens (Frozen)
Ship as CSS custom properties on `:root` in `tokens.css`. Semantic names only.

## Color — Surfaces
| Token | Value | Use |
|---|---|---|
| `--surface-0` | `#FFFFFF` | Cards, header, mats, label plates |
| `--surface-1` | `#FAF8F4` | Page background, alternating sections |
| `--surface-2` | `#F4F0E8` | Recessed plates (gallery wall plate, footer), image fallback |
| `--surface-deep` | `#141210` | Dark bands, filmstrips, image-grid gaps |
| `--image-backdrop` | `#1A1816` / `#2A2622` | Behind loading/letterboxed images |

## Color — Ink
| Token | Value | Use |
|---|---|---|
| `--ink-900` | `#141210` | Headlines, primary text |
| `--ink-600` | `#57514B` | Body text, secondary |
| `--ink-400` | `#8B8378` | Captions, meta, labels |
| `--ink-inverse` | `#FAF8F4` | Text on dark |

## Color — Accent
| Token | Value | Use |
|---|---|---|
| `--gold-500` | `#C9A961` | Hairline accents, active underlines, dividers |
| `--gold-600` | `#A8843C` | Kickers, links, chips |
| `--gold-gradient` | `linear-gradient(135deg, #C9A961, #A8843C)` | THE primary CTA (one per view), featured plates |
| `--forest-600` | `#3E5A48` | Avatar plates, success/positive, photowalk tags |
| `--forest-gradient` | `linear-gradient(135deg, #3E5A48, #2A3E32)` | Initials avatar plates |

## Color — Lines
| Token | Value | Use |
|---|---|---|
| `--hairline` | `#E7E1D6` | All borders/dividers (1px) |
| `--hairline-soft` | `#F0EBE0` | Inner-card dividers |
| `--hairline-strong` | `#D8D2C6` | Input borders, secondary buttons |

Tag colors: Photowalk `#E8EFE9`/`#3E5A48` · Workshop `#F5EDD8`/`#8C6830` · Exhibition `#141210`/`#FAF8F4`.

## Typography
Families: **Outfit** (headings, weights 300–800) · **Inter** (body, 300–600) · **JetBrains Mono** (annotations/EXIF/labels only).

| Token | Spec |
|---|---|
| `--text-display` | Outfit 700 · clamp(56px, 7vw, 96px) · lh 0.95 · ls −0.035em |
| `--text-h1` | Outfit 700 · clamp(36px, 4vw, 52px) · lh 1.05 · ls −0.025em |
| `--text-h2` | Outfit 600–700 · clamp(26px, 3vw, 34px) · lh 1.15 · ls −0.015em |
| `--text-h3` | Outfit 600 · 21px · lh 1.25 |
| `--text-body` | Inter 400 · 16px · lh 1.75 |
| `--text-small` | Inter 400 · 13–14px · lh 1.65 |
| `--text-label` | Inter 600 · 11px · uppercase · ls 0.18em (kickers/exhibition labels) |
| `--text-mono` | JetBrains Mono 400 · 10–12px · ls 0.06em |

Minimums: body ≥14px web; never below 12px anywhere.

## Spacing (8px base)
`--s-1: 8` · `--s-2: 16` · `--s-3: 24` · `--s-4: 32` · `--s-6: 48` · `--s-8: 64` · `--s-12: 96` · `--s-16: 128`
Section vertical rhythm: 96–112px desktop, 64px mobile. Content max-width: **1360px**, gutter 48px desktop / 20px mobile.

## Radius (restrained)
`--r-0: 0` (images, cards, mats — photography is NEVER rounded) · `--r-1: 2px` (buttons, plates) · `--r-2: 8px` (inputs) · `--r-full: 999px` (avatars, filter chips).

## Elevation (3 levels max)
| Token | Value | Use |
|---|---|---|
| `--e-1` | `0 1px 2px rgba(20,18,16,.04)` | Cards, mats |
| `--e-2` | `0 8px 32px rgba(20,18,16,.07)` | Hover lift, condensed header |
| `--e-3` | `0 24px 64px rgba(20,18,16,.14)` | Hero imagery & label plates ONLY |

Gold CTA shadow: `0 2px 10px rgba(168,132,60,.3)` + `inset 0 1px 0 rgba(255,255,255,.25)` (satin highlight).

## Borders
1px `--hairline` everywhere; 2px `--ink-900` only for emphasis rules (timeline top rule); 2px `--gold-500` active-nav underline; 3px gold top bar for active genre plates.

## Motion tokens
| Token | Value |
|---|---|
| `--m-fast` | 0.2s ease (hovers) |
| `--m-med` | 0.35s cubic-bezier(0.4, 0, 0.2, 1) (header condense) |
| `--m-reveal` | 0.7s power2.out (GSAP reveal) |
| `--m-image` | 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) (image scale hover) |
| `--m-stagger` | 80ms between children |

`prefers-reduced-motion`: disable ALL transforms; opacity-only fades.

## Breakpoints
| Token | Value | Notes |
|---|---|---|
| `--bp-sm` | 640px | 1-col grids, drawer nav |
| `--bp-md` | 900px | 2-col grids, tablet header |
| `--bp-lg` | 1200px | full grids |
| `--bp-max` | 1360px | content max-width |
