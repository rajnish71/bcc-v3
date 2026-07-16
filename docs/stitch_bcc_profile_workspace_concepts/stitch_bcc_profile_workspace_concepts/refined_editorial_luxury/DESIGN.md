---
name: Refined Editorial Luxury
colors:
  surface: '#fcf9f3'
  surface-dim: '#dcdad4'
  surface-bright: '#fcf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ed'
  surface-container: '#f0eee8'
  surface-container-high: '#ebe8e2'
  surface-container-highest: '#e5e2dc'
  on-surface: '#1c1c18'
  on-surface-variant: '#4c4640'
  inverse-surface: '#31312d'
  inverse-on-surface: '#f3f0ea'
  outline: '#7d766f'
  outline-variant: '#cec5bd'
  surface-tint: '#615e5b'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1d1b19'
  on-primary-container: '#878380'
  inverse-primary: '#cbc5c2'
  secondary: '#785914'
  on-secondary: '#ffffff'
  secondary-container: '#ffd484'
  on-secondary-container: '#795a15'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1c1a'
  on-tertiary-container: '#848481'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e8e1dd'
  primary-fixed-dim: '#cbc5c2'
  on-primary-fixed: '#1d1b19'
  on-primary-fixed-variant: '#494643'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#eac172'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4200'
  tertiary-fixed: '#e4e2de'
  tertiary-fixed-dim: '#c8c6c3'
  on-tertiary-fixed: '#1b1c1a'
  on-tertiary-fixed-variant: '#474744'
  background: '#fcf9f3'
  on-background: '#1c1c18'
  surface-variant: '#e5e2dc'
  satin-bg: '#F2EFE9'
  ivory-surface: '#FAF8F4'
  ink-primary: '#141210'
  ink-secondary: '#57514B'
  ink-muted: '#8B8378'
  gold-accent: '#A8843C'
  gold-light: '#C9A961'
  border-hairline: '#E7E1D6'
  forest-member: '#3E5A48'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 72px
    fontWeight: '700'
    lineHeight: '1.0'
    letterSpacing: -0.03em
  headline-h1:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.05'
  headline-h1-mobile:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.1'
  headline-h2:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.15'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '300'
    lineHeight: '1.7'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.7'
  ui-nav:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: normal
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: normal
    letterSpacing: 0.18em
  metadata-tiny:
    fontFamily: JetBrains Mono
    fontSize: 9px
    fontWeight: '700'
    lineHeight: normal
    letterSpacing: 0.1em
spacing:
  base: 8px
  gutter: 24px
  margin-page: 48px
  sheet-padding: 64px
  orientation-bar-height: 64px
  navigator-width: 280px
---

## Brand & Style

This design system is built for the **BCC Member Profile Editor**, an environment that balances high-utility productivity with the prestige of a luxury photography publication. The brand personality is **Professional, Institutional, and Refined**, evoking the quiet confidence of a high-end editorial workspace.

The chosen aesthetic is **Minimalist / Editorial**. It prioritizes content—specifically natural photography—over UI decoration. Key characteristics include:
- **Hairline Precision:** Use of 1px dividers to create an architectural sense of order.
- **Generous Whitespace:** Large margins and internal padding to prevent cognitive load during the editing process.
- **Surface Layering:** Depth is conveyed through subtle tonal shifts between Ivory and Satin backgrounds rather than heavy shadows.
- **Frozen Authority:** A design philosophy that treats the layout as a "Sheet" or "Canvas," mimicking the permanence of printed matter.

## Colors

The palette is rooted in a warm, sophisticated range of "Surfaces" and "Ink."

- **Surfaces:** Use `#FAF8F4` (Ivory) for the main Editorial Sheet/Canvas. Use `#F2EFE9` (Satin) for the workspace backgrounds and peripheral bars (Orientation Bar, Navigator) to provide soft contrast.
- **Ink:** `#141210` (Ink) is the primary color for all critical typography and icons. Secondary text should use `#57514B` to maintain hierarchy without losing legibility.
- **Accents:** Gold (`#A8843C`) is used sparingly for interactive highlights, active states, and specific branding moments like section numbers. 
- **Borders:** Layout separation is strictly managed via `#E7E1D6` (Hairline). Avoid using borders and shadows simultaneously.

## Typography

This system employs a triple-font stack to separate editorial expression from technical metadata.

- **Outfit (Display):** Used for headlines and section titles. High-impact and elegant. Use negative letter spacing on larger sizes to maintain the "tight" editorial feel.
- **Inter (Interface):** The workhorse for body copy and navigation. It provides a clean, neutral balance to the more expressive Outfit.
- **JetBrains Mono (Labels):** Used for all metadata, EXIF data, and technical labels. This font signals "precision" and "technical specs," essential for a photography society. It should almost always be set in uppercase with generous letter spacing.

## Layout & Spacing

The layout utilizes a **Fixed-Fluid Hybrid** model optimized for a "Member Profile Editor" workspace.

- **Persistent Navigator:** A 280px fixed-width left rail for site-wide navigation and profile sections.
- **Orientation Bar:** A 64px fixed-height top bar for workspace-specific context and actions (e.g., Save, Preview, Status).
- **Editorial Sheet (Canvas):** The main content area behaves like a physical piece of paper. It has a max-width of 1140px, centered within the workspace. It uses a 12-column grid with 24px gutters.
- **Responsive Behavior:** 
  - **Desktop (1280px+):** Full Navigator and Editorial Sheet.
  - **Tablet (768px - 1024px):** Navigator collapses into a drawer; margins reduce to 24px.
  - **Mobile:** Navigator and Orientation Bar merge into a single mobile header; Editorial Sheet becomes fluid (100% width) with 16px horizontal padding.

## Elevation & Depth

To maintain the "Printed Editorial" aesthetic, depth is minimal and highly intentional.

- **Tonal Layering:** The primary method of separation. The satin background (`#F2EFE9`) serves as the base layer, while the Editorial Sheet (`#FAF8F4`) sits on top.
- **Hairline Dividers:** Use 1px solid borders (`#E7E1D6`) instead of shadows to define containers and workspace sections.
- **Ambient Shadows:** Shadows are reserved only for floating elements like dropdown menus or active modals. Use a very low-opacity ink tint: `0 8px 32px rgba(20, 18, 16, 0.07)`.
- **Glassmorphism:** Reserved strictly for the Orientation Bar when content scrolls beneath it. Apply a subtle blur (14px) and 90% opacity to the Ivory surface to maintain legibility.

## Shapes

The shape language is **Sharp and Architectural**. 

- **Containers & Cards:** Use a 0px border radius (`rounded-none`). This reinforces the "print heritage" and precision of a photography publication.
- **Buttons & Chips:** Use a subtle 2px radius (`rounded-sm`) to provide a faint interactive affordance without breaking the geometric rigor of the design.
- **Photography (Non-Negotiable):** Images must always have a 0px border radius. They must maintain their natural aspect ratio—cropping via `object-fit: cover` is strictly forbidden.
- **Avatars:** The only exception to the sharp-edge rule. Avatars are always circular (`rounded-full`).

## Components

### Orientation Bar
The top-level workspace control. It should feature the current file/profile name in Outfit (Body Large) and primary actions (Save, Publish) on the far right. Use a bottom hairline for separation.

### Persistent Navigator
A vertical list of navigation items. Active states are indicated by a 2px Gold (`#A8843C`) left-border accent and typography weight shift.

### Editorial Sheet (Canvas)
The primary white container (`#FAF8F4`) where editing occurs. It should feel like a document. Use generous top/bottom padding (96px) to let the content breathe.

### Buttons
- **Primary:** Gold gradient background (`linear-gradient(135deg, #C9A961, #A8843C)`) with Ink text. Use only once per view.
- **Secondary:** Transparent background with an Ink hairline border.
- **Ghost:** Ink text only, no border. Used for low-priority metadata actions.

### Input Fields
Strictly 1px hairline borders on the bottom only, or a full 2px radius box if necessary for clarity. Labels must use JetBrains Mono (Label-Mono style) above the input.

### Chips/Badges
Small, 2px rounded containers using the Ivory surface. Use JetBrains Mono for the text. Status indicators (like "Draft" or "Frozen") use a 50% rounded dot marker in the respective status color.