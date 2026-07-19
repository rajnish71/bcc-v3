# NATURE-ARCH-001
## Nature Engine Architecture & Constitution
### Birds of Bhopal — Reference Implementation

---

| Field | Value |
|---|---|
| **Document ID** | NATURE-ARCH-001 |
| **Status** | FROZEN |
| **Version** | 1.0.0 |
| **Authority** | BCC Platform |
| **Reference Implementation** | Birds of Bhopal |
| **Seed Dataset** | 543 records · ~480 canonical species · Madhya Pradesh |

---

> **Constitutional Standing.** This document carries equal authority to MEM-006, MEM-007, HUB-ARCH-001, and PHOTO-ARCH-001. No implementation of the Nature Engine, no data model change, and no public API contract may contradict what is established here without a formal constitutional amendment. The Birds of Bhopal module is the reference implementation; all future Nature modules (Butterflies, Dragonflies, Mammals, Trees, etc.) are constitutional extensions of this engine, not separate systems.

---

## Table of Contents

**Prefacing Analysis**
- [Phase 1 — Architectural Review of the Seed Workbook](#phase-1--architectural-review-of-the-seed-workbook)
- [Phase 2 — Domain Model Discovery](#phase-2--domain-model-discovery)

**Constitutional Sections**
- [§1 Vision, Mission & Strategic Intent](#1-vision-mission--strategic-intent)
- [§2 Core Architectural Principles](#2-core-architectural-principles)
- [§3 Complete Domain Model](#3-complete-domain-model)
- [§4 Classification Engine](#4-classification-engine)
- [§5 Species Repository](#5-species-repository)
- [§6 Observation Engine](#6-observation-engine)
- [§7 Verification Engine](#7-verification-engine)
- [§8 Import Engine](#8-import-engine)
- [§9 Database Architecture](#9-database-architecture)
- [§10 Search Architecture](#10-search-architecture)
- [§11 Species Pages](#11-species-pages)
- [§12 Location Pages](#12-location-pages)
- [§13 Photographer Nature Profile](#13-photographer-nature-profile)
- [§14 Projects](#14-projects)
- [§15 Analytics](#15-analytics)
- [§16 Roles & Permissions](#16-roles--permissions)
- [§17 API Architecture](#17-api-architecture)
- [§18 Performance Architecture](#18-performance-architecture)
- [§19 Future Expansion](#19-future-expansion)

---

# Phase 1 — Architectural Review of the Seed Workbook

Before any architecture can be designed, the seed data must be critically examined. The workbook *Birds of MP — Proper Classification* is the proposed foundation for the Nature Engine's canonical species repository. It contains 543 rows across three sheets: Master Table (9 columns), Master with Habitat and Food (11 populated columns), and Classification Explained (a business glossary). This review identifies structural defects that, if carried forward unchanged into the production data model, would cause permanent architectural harm.

This review is not a criticism of the curator's effort — the workbook is a serious and well-intentioned knowledge artefact. It is a critique of the data model assumptions embedded within it, evaluated against the requirements of a long-lived enterprise platform.

---

### Finding 1 — CRITICAL: Compound Observation Records Are Not Species

**63 of 543 rows represent uncertain observations, not canonical species.**

The workbook contains 63 entries such as *"Taiga/Red-breasted Flycatcher"* with a scientific name of *"Ficedula albicilla / Ficedula parva"*. These records encode a real-world situation: a photographer photographed a bird but could not confirm definitively which of two species it was.

Treating these as species in a canonical repository is a category error. A species is a biological taxon with a single scientific name, a single eBird code, and a single IUCN record. A compound name with a slash is not a species — it is an observation with an unresolved identification. It belongs in the Observation Engine, not the Species Repository.

The existence of one hybrid record (*"White-throated × Spot-breasted Fantail"*) requires separate modelling — hybrids are a distinct biological concept with their own type in the domain model.

> **Architectural ruling:** Remove all 63 compound entries from the species canonical list. The ~480 remaining entries represent true species. Compound entries become the founding observation records for each species pair, placed in the Observation Engine with identification status `AMBIGUOUS`. The hybrid entry receives a dedicated `HybridRecord` type referencing both parent species.

---

### Finding 2 — CRITICAL: Feeding Behaviour Is Over-Specified and Under-Normalized

**95+ unique feeding strings create an unmaintainable classification system.**

The Feeds column contains over 95 distinct string values. The granularity is admirable for scientific accuracy but the encoding is structurally wrong for a database. Each value encodes multiple independent facts as a single free-text composite.

No two curators writing this independently would produce the same string for the same species. The ordering matters (*"Carnivore (Small Mammals, Birds)"* vs *"Carnivore (Birds, Small Mammals)"* appear as different values). The parenthetical structure cannot be queried. Filtering for "all piscivores" requires substring matching across dozens of distinct strings, not an index lookup.

Additionally, the glossary sheet defines distinct conceptual tiers (primary feeding strategy, prey type, hunting method) which are conflated into a single string rather than modelled as separate attributes.

> **Architectural ruling:** The feeding dimension requires a two-tier normalized model. Tier 1 is a primary `TrophicCategory` (seven values: Carnivore, Insectivore, Piscivore, Herbivore, Granivore, Omnivore, Scavenger). Tier 2 is a set of `PreyType` tags drawn from a controlled vocabulary. A species can have one primary trophic category and multiple prey type tags. Hunting method (Aerial, Ground, Aquatic) is a third optional attribute. This three-field model captures all 95 current string values faithfully.

---

### Finding 3 — CRITICAL: Migration Status Conflates Two Independent Dimensions

**"Rare" and "Vagrant/Rare" conflate occurrence frequency with migration pattern.**

The Migrant Status column conflates two orthogonal biological concepts. **Migration pattern** describes the species' relationship to the geography across seasons (Resident, Summer Migrant, Winter Migrant, Passage Migrant). **Occurrence frequency** describes how reliably the species is found there (Common, Uncommon, Rare, Vagrant, Accidental). These are independent. A Resident can be Rare. A Winter Migrant can be Common.

The compound status values *"Resident / Winter Migrant"* and *"Winter Migrant / Resident"* appearing as separate strings (meaning the same thing) also indicate the single-column approach is failing.

> **Architectural ruling:** Model these as two separate, normalized fields. `migration_pattern`: Resident | Summer Migrant | Winter Migrant | Passage Migrant | Vagrant. `occurrence_frequency`: Common | Uncommon | Rare | Casual | Accidental.

---

### Finding 4 — CRITICAL: Geography Is Too Coarse to Be Useful

**Binary Bhopal/Rest-of-MP geography cannot support location features.**

The Geography column contains only two values: *"Bhopal"* (378 records) and *"Rest of MP"* (165 records). This binary encoding cannot support location pages, hotspot maps, locality-based filtering, or migration corridor analysis. "Rest of MP" is a residual catch-all providing no meaningful geographic information.

> **Architectural ruling:** The Geography field maps to `distribution_scope`, a coarse initial attribute. Production location data is managed through the Location entity hierarchy (Country → State → District → City → Named Locality → Named Spot). The workbook geography values are import-time hints that seed the initial distribution scope. They are not the production geographic model.

---

### Finding 5 — WARN: Incomplete Taxonomic Hierarchy (Order Is Missing)

**The Order rank is absent, making taxonomy incomplete for search and navigation.**

Standard Linnaean taxonomy for birds runs: Class (Aves) → Order (e.g. Passeriformes) → Family → Genus → Species. The workbook jumps directly from eBird Classification Group to Family (Scientific) to Scientific Name, omitting Order entirely. Without Order, taxonomic navigation and standard checklist synchronization are impossible.

> **Architectural ruling:** Order is a required rank in the Taxonomy entity. During import, the system resolves Order from the Family (Scientific) name against the eBird or IOC master taxonomy automatically — no curator work is required.

---

### Finding 6 — WARN: No External Species Identifiers

**Absence of eBird species codes, IOC numbers, or GBIF taxon keys blocks external integration.**

The workbook references eBird classification group names but contains no machine-readable species identifiers. Without these anchors, synchronization with external databases and citizen science data exchanges are impossible.

> **Architectural ruling:** The Species entity carries an `ExternalReference` collection storing one record per recognized external authority (eBird, IOC, GBIF, BirdLife). External IDs are resolved by scientific name match during import.

---

### Finding 7 — WARN: Two Conflicting Habitat Taxonomies

**The Classification Explained sheet defines a habitat taxonomy that does not match the values used in the data.**

The glossary defines 8 habitat categories; the actual data uses 16 distinct values. These two habitat ontologies were independently evolved and were never reconciled.

> **Architectural ruling:** Adopt the 16-value fine-grained vocabulary from the data column as the canonical habitat taxonomy. The 8 meta-categories from the glossary become a `HabitatGroup` parent layer, enabling two-level navigation.

---

### Finding 8 — WARN: Conservation Status Contains Uncertainty Composites

**"EN / VU" and "NT / LC" encode assessor uncertainty as slash-separated strings.**

These indicate situations where global vs. regional IUCN status differs, or where assessor certainty was limited.

> **Architectural ruling:** The Species entity stores two conservation status fields: `iucn_global_status` and `iucn_regional_status` (India Red List). Both are single IUCN category codes. Compound slash values are import-time flags that trigger a curator review workflow.

---

### Finding 9 — NOTE: Broad Classification Is Ecological Grouping, Not Taxonomy

**Broad Classification is a valid and useful BCC-defined browse aid — but must not be confused with scientific taxonomy.**

"Raptor" spans multiple unrelated orders (Accipitriformes, Falconiformes, Strigiformes). "Waterbird" spans Anseriformes, Podicipediformes, Pelecaniformes, and others.

> **Architectural ruling:** The BCC Browse Classification is a named classification scheme with authority `BCC` and a fixed 6-value controlled vocabulary. It exists alongside, but independent of, the scientific taxonomy.

---

### Finding 10 — NOTE: No Source Authority or Version Information

**The workbook cites no taxonomic authority and carries no version number.**

Taxonomy is not static — species are regularly split, lumped, or reclassified. Without a baseline authority version, future updates cannot be reconciled.

> **Architectural ruling:** The Import Engine records the authority and version used at the time of each import (e.g., eBird Taxonomy v2024, IOC 14.1) in the `ImportBatch` record.

---

### Finding 11 — NOTE: Family (Common) Is a BCC Vernacular, Not a Scientific Rank

**110 unique "Family (Common)" values do not map 1:1 to Families (Scientific).**

The workbook groups all flycatchers together regardless of scientific family (Muscicapidae, Stenostiridae, Rhipiduridae are separate scientific families but all called "Flycatcher"). This is a useful navigation grouping but not a scientific classification.

> **Architectural ruling:** Family (Common) becomes a separate `VernacularGroup` classification scheme with BCC authority and approximately 110 values, stored separately from Family (Scientific).

---

# Phase 2 — Domain Model Discovery

Before naming tables or designing APIs, the correct enterprise domain model must be discovered from the underlying reality of the problem.

### What Is Scientific Taxonomy
Scientific taxonomy is the formal classification of living things by an external international authority. For birds, the primary authorities are the **IOC World Bird List** and **eBird/Clements taxonomy**. BCC stores them as reference data. BCC does not author taxonomy — it consumes it.

### What Is a Species Attribute
A stable biological fact about a species that does not vary by observer, location, or time within a reasonable window. Migration pattern, trophic category, body size range, and primary habitat type are species attributes.

### What Is a Classification Scheme
A named, authored system for assigning species to categories for a specific purpose. BCC operates multiple independent schemes simultaneously. A scheme has: an authority (BCC, IUCN, eBird), a purpose, a controlled value set, and cardinality rules.

### What Is a Trait
A specific measurable or observable characteristic: plumage coloration, beak shape, wing shape, call type, nest type, breeding season. Reserved for a future trait enrichment phase.

### What Is a Behaviour
An observed activity pattern: flocking, territorial display, migration timing, feeding method in action. Behaviours are partly species-level (reference data) and partly observation-level (evidence data).

### What Is Observation Data
Evidence of a species' presence at a specific time and place, captured by a specific person. The primary unit of community contribution. Evidence (photograph, GPS, timestamp) is immutable; identifications built on top of evidence can evolve.

### What Is Evidence
The raw material supporting an identification claim: photograph, audio recording, GPS data. Evidence is immutable after submission.

### What Is Derived Information
Computed from primary data and cannot be independently authored. Species count, life list completeness, rarity index, contributor ranking — these are never stored as authoritative data. They are materialized views and computed statistics.

### What Belongs to External Authorities
Scientific names and their authors, taxonomic hierarchy, IUCN Red List categories, eBird species codes, IOC sequence numbers, GBIF taxon keys.

### What Belongs to BCC
BCC Browse Classification, vernacular group names, local common names, Bhopal distribution records, habitat assessments for the Bhopal region, community observation data, photographer profiles, project definitions, and all user-generated content.

---

# §1 Vision, Mission & Strategic Intent

## Vision

To build the most authoritative, community-curated, photographically evidenced biodiversity knowledge platform for Central India — one that transforms BCC members' observations into a permanent scientific record while making nature discovery joyful and accessible to the public.

The Nature Engine is not a gallery with species tags. It is a knowledge system where every photograph is evidence, every identification is a scientific claim, and every verified record contributes to the understanding of Madhya Pradesh's biodiversity over time.

## Mission

To provide BCC with a reusable, extensible infrastructure that supports multiple biodiversity modules — beginning with Birds of Bhopal — through a single coherent architecture. Every module built on the Nature Engine shares the same observation workflow, verification system, classification engine, search infrastructure, and analytics pipeline. The engine scales from a single species group to the full breadth of MP's documented biodiversity without structural redesign.

## Guiding Principles

| Principle | Statement |
|---|---|
| **Evidence First** | Every species record on the public platform must be supported by at least one verified photograph. Unconfirmed species entries are held in a pending state invisible to the public until evidence is attached and verified. |
| **Science Over Convention** | Where a popular common name conflicts with scientific consensus, scientific consensus governs. BCC's curatorial decisions are explicitly labelled as BCC-authored rather than presented as scientific fact. |
| **Community Over Curation** | The system starts with a curated seed dataset but is designed to receive continuous community contributions. Curator intervention is the exception; community consensus is the norm. |
| **Immutable History** | Observations, identifications, and verifications are never deleted. They may be superseded or hidden, but the record of what was submitted, by whom, and when, persists permanently in the audit log. |
| **Module Reuse** | Every architectural decision is evaluated against future modules. An architecture that works for birds but requires redesign for butterflies has failed. |
| **Locality Over Generality** | The platform's primary value is hyper-local knowledge: what species are in Bhopal's Van Vihar in December? Global databases provide global data. BCC provides local precision that global databases cannot match. |
| **Separation of Concerns** | Scientific taxonomy, BCC classification, observation evidence, community identification, and derived statistics are kept in rigorously separate layers. |
| **No Silent Derivation** | Derived statistics are never stored alongside primary data as if they were authored facts. They are always computed, cached with a timestamp, and clearly distinguished in API responses. |

## Scope & Boundaries

**In Scope — Version 1 (Birds of Bhopal):** Canonical species repository for birds of Madhya Pradesh (~480 confirmed species). Observation submission, identification, community review, and expert verification. Species pages, location pages, photographer nature profiles with life lists. Administrative import and curation tools. Search, analytics, statistics. Projects framework.

**In Scope — Future Phases:** Additional Nature Modules (Butterflies, Dragonflies, Mammals, Trees, Plants, Fungi, Reptiles). Audio identification. AI-assisted species identification. GBIF and eBird integration. Citizen science export. Mobile applications.

**Out of Scope — Permanently:** Replacing or competing with global platforms (iNaturalist, eBird, GBIF). General-purpose citizen science unrelated to BCC's photography focus. Commercial licensing of data without explicit constitutional amendment. Species records for which BCC has no photographic evidence.

## Long-term Strategy

Phase 1 establishes the engine with Birds of Bhopal using the seed dataset of ~480 confirmed species. The primary objective is to get the domain model correct — not to maximize public-facing features.

Phase 2 adds a second Nature Module (recommended: Butterflies of Bhopal) to prove the reusability claim and surface any domain model assumptions that were accidentally bird-specific.

> **Constitutional Ruling:** The expansion to a second Nature Module must occur before the Nature Engine architecture is considered stable. The first module always encodes hidden assumptions. The second module forces those assumptions into the open. Do not freeze the domain model as a constitution until at least one successful second-module implementation validates the extensibility claims.

---

# §2 Core Architectural Principles

| Principle | Statement |
|---|---|
| **Scientific Truth** | Taxonomy, conservation status, and species attributes sourced from external authorities are marked with their authority and version. They are not overridden by local curation except through a documented exception workflow. |
| **Immutable Evidence** | A submitted observation's core evidence — photograph, timestamp, GPS — cannot be modified after submission. Identifications can change; the evidence cannot. |
| **Versioned Knowledge** | The species repository and all classification schemes carry version numbers. A taxonomy update triggers a versioned update event, not a silent overwrite. |
| **Eventual Verification** | No observation is expected to remain unverified forever. The system implements escalating review: community first, then Senior Identifier, then Curator. |
| **Full Audit Trail** | Every state transition is recorded with: actor, timestamp, previous state, new state, and reason. The audit trail is write-only and not editable by any user including administrators. |
| **Normalization Over Convenience** | Classification data is normalized into scheme-value lookup tables, not stored as free-text strings on species records. |
| **Statistics Are Derived** | Species counts, observation totals, life list sizes, and any other aggregate are never stored as authoritative fields on primary entities. They are computed by background jobs and stored in statistics tables. |
| **Performance Through Materialization** | Expensive computations are pre-computed and stored in materialized summary tables. No public page performs aggregate queries against the primary observation table at request time. |
| **Module Isolation** | Each Nature Module is isolated at the data level through a `nature_module` discriminator. Species from different modules do not share taxonomic lineage tables. |
| **Technology Freeze** | The Nature Engine is built on the platform's frozen stack: NestJS + Fastify, Kysely, MySQL 8, Astro, Cloudflare R2, ImageKit. No additional standing process is introduced. |

---

# §3 Complete Domain Model

Every named concept in implementation must correspond to one of these entities or be explicitly derived from them. New entities may only be introduced through a constitutional amendment process.

## Core Species Entities

### `NatureModule`
The top-level discriminator for all nature-related content. Each module (Birds, Butterflies, Dragonflies, Trees, etc.) is a separate NatureModule record. All species, observations, projects, and statistics belong to a module. The module defines which classification schemes are applicable and which taxonomy authority is used.

**Key fields:** `module_key`, `display_name`, `taxonomy_authority`, `taxonomy_version`, `is_active`

---

### `TaxonomicNode`
A single node in the Linnaean hierarchy. One record per rank-name combination (e.g., Order=Passeriformes, Family=Muscicapidae). Nodes form a parent-child tree. Species-level nodes link to the Species entity. Authority and version are stored on every node to support taxonomy updates.

**Key fields:** `rank`, `scientific_name`, `authority_author`, `authority_year`, `parent_node_id`, `ebird_code`, `ioc_number`, `gbif_taxon_key`

---

### `Species`
The canonical record for a single biological species within a NatureModule. Links to its TaxonomicNode (species rank). Stores species-level attributes that are stable and scientifically attributed. Does NOT store observation-derived statistics.

**Key fields:** `primary_common_name`, `local_names (JSON)`, `taxonomic_node_id`, `module_id`, `iucn_global_status`, `iucn_regional_status`, `migration_pattern`, `occurrence_frequency`, `distribution_scope`, `slug`, `is_published`, `feature_photo_id`

---

### `SpeciesSynonym`
Historical scientific names and alternative common names. Enables search to find a species by obsolete names. Includes an authority reference explaining why the name was superseded.

**Key fields:** `species_id`, `synonym_name`, `name_type`, `language`, `is_searchable`

---

### `HybridRecord`
Represents a documented hybrid between two species within the same NatureModule. Not a species itself — references two parent Species records. Has its own observation workflow but is never added to life lists.

**Key fields:** `parent_species_a_id`, `parent_species_b_id`, `hybrid_formula`, `documentation_notes`

---

### `TrophicProfile`
The normalized feeding ecology record for a species. Replaces 95+ free-text feeding strings with a structured three-field model. Primary trophic category is a controlled 7-value enum.

**Key fields:** `species_id`, `primary_trophic_category`, `foraging_method`, `notes`

---

### `TrophicPreyType`
Junction table linking a TrophicProfile to specific prey type values from a controlled vocabulary. A species can have multiple prey types ordered by dietary importance (primary, secondary, occasional).

**Key fields:** `trophic_profile_id`, `prey_type_id`, `importance_rank`

---

### `ExternalReference`
Links a Species or TaxonomicNode to an identifier in an external database (eBird, GBIF, BirdLife, IOC). One record per authority per species.

**Key fields:** `entity_type`, `entity_id`, `authority`, `external_id`, `external_url`, `verified_at`

---

## Classification Entities

### `ClassificationScheme`
A named, versioned system for assigning species to categories for a specific purpose. Each scheme has an authority, a cardinality rule, and a module scope.

**Key fields:** `scheme_key`, `authority`, `is_multi_value`, `module_scope`, `version`, `is_searchable`

---

### `ClassificationValue`
A single value within a ClassificationScheme. Values have display labels, short codes, sort orders, optional parent values (for hierarchical schemes), and descriptions.

**Key fields:** `scheme_id`, `value_code`, `display_label`, `description`, `parent_value_id`, `sort_order`, `is_active`

---

### `SpeciesClassification`
Junction table assigning a species to a value within a scheme. The primary mechanism by which all species classifications are stored. Records include the assigning authority and a confidence level.

**Key fields:** `species_id`, `scheme_id`, `value_id`, `assigned_by`, `confidence`, `assigned_at`, `notes`

---

## Observation & Verification Entities

### `Observation`
The primary unit of community contribution. One photographer, one location, one point in time. Its core evidence (location, timestamp, submitter) is immutable after submission.

**Key fields:** `module_id`, `submitter_id`, `observed_at`, `location_id`, `gps_lat`, `gps_lng`, `gps_accuracy_m`, `field_notes`, `lifecycle_state`, `submitted_at`

---

### `ObservationMedia`
A single piece of photographic evidence attached to an Observation. Media is immutable after upload — it can be superseded (a better photo added) but the original record persists.

**Key fields:** `observation_id`, `photo_asset_id`, `media_type`, `exif_captured_at`, `exif_camera`, `exif_lens`, `is_primary`, `quality_score`, `uploaded_at`

---

### `SpeciesIdentification`
A claim, made by a specific user at a specific time, that the subject of an Observation is a specific Species. Multiple identifications can exist per observation, from different users.

**Key fields:** `observation_id`, `identified_species_id`, `alternate_species_id`, `identifier_id`, `confidence_level`, `identification_notes`, `identification_state`, `identified_at`

---

### `VerificationRecord`
A formal verdict by a qualified verifier on the accepted identification for an observation. Records the reasoning, the qualifying role at time of verification, and the final accepted species.

**Key fields:** `observation_id`, `verified_species_id`, `verifier_id`, `verifier_role_at_time`, `verification_verdict`, `reasoning`, `verified_at`, `is_final`

---

### `ObservationLifecycleEvent`
The immutable audit log for every state transition. Write-only. Records: previous state, new state, triggering actor, actor's role, timestamp, and optional note.

**Key fields:** `observation_id`, `from_state`, `to_state`, `actor_id`, `actor_role`, `event_note`, `occurred_at`

---

### `IdentificationConflict`
Recorded when two or more identifications reach conflicting conclusions and cannot be resolved by normal community consensus. Triggers escalation.

**Key fields:** `observation_id`, `conflicting_id_a`, `conflicting_id_b`, `conflict_detected_at`, `escalation_level`, `resolved_at`, `resolution_notes`

---

## Location Entities

### `LocationNode`
A node in the geographic hierarchy. Self-referential adjacency list. Ranks: Country, State, District, City, Zone, Named Locality, Named Spot.

**Example hierarchy:** India → Madhya Pradesh → Bhopal District → Bhopal City → Van Vihar National Park

**Key fields:** `location_rank`, `display_name`, `slug`, `parent_id`, `centroid_lat`, `centroid_lng`, `bbox_ne_lat`, `bbox_sw_lng`, `is_hotspot`, `habitat_notes`

---

### `LocationHabitat`
Junction table associating a LocationNode with one or more ClassificationValues from the Habitat Scheme.

**Key fields:** `location_id`, `habitat_value_id`, `is_dominant`, `coverage_pct`

---

## Community, Projects & Statistics Entities

### `NatureContributor`
The Nature Engine's view of a BCC member. Extends the platform user identity with nature-specific profile data.

**Key fields:** `user_id` (FK → users), `display_name`, `bio`, `preferred_modules`, `expertise_level`, `total_observations`, `is_identifier`

---

### `LifeListEntry`
Records that a contributor has a verified observation of a specific species. Created automatically when an observation reaches Verified state. Never manually authored.

**Key fields:** `contributor_id`, `species_id`, `module_id`, `first_verified_observation_id`, `achieved_at`, `is_contested`

---

### `NatureProject`
A curated collection of species, locations, and observations organized around a specific goal.

**Key fields:** `module_id`, `project_key`, `title`, `description`, `start_date`, `end_date` (nullable), `project_type`, `is_active`, `lead_curator_id`

---

### `SpeciesStatistics` *(materialized)*
Pre-computed aggregate statistics for a species within a module. Never edited directly. Rebuilt by background jobs when observation data changes.

**Key fields:** `species_id`, `module_id`, `total_observations`, `verified_observations`, `unique_contributors`, `first_recorded_at`, `last_recorded_at`, `monthly_distribution (JSON)`, `computed_at`

---

### `LocationStatistics` *(materialized)*
Pre-computed aggregate statistics for a location node.

**Key fields:** `location_id`, `module_id`, `total_species`, `total_observations`, `unique_contributors`, `species_by_month (JSON)`, `computed_at`

---

### `ContributorStatistics` *(materialized)*
Pre-computed aggregate statistics for a contributor within a module.

**Key fields:** `contributor_id`, `module_id`, `life_list_count`, `verified_observations`, `rare_species_count`, `locations_visited`, `contribution_rank`, `computed_at`

---

### `ImportBatch`
A record of a workbook or CSV import event. Enables complete audit of how the canonical species repository was populated.

**Key fields:** `module_id`, `import_type`, `source_file_ref`, `taxonomy_authority`, `taxonomy_version`, `total_rows`, `created_count`, `updated_count`, `skipped_count`, `error_count`, `can_rollback`, `imported_by`, `imported_at`

---

### `SearchIndex`
Denormalized search data for species, built from the primary species record, taxonomy, classification values, and synonyms. Rebuilt after any change to a species. Implemented as MySQL virtual/generated columns table with FULLTEXT indexes.

**Key fields:** `entity_type`, `entity_id`, `module_id`, `search_text (FULLTEXT)`, `facet_json`, `sort_rank`, `indexed_at`

---

# §4 Classification Engine

The Classification Engine replaces the flat-column approach of the seed workbook with a normalized, extensible, multi-scheme framework. Every classification in the system flows through this engine.

> **Governing Rule:** A classification scheme is an independent dimension. Changing a species' habitat classification must not affect its migration classification. Different schemes can have different cardinalities, different authorities, and different update frequencies. They are never stored as columns on the Species table — they are always stored as `SpeciesClassification` junction records.

---

## Scheme 1 — Scientific Taxonomy (External Authority)

**Authority:** IOC World Bird List / eBird Clements (module-configured)  
**Cardinality:** Single path (one Order, one Family, one Genus per species)  
**BCC Role:** Consumer, not author  
**Update Protocol:** When the authority releases a new checklist version, a Taxonomy Update workflow runs. Changes are diff-computed, reviewed by a Curator, and applied as a versioned batch. Historical records reference the previous taxonomy version.

```
Kingdom:  Animalia
  Phylum:   Chordata
    Class:    Aves
      Order:    Passeriformes
        Family:   Muscicapidae
          Genus:    Ficedula
            Species:  Ficedula parva (Bechstein, 1792)
```

---

## Scheme 2 — Migration Status (Two Independent Fields)

**Authority:** BCC (based on field observations and regional checklists)

**Field 1 — `migration_pattern`** (single-value):

| Code | Label | Definition |
|---|---|---|
| `RESIDENT` | Resident | Present year-round; breeds locally |
| `WINTER` | Winter Migrant | Arrives Oct–Feb; breeds elsewhere |
| `SUMMER` | Summer Migrant | Arrives Mar–Sep; breeds locally |
| `PASSAGE` | Passage Migrant | Passes through seasonally; does not breed or winter here |
| `VAGRANT` | Vagrant | Arrives out of normal range; occurrence is irregular |

**Field 2 — `occurrence_frequency`** (single-value, independent of migration pattern):

| Code | Label | Definition |
|---|---|---|
| `COMMON` | Common | Reliably encountered on most visits to suitable habitat |
| `UNCOMMON` | Uncommon | Seen on many visits but not guaranteed |
| `RARE` | Rare | Recorded fewer than annually on average |
| `CASUAL` | Casual | Fewer than five credible records total |
| `ACCIDENTAL` | Accidental | Single or two records; not expected to recur |

---

## Scheme 3 — Conservation Status (IUCN)

**Authority:** IUCN Red List (`iucn_global_status`); Wildlife Institute of India (`iucn_regional_status`)  
**Cardinality:** Single value per field  
**Controlled Vocabulary:** EX | EW | CR | EN | VU | NT | LC | DD | NE  
No compound or slash values are stored. The two fields handle the global/regional split that previously required slash encoding.

---

## Scheme 4 — Habitat Classification (Canonical Taxonomy)

**Authority:** BCC (derived empirically from the seed workbook's actual data values)  
**Cardinality:** Multi-value — a species can occupy multiple habitats  
**Structure:** Two-tier — HabitatGroup (broad) → HabitatType (specific)

| HabitatGroup | Code | Label |
|---|---|---|
| Woodland | `WOOD_FOREST_EDGE` | Woodland / Forest Edge |
| Woodland | `WOOD_SCRUB` | Woodland / Scrub |
| Scrubland | `SCRUB_FARMLAND` | Scrub / Farmland |
| Grassland | `GRASS_OPEN` | Grassland |
| Grassland | `GRASS_FARMLAND` | Grassland / Farmland |
| Grassland | `OPEN_FARMLAND` | Open Country / Farmland |
| Urban | `URBAN_HABITATION` | Urban / Human Habitation |
| Urban | `URBAN_FARMLAND` | Urban / Farmland |
| Wetland | `WETLAND_LAKE` | Wetland / Lake |
| Wetland | `WETLAND_MARSH` | Wetland / Marsh |
| Wetland | `WETLAND_RIVER` | Wetland / River |
| Rocky | `ROCKY_HILLS` | Rocky Hills / Cliffs |
| Rocky | `ROCKY_OPEN` | Rocky / Open Country |
| Farmland | `FARM_GRASS` | Farmland / Grassland |
| Coastal | `COASTAL_MARINE` | Coastal / Marine |
| Rocky | `ROCKY_CLIFFS` | Rocky / Cliffs |

---

## Scheme 5 — Trophic Classification (Normalized Three-Field Model)

**Authority:** BCC

**Primary Trophic Category** (single-value, required):
`Carnivore` | `Insectivore` | `Piscivore` | `Herbivore` | `Granivore` | `Omnivore` | `Scavenger`

**Prey Types** (multi-value, from controlled vocabulary): Fish | Rodents | Small Birds | Large Birds | Reptiles | Amphibians | Insects | Aquatic Invertebrates | Terrestrial Invertebrates | Worms | Crustaceans | Molluscs | Seeds | Fruits | Nectar | Aquatic Plants | Carrion | Wasps/Bees | Human Scraps

**Foraging Method** (single-value, optional): Aerial | Ground | Aquatic | Bark-gleaning | Nectaring | Probing | Filter-feeding | Sallying | Soaring-pursuit

> **Implementation Note:** The 95+ free-text strings from the seed workbook must be algorithmically mapped to this three-component model during import. A mapping table is maintained in the Import Engine for all known string values. Unmapped strings are flagged for manual curator review rather than being imported verbatim.

---

## Scheme 6 — BCC Browse Classification

**Authority:** BCC | **Cardinality:** Single-value | **Purpose:** Navigation by lay observers

| Code | Label | Description |
|---|---|---|
| `ARBOREAL` | Arboreal / Perching | Birds mainly seen on trees, wires, poles or flying between perches |
| `BUSH` | Bush / Understory | Birds mostly found in dense bushes, reeds, tall grass and lower vegetation |
| `RAPTOR` | Raptor | Birds of prey that hunt using talons and a hooked beak |
| `TERRESTRIAL` | Terrestrial / Ground | Birds that spend most of their time walking or running on land |
| `WATERBIRD` | Waterbird / Swimming | Birds adapted to swim and float on water |
| `WADER` | Wetland / Wader | Birds that walk in shallow water or mud along wetland edges |

---

## Scheme 7 — BCC Vernacular Group (Family Common Names)

**Authority:** BCC | **Cardinality:** Single-value | **Purpose:** Intuitive navigation grouping

The ~110 "Family (Common)" values from the workbook (Kingfisher, Flycatcher, Raptor, Heron/Egret, etc.) are stored as a BCC-curated vernacular grouping scheme, completely separate from the scientific Family rank. Labelled as "BCC Vernacular Group" in all interfaces.

**Cardinality Enforcement:** For single-value schemes, a `UNIQUE` constraint on `(species_id, scheme_id)` in the SpeciesClassification table ensures only one value can be assigned per species per scheme.

---

# §5 Species Repository

The Species Repository is the canonical source of truth for all species known to the Nature Engine. It is a governed, versioned, evidence-backed knowledge store where every entry carries scientific authority and every change is audited.

## Canonical Species Record Lifecycle

```
Species Proposed
    ↓ Taxonomy Resolution (automated)
Classification Assignment
    ↓
Duplicate Detection
    ↓
Curator Review
    ↓
Published (awaiting evidence)
    ↓ First Verified Observation attached
Fully Active — statistics accrue
```

## Scientific Authority Management

When the eBird taxonomy or IOC checklist releases a new version, a Taxonomy Update Job runs: it downloads the new checklist, diffs it against the current repository, and produces a Taxonomy Update Report listing species splits, lumps, renames, and reclassifications. A Curator reviews and approves each change. Species that are split produce two new species records; species that are lumped archive one record and merge its observations onto the surviving record.

## Scientific Name Integrity Rules

> **Hard Constraint:** No two Species records in the same NatureModule may share the same scientific binomial (Genus + species epithet). This constraint is enforced at the database level with a `UNIQUE` constraint on `(module_id, taxonomic_node_id)`. Any import that would create a duplicate triggers an error, not a silent merge.

## Evidence Requirement Policy

A species is published to the public platform only after at least one Verified observation photograph is attached. Species imported from the seed workbook are in `SEED_PUBLISHED` state — they appear on species list pages — but their individual pages display a notice that no member photograph is yet verified. This creates transparent distinction between "we know this species exists in Bhopal" and "a BCC member has photographed and verified it."

## Versioning and Rollback

The Species Repository implements event-sourced change records for high-consequence mutations: taxonomy reclassification, conservation status changes, scientific name changes, and module transfers. The ImportBatch entity enables rollback of a complete import operation by storing the pre-import snapshot of every affected species record.

---

# §6 Observation Engine

The Observation Engine is the workflow subsystem that transforms a raw photograph into a verified, published, statistically-counted species record.

## Lifecycle States

```
DRAFT → SUBMITTED → NEEDS_IDENTIFICATION / IDENTIFICATION_PENDING
    → COMMUNITY_CONSENSUS → EXPERT_REVIEW
    → VERIFIED → PUBLISHED
    (terminal: REJECTED | UNRESOLVABLE | WITHDRAWN)
```

## State Definitions

| State | Description |
|---|---|
| `DRAFT` | Member uploads photo(s), fills basic fields. Not yet visible to community. |
| `SUBMITTED` | Evidence locked. Immutable from this point. Auto-validation runs. |
| `NEEDS_IDENTIFICATION` | Member left species blank. Open for community identifiers. |
| `IDENTIFICATION_PENDING` | Member provided species. Awaiting community confirmation. |
| `COMMUNITY_CONSENSUS` | 2+ identifiers agree. Escalates to expert review if species rarity requires it. |
| `EXPERT_REVIEW` | Escalated to Senior Identifier or Curator. |
| `VERIFIED` | Accepted identification confirmed. Life list updated. Statistics queued for rebuild. |
| `PUBLISHED` | Visible on species page, location page, contributor profile. |
| `REJECTED` | Evidence determined insufficient or identification invalid. Terminal state. |
| `UNRESOLVABLE` | Conflict cannot be resolved. Not counted in statistics. Terminal state. |
| `WITHDRAWN` | Submitter withdrew before verification. Hidden from public; preserved in audit. |

## Identification Thresholds by Rarity

| Occurrence Frequency | Min. Identifiers | Expert Review Required | Auto-publish after verify |
|---|---|---|---|
| COMMON | 1 (submitter's own) + 1 community | No | Yes |
| UNCOMMON | 2 community identifiers | No | Yes |
| RARE | 2 community + 1 Senior Identifier | Yes | Curator approval required |
| CASUAL / ACCIDENTAL | 1 Senior Identifier + 1 Curator | Mandatory | Curator approval required |

## Ambiguous Identification Handling

When a submitter cannot determine the species with certainty, they may submit an identification with two candidate species and a confidence level of AMBIGUOUS. This directly models the 63 compound records from the seed workbook within the correct domain layer. If no consensus is reached, the observation is stored with state `UNRESOLVABLE` with both candidate species recorded, and counted against neither species for statistics purposes.

## Evidence Immutability

Once an observation reaches SUBMITTED state, the following fields are permanently locked: `submitter_id`, `observed_at`, `gps_lat`, `gps_lng`, and all ObservationMedia records already attached. A submitter may attach additional photos while the observation is in `NEEDS_IDENTIFICATION` or `IDENTIFICATION_PENDING`, but may not remove already-submitted photos.

## First Record Detection

When an observation is verified and the species has no prior verified observations at the same location node, a First Record event is raised. The system records `first_recorded_at` on the LocationStatistics for that species, notifies the contributor, and optionally flags the observation as a Notable Record.

---

# §7 Verification Engine

The Verification Engine is the governance layer over the identification process. It manages confidence, handles conflicts, enforces escalation rules, and produces the final authoritative verdict.

## Confidence Model

Every SpeciesIdentification carries a four-level confidence scale:

| Level | Definition |
|---|---|
| CERTAIN | Field marks clearly visible and diagnostic |
| PROBABLE | Field marks consistent but not fully diagnostic |
| POSSIBLE | Consistent with species but alternative species not ruled out |
| AMBIGUOUS | Two species considered equally likely |

## Conflict Detection

A conflict is defined as: two or more identifications of the same observation reaching different species conclusions, where neither identification is marked AMBIGUOUS and both identifiers have at least the IDENTIFIER role. On conflict detection, the observation's lifecycle state transitions to `EXPERT_REVIEW` and an IdentificationConflict record is created.

## Escalation Ladder

```
Community disagreement detected
    ↓ Auto-escalate after 48h without resolution
LEVEL 1 — Senior Identifier assigned. Reviews all identifications and evidence.
    ↓ If unresolved within 7 days
LEVEL 2 — Curator review. May request additional expert opinion.
    ↓ If still unresolved after 21 days
UNRESOLVABLE — Terminal state. Observation stored with all identifications intact.
```

## Expert Review Protocol

When an observation requires expert review, the Senior Identifier receives: the full evidence set, all existing identifications with reasoning, the species' classification profile (habitat, migration status, occurrence frequency), and the GPS location with seasonal context. The expert is **not told who made prior identifications** to prevent deference to authority rather than evidence.

## Verification Locking

Once a VerificationRecord is created with `is_final = true`, the identification is locked. Future reviewers can flag a disagreement, but the lock can only be broken by a Curator who must document the reason. The original verification record is never deleted, only superseded by a newer one that references the old one.

## Future AI Integration

When AI identification is added, it enters the pipeline as an additional SpeciesIdentification record with `identifier_type = AI`. It has the same vote weight as a CONTRIBUTOR-level identifier — it cannot override a human Senior Identifier. The VerificationRecord constituting a final verdict must always be authored by a qualified human identifier.

---

# §8 Import Engine

The Import Engine transforms the authoritative seed workbook — and future external data sources — into the canonical species repository. It is a permanent subsystem, not a one-time migration script.

## Complete Import Pipeline

```
Source File Received (XLSX, CSV, or API feed)
    ↓ File validation
PARSE — Extract rows; detect encoding, schema version, authority declaration
    ↓
VALIDATE — Check required fields, controlled vocabulary values, scientific name format
    ↓ Validation report generated
TAXONOMY RESOLVE — Match scientific name to TaxonomicNode. Resolve Order from Family.
                   Resolve external IDs (eBird code, GBIF key).
    ↓
CLASSIFICATION MAP — Map workbook classification strings to canonical ClassificationValues.
                     Apply trophic string-to-normalized mapping table.
    ↓
DUPLICATE DETECT — Match proposed species against existing repository by scientific name
                   and by common name similarity.
    ↓
COMPOUND FILTER — Separate compound (slash) entries from true species.
                  Flag for Observation Engine seeding.
    ↓
CURATOR PREVIEW — Present import diff: new, updated, skipped, errored. Curator approves or rejects.
    ↓ Curator approves
COMMIT — Write to canonical repository within a database transaction.
    ↓
STATISTICS REBUILD — Queue rebuild jobs for all affected species, locations, contributors.
    ↓
SEARCH REINDEX — Rebuild search index entries for all imported or updated species.
```

## Validation Rules

**Hard errors** (block import of the affected row): Missing scientific name; scientific name not parseable as a binomial; conservation status value outside controlled vocabulary; migrant status value outside controlled vocabulary; duplicate scientific name already in repository without a merge directive.

**Soft warnings** (flag for curator review, do not block): Common name not matching any recognized English name in the authority checklist; trophic feeding string not in the mapping table (auto-maps to UNMAPPED); habitat value not in canonical taxonomy (auto-maps to closest match); geography value outside defined scope.

## Re-import and Partial Update

The diff algorithm compares incoming data against the current repository using scientific name as the primary key. Changes to classification values update the SpeciesClassification junction records. Changes to common names add SpeciesSynonym records rather than overwriting the current primary name. Species in the repository but not in the updated import are flagged as potentially removed — they are never auto-deleted.

## Rollback

The ImportBatch entity stores a pre-import snapshot of every species record that was modified. A rollback operation restores these snapshots within a transaction and removes any species records newly created by the batch. Rollback is available for 30 days after an import.

## Compound Record Seeding

The 63 compound records from the seed workbook are not imported as species. They are imported as seed Observation records in AMBIGUOUS state, with the two candidate species referenced as alternate identifications. Curators are notified of these seeded observations and invited to make a definitive identification if the evidence supports one.

---

# §9 Database Architecture

The Nature Engine uses the platform's frozen MySQL 8 database (`bcc_v3`) with Kysely as the query builder. No additional database technology is introduced.

## Core Species Tables

| Table | Purpose | Row Estimate |
|---|---|---|
| `nature_modules` | Module registry | < 20 |
| `taxonomic_nodes` | Full Linnaean hierarchy | ~2,000 (birds) |
| `species` | Canonical species records | ~500 (birds); ~5,000 long-term |
| `species_synonyms` | Alternative and historical names | ~3,000 |
| `hybrid_records` | Inter-species hybrid documentation | < 50 |
| `trophic_profiles` | One per species | ~500 |
| `trophic_prey_types` | Species-to-prey-type junction | ~2,500 |
| `external_references` | Species-to-external-ID links per authority | ~2,000 |

## Classification Tables

| Table | Purpose | Notes |
|---|---|---|
| `classification_schemes` | Named classification systems | ~10 schemes initially |
| `classification_values` | Values within each scheme | ~150 total across all schemes |
| `species_classifications` | Junction: species ↔ scheme ↔ value | ~3,000 rows (multi-scheme) |

## Observation Tables

| Table | Purpose | Notes |
|---|---|---|
| `observations` | Primary observation records | High volume long-term |
| `observation_media` | Photo attachments per observation | Multiple per observation |
| `species_identifications` | Identification claims | Multiple per observation |
| `verification_records` | Expert/curator verdicts | One final per observation |
| `identification_conflicts` | Conflict records requiring escalation | Rare in practice |
| `observation_lifecycle_events` | Immutable audit log | Append-only; high volume |

## Location Tables

| Table | Purpose | Notes |
|---|---|---|
| `location_nodes` | Geographic hierarchy | Adjacency list; ~200 initially |
| `location_habitats` | Habitat types per location (junction) | Multi-value per location |

## Statistics Tables *(Materialized)*

> **Architectural Rule:** Statistics tables are **never written to by API request handlers**. They are written exclusively by background jobs triggered by observation lifecycle events.

| Table | Rebuilt When |
|---|---|
| `species_statistics` | Observation for species changes state to VERIFIED or PUBLISHED |
| `location_statistics` | Observation at location changes state to VERIFIED or PUBLISHED |
| `contributor_statistics` | Contributor's observation changes state or life list entry created |
| `module_statistics` | Nightly rebuild |
| `monthly_observation_counts` | Nightly rebuild; powers seasonality charts |

## Import & Audit Tables

| Table | Purpose |
|---|---|
| `import_batches` | Record of every import operation |
| `import_batch_rows` | Per-row result of an import |
| `import_rollback_snapshots` | Pre-import state snapshots for rollback |

## Key Index Strategy

- **species:** Index on `(module_id, is_published)`, unique on `(module_id, taxonomic_node_id)`, index on `slug`
- **observations:** Index on `(module_id, lifecycle_state)`, index on `(location_id, observed_at)`, index on `(submitter_id, lifecycle_state)`
- **species_classifications:** Index on `(species_id, scheme_id)`, index on `(scheme_id, value_id)` for faceted filtering
- **life_list_entries:** Unique on `(contributor_id, species_id, module_id)`
- **observation_lifecycle_events:** Index on `(observation_id, occurred_at)`. Partition by year when volume demands it.

## Search Index Table

A denormalized `nature_search_index` table holds pre-joined, pre-flattened search data per entity. For species: primary name, all synonyms, scientific name, family, order, BCC vernacular group, habitat labels, migration label, conservation status label, BCC browse class — concatenated into a FULLTEXT-indexed `search_text` column. A separate `facet_json` column stores filter sidebar values without additional joins.

## Caching Philosophy

The Nature Engine does not introduce Redis or any external cache. MySQL query cache and Fastify response caching serve as the primary mechanism. Species list pages: 15-minute TTL. Individual species pages: 1-hour TTL, busted when the species record, its statistics, or any of its classifications changes.

---

# §10 Search Architecture

## Species Search
Primary search against common name, scientific name, synonyms, vernacular group, and classification labels. Supports exact match, prefix match (autocomplete), full-text weighted relevance, and faceted filtering.

**Facets:** BCC Browse Class, Habitat Type, Migration Pattern, Occurrence Frequency, Conservation Status, Family (Common), Order, Module

**Ranking:** Exact name match → published species with verified photos → unphotographed species

## Observation Search
Filters: species, location, date range, contributor, lifecycle state, has-verified-ID, has-photos, module. Public access: PUBLISHED observations only. Members: own submissions in any state. Sorted by: most recent, by location, by species, by contributor rank.

## Location Search
Name search against location_nodes. Filters: habitat type, location rank, has-observations, module. Returns: location name, dominant habitat, total species, total observations, coordinates. Supports bounding-box filtering for map-based discovery.

## Photographer / Contributor Search
Filters: module, expertise level, life list size range, contribution period. Available to authenticated members only — public visibility requires opt-in from the contributor.

## Taxonomy Search
Navigation through the full taxonomic tree. Browse by Order → Family → Genus → Species. Results show count of species at each level present in the current module's repository.

## Advanced Search
Authenticated-member feature. Combine any filters simultaneously: *"Show me winter migrant insectivores found in wetland habitats with at least one verified photo, sorted by rarest first."* Results are exportable as CSV for Curator role.

## Map Search
Species occurrence by geography. Input: bounding box or location node. Output: species recorded within that geography with observation counts and date ranges. Reads from LocationStatistics and a pre-computed `species_at_location` materialized table rebuilt nightly.

## Saved Searches and Search Presets
Authenticated members may save named search configurations. Curators may define public search presets that appear in the Discovery navigation, stored as serialized filter JSON with a human-readable title.

---

# §11 Species Pages

Each species has a canonical public-facing page at `/{module-key}/{slug}` (e.g., `/birds/tickells-blue-flycatcher`).

## Information Hierarchy

| Zone | Content | Source |
|---|---|---|
| Identity Header | Primary common name, scientific name with authority, BCC vernacular group, BCC browse class badge, conservation status badge | Species record + TaxonomicNode |
| Featured Photography | Best 3–5 verified photographs, curated by quality score, credited to photographer | ObservationMedia (verified) |
| Taxonomy Panel | Full Linnaean hierarchy from Order to species, with browse links at each rank | TaxonomicNode chain |
| Ecology Panel | Primary habitat types, dominant habitat, trophic profile, migration pattern, occurrence frequency, seasonal presence chart | SpeciesClassification + SpeciesStatistics |
| Bhopal Distribution | Map showing location nodes where species has been verified, with observation counts | species_at_location materialized table |
| Observation Gallery | Paginated grid of PUBLISHED observations, most recent first, filterable by location and month | Observations (state=PUBLISHED) |
| Statistics Panel | Total observations, unique photographers, first recorded date, monthly chart | SpeciesStatistics |
| Top Contributors | Top 5 photographers by verified observation count, with most recent photo | ContributorStatistics |
| Related Species | Same Genus siblings, commonly confused species, species co-observed at same locations | TaxonomicNode + SpeciesRelationship |
| Identification Notes | Curator-authored field tips and diagnostic features. Shown only when authored. | Curator-authored content (nullable) |
| External Links | Links to eBird, IOC, GBIF, BirdLife pages — generated from ExternalReference records | ExternalReference |

## Evidence Transparency
Species that exist in the repository from the seed workbook but have no member photographs display a transparent "No BCC photograph yet" notice with an invitation to submit an observation.

## Canonical URL and Slug
The slug is derived from the primary common name at species creation and is immutable thereafter. If a common name changes, the old slug redirects (301) to the new slug — but the old slug is never reassigned.

---

# §12 Location Pages

## Information Hierarchy

| Zone | Content | Source |
|---|---|---|
| Location Identity | Location name, parent hierarchy, habitat type badges, hotspot flag, GPS coordinates link to map | LocationNode + LocationHabitat |
| Location Map | Embedded map showing location boundary/centroid and all observation GPS points | LocationNode bbox + observations |
| Statistics Summary | Total species recorded, total verified observations, total unique contributors, date of first record | LocationStatistics |
| Seasonality Chart | Species count by month, observation count by month | monthly_observation_counts |
| Species Checklist | All species verified at this location, grouped by BCC Browse Class, with observation count and most recent sighting. Filterable by migration status and season. | species_at_location + classifications |
| Notable Records | First records, rare species, notable seasonal arrivals | ObservationLifecycleEvents (first-record type) |
| Recent Observations | Ten most recent published observations with thumbnail, species name, date, contributor | Observations (state=PUBLISHED) |
| Top Contributors | Members with the most verified observations at this location | ContributorStatistics filtered by location |
| Habitat Notes | Curator-authored description of habitats, access, and best visit times. Optional. | LocationNode.habitat_notes |

## Location Hierarchy Navigation
Location pages exist at every hierarchy level. The Bhopal City page aggregates from all child locations. The Madhya Pradesh page aggregates from all districts. Navigation is bidirectional: from species page ("where is this species found?") and from location page ("what species are found here?").

---

# §13 Photographer Nature Profile

## Profile Sections

| Section | Content | Visibility |
|---|---|---|
| Identity | Display name, member since, module preferences, expertise level badge | Public (opt-in) |
| Life List | Total species verified per module, species list with first-observed date and primary photo, rare species highlighted | Public (opt-in) / Members-only / Private |
| Contribution Stats | Total verified observations, total identifications made, total conflict resolutions, contribution rank | Public (opt-in) |
| Recent Activity | Last 10 published observations, most recent identification activity | Public (opt-in) |
| Location Coverage | Map showing all location nodes where the member has verified observations | Public (opt-in) |
| Monthly Activity | Bar chart of observations per month over the last 12 months | Public (opt-in) |
| Rarest Finds | Top 10 rarest species (by occurrence frequency and total community observation count) | Public (opt-in) |
| Leaderboard Position | Rank within module community by life list size, verified observation count, location diversity | Public (opt-in) |

## Privacy by Default
All sections are private by default. Members opt into each visibility level independently. The platform never publishes precise GPS coordinates — only the named location node is shown publicly.

## Life List Integrity
A life list entry is automatically created when the member's observation reaches VERIFIED state. It is never manually added. If a verification is later overturned, the life list entry is flagged as contested rather than deleted. The contested flag is visible to the member but not to public viewers.

## Contribution Scoring
ContributorStatistics maintains a contribution rank computed from: verified observations submitted (40%), observation quality rated by identifiers (25%), identifications made for others' observations (25%), rare species documented (10%). The score is used only to compute relative leaderboard ranking. The formula is documented publicly.

---

# §14 Projects

Projects are curated, goal-oriented frames placed over the Nature Engine's observation corpus. They do not create separate data silos — they are named views over the same shared species repository and observation data.

## Project Types

| Type | Description | Example |
|---|---|---|
| Ongoing Catalogue | Permanent, open-ended documentation effort | Birds of Bhopal |
| Seasonal Survey | Time-bounded annual survey. Repeats on a schedule. | BCC Winter Bird Count 2025 |
| Special Collection | Curated selection meeting a specific criterion | Bhopal's Raptors, Waterbirds of Upper Lake |
| Challenge | Competitive/participatory event with defined goals and a leaderboard | 100 Species in 30 Days Challenge |
| Citizen Science Export | Configured to produce structured data exports compatible with GBIF or eBird | Bhopal Biodiversity Survey — GBIF Export Edition |

## Birds of Bhopal — The Reference Project
**Type:** Ongoing Catalogue  
**Scope:** All species in the Birds module with distribution_scope including Bhopal  
**Goal:** Document every species in the canonical list with at least one verified photograph  
**Geographic scope:** Bhopal District location node and all children  
**End date:** None  
**Automatic inclusion:** All observations submitted by BCC members in the Birds module within the Bhopal location hierarchy

## Project Progress Tracking
Each project maintains a materialized progress view: how many species in scope have at least one verified observation (documented), how many have observations in review, and how many have no community observations yet. Challenge projects maintain a contributor leaderboard for the challenge period.

---

# §15 Analytics

All analytics are automatically derived from primary observation and species data. No analytics require manual curation or data entry.

## Public Analytics Surfaces

| Analytic | Description | Update Frequency |
|---|---|---|
| Species Trend | Observation count per species per year | Monthly rebuild |
| Monthly Seasonality | Which months see the most observations per species | On observation state change |
| Migration Arrival/Departure | Earliest and latest observation date per year for migratory species | Nightly rebuild in season |
| Location Heatmap | Observation density across Bhopal's location nodes, displayable by species, month, or total volume | Nightly rebuild |
| Observation Growth | Cumulative observations over time — platform growth indicator | Nightly rebuild |
| Rare Species Tracker | All RARE or CASUAL species recorded in the current calendar year | On observation verification |
| Top Contributors | Module-level leaderboard by life list size, observation count, identification count | Weekly rebuild |
| Conservation Highlights | EN and CR species documented in the current year with observation counts | Monthly rebuild |
| First Records of the Year | Species recorded for the first time in a calendar year at any Bhopal location | On observation verification |
| Hotspot Comparison | Species richness comparison across named locations by month | Monthly rebuild |

## Admin Analytics (Curator/Administrator Only)
Observation workflow health: observations stuck beyond threshold durations. Identifier activity: who is actively identifying vs. inactive. Import history: all import batches with success rates. Conflict rate: percentage of observations that required escalation.

---

# §16 Roles & Permissions

Nature roles are module-scoped and completely separate from the platform's general RBAC system (consistent with MEM-006 §RBAC Decoupling). A user may be a Senior Identifier in the Birds module and a Contributor in the Butterflies module independently.

## Nature Role Definitions

| Role | Description | Key Capabilities |
|---|---|---|
| `GUEST` | Unauthenticated public visitor | View published species pages, location pages, published observations |
| `MEMBER` | Authenticated BCC platform member — not yet a nature contributor | View all public content |
| `CONTRIBUTOR` | Member who has submitted at least one observation | Submit observations, make identifications, manage own drafts |
| `IDENTIFIER` | Trusted member with demonstrated identification accuracy | All Contributor capabilities. Identifications carry higher weight in consensus. |
| `SENIOR_IDENTIFIER` | Expert-level member assigned by Curator | All Identifier capabilities. Expert review for RARE and CASUAL species. Resolve Level-1 conflicts. |
| `CURATOR` | BCC-appointed nature module curator | All Senior Identifier capabilities. Publish/archive species. Approve imports. Override verifications (documented). Assign roles. |
| `MODERATOR` | Community moderator for content quality | Flag/hide inappropriate observations. Cannot modify species records or verifications. |
| `ADMINISTRATOR` | Platform administrator | Full access. Cannot bypass the audit log. |

## Permissions Matrix

| Action | Guest | Contributor | Identifier | Sr. Identifier | Curator |
|---|---|---|---|---|---|
| View published species | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit observation | — | ✓ | ✓ | ✓ | ✓ |
| Identify others' observations | — | ✓ | ✓ | ✓ | ✓ |
| Expert review (RARE species) | — | — | — | ✓ | ✓ |
| Resolve identification conflict | — | — | — | Level 1 | All levels |
| Publish / archive species | — | — | — | — | ✓ |
| Run import | — | — | — | — | ✓ |
| Override verification | — | — | — | — | ✓ (documented) |
| Assign Identifier role | — | — | — | — | ✓ |
| Export data (CSV) | — | — | — | — | ✓ |

> **Constitutional Ruling:** Nature roles are module-scoped. A role assignment record references both the user and the module. The platform RBAC system's general administrator role does not automatically grant Curator status in the Nature Engine — it must be explicitly assigned through the Nature role assignment workflow.

---

# §17 API Architecture

The Nature Engine exposes its functionality through the platform's NestJS/Fastify REST API. Each controller declares `api/v1/nature/` in its own `@Controller()` decorator. No global prefix is used (CLAUDE.md §4.1). All responses follow the platform's standard envelope format.

## API Route Groups

| Group | Prefix | Access Level | Description |
|---|---|---|---|
| Modules | `/api/v1/nature/modules` | Public | List available nature modules |
| Species | `/api/v1/nature/{module}/species` | Public (published only) | List, search, retrieve species |
| Taxonomy | `/api/v1/nature/{module}/taxonomy` | Public | Navigate taxonomic hierarchy |
| Classifications | `/api/v1/nature/classifications` | Public (read); Curator (write) | Retrieve schemes/values; assign classifications |
| Observations | `/api/v1/nature/{module}/observations` | Public (published); Member (own); Curator (all) | Submit, retrieve, manage observations |
| Identifications | `/api/v1/nature/identifications` | Contributor+ | Submit and manage species identifications |
| Verifications | `/api/v1/nature/verifications` | Senior Identifier+ | Submit expert verdicts; resolve conflicts |
| Locations | `/api/v1/nature/locations` | Public | Browse location hierarchy; get species checklists |
| Projects | `/api/v1/nature/projects` | Public (read); Curator (write) | List, retrieve, manage projects |
| Contributors | `/api/v1/nature/contributors` | Member (own full); Public (opt-in) | Life lists, statistics, activity feeds |
| Search | `/api/v1/nature/search` | Public (limited); Member (full) | Species search, observation search, faceted filtering |
| Statistics | `/api/v1/nature/{module}/statistics` | Public | Module-level analytics, seasonality, leaderboards |
| Import | `/api/v1/nature/admin/import` | Curator+ | Upload workbook, preview diff, approve/reject |
| Admin | `/api/v1/nature/admin` | Curator+ | Species management, role assignment, diagnostics |

## API Design Conventions

- **Module discriminator in path:** Every species and observation endpoint includes the module key in the path. This makes the module scope explicit and prevents cross-module data leakage.
- **Pagination:** All list endpoints use cursor-based pagination (cursor + limit).
- **Lifecycle state filtering:** Observation endpoints default to `state=PUBLISHED` for unauthenticated callers. Members receive own observations in all states. Curators receive all observations without a filter override.
- **Response includes derived statistics inline:** Species detail responses include the materialized statistics object; they do not expose the raw observation join.
- **Rate limiting:** Search endpoints are rate-limited per IP. Observation submission endpoints are rate-limited per authenticated user.

## Build-time API Calls (Astro)

Consistent with CLAUDE.md §4.5, all `getStaticPaths()` and top-level fetch calls that build species pages or location pages must target `http://localhost:3001`. The Nature Engine's API endpoints support a `?build=true` query parameter that disables rate limiting and enables complete result sets for the static build process only. This parameter is validated against the request origin — it is rejected for non-localhost callers.

---

# §18 Performance Architecture

Performance is achieved through schema discipline and pre-computation — not through additional infrastructure.

> **Governing Constraint:** No public API call performs aggregate queries against the primary observation table. All public-facing aggregations are pre-computed and cached.

## Read Path Optimization

**Species List Page:** Built at Astro static build time. The API reads from the `species` table with a join to `species_statistics`. No observation table is touched. Static HTML is served by Nginx.

**Species Detail Page:** Built statically for all published species. Joins: species → taxonomic_nodes → species_classifications → classification_values → species_statistics. The observation gallery loads lazily client-side via a separate paginated API call.

**Search:** All search queries target the `nature_search_index` table exclusively. The FULLTEXT index handles name searches. The `facet_json` column populates filter sidebars without additional joins.

## Write Path Optimization

Observation submission writes three records atomically: Observation, ObservationMedia, and ObservationLifecycleEvent. Statistics rebuild and search reindex are queued as background jobs — never synchronous in the request handler.

## Background Jobs

| Job | Trigger | Estimated Duration |
|---|---|---|
| SpeciesStatisticsRebuild | Observation state → VERIFIED or PUBLISHED | < 200ms per species |
| LocationStatisticsRebuild | Observation state → VERIFIED or PUBLISHED | < 500ms per location |
| ContributorStatisticsRebuild | Life list entry created or observation state changes | < 300ms per contributor |
| SearchIndexRebuild (species) | Species record or classification updated | < 50ms per species |
| MonthlyDistributionRebuild | Nightly at 02:00 local time | < 30 seconds for all species |
| ModuleStatisticsRebuild | Nightly at 02:30 local time | < 10 seconds |
| TaxonomySync (external authority) | Manual trigger by Curator only | Variable; 1–10 minutes |

## Image Optimization

All observation photographs are stored in Cloudflare R2 and served through ImageKit as defined in PHOTO-ARCH-001. The Nature Engine makes no independent storage decisions for photographs. ImageKit transformation parameters are used per display context:
- Thumbnail: 200×150
- Gallery: 800×600
- Featured: 1200×900

## Scalability Thresholds and Review Triggers

The following thresholds trigger a mandatory performance architecture review:
- Species repository exceeds 10,000 records across all modules
- Observation corpus exceeds 50,000 PUBLISHED observations
- Search latency p95 exceeds 200ms
- Statistics rebuild time for a single species exceeds 5 seconds

At these thresholds, the introduction of additional infrastructure (Elasticsearch for search, Redis for caching) becomes architecturally justified and may be proposed through a formal TECH-STACK amendment.

---

# §19 Future Expansion

## Adding a New Nature Module

Adding a second Nature Module requires: creating a NatureModule record with its taxonomy authority; defining module-specific classification schemes or inheriting existing ones; importing the species seed dataset through the Import Engine; and publishing the module as inactive until at least 20 species have verified observations. The observation workflow, verification engine, location hierarchy, search system, and API routing are all shared infrastructure — no module-specific code is written for these systems.

## Planned Module Roadmap

| Planned Module | Taxonomy Authority | Primary New Scheme | Special Considerations |
|---|---|---|---|
| Butterflies of Bhopal | iNaturalist / India checklist | Wing pattern classification | Life stage (larva, pupa, adult) adds to ObservationMedia model |
| Dragonflies & Damselflies | iNaturalist | Suborder (Anisoptera/Zygoptera) | Gender dimorphism classification needed |
| Trees of Bhopal | GBIF / Flora of India | Deciduous/Evergreen scheme | Observation model extends to phenology observations (flowering, fruiting) |
| Mammals of MP | IUCN SSC | Activity pattern (Diurnal/Nocturnal) | Observation metadata may include camera-trap source type |
| Reptiles of Bhopal | IUCN SSC + iNaturalist | Venomous/Non-venomous flag | High public-safety interest; verification threshold elevated |
| Fungi of Bhopal | iNaturalist / GBIF | Substrate type scheme | Taxonomy more fluid than animals; higher update frequency expected |

## AI-Assisted Identification

When AI identification is introduced: it enters the pipeline as an additional SpeciesIdentification record with `identifier_type = AI`. The AI vote weight equals a CONTRIBUTOR-level identifier. Its role is to suggest, not to decide. All AI identifications are logged permanently including the model version, enabling future AI accuracy analysis over time.

## Audio Recognition

Audio observation support requires extending the ObservationMedia model to support audio file types (MP3, WAV, OGG). Audio AI recognition (spectrogram analysis) produces the same SpeciesIdentification record format as visual AI. Verification thresholds for audio-only identifications are set higher than for photographic identifications.

## External Database Integration

**GBIF:** The Export pathway allows Curator-approved project data to be formatted and submitted as Darwin Core Archives. This is a one-way export. GBIF species data can be imported as taxonomy reference material through the Import Engine.

**eBird:** Species taxonomy synchronization uses the annual eBird checklist as the authority for the Birds module. A dedicated TaxonomySync job downloads the new checklist, computes a diff, and presents it to the Curator for approval.

**iNaturalist:** For non-bird modules, iNaturalist taxonomy feeds serve as the authority. No live API integration is planned in V1 — import-only.

## Citizen Science Export

Projects designated as citizen science projects generate standardized data exports: Darwin Core Archive (GBIF), eBird checklist format, and custom CSV exports defined by Curators. All exports include only PUBLISHED, verified observations. Privacy protection: GPS coordinates exported at the LocationNode level, not individual photo GPS.

## Mobile Application

The Nature Engine API serves mobile clients without modification. The offline observation capture requirement is addressed at the mobile application layer as a local-first draft queue that syncs to the DRAFT state when connectivity is restored. No backend changes are required — the DRAFT state already models an unsynchronized observation.

## Expansion Governance

> **Constitutional Ruling:** Every new Nature Module is a constitutional extension. Before adding a module, a Module Proposal must be drafted documenting: the taxonomy authority and version, the seed dataset source, any new classification schemes required, any new observation media types, and a Curator who will govern the module. This proposal is reviewed against this constitution for compatibility before implementation begins.

---

## Document Footer

```
NATURE-ARCH-001 · Version 1.0.0 · BCC Unified Platform V3
Constitutional authority: equal to MEM-006, MEM-007, HUB-ARCH-001, PHOTO-ARCH-001
Reference implementation: Birds of Bhopal
Seed dataset: 543 records · ~480 canonical species · Madhya Pradesh
```

*Bhopal Camera Club — Nature Engine Architecture & Constitution*
