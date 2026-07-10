# PHOTO-ARCH-001

# PHOTO ASSET ARCHITECTURE FREEZE v1.0

Document Status

Approved
Frozen
Authoritative

Document ID

PHOTO-ARCH-001

Classification

Platform Architecture — Canonical Photo Asset Model

Authority

Human Authority (Rajnish K. Khare)

Architecture Review

Initial Review — July 2026

Date

2026-07-10

Platform

BCC Unified Platform V3

Related Documents

• MEM-006 — Membership Constitution and Architecture v1.0
• TECH-STACK-FREEZE.md
• HUB-ARCH-001 — Hub Component Architecture Freeze v1.0
• V6 00 BCC Design Principles
• CLAUDE.md
• SOURCE_INDEX.md

---

## PURPOSE

This document establishes the authoritative architecture governing photographic
assets throughout the BCC Unified Platform.

This document defines:

• Canonical Photo identity
• Container architecture
• Viewing Context architecture
• Canonical URL strategy
• Ownership boundaries
• Navigation behaviour
• Reuse rules
• Future extensibility
• Canonical ownership model

This document is the mandatory architectural authority for every module that
creates, references, displays, or manages photographic assets.

All future implementation shall conform to this architecture.

No implementation may duplicate, redefine, or bypass the Canonical Photo model
without a formal revision to this document.

---

## DESIGN PHILOSOPHY

Photography is the primary content asset of the BCC Unified Platform.

Stories, Collections, Journals, Activities, Contests, Exhibitions, Search,
Homepage Presentation, and future presentation modules exist to organise, curate, and
contextualise photographic assets—not to duplicate them.

Accordingly, this document establishes the Canonical Photo as the single
authoritative representation of every photograph within the platform and
defines the architectural rules governing its identity, ownership, reuse,
presentation, and navigation.

Every future module shall reference Canonical Photos rather than creating
independent copies or isolated representations.

This philosophy ensures consistency, prevents data duplication, preserves
historical continuity, and allows unlimited future reuse of photographic
assets without architectural redesign.

---

## SCOPE

This document governs every photographic asset within the BCC Unified Platform.

This includes photographs displayed within:

• Showcase
• Photographer Portfolios
• Stories
• Collections
• Journal Articles
• Activities
• Contests
• Exhibitions
• Homepage Presentation
• Search Results
• Member Hub
• Future presentation modules

This document governs:

• Canonical Photo identity
• Ownership boundaries
• Presentation architecture
• Navigation context
• URL behaviour
• Reuse across multiple modules

Every module displaying photography shall comply with this architecture.

---

## OUT OF SCOPE

This document does not define:

• Visual design
• CSS implementation
• Layout composition
• Design tokens
• Upload processing
• Image optimisation
• Backend storage implementation
• Database schema
• Permission rules
• Marketplace workflow

These remain governed by their respective constitutional,
architectural or implementation documents.

---

## NON-GOALS

This document does not define:

• Gallery layouts
• Story authoring workflows
• Collection management
• Journal editing
• Contest rules
• Marketplace implementation
• Recommendation algorithms
• Database implementation
• API endpoints

These remain governed by their respective architectural or implementation documents.

---

## DEFINITIONS

| Term            | Definition                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Canonical Photo | The single authoritative photographic asset and metadata record within the platform.                     |
| Photo Identity  | The immutable identity of a Canonical Photo, including ownership, metadata and permanent URL.            |
| Container       | An ordered or curated presentation of references to Canonical Photos.                                    |
| Viewing Context | The navigation and browsing state associated with the Container from which a Canonical Photo was opened. |
| Canonical URL   | The permanent public URL assigned to a Canonical Photo.                                                  |

---

## ARCHITECTURAL PRINCIPLES

### Principle 1 — Single Canonical Photo

Every photograph exists exactly once within the platform.

Regardless of where it appears, every presentation references the same
Canonical Photo.

The platform shall never create multiple independent photo records
representing the same photographic asset.

### Principle 2 — Containers Reference Photos

Containers do not own photographs.
Containers reference Canonical Photos.
A Canonical Photo may belong to one, many, or unlimited Containers without
duplication.

### Principle 3 — Container Independence

Containers are independent presentation entities.

Each Container possesses its own identity, metadata, permissions,
ordering, and presentation behaviour.

Containers reference Canonical Photos but never inherit ownership
of those photographic assets.

A Container may be shared, linked, archived, or deleted without
affecting the Canonical Photos it references.

### Principle 4 — Canonical Identity

Every Canonical Photo owns exactly one immutable identity.
This identity includes:
• Photographer
• Metadata
• EXIF
• Copyright
• Licensing
• Permanent URL

Identity never changes based on where the photograph is displayed.

### Principle 5 — Permanent Public Identity

Every Canonical Photo receives exactly one permanent public URL.
This URL remains constant regardless of:

• Stories
• Collections
• Portfolio location
• Activities
• Contests
• Exhibitions
• Homepage Presentation

The URL represents the photograph—not the Container.

### Principle 6 — Viewing Context Is External

Browsing behaviour depends on the Container from which the photograph was
opened.
The Canonical Photo remains unchanged.
Navigation adapts to the active Viewing Context without altering Photo
Identity.

### Principle 7 — Unlimited Reuse

A Canonical Photo may appear within unlimited Containers.
Reuse never creates duplicated metadata, duplicated comments,
duplicated reactions or duplicate Canonical URLs.

### Principle 8 — Separation of Ownership

Canonical Photos own photographic information.

Containers own presentation, sequencing and narrative.

This separation is mandatory throughout the platform.

### Principle 9 — Interaction Ownership

Comments, reactions, favourites, downloads, purchase options,
licensing and future user interactions belong to the Canonical Photo.

Containers never own independent interaction histories for
referenced Canonical Photos.

### Principle 10 — Future Extensibility

Future modules shall integrate by referencing Canonical Photos.
No future module shall introduce an alternative ownership model or duplicate
photographic assets.

---

## CANONICAL PHOTO

The Canonical Photo is the single authoritative representation of a
photographic asset.

Every Canonical Photo possesses:

• Immutable identity
• Permanent URL
• Photographer ownership
• Metadata
• EXIF
• Copyright
• Licensing information
• Interaction history
• Usage history

A Canonical Photo may exist without belonging to any Container.

Containers may be created, modified or removed without affecting
the existence or identity of the Canonical Photo.

Containers merely reference the Canonical Photo.

---

## CONTAINER ARCHITECTURE

A Container is an ordered or curated presentation of references to Canonical Photos.

Containers organise, curate and present Canonical Photos.

They do not own photographs.

Examples include:

• Photographer Portfolio
• Story
• Collection
• Journal Article
• Activity Gallery
• Contest Gallery
• Exhibition
• Homepage Presentation
• Search Results
• Favourites
• Future AI-generated Collections

Containers may reference the same Canonical Photo simultaneously without creating duplicate ownership, metadata, or interaction history.

The Container architecture enables unlimited reuse of Canonical Photos
without compromising identity, ownership, interaction history,
or permanent public URLs.

Containers define context, not ownership.

---

## VIEWING CONTEXT

Viewing Context represents the browsing environment from which a Canonical
Photo was opened.

Viewing Context affects:

• Previous navigation
• Next navigation
• Breadcrumbs
• Return destination
• Related navigation

Viewing Context never alters the Canonical Photo itself.

A Canonical Photo may be viewed through different Viewing Contexts
during its lifetime.

Only navigation changes.

Viewing Context is transient.

It exists only while a Canonical Photo is being viewed
from a particular Container.

Photo Identity, ownership, metadata, interactions and Canonical URL
remain unchanged.

Examples

Photographer Portfolio
        ↓
Canonical Photo
        ↓
Previous / Next follows Portfolio

Story
        ↓
Canonical Photo
        ↓
Previous / Next follows Story

Collection
        ↓
Canonical Photo
        ↓
Previous / Next follows Collection

---

## CANONICAL URL

Every Canonical Photo has exactly one permanent public URL.

Format

/showcase/{photoId}

This URL never changes.

Containers shall never create independent public URLs
representing the same Canonical Photo.

Regardless of entry point, all public photo references
ultimately resolve to the Canonical URL.

Examples

✓ /showcase/8427

✗ /story/birds/photo8427

✗ /collection/top100/photo8427

This Canonical URL constitutes the permanent public identity of the
Canonical Photo and shall remain valid regardless of future presentation
modules or architectural evolution.

---