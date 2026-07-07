# BCC Design System — Final (Frozen)
**Bhopal Camera Club · Astro Theme · Handoff to Antigravity 2.0 · June 2026**
Status: **APPROVED — no further design exploration. This document is the source of truth.**

---

## 1. Design Philosophy

**"Refined Editorial Luxury"** — a hybrid direction approved after comparing three concepts:

| Source concept | What it contributes |
|---|---|
| Leica Editorial (A) | Structural skeleton: hairline rules, asymmetric editorial grid, exhibition-label captions, restraint |
| Apple Luxury (B) | Material finish: warm ivory satin surfaces, soft layered depth, ONE metallic-gold CTA per view, gentle light gradients |
| Photography Magazine (C) | Photography density: full-bleed image moments, category plates, high image share |

The foundation is **typography + hairlines, not effects** — chosen explicitly for a 5–10 year lifespan.

## 2. Brand Positioning

> "India's premier photography community."

BCC **is**: a photography community · a learning organization · a cultural institution · an exhibition platform · a conservation-minded club · a member-driven organization.

BCC **is not**: a camera manufacturer · a camera retailer · a photography agency · a solo photographer portfolio · a software platform.

Tone: prestigious, sophisticated, modern, visual, confident, timeless.

## 3. Design Principles

1. **Photography first — 70/30.** Photography ≈70% of visual attention; interface ≈30%. The UI frames photographs; it never competes.
2. **No camera-product imagery.** Gear close-ups, camera flat-lays and product photography are banned everywhere. Allowed subjects: member photographs, photo walks, wildlife, heritage, street, nature, exhibitions, photographers at work (people, not products).
3. **The work, crediting the maker.** Lead with photographs; always attribute by name. Recognition is a primary product of the site.
4. **One gold CTA per view.** The gold gradient is reserved for the single primary action visible at any time (normally "Become a Member").
5. **Square photo frames.** Photography is never border-radiused — square frames echo print heritage. Radius is reserved for inputs and avatar circles.
6. **Restrained gloss.** Satin nav surface, soft shadows (3 elevation levels max), one gradient CTA. No glassmorphism, neon, heavy gradients, dark themes, or SaaS aesthetics.
7. **Dynamic data only.** No hardcoded names, events, statistics, plans, dates or categories anywhere. Every component is a typed contract over CMS collections.
8. **Designed for real-world member photography** — variable quality, mixed orientations, panoramas, phone shots. See `image-presentation-spec.md`.

## 4. Final Approved Information Architecture

```
/                       Home
/about                  About
/activities             Activities (filterable: Photowalks / Workshops / Exhibitions)
/showcase               Showcase (photography discovery hub)
/gallery/photographer/[slug]   Photographer Portfolio
/join                   Join (tiers + 3-step application)
/journal                Journal index
/journal/[slug]         Journal detail
/signin                 Sign In
/hub                    Member Hub (auth-gated; member/committee/admin)
```

## 5. Final Approved Navigation

**`Home · About · Activities · Showcase · Journal`** + `Sign In` (text) + **`Become a Member`** (gold CTA).

- Exactly five link items. "Join" is NOT a nav link — the gold CTA owns that intent.
- "Showcase" approved over Gallery / Photographers / Portfolios / Collections (prestige, photography-first, elastic scope).
- Member-state terminology: **"Member Hub"** (approved over Dashboard / Portal / My BCC).
- Guest CTA: **"Become a Member"** (approved over "Join BCC").
- Full role behavior: see `header-state-machine.md`.

## 6. Final Approved Homepage Hierarchy (frozen)

1. **BCC Spotlight hero** — One Frame: a single monumental member photograph, museum label plate (title, member, originating activity), committee-curated with **no fixed cadence** (label is "BCC Spotlight", never "Photograph of the Month").
2. **StatBand** — club statistics (dynamic).
3. **Gallery Wall — "Our members, on the wall."** 12 matted prints in production, rotating, max one per photographer, photographer-name-first labels, each mat links to `/gallery/photographer/[slug]`. Right footnote: "Your frame could hang here — Become a Member" → /join.
4. **Upcoming events** — EventRow ×3.
5. **Full-bleed photo band** — heritage series, soft parallax.
6. **Membership tiers** — 3 plans from `membershipPlans[]`.
7. **Journal preview** — JournalCard ×3.

Sequence rationale (approved): hero answers *"is this club capable of exceptional photography?"* (excellence); the wall answers *"can people like me belong here?"* (community). Depth → breadth.

## 7. Photography-first & Community-first philosophy

- The homepage hero is always a member photograph with attribution — never stock, never abstract branding.
- Photographer-at-work documentary imagery is reserved for **About** and **Activities** pages.
- Recognition is cumulative: rotation (Spotlight + wall) puts 50+ members on the homepage per year.
- Discovery is two converging flows (recognition path and exploration path) — see `showcase-spec.md` §Discovery flows.

## 8. Logo & Brand mark

- Full horizontal logo, full color, on white/ivory surfaces (brand standard).
- Desktop header logo: **56px** at rest, **44px** condensed; never below 38px (mobile).
- The logo anchors the header; navigation supports it. No tiny startup-style logos.
