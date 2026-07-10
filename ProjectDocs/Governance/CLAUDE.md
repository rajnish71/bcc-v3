# BCC Unified Platform V3 — Project Instructions

## Source of Truth
**`BCC V3 Design System.md`** is the authoritative design system for this project. All wireframes must follow it. Do not deviate from its tokens, typography, button system, IA, or navigation without explicit user instruction.

Supporting frozen source files (do not modify):
- `uploads/design-system-final.md` — philosophy, IA, nav, homepage hierarchy
- `uploads/design-tokens.md` — all CSS tokens (colors, type, spacing, radius, elevation, motion, breakpoints)

## Wireframe Files
| File | Route |
|---|---|
| BCC Home Wireframe.dc.html | `/` |
| BCC Events Wireframe.dc.html | `/activities` |
| BCC Membership Wireframe.dc.html | `/join` |
| BCC Showcase Wireframe.dc.html | `/showcase` |
| BCC Photographers Wireframe.dc.html | `/gallery/photographer` |
| BCC Photographer Profile Wireframe.dc.html | `/gallery/photographer/[slug]` |
| BCC Shared Layout Components.dc.html | Shared nav/footer patterns |

## Key Rules
- **Fonts:** Outfit (headings) · Inter (body/UI) · JetBrains Mono (data/credentials only)
- **Colors:** Use tokens from design system. Wireframe amber #F5A82A and dark #222 are lo-fi stand-ins only — map to `--gold-gradient`/`--gold-600` and `--ink-900` in hi-fi
- **One gold CTA per view** — `--gold-gradient` is reserved for the single primary action
- **Photography never rounded** — `--r-0` on all images and photo cards
- **No hardcoded content** — all values from CMS collections
- **Nav (frozen):** Home · About · Activities · Showcase · Journal + Sign In + Become a Member
- **Do not change wireframe layouts** unless explicitly asked — only update tokens/colors/copy when instructed

## Wireframe Annotation Convention
- Amber circle badges ①② — annotation callouts
- Dashed borders — content placeholder boundaries (not hi-fi)
- Grey fills — image placeholders
- Grey bars — body copy placeholders
- "⚙ ADMIN-TOGGLED" — section controlled by admin toggle
- "hi-fi: [desc]" — describes production colour/treatment

## Hub Architecture (Authenticated Pages)

For any work on `frontend/src/layouts/HubLayout.astro` or `frontend/src/pages/hub/*`,
read **HUB-ARCH-001** before implementation:
`ProjectDocs/Architecture/HUB_COMPONENT_ARCHITECTURE_FREEZE_v1.0.md`

Hub implementation must not violate HUB-ARCH-001.
No deviation from the composition model is permitted without a formal revision to that document.
