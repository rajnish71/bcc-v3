# BCC Design System — "Aperture, Focus & Light"
## Bhopal Camera Club · v1.0 · June 2026

---

## 1. Design Philosophy

This system is built on the language of photography itself. Every decision traces back to the camera: the darkroom gives us our deep backgrounds so uploaded photos pop with maximum luminosity; the lens element stack gives us our glassmorphic surfaces (frosted, layered, refracting depth); the viewfinder frame gives us crop-mark borders; the iris diaphragm gives us the aperture motif that runs throughout; and the duality of warm golden light leaks vs. cool cyan focal glows gives us our accent palette.

**Three design principles:**
1. **Recede so photos can speak** — UI chrome is dark, muted, and thin. Photography fills the frame.  
2. **Precision over decoration** — Every element earns its place. Fine 1px lines over thick borders; micro-details over gradients.  
3. **Craft at every scale** — From a 96px hero title to a 12px caption, the system scales with intention.

---

## 2. Color Tokens

All values listed as CSS custom properties for a `:root` block in the global stylesheet.

### Base Surfaces
```css
--color-bg:           #0B0B0E;   /* Darkroom black — primary page background */
--color-bg-2:         #101014;   /* Secondary fill — alternate section backgrounds */
--color-surface:      #15151C;   /* Card / panel surface */
--color-surface-2:    #1E1E28;   /* Elevated card / hovered surface */
--color-surface-3:    #26263A;   /* Tooltip / popover */
```

### Borders
```css
--color-border:       rgba(255,255,255,0.07);   /* Default border */
--color-border-md:    rgba(255,255,255,0.12);   /* Medium emphasis */
--color-border-strong:rgba(255,255,255,0.20);   /* Focused / hovered */
--color-border-amber: rgba(245,168,42,0.30);    /* Amber accent border */
--color-border-cyan:  rgba(0,200,232,0.25);     /* Cyan accent border */
```

### Typography
```css
--color-text:         #F0EFF6;   /* Primary text — slightly warm white */
--color-text-2:       #8A899E;   /* Secondary — muted lavender-gray */
--color-text-3:       #52516A;   /* Tertiary / placeholder */
--color-text-inverse: #0B0B0E;   /* On light backgrounds */
```

### Accent: Warm Light Leak (Amber)
```css
--color-amber:        #F5A82A;   /* Primary interactive accent */
--color-amber-dim:    #C4851F;   /* Hover / pressed */
--color-amber-muted:  rgba(245,168,42,0.12);  /* Subtle amber fill */
--color-amber-glow:   rgba(245,168,42,0.20);  /* Glow / shadow */
```

### Accent: Focal Glow (Cyan)
```css
--color-cyan:         #00C8E8;   /* Secondary accent / links */
--color-cyan-dim:     #009DB8;   /* Hover / pressed */
--color-cyan-muted:   rgba(0,200,232,0.10);   /* Subtle cyan fill */
--color-cyan-glow:    rgba(0,200,232,0.18);   /* Glow / shadow */
```

### Brand Aperture Palette (from logo iris blades)
```css
--color-iris-orange:  #E8622D;   /* Orange blade */
--color-iris-teal:    #00B4C8;   /* Teal blade */
--color-iris-magenta: #E4007F;   /* Magenta blade */
--color-iris-amber:   #F9B72B;   /* Amber blade */
--color-iris-olive:   #8CB43A;   /* Olive blade */
```
These are used for: category badge backgrounds, timeline node dots, avatar ring colors, and decorative accents. Never use them as primary text color on dark backgrounds without a contrast check.

### Semantic
```css
--color-success:  #4CAF7D;
--color-warning:  #F5A82A;  /* same as --color-amber */
--color-error:    #E8622D;  /* same as --color-iris-orange */
--color-info:     #00C8E8;  /* same as --color-cyan */
```

---

## 3. Typography Hierarchy

### Font Families
```css
--font-display: 'Outfit', sans-serif;   /* All headings and display text */
--font-body:    'Inter', sans-serif;    /* Body copy, UI labels, captions */
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;  /* Code, data, technical */
```

**Loading:** Both Outfit and Inter are loaded from Google Fonts with weights 300–900 (Outfit) and 300–600 (Inter). Use `display=swap` and preconnect.

### Scale
| Token | Size | Weight | Line-height | Letter-spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `--text-display` | 5rem / 80px | 800 | 1.0 | -0.04em | Hero headline |
| `--text-hero` | 3.75rem / 60px | 700 | 1.05 | -0.03em | Section hero |
| `--text-h1` | 3rem / 48px | 700 | 1.1 | -0.025em | Page title |
| `--text-h2` | 2.25rem / 36px | 700 | 1.15 | -0.02em | Section title |
| `--text-h3` | 1.75rem / 28px | 600 | 1.2 | -0.015em | Subsection |
| `--text-h4` | 1.25rem / 20px | 600 | 1.3 | -0.01em | Card title |
| `--text-lg` | 1.125rem / 18px | 400 | 1.6 | 0 | Lead paragraph |
| `--text-base` | 1rem / 16px | 400 | 1.7 | 0 | Body copy |
| `--text-sm` | 0.875rem / 14px | 400 | 1.6 | 0.005em | Secondary text |
| `--text-xs` | 0.75rem / 12px | 500 | 1.5 | 0.06em | Labels, badges |
| `--text-label` | 0.6875rem / 11px | 600 | 1.4 | 0.10em | Eyebrow/caps labels |

### Eyebrow Labels
Small ALL-CAPS labels that precede section titles. Style: `font-family: var(--font-body)`, `font-size: var(--text-label)`, `font-weight: 600`, `letter-spacing: 0.12em`, `text-transform: uppercase`, `color: var(--color-amber)`.

---

## 4. Spacing & Layout Tokens

```css
--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px
--space-5:   20px
--space-6:   24px
--space-8:   32px
--space-10:  40px
--space-12:  48px
--space-16:  64px
--space-20:  80px
--space-24:  96px
--space-32:  128px

--radius:     8px    /* Small cards, inputs */
--radius-md:  12px   /* Standard cards */
--radius-lg:  16px   /* Large panels */
--radius-xl:  24px   /* Modals, hero panels */
--radius-full: 9999px /* Pills, tags */

--nav-height: 72px
--content-max: 1200px
--content-wide: 1440px
```

---

## 5. Glassmorphic Panel

The core card/panel pattern. Applied as a class or mixin.

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-lg);
  box-shadow: 
    0 1px 0 0 rgba(255,255,255,0.04) inset,   /* top inner highlight */
    0 24px 48px -12px rgba(0,0,0,0.5);         /* deep shadow */
}

/* Hover state */
.glass-panel:hover {
  background: rgba(255, 255, 255, 0.055);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 1px 0 0 rgba(255,255,255,0.06) inset,
    0 0 0 1px rgba(245,168,42,0.15),           /* amber ring on hover */
    0 32px 64px -12px rgba(0,0,0,0.6);
}
```

---

## 6. Viewfinder Card Frame

Applied to photo/image cards. Shows crop-mark corners on hover — a signature UI detail.

```css
.vf-card {
  position: relative;
  overflow: visible;
  transition: transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94);
}

/* All four corner marks via ::before, ::after + two span.vf-corner children */
.vf-card::before,
.vf-card::after,
.vf-card .vf-br,
.vf-card .vf-bl {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border-color: rgba(255,255,255,0.7);
  border-style: solid;
  opacity: 0;
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
  z-index: 10;
}

.vf-card::before  { top: 10px;    left: 10px;    border-width: 1.5px 0 0 1.5px; }
.vf-card::after   { top: 10px;    right: 10px;   border-width: 1.5px 1.5px 0 0; }
.vf-card .vf-br   { bottom: 10px; right: 10px;   border-width: 0 1.5px 1.5px 0; }
.vf-card .vf-bl   { bottom: 10px; left: 10px;    border-width: 0 0 1.5px 1.5px; }

.vf-card:hover::before,
.vf-card:hover::after,
.vf-card:hover .vf-br,
.vf-card:hover .vf-bl { opacity: 1; }

.vf-card:hover { transform: scale(1.015); }
```

---

## 7. Button Variants

### Primary (Amber)
```css
.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 28px;
  background: var(--color-amber);
  color: #0B0B0E;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
}
.btn-primary:hover {
  background: #FFB830;
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(245,168,42,0.35);
}
```

### Ghost
```css
.btn-ghost {
  /* same base, but: */
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border-md);
}
.btn-ghost:hover {
  border-color: var(--color-border-strong);
  background: rgba(255,255,255,0.04);
}
```

### Text link
```css
.btn-text {
  background: none; border: none; padding: 0;
  color: var(--color-amber);
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s;
}
.btn-text:hover { color: #FFB830; }
```

---

## 8. Form Controls

```css
.input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 0.9375rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.input::placeholder { color: var(--color-text-3); }
.input:focus {
  border-color: var(--color-amber);
  background: rgba(245,168,42,0.04);
  box-shadow: 0 0 0 3px rgba(245,168,42,0.12);
}
```

---

## 9. Category Badge Colors

| Category | Background | Text |
|----------|-----------|------|
| Photowalk | `rgba(0,180,200,0.15)` | `#00B4C8` |
| Workshop | `rgba(245,168,42,0.15)` | `#F5A82A` |
| Contest | `rgba(228,0,127,0.15)` | `#E4007F` |
| Exhibition | `rgba(140,180,58,0.15)` | `#8CB43A` |
| Portrait | `rgba(232,98,45,0.15)` | `#E8622D` |
| Landscape | `rgba(0,200,232,0.15)` | `#00C8E8` |

---

## 10. GSAP Animation Specs

### Global Configuration
```js
gsap.config({ nullTargetWarn: false });
gsap.registerPlugin(ScrollTrigger);

// Standard eases
const EASE_OUT = 'power3.out';
const EASE_INOUT = 'power2.inOut';
const EASE_ELASTIC = 'elastic.out(1, 0.75)';
const EASE_BACK = 'back.out(1.4)';
```

### 1. Page Entrance (runs on every route load)
```js
const tl = gsap.timeline();
tl.from('.page-content', { opacity: 0, y: 24, duration: 0.5, ease: EASE_OUT });
```

### 2. Hero Title Stagger
```js
gsap.from('.hero-word', {
  opacity: 0,
  y: 60,
  duration: 0.9,
  stagger: 0.08,
  ease: EASE_OUT,
  delay: 0.1
});
```

### 3. Aperture Decoration Entrance
```js
gsap.from('.aperture-deco', {
  scale: 0.85,
  opacity: 0,
  rotation: -15,
  duration: 1.2,
  ease: EASE_OUT,
  delay: 0.3
});
```

### 4. Scroll Reveal (cards, sections)
```js
gsap.from(target, {
  opacity: 0,
  y: 40,
  duration: 0.7,
  stagger: 0.08,
  ease: EASE_OUT,
  scrollTrigger: {
    trigger: container,
    start: 'top 80%',
    toggleActions: 'play none none none'
  }
});
```

### 5. Stats Counter
```js
const counter = { val: 0 };
gsap.to(counter, {
  val: targetNumber,
  duration: 2,
  ease: 'power2.out',
  scrollTrigger: { trigger: el, start: 'top 75%', once: true },
  onUpdate: () => { el.textContent = Math.round(counter.val).toLocaleString(); }
});
```

### 6. Parallax Hero Background
```js
gsap.to('.hero-bg', {
  y: '30%',
  ease: 'none',
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true
  }
});
```

### 7. Nav Glass Transition
```js
// On scroll: glassmorphic effect intensifies
ScrollTrigger.create({
  start: 'top -60px',
  onUpdate: (self) => {
    nav.style.backdropFilter = `blur(${Math.min(20, self.scroll() / 3)}px)`;
    nav.style.background = `rgba(11,11,14,${Math.min(0.85, self.scroll() / 100)})`;
  }
});
```

### 8. Photo Card Hover (GSAP hover, not CSS)
```js
el.addEventListener('mouseenter', () => {
  gsap.to(el, { scale: 1.025, duration: 0.35, ease: EASE_BACK });
  gsap.to(el.querySelectorAll('.vf-corner'), { opacity: 1, duration: 0.2 });
  gsap.to(overlay, { opacity: 1, duration: 0.3 });
});
el.addEventListener('mouseleave', () => {
  gsap.to(el, { scale: 1, duration: 0.35, ease: EASE_BACK });
  gsap.to(el.querySelectorAll('.vf-corner'), { opacity: 0, duration: 0.2 });
  gsap.to(overlay, { opacity: 0, duration: 0.3 });
});
```

### 9. Lens Shutter Page Transition
A full-screen overlay using the aperture SVG that "opens" when navigating to a new page:
```js
// Outgoing page
gsap.to('.shutter-overlay', { 
  scale: 1, opacity: 1, duration: 0.3, ease: 'power2.in',
  onComplete: () => { navigateToPage(target); }
});
// Incoming page
gsap.from('.shutter-overlay', { scale: 1, opacity: 1 });
gsap.to('.shutter-overlay', { scale: 0, opacity: 0, duration: 0.5, ease: 'power3.out' });
```

### 10. Timeline Reveal (About page)
```js
gsap.from('.timeline-item', {
  opacity: 0,
  x: -30,
  duration: 0.6,
  stagger: 0.12,
  scrollTrigger: { trigger: '.timeline', start: 'top 70%' }
});
```

---

## 11. Decoration Patterns

### Aperture Decorative Ring
A rotating dashed ring that appears around logo marks and hero decorations:
```css
.aperture-ring {
  border-radius: 50%;
  border: 1px dashed rgba(245,168,42,0.15);
  animation: spin 30s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

### Crop Mark Overlay (on section headers)
Two corner brackets in the top-left and bottom-right of a section:
```css
.crop-frame::before { top: 0; left: 0; border-width: 2px 0 0 2px; }
.crop-frame::after  { bottom: 0; right: 0; border-width: 0 2px 2px 0; }
/* Border color: rgba(245,168,42,0.25) */
```

### Grain Texture
Subtle film grain overlay on hero sections:
```css
.grain::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,..."); /* SVG turbulence filter */
  opacity: 0.04;
  pointer-events: none;
}
```

---

## 12. Responsive Breakpoints

```css
--bp-sm:   640px   /* Small devices */
--bp-md:   768px   /* Tablets */
--bp-lg:   1024px  /* Laptops */
--bp-xl:   1280px  /* Desktops */
--bp-2xl:  1536px  /* Large screens */
```

---

## 13. Astro-specific Notes

**Component file structure:**
```
src/
  styles/
    global.css          ← All CSS custom properties + resets
    typography.css      ← Type scale definitions
    components.css      ← Glass panel, buttons, viewfinder, forms
  components/
    layout/
      Nav.astro
      Footer.astro
    ui/
      Button.astro
      GlassCard.astro
      PhotoCard.astro
      CategoryBadge.astro
      ViewfinderFrame.astro
      SectionHeader.astro
    sections/
      HeroSection.astro
      GalleryGrid.astro
      StatsBar.astro
      EventCard.astro
  lib/
    gsap.ts             ← GSAP registration + shared animation helpers
    animations.ts       ← Page-level GSAP timelines
```

**GSAP loading in Astro:**
Load GSAP client-side only with `client:only="react"` or in a `<script>` tag at the component level. Register `ScrollTrigger` once in a layout-level script. Use `is:inline` to avoid double-hydration.

---

*Bhopal Camera Club Design System · "Aperture, Focus & Light" · v1.0*
