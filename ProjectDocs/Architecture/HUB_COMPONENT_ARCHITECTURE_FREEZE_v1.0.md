# HUB-ARCH-001

# HUB COMPONENT ARCHITECTURE FREEZE v1.0

Document Status:

Approved
Frozen
Authoritative

Document ID:
HUB-ARCH-001

Classification:
Frontend Architecture — Authenticated Application Shell

Authority:
Human Authority (Rajnish K. Khare)

Architecture Review:
Two independent review cycles completed — July 2026

Date:
2026-07-10

Platform:
BCC Unified Platform V3

Related Documents:

* MEM-006 — Membership Constitution and Architecture v1.0
* TECH-STACK-FREEZE.md
* V6 00 BCC Design Principles (Design Authority)
* CLAUDE.md — Claude Code Operating Contract
* SOURCE_INDEX.md

---

# PURPOSE

This document establishes the authoritative component architecture for the
Member Hub — the authenticated application shell of BCC Unified Platform V3.

This document governs:

* Layout composition for all authenticated Hub pages
* Component ownership and responsibility boundaries
* Authentication and RBAC ownership model
* Slot composition strategy
* Component communication rules
* Responsive architecture for the Hub shell
* Administration strategy within the current project scope
* Future evolution path

This document is the mandatory reference for all frontend implementation
of authenticated Hub pages.

All implementation shall conform to this architecture.
No Hub page may deviate from this composition model without a formal revision
to this document.

---

# SCOPE

## In Scope

This document governs all pages under the `/hub/` route namespace and any
authenticated workspace accessible to users with `role ≥ member`.

This includes:

* Hub Home (`/hub/`)
* Portfolio (`/hub/portfolio/`)
* Upload Studio (`/hub/upload/`)
* Profile (`/hub/profile/`)
* Membership and Renewals (`/hub/membership/`)
* Role-elevated workspaces (Editor, Moderator, Coordinator, Admin, Super Admin)
  rendered as RBAC-gated workspace groups within the same shell

## Out of Scope

This document does not govern:

* Public site pages — governed by BaseLayout (no change)
* Authentication pages (`/auth/*`) — governed by MinimalLayout
* A future dedicated Admin Console — governed by a future AdminLayout document
* Visual design, CSS, spacing, or token decisions — governed by V6 00 BCC Design Principles
* Backend API architecture
* Database schema

---
Non-goals

This document does not define:

• Visual design
• CSS implementation
• Design tokens
• API endpoints
• Database schema
• Business workflows
• Upload processing
• Member entitlements
• Wireframe structure

These remain governed by their respective constitutional or design documents.

---

# ARCHITECTURAL PRINCIPLES

## Principle 1 — Single Authentication Owner

Authentication state has exactly one owner: HubLayout.

No child component independently reads JWT tokens, localStorage, cookies,
browser session storage, or any authentication state.

Authentication is injected downward as props only.

## Principle 2 — Single Navigation Owner

Navigation rendering has exactly one owner: HubSidebar.

No Hub page constructs its own navigation or sidebar.
Navigation structure is provided by HubLayout and rendered exclusively by HubSidebar.

## Principle 3 — Single Responsive Shell Owner

The authenticated application shell — its layout grid, responsive breakpoint
behaviour, and structural transitions — is owned exclusively by HubLayout.

No workspace page manages its own outer shell.

## Principle 4 — Workspace Isolation

Each Hub page is responsible only for its own workspace content.

Everything outside the workspace — header, navigation, footer, auth guard,
responsive shell — is inherited from the component hierarchy.

## Principle 5 — Presentation Separated from Behaviour

Shared presentational components (HubPageHeader, HubSection) own layout
and presentation only.

Business logic, interactivity, and data fetching belong to the workspace.

## Principle 6 — Props Flow Downward, Events Flow Upward

HubLayout resolves session and RBAC state and passes only the required
props to each child component.

Communication from workspace components back toward HubPageHeader uses
the browser's native CustomEvent mechanism.
No child component reaches upward for shared state independently.

## Principle 7 — RBAC Decides Navigation Visibility, Not Layout Structure

RBAC role determines which navigation items are visible in HubSidebar.

RBAC role does not change the layout structure, slot composition, or
component hierarchy. The shell is identical for all authenticated roles.

## Principle 8 — Future Extraction Without Page-Level Changes

The administration strategy is designed so that a future AdminLayout can be
extracted as a sibling of HubLayout without requiring changes to individual
workspace implementations.

---

# HUB COMPOSITION ARCHITECTURE

## Public Site (No Change)

```
BaseLayout
├── SiteHeader
├── [Page Content]
└── SiteFooter
```

## Member Hub

```
HubLayout
├── SiteHeader
├── HubSidebar
├── Hub Workspace
│   ├── [named slot : page-header]
│   └── [default slot : workspace]
└── SiteFooter
```

## Hub Page — Composition Pattern

```astro
<HubLayout>

  <HubPageHeader slot="page-header" title="..." subtitle="...">
    <a slot="cta" href="/hub/upload/">Upload Photo</a>
  </HubPageHeader>

  <!-- Workspace content in default slot -->
  <PortfolioWall />
  <Inspector />

</HubLayout>
```

Pages that do not require a page header omit the named slot entirely.
The `page-header` slot renders nothing when no content is provided.

---

# COMPONENT HIERARCHY

```
HubLayout                         [authentication · session · RBAC · shell]
│
├── SiteHeader                    [receives session from HubLayout as prop]
│
├── HubSidebar                    [receives role from HubLayout as prop]
│   ├── Desktop Left Rail
│   ├── Tablet Hub Tabs
│   └── Mobile Hub Bar
│
├── Hub Workspace
│   ├── [slot: page-header]
│   │   └── HubPageHeader         [optional · named slot injection]
│   │       ├── Title
│   │       ├── Subtitle
│   │       ├── Statistics        [client-hydrated]
│   │       └── [slot: cta]       [injected by page]
│   │
│   └── [slot: default]           [workspace content · owned by each page]
│       ├── HubSection            [optional utility · where pattern applies]
│       │   ├── Heading
│       │   ├── [Optional Action]
│       │   └── Body
│       └── [Page-specific components]
│
└── SiteFooter
```

---

# COMPONENT OWNERSHIP

| Component | Owns |
|---|---|
| HubLayout | Authentication · Session · RBAC · Responsive shell · Layout · Loading state |
| HubSidebar | Navigation rendering only |
| HubPageHeader | Page heading presentation only |
| HubSection | Section heading presentation only |
| Workspace | Business functionality · Data fetching · Interactivity |

---

# AUTHENTICATION OWNERSHIP

## Rule

HubLayout is the sole owner of authentication state.

## Authentication Responsibilities of HubLayout

* Read and validate the JWT token on client-side execution
* Redirect unauthenticated users to `/auth/signin/` with the intended destination preserved
* Maintain the authenticated session for the lifetime of the page
* Resolve user identity and role from the validated token
* Pass resolved session and role to child components as props
* Own the loading state during authentication resolution

## Authentication Loading State

During authentication resolution, the Hub workspace remains hidden.

HubLayout displays a loading state until authentication succeeds.

This is an explicit HubLayout responsibility, not a page-level concern.

## Prohibition

No child component independently reads:

* JWT tokens
* localStorage
* sessionStorage
* Cookies
* Any browser authentication state

Violation of this rule creates multiple independent authentication paths
and breaks the single-owner principle.

---

# RBAC OWNERSHIP

## Rule

HubLayout is the sole owner of RBAC resolution.

## RBAC Responsibilities of HubLayout

* Resolve the authenticated user's role from session
* Pass `role` as a prop to HubSidebar for navigation visibility decisions
* RBAC role is resolved once, at HubLayout level
* Role-gated content within workspaces uses the role prop passed from HubLayout

## RBAC and Navigation

HubSidebar uses the `role` prop to determine which navigation items to render.

HubSidebar does not perform RBAC decisions.
HubSidebar renders the navigation structure it is given.
Visibility logic lives in HubSidebar's rendering, driven by the role prop.

## RBAC and Layout Structure

RBAC does not change the layout structure.

The shell — HubLayout, HubSidebar, Hub Workspace slots, SiteFooter — is
structurally identical for all authenticated roles.

Role affects navigation item visibility and workspace content availability.
Role does not affect the composition model.

---

# HUB LAYOUT

## Identity

HubLayout is the authenticated application shell.

Every Hub page inherits HubLayout.
No Hub page constructs its own shell.

## Responsibilities

* Session ownership
* Authentication ownership and guard
* Authentication loading state
* RBAC ownership and resolution
* Responsive shell layout
* Hub layout grid management
* Passing required props to child components
* Rendering SiteHeader, HubSidebar, SiteFooter
* Exposing the `page-header` named slot
* Exposing the `workspace` default slot

## Props Passed to Children

| Child | Props Received |
|---|---|
| SiteHeader | Full session object (required for 6-state rendering) |
| HubSidebar | `role` · user display identity (name, avatar) |
| HubPageHeader | None from HubLayout — receives props from the injecting page |

HubLayout passes only what each child requires.
No child receives the full session object unnecessarily.

## Slot Contract

```
page-header  Named slot. Optional. HubPageHeader is the expected occupant.
             Renders nothing if omitted. No fallback content.

[default]    Default slot. Required. Workspace content provided by each page.
```

## Auth Guard Behaviour

| Condition | HubLayout Action |
|---|---|
| Token absent | Redirect to `/auth/signin/?next=[current path]` |
| Token present, invalid | Redirect to `/auth/signin/?next=[current path]` |
| Token valid, role insufficient | Redirect to `/hub/` with insufficient-access state |
| Token valid, role sufficient | Resolve session, pass props, render workspace |
| Token resolution in progress | Show loading state, hide workspace |

---

# HUBSIDEBAR

## Identity

HubSidebar is the single reusable navigation component for the Member Hub.

Every Hub page inherits HubSidebar through HubLayout.
No Hub page constructs its own navigation.

HubSidebar is named `HubSidebar` — consistent with V6 00 BCC Design Principles
Section 9 Component Contracts. This name is frozen.

## Responsibilities

* Navigation rendering
* Responsive mode switching across breakpoints
* Role-aware navigation item visibility

## What HubSidebar Does Not Do

HubSidebar does not:

* Authenticate users
* Perform RBAC decisions
* Read browser storage
* Manage session state
* Make API calls

HubSidebar renders the navigation structure it receives.

## Navigation Modes

| Breakpoint | Mode |
|---|---|
| ≥ 900px | Desktop Left Rail — persistent vertical sidebar |
| 600px – 900px | Tablet Hub Tabs — top tab bar |
| < 600px | Mobile Hub Bar — horizontal-scroll tab bar |

Hub layout never stacks navigation above content on mobile.
Horizontal-scroll tab bar is the minimum mobile presentation.

## Navigation Sections

Base sections (all authenticated roles):

* Overview
* My Gallery
* Profile
* Renewals
* Membership Card

Role-elevated sections (rendered below base sections, RBAC-gated):

* Content Editor workspace group
* Moderator workspace group
* Coordinator workspace group
* Admin workspace group
* Super Admin workspace group

Role-elevated sections are hidden when the user's role does not grant access.
They are not disabled — they are absent from the rendered navigation.

## Active State

Active navigation item: gold left border on Desktop Left Rail.
Active tab: gold underline on Tablet Hub Tabs and Mobile Hub Bar.

---

# HUBPAGEHEADER

## Identity

HubPageHeader is a reusable page heading component.
It is inserted through the `page-header` named slot of HubLayout.

## Responsibilities

* Page title
* Subtitle
* Optional client-hydrated statistics
* CTA slot

## What HubPageHeader Does Not Do

HubPageHeader does not:

* Own business logic
* Manage interactivity
* Handle navigation
* Read authentication state

HubPageHeader owns presentation.
The workspace owns behaviour.

## CTA Ownership

HubPageHeader provides a `cta` slot.
The page injects the CTA element into this slot.

Navigation CTAs use `<a href="...">`.
Interactive CTAs (triggering workspace panels or modals) dispatch a
CustomEvent that the workspace component listens for.

The CTA button lives in HubPageHeader's slot.
The CTA handler lives in the workspace.
These are never combined in a single component.

## Statistics

Statistics displayed in HubPageHeader (counts, totals) are user-specific
and cannot be resolved at build time.

Statistics are hydrated client-side after authentication resolution.
HubPageHeader renders statistics areas as initially empty placeholders
that are populated by client-side script execution.

## Usage Example

```astro
<!-- Simple navigational CTA -->
<HubLayout>
  <HubPageHeader slot="page-header" title="My Gallery" subtitle="Your photography portfolio">
    <a slot="cta" href="/hub/upload/">Upload Photo</a>
  </HubPageHeader>
  <PortfolioWall />
</HubLayout>

<!-- Interactive CTA communicating with workspace -->
<HubLayout>
  <HubPageHeader slot="page-header" title="Upload Studio">
    <button slot="cta" id="open-upload-panel">New Upload</button>
  </HubPageHeader>
  <UploadQueue />  <!-- Listens for 'hub:open-upload' CustomEvent -->
</HubLayout>
```

## Pages That Omit HubPageHeader

Pages where the workspace functions as a unified environment (e.g., Portfolio,
Upload Studio) may omit HubPageHeader entirely.

The `page-header` named slot renders nothing when no content is provided.
This is intentional and valid.

---

# HUBSECTION

## Identity

HubSection is a reusable section presentation component.

It standardises the heading + optional action + body layout pattern used
within Hub Home and informational Hub pages.

## Responsibilities

* Section heading
* Optional section-level action
* Section body slot

## When to Use HubSection

HubSection applies where workspace content follows this pattern:

```
[Section Heading]    [Optional Action]
─────────────────────────────────────
[Body Content]
```

Examples where HubSection applies:

* Recent Work
* Happening Now
* Journey
* Noticeboard
* Learning
* Membership summary
* Collections

## When Not to Use HubSection

HubSection does not apply to unified workspace environments.

HubSection is explicitly not intended for:

* Portfolio — PortfolioWall + SelectionBar + Inspector is a single environment
* Upload Studio — DropZone + UploadQueue + Metadata Inspector is a single environment
* Future editing or studio environments of similar structure

Forcing HubSection onto unified workspaces breaks both the layout and the
visual language.

## Optionality

HubSection is an available utility component.

It is not mandatory.
It is not a universal wrapper for all workspace content.
Pages use HubSection where the heading+action+body pattern genuinely applies
and omit it where it does not.

---

# WORKSPACE OWNERSHIP

## Rule

Each Hub page owns only its workspace content.

Authentication, navigation, responsive shell, page header, and footer
are inherited from the component hierarchy.
Pages do not re-implement any inherited concern.

## Workspace Examples

### Hub Home (`/hub/`)

```
WelcomeBand
AttentionRow
RecentWork         [HubSection]
HappeningList      [HubSection]
JourneyNumbers     [HubSection]
PersonalStack
```

### Portfolio (`/hub/portfolio/`)

```
PortfolioToolbar
Collections Strip
PortfolioWall
SelectionBar
Inspector
```

### Upload Studio (`/hub/upload/`)

```
UploadQueue
Metadata Inspector
Publication
```

### Profile (`/hub/profile/`)

```
Profile Forms
```

### Membership and Renewals (`/hub/membership/`)

```
Billing
Renewals
```

Only workspace content changes between pages.
Everything outside the workspace slot is identical across all Hub pages.

---

# COMPONENT COMMUNICATION

## Session and Role — Downward via Props

HubLayout resolves session and role, then passes them downward as props.

```
HubLayout
  → SiteHeader receives: session (full object)
  → HubSidebar receives: role, user display identity
  → HubPageHeader receives: nothing from HubLayout
                            (title/subtitle/cta from the injecting page)
```

## Workspace Statistics — Client-side API Calls

User-specific statistics (photo counts, membership status, activity totals)
cannot be resolved at build time in Astro's static output model.

These values are fetched by client-side scripts in the workspace or
in HubPageHeader's statistics area, executing after authentication resolves.

## CTA to Workspace — CustomEvent

When a CTA in HubPageHeader must trigger behaviour in the workspace, the
communication mechanism is the browser's native CustomEvent API.

```
CTA button (in HubPageHeader slot)
  → dispatches: document.dispatchEvent(new CustomEvent('hub:action-name'))

Workspace component
  → listens: document.addEventListener('hub:action-name', handler)
```

Event names use the `hub:` namespace prefix.

No child component reaches upward for shared state.
No prop drilling for interactive communication.
No framework-level state management.

## Inter-workspace Communication

Workspace components on the same page may communicate directly through
shared parent state in the page's own script block.

This is page-local and does not involve the shared architecture components.

---

# RESPONSIVE ARCHITECTURE

## Shell Breakpoints

These breakpoints govern the Hub shell. They are owned by HubLayout.

| Breakpoint | Shell Behaviour |
|---|---|
| ≥ 900px | Desktop — SiteHeader full nav · HubSidebar Left Rail |
| 600px – 900px | Tablet — SiteHeader hamburger drawer · HubSidebar Tab Bar |
| < 600px | Mobile — SiteHeader hamburger drawer · HubSidebar Horizontal-scroll Bar |

## Navigation Mode Transitions

HubSidebar manages its own mode transitions in response to viewport width.
HubLayout provides the structural grid that accommodates each mode.

Desktop (≥ 900px): two-column grid — Left Rail + Workspace

Tablet and Mobile (< 900px): single-column — Workspace full width, navigation above or below per mode

## Workspace Responsive Behaviour

Individual workspace components manage their own internal responsive behaviour.

The shell grid does not dictate how workspace content arranges itself internally.

## SiteHeader on Hub Pages

SiteHeader renders in the Member state on all Hub pages.

SiteHeader receives the full session object from HubLayout.
SiteHeader renders the correct role state (Member, Editor, Moderator, Admin)
based on the resolved session.

---

# ADMINISTRATION STRATEGY

## Current Scope

HubLayout serves all authenticated workspaces within the current project scope.

This includes:

* Member workspaces (all authenticated roles)
* RBAC-elevated workspaces rendered as gated workspace groups in HubSidebar

Administration functions (application review, member management, financial
records, system configuration) are accessed as role-gated workspace groups
within the existing HubSidebar navigation structure.

## Rationale for Single Layout

At the current project scope, the administration surface does not warrant a
separate shell.

A single authenticated shell — with RBAC-controlled navigation visibility —
is sufficient, maintainable, and avoids premature abstraction.

## Future Evolution Point

If the administration surface grows to the point where it requires a
visually distinct shell, a dedicated AdminLayout may be extracted as a
sibling of HubLayout.

This extraction is an intentional future extension point.
It does not require changes to individual workspace implementations.
The workspace slot composition model remains unchanged regardless of
which layout shell is in use.

This decision is deferred and will be revisited when the administration
surface warrants it.

---

# Future Architecture Evolution

## AdminLayout (Deferred)

A future AdminLayout may be introduced as a sibling of HubLayout.

AdminLayout would serve the Admin Console experience described as
"visually distinct" in V6 00 BCC Design Principles.

AdminLayout would share the same slot composition model as HubLayout.
Individual workspace components would require no changes.
The split would be a routing and layout decision, not a workspace decision.

Trigger for this decision: administration surface size and visual distinctness
requirements — not a scheduled milestone.

## HubLayout Versioning

If HubLayout requires structural changes after implementation begins,
those changes must be documented as a new version of this document.

This document (v1.0) governs the initial implementation.
No component may silently deviate from this architecture.

---

# FROZEN DECISIONS

The following decisions are frozen as of this document.
They may not be revisited without a formal revision to this document and
explicit Human Authority approval.

| # | Decision | Frozen State |
|---|---|---|
| FD-001 | HubLayout is sole authentication owner | FROZEN |
| FD-002 | No child component reads browser storage | FROZEN |
| FD-003 | HubSidebar is sole navigation owner | FROZEN |
| FD-004 | Component name is HubSidebar (not HubNavigation) | FROZEN |
| FD-005 | HubPageHeader is injected via named slot `page-header` | FROZEN |
| FD-006 | CTA ownership: HubPageHeader layout, workspace behaviour | FROZEN |
| FD-007 | CTA-to-workspace communication: CustomEvent with `hub:` prefix | FROZEN |
| FD-008 | Statistics in HubPageHeader are client-hydrated, never build-time | FROZEN |
| FD-009 | HubSection is optional — not mandatory for all sections | FROZEN |
| FD-010 | HubSection does not apply to unified workspace environments | FROZEN |
| FD-011 | Props flow downward only; each child receives only what it requires | FROZEN |
| FD-012 | RBAC does not change layout structure, only navigation visibility | FROZEN |
| FD-013 | Hub loading state is owned by HubLayout | FROZEN |
| FD-014 | AdminLayout is deferred; Hub serves all current admin scope | FROZEN |
| FD-015 | Future AdminLayout extraction requires no workspace changes | FROZEN |

---

# DOCUMENT AUTHORITY

This document is the authoritative architecture reference for all authenticated
Hub page implementation in BCC Unified Platform V3.

## Document Hierarchy Position

```
Governance Layer
MEM-006 (Membership Constitution)
MEM-007 (Numbering Constitution)

Platform Layer
TECH-STACK-FREEZE
PHASE_ROADMAP

Architecture Layer
HUB-ARCH-001 (this document)     ← governs Hub frontend composition

Design Layer
V6 00 BCC Design Principles      ← governs visual design

Implementation Layer
CLAUDE.md                        ← governs Claude Code operating rules
```

This document sits below the technology and membership constitutional layers.
It does not supersede MEM-006, MEM-007, or TECH-STACK-FREEZE.

It supersedes any informal Hub architecture decisions made prior to this document.

## Change Control

Changes to frozen decisions require:

1. Human Authority approval
2. A new versioned document (v1.1 or v2.0 as appropriate)
3. Updated references in SOURCE_INDEX.md and CLAUDE.md

---
Revision History

v1.0
2026-07-10
Initial constitutional freeze.

Future revisions:
v1.1
v2.0

---


HUB-ARCH-001 — Hub Component Architecture Freeze v1.0

This document is the constitutional authority for Member Hub frontend
architecture in BCC Unified Platform V3.

All Hub implementation shall inherit from this document.

END OF DOCUMENT