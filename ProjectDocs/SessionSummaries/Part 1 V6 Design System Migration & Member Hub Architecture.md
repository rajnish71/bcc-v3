BCC Unified Platform V3
Conversation Summary
V6 Design System Migration & Member Hub Architecture

Session Date: 10–11 July 2026

Objective

This session focused on completing the architectural foundation for the V3 Member Hub before implementation.

Rather than immediately building pages, the work concentrated on freezing architecture, governance documents, implementation sequencing and future reconciliation strategy.

This effectively completed the Member Hub Architecture Phase and prepared the project for implementation.

The work aligns with the active roadmap in PHASE_ROADMAP v2.0, which identifies Stage 2 (Member Hub Foundation) as the current development focus.

Major Outcomes
1. Hub Architecture Frozen

The most significant outcome of this session was freezing the authenticated Hub architecture.

A new constitutional architecture document was introduced:

HUB-ARCH-001 — Hub Component Architecture Freeze v1.0

This document establishes:

HubLayout
HubSidebar
HubPageHeader
HubSection
Authentication ownership
RBAC ownership
Slot composition
Component ownership
Responsive shell
Event communication model
Future Admin extraction strategy

This architecture is now considered authoritative for all authenticated Member Hub pages.

2. Hub Component Hierarchy Finalized

The authenticated shell was frozen as:

HubLayout
    ↓
HubSidebar
    ↓
HubPageHeader (optional named slot)
    ↓
HubSection (optional)
    ↓
Workspace

Responsibilities were clearly separated:

HubLayout

Owns:

Authentication
Session
RBAC
Layout
Responsive shell
Loading state
HubSidebar

Owns:

Navigation rendering
Responsive navigation modes
Role-based visibility
HubPageHeader

Owns:

Page title
Subtitle
Statistics
CTA slot
HubSection

Reusable presentation component for pages naturally divided into heading/body sections.

Workspace

Owns:

Business logic
API calls
Interactivity
Page functionality
3. Named Slot Architecture

HubLayout exposes two slots:

page-header (named)
default (workspace)

This allows pages to include or omit HubPageHeader naturally.

Examples:

Hub Home

HubPageHeader
Recent Activity
Journey
Learning
Noticeboard

Portfolio

(no HubPageHeader)

PortfolioWall
SelectionBar
Inspector

Upload Studio

(no HubPageHeader)

DropZone
Upload Queue
Metadata Inspector
4. Authentication Ownership Finalized

Authentication ownership was simplified.

Only HubLayout:

validates JWT
redirects
resolves session
resolves RBAC

Child components never:

read JWT
access localStorage
inspect cookies
authenticate independently
5. Event Communication Pattern

Interactive CTAs use browser CustomEvents.

Example:

HubPageHeader

Upload Button

↓

dispatch CustomEvent

↓

Workspace

↓

Open Upload Panel

Presentation and behaviour remain completely separated.

6. Phase Roadmap Updated

PHASE_ROADMAP.md was rewritten to reflect the new implementation order.

Stage 2 became:

Phase A

A1
Hub Architecture

A2
V6 12 Navigation

A3
Hub Home Reconciliation

A4
Portfolio Reconciliation

A5
Upload Studio Reconciliation

A6
Implementation

HubLayout
HubSidebar
HubPageHeader
HubSection
Navigation
Hub Home
Portfolio
Upload Studio

A7
Validation
Deployment
Testing
Git

Future phases were also reorganized:

Phase B – Legacy Profile Audit
Phase C – Legacy Data Reconciliation
Phase D – Member Profile
Phase E – Production Cutover
Phase F – Membership & Billing
Phase G – Collections
Phase H – Taxonomy Architecture
Phase I – Remaining Public Pages

This roadmap now serves as the authoritative sequencing document.

7. Governance Documents Updated

Multiple governance documents were synchronized with the new architecture:

Updated:

Bootstrap.md
SOURCE_INDEX.md
PHASE_ROADMAP.md
CLAUDE.md
Root CLAUDE.md
BCC Unified Platform Specification

The SOURCE_INDEX was updated so Hub implementation explicitly references HUB-ARCH-001 in its prescribed reading path.

8. Claude Operating Contract Expanded

Claude instructions were updated to include:

Ground Truth hierarchy

MEM-006
MEM-007
TECH STACK
PHASE ROADMAP
HUB-ARCH-001
CLAUDE.md

Hub Architecture now became part of the permanent operating contract for Claude Code.

9. Functional Specification Updated

The Functional Specification was revised to reference HUB-ARCH-001 as the governing authority for authenticated Member Hub composition, ensuring alignment between the constitutional membership documents, technology freeze, and frontend architecture.

10. Design Authority Strategy

A key architectural decision was made not to immediately update V6 00 – Design Principles.

Instead, the project will perform a single comprehensive Design Authority Reconciliation after all V6 wireframes are complete.

The future reconciliation will update:

V6 00
V6 01–18
V6 98 token.css
V6 99 systemdesign.md

This avoids repeated edits and ensures every design document reflects the final architecture in one coordinated pass.

11. Future Design Authority Reconciliation

The future reconciliation is expected to incorporate architectural decisions such as:

Representative Photo rule
Buffered Justified Gallery layout
Upload Studio workflow
Collections architecture
Hub Architecture
Navigation refinements
Taxonomy references
Additional implementation discoveries

No updates to V6 00 will be made before that milestone.

12. Part 2 Handoff Prepared

A clean continuation prompt was prepared for the next conversation.

The next session will:

Treat all governance and architecture decisions from Part 1 as frozen.
Continue from Phase A2 of the roadmap:
V6 12 Members Hub Navigation
Reconcile V6 09 Hub Home
Reconcile V6 10 Portfolio
Reconcile V6 11 Upload Studio
Implement the Hub component architecture.
Explicitly defer V6 00 updates until the Design Authority Reconciliation phase.
Final Project Status
Governance
✅ Bootstrap updated
✅ SOURCE_INDEX updated
✅ PHASE_ROADMAP v2.0 updated
✅ CLAUDE.md updated
✅ Root CLAUDE.md updated
✅ Functional Specification updated
Architecture
✅ HUB-ARCH-001 created
✅ Hub component hierarchy frozen
✅ Authentication ownership frozen
✅ RBAC ownership frozen
✅ Slot architecture frozen
✅ Event communication frozen
✅ Responsive Hub shell frozen
Design

Completed or frozen:

✅ V6 00 Design Principles
✅ V6 01 Home
✅ V6 03 Showcase
✅ V6 09 Hub Home
✅ V6 10 Portfolio
✅ V6 11 Upload Studio (pending final reconciliation)
✅ V6 12 Members Hub Navigation
✅ V6 91 SiteHeader
✅ V6 92 SiteFooter