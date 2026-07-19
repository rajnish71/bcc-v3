# PHOTO-ARCH-002

# PHOTO STORAGE & DELIVERY ARCHITECTURE FREEZE v1.0

Document Status

Approved
Frozen
Authoritative

Document ID

PHOTO-ARCH-002

Classification

Platform Architecture — Photo Storage & Delivery

Authority

Human Authority (Rajnish K. Khare)

Architecture Review

Initial Review — July 2026

Date

2026-07-15

Platform

BCC Unified Platform V3

Related Documents

• PHOTO-ARCH-001 — Photo Asset Architecture Freeze v1.0
• MEM-006 — Membership Constitution and Architecture v1.0
• MEM-007 — Membership Numbering Constitution v1.0
• TECH-STACK-FREEZE.md
• HUB-ARCH-001 — Hub Component Architecture Freeze v1.0
• CLAUDE.md — Claude Code Operating Contract
• SOURCE_INDEX.md
• Conforms to PLATFORM-ARCH-001.

---

## PURPOSE

This document establishes the authoritative architecture governing the physical
storage, preservation, delivery and lifecycle management of photographic assets
throughout the BCC Unified Platform.

PHOTO-ARCH-001 governs Canonical Photo identity.
PHOTO-ARCH-002 governs Canonical Photo storage and delivery.

These two documents are complementary and non-overlapping.

This document defines:

• Master Asset
• Object Store
• Delivery Layer
• Dynamic Derivatives
• Canonical Storage Identifier
• Integrity Verification
• Deletion Behaviour
• Disaster Recovery
• Storage Independence

This document is the mandatory architectural authority for every module that
stores, retrieves, delivers or permanently removes photographic assets.

All future implementation involving photographic storage or delivery shall
conform to this architecture.

No implementation may bypass, duplicate or redefine the storage and delivery
model without a formal revision to this document.

---

## DESIGN PHILOSOPHY

The BCC Unified Platform is an archival system first and a presentation
platform second.

Every photograph uploaded to the platform represents a permanent historical
record of the community and the creative work of its photographer.

Accordingly, the platform shall preserve one immutable Master Asset for
every Canonical Photo.

Everything presented to users is a dynamically generated representation of
that Master Asset.

The Master Asset is permanent.
Every delivery image is temporary.

Photographers are the lawful owners of their photographs.
The platform is the custodian — not the owner — of every photographic
asset it stores.

All storage and delivery architecture shall honour this distinction.

---

## SCOPE

This document governs the physical implementation of every photographic
asset within the BCC Unified Platform.

This document governs:

• Master Asset storage
• Object Store behaviour
• Delivery Layer behaviour
• Dynamic Derivative generation
• Image optimisation and format conversion
• Watermarking
• Integrity verification
• Deletion and archival behaviour
• Disaster recovery
• Storage migration principles

Every module that stores, serves, or permanently removes a photographic asset
shall comply with this architecture.

---

## OUT OF SCOPE

This document does not define:

• Canonical Photo Identity
• Container Architecture
• Viewing Context
• Canonical URLs
• Photographer Ownership Model
• Permissions and Visibility Rules
• Gallery Layouts
• Database Schema
• API Endpoints
• CSS or Visual Design
• Upload UI or Workflow
• Contest or Exhibition Rules
• Video Assets
• Audio Assets
• Document Assets

Canonical Photo Identity remains governed by PHOTO-ARCH-001.

All other items remain governed by their respective architectural,
constitutional or implementation documents.

Video, audio and document assets are explicitly outside the scope of
this document and require independent architectural governance.

---

## NON-GOALS

This document does not define:

• Upload form behaviour
• Admin moderation workflows
• Gallery display rules
• Contest submission processing
• Specific API contracts
• Specific database column definitions

These remain governed by their respective architectural or implementation
documents.

---

## DEFINITIONS

| Term | Definition |
| ---- | ---------- |
| Master Asset | The single authoritative binary file representing a photographic asset. Stored exclusively in the Object Store. Never modified after successful upload. |
| Object Store | The permanent authoritative storage layer responsible for holding every Master Asset. The System of Record for all photographic assets. |
| Origin Store | The Object Store as referenced by the Delivery Layer. The Delivery Layer pulls from the Origin Store to generate Dynamic Derivatives. |
| Delivery Layer | The processing and distribution layer responsible for dynamic resizing, format conversion, optimisation, watermarking and edge caching. Never the Source of Truth. Never a permanent store. |
| Canonical Storage Identifier | An immutable identifier assigned to a Master Asset at the time of upload and permanently recorded in the platform database. Uniquely locates the Master Asset within the Object Store. Survives any migration between Object Store providers. |
| Dynamic Derivative | A presentation variant of a Master Asset generated on demand by the Delivery Layer. Not permanently stored. Always reproducible solely from the Master Asset. |
| Delivery URL | A URL served by the Delivery Layer referencing a Dynamic Derivative. Not permanent. Not archival. Must never be treated as a canonical reference. |
| Integrity Verification | The process of confirming that a recorded Canonical Storage Identifier resolves to an existing, accessible and unmodified Master Asset in the Object Store. |
| Hard Delete | Permanent and irreversible removal of a photographic asset and all associated platform records, with no recovery mechanism available to application users. |

---

## ARCHITECTURAL PRINCIPLES

### Principle 1 — Single Master Asset

Every Canonical Photo owns exactly one Master Asset.

No Canonical Photo shall own multiple authoritative image files.

The Master Asset is the single physical realisation of the Canonical Photo.

### Principle 2 — Immutable Master

The Master Asset shall never be modified after successful upload.

Subsequent edits by the photographer to the photographic image shall create
a new Canonical Photo rather than replacing the existing Master Asset.

Metadata corrections that do not alter the photographic binary do not require
a new Master Asset and do not violate this principle.

### Principle 3 — Object Store is the System of Record

The Object Store is the sole authoritative storage location for every
Master Asset.

No Delivery Layer, CDN cache, or derived copy may become the Source of Truth.

All disaster recovery and archival operations shall treat the Object Store
as primary.

No implementation shall designate any other system as the authoritative
holder of Master Assets.

### Principle 4 — Delivery Layer is Not Storage

The Delivery Layer performs:

• Dynamic resizing
• Format conversion
• Compression
• Responsive image generation
• Watermarking
• CDN edge caching
• Optimised delivery

The Delivery Layer never owns photographic assets.

The Delivery Layer operates as a presentation service on top of the
Object Store.

Loss of the Delivery Layer or its cache constitutes a delivery disruption,
not data loss.

### Principle 5 — Dynamic Derivatives Are Never Permanently Stored

The platform shall not maintain a permanent derivative store.

All presentation variants shall be generated dynamically from the
Master Asset by the Delivery Layer, on demand.

Every Dynamic Derivative is reproducible from the Master Asset alone.

No Dynamic Derivative shall ever be treated as an authoritative or
archival copy of a photograph.

### Principle 6 — Preservation of Original

The Master Asset shall be preserved exactly as accepted by the platform
at the time of upload.

The platform shall not recompress, resize, reformat or overwrite the
Master Asset after successful upload.

The original binary remains permanently unchanged for the lifetime of
the Canonical Photo.

### Principle 7 — Storage Independence

The public identity of a Canonical Photo shall remain entirely independent
of its physical storage.

Migration between Object Store providers shall never affect:

• Photo ID
• Canonical URL
• Metadata
• Photographer ownership
• Interaction history
• Container memberships

The Canonical Storage Identifier exists precisely to enable this migration
without disruption to any public or platform-level reference.

### Principle 8 — Canonical Storage Identifier

Every Master Asset shall possess exactly one immutable Canonical Storage
Identifier.

This identifier is assigned at the time of successful upload and
permanently recorded in the platform database.

No two Master Assets shall share the same Canonical Storage Identifier.

The Canonical Storage Identifier shall remain valid and unchanged across
any Object Store migration or provider change.

The Canonical Storage Identifier is a storage-domain concept.
It is separate from and independent of the Photo ID defined by PHOTO-ARCH-001.

The Canonical Storage Identifier is an internal architectural identifier and shall never be exposed as a public identifier, public URL, or user-facing reference.

### Principle 9 — Integrity Verification

The platform shall periodically verify that every recorded Canonical Storage
Identifier resolves to an existing and accessible Master Asset in the
Object Store.

The platform shall maintain a verifiable record of the Master Asset's
expected state at the time of upload, and shall confirm that the stored
binary continues to match that record.

Failure to locate a Master Asset in the Object Store constitutes a
critical integrity event requiring immediate platform response.

A Master Asset that is present but cannot be verified against its
expected state constitutes an equal-severity integrity event.

Integrity verification is mandatory platform behaviour and shall not be
treated as optional or deferred.

### Principle 10 — Disaster Recovery

Loss of the Delivery Layer or its cache shall never constitute data loss.

Every Dynamic Derivative is fully reproducible from the Master Asset alone.

No Dynamic Derivative shall be used as a source for disaster recovery.

All disaster recovery procedures shall begin from the Object Store.

### Principle 11 — Viewing and Downloading Are Architecturally Distinct

Viewing and downloading represent different architectural behaviours with
different requirements.

**Viewing** shall use the Delivery Layer.
Performance, optimisation and responsive delivery are the governing
priorities for viewing.

**Downloading the original** shall serve the Master Asset via authenticated
access to the Object Store directly.
The Delivery Layer shall not be used for archival downloads.
Format conversion, compression and optimisation shall not be applied
to archival downloads.

This separation ensures archival fidelity is never compromised by
the optimisations applied during presentation.

### Principle 12 — Photographer Ownership and Platform Custodianship

The photographer is the lawful owner of every uploaded photograph.

The platform is the custodian — not the owner — of every photographic
asset it stores.

All storage architecture, retention behaviour and deletion behaviour
shall honour this distinction unconditionally.

Platform custodianship ends at the photographer's lawful instruction
to delete.

### Principle 13 — Deletion Behaviour

Deletion of a Canonical Photo by its lawful owner constitutes a permanent
and irreversible removal of the photographic asset from the platform.

The deletion model for photographic assets is Hard Delete.

On deletion, the platform shall remove:

• The Master Asset from the Object Store
• All cached and derived variants from the Delivery Layer
• The Canonical Storage Identifier from the platform database
• Photographic metadata associated with the asset, where appropriate
• All Container references to the deleted Canonical Photo

Soft delete, trash bin and restore mechanisms are not supported for
photographic assets.

The photographer's right to permanently remove their own work is
unconditional.

Temporary infrastructure backups created automatically by cloud providers
are exempt from immediate deletion, provided:

• They operate outside normal application operation.
• They expire according to infrastructure retention policy.
• They are never accessible to application users or platform processes.

Such infrastructure backups do not constitute a recovery mechanism
available within the platform.

### Principle 14 — Storage Scope

This architecture governs still photographic assets only.

Video assets, audio assets and document assets are outside the scope of
this document.

Each non-photographic asset class shall require independent architectural
governance before any storage implementation is undertaken.

---

## STORAGE RESPONSIBILITY MATRIX

| Responsibility | Object Store | Delivery Layer |
| -------------- | :----------: | :------------: |
| Master Asset | ✅ | ❌ |
| System of Record | ✅ | ❌ |
| Permanent Storage | ✅ | ❌ |
| Archival Download Source | ✅ | ❌ |
| Integrity Verification | ✅ | ❌ |
| Disaster Recovery Source | ✅ | ❌ |
| Dynamic Resizing | ❌ | ✅ |
| Format Conversion | ❌ | ✅ |
| Compression & Optimisation | ❌ | ✅ |
| Responsive Image Generation | ❌ | ✅ |
| Watermarking | ❌ | ✅ |
| CDN Edge Cache | ❌ | ✅ |
| Delivery URL Generation | ❌ | ✅ |

A responsibility shall have exactly one architectural owner.

No responsibility shall be duplicated across architectural layers.

---

## UPLOAD LIFECYCLE

The following diagram represents the reference upload workflow.

It describes how the platform handles a new photographic asset from
the point of browser submission through to availability for delivery.

```
Browser
  ↓
Upload Request (authenticated)
  ↓
Object Store — Master Asset written
  ↓
Integrity Verification — Master Asset confirmed present and accessible
  ↓
Database — Canonical Photo record created with Canonical Storage Identifier
  ↓
Delivery Layer — Dynamic Derivatives available on demand
  ↓
Browser — presentation complete
```

This diagram is a reference workflow, not a mandatory implementation
sequence.

Legitimate bulk operations, administrative ingestion, platform migrations
and automated pipelines may follow different internal sequences.

**The following invariant applies under all upload paths without exception:**

> A Canonical Photo record shall not exist in the platform database
> without a corresponding confirmed Master Asset present in the Object Store.

No upload path, migration script, administrative tool or automated process
may create a Canonical Photo record in the database without first confirming
the corresponding Master Asset in the Object Store.

---

## MULTI-LAYER AND MULTI-PROVIDER CONSIDERATIONS

The platform may introduce additional Delivery Layer providers or Object
Store tiers without violating this architecture, provided the following
conditions are satisfied:

• Every Master Asset remains accessible from a single authoritative
  Object Store. No second Object Store shall become a parallel Source
  of Truth.

• No additional storage tier shall become a permanent derivative store.

• The Canonical Storage Identifier shall continue to uniquely and
  unambiguously identify the Master Asset regardless of how many
  storage or delivery tiers exist.

• Additional Delivery Layer providers shall operate in a complementary
  role. The Object Store remains authoritative regardless of how many
  Delivery Layer providers exist.

• Introduction of a secondary Object Store tier for cold archival or
  geographic redundancy is permitted, provided the primary authoritative
  Canonical Storage Identifier continues to identify the Master Asset
  in the primary Object Store.

Multi-layer and multi-provider configurations shall be governed by a
formal architectural decision before implementation and shall not alter
the principles in this document.

---

## CURRENT TECHNOLOGY BINDING

The following table records the current technology binding for each
architectural role defined in this document.

These bindings are descriptive.
They document the current implementation only.
They do not constitute architectural principles.
They are subject to change under the Change Control rules below without
requiring revision of the architectural principles.

| Architectural Role | Current Technology |
| ------------------ | ------------------ |
| Object Store | Cloudflare R2 (bucket: bccuploads) |
| Origin Store | Cloudflare R2 (as referenced by the Delivery Layer) |
| Delivery Layer | ImageKit (endpoint: duynda7oq) |
| Backend | NestJS with Fastify adapter |
| Database | MySQL with Kysely query builder |

---

## RELATIONSHIP TO PHOTO-ARCH-001

PHOTO-ARCH-001 and PHOTO-ARCH-002 are complementary documents governing
different concerns.

Neither document supersedes the other.
Neither document duplicates the other.

| Concern | Governing Document |
| ------- | ------------------ |
| Canonical Photo Identity | PHOTO-ARCH-001 |
| Photo Ownership (Photographer) | PHOTO-ARCH-001 |
| Canonical URL | PHOTO-ARCH-001 |
| Container Architecture | PHOTO-ARCH-001 |
| Viewing Context | PHOTO-ARCH-001 |
| Interaction History | PHOTO-ARCH-001 |
| Future Extensibility | PHOTO-ARCH-001 |
| Master Asset | PHOTO-ARCH-002 |
| Object Store | PHOTO-ARCH-002 |
| Delivery Layer | PHOTO-ARCH-002 |
| Canonical Storage Identifier | PHOTO-ARCH-002 |
| Dynamic Derivatives | PHOTO-ARCH-002 |
| Integrity Verification | PHOTO-ARCH-002 |
| Deletion Behaviour | PHOTO-ARCH-002 |
| Disaster Recovery | PHOTO-ARCH-002 |
| Storage Independence | PHOTO-ARCH-002 |

No concern shall be claimed by both documents.

When a question arises involving both identity and storage, both
documents shall be consulted.
Identity questions are resolved by PHOTO-ARCH-001.
Storage and delivery questions are resolved by PHOTO-ARCH-002.

---

## DOCUMENT HIERARCHY POSITION

```
Governance Layer
  MEM-006 (Membership Constitution)
  MEM-007 (Numbering Constitution)

Platform Layer
  TECH-STACK-FREEZE
  PHASE_ROADMAP

Architecture Layer
  PHOTO-ARCH-001 — Canonical Photo Identity
  PHOTO-ARCH-002 — Photo Storage & Delivery     ← this document
  HUB-ARCH-001   — Hub Component Architecture
  ADMIN-ARCH-001 — Administration Console

Design Layer
  V6 00 BCC Design Principles

Implementation Layer
  CLAUDE.md — Claude Code Operating Contract
```

PHOTO-ARCH-002 sits within the Architecture Layer alongside PHOTO-ARCH-001.

PHOTO-ARCH-002 does not supersede PHOTO-ARCH-001.
PHOTO-ARCH-002 does not supersede TECH-STACK-FREEZE.
PHOTO-ARCH-002 does not supersede MEM-006 or MEM-007.

PHOTO-ARCH-002 supersedes any informal storage or delivery decisions
made prior to this document.

---

## CHANGE CONTROL

### Architectural Principles

Changes to the architectural principles of this document require:

1. Human Authority approval
2. A new versioned document (v1.1 or v2.0 as appropriate)
3. Updated references in SOURCE_INDEX.md and CLAUDE.md

### Current Technology Binding

Changes to the Current Technology Binding section require:

1. Human Authority approval
2. A formal update to the Current Technology Binding section of this document
3. Confirmation that all architectural principles continue to be satisfied
   under the new binding

Changing a technology binding does not require a version increment to the
architectural principles themselves, provided those principles are
unaffected by the change.

Changes to technology bindings shall not require revision of the architectural principles provided the constitutional responsibilities defined by this document continue to be satisfied.

---

## DOCUMENT STATUS

PHOTO-ARCH-002 v1.0 is hereby declared the authoritative constitutional
architecture governing the storage and delivery of photographic assets
within the BCC Unified Platform.

All future implementation involving photographic storage, delivery,
optimisation, integrity verification or deletion shall conform to
this document.

Architectural changes require formal revision of PHOTO-ARCH-002.

---

Revision History

v1.0 — 2026-07-15 — Initial constitutional freeze.
