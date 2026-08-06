BIRD-DATA-001
Birds Data Model \& Import Specification

Document ID: BIRD-DATA-001
Status: Frozen
Version: 1.0

\---

# 

# 1\. Purpose



This document defines the canonical data model governing all bird-related information within the Bhopal Camera Club platform.

It establishes how bird species, classifications, observations, locations and related data are represented, validated, imported and maintained.

This document serves as the authoritative reference for database design, import workflows and future data maintenance.

It does not define user interfaces, APIs or implementation details.



\---

# 

# 2\. Design Rule



This document models bird data exactly as it exists.

It does not attempt to anticipate future biodiversity projects.

Generalization shall occur only after a second project demonstrates a genuine need for shared data structures.



\---

# 

# 3\. Scope

## 

## 3.01 This document covers



* Bird species data
* Taxonomic information
* Classification systems
* Species attributes
* Geographic distribution
* Workbook import rules
* Validation rules
* Database model
* Data relationships

## 

## 3.02 Out of Scope



This document does not define:



* Public website
* Species pages
* Observation workflow
* Verification workflow
* User permissions
* Search
* Analytics
* Mobile applications
* Nature Engine expansion
* 

These are governed by their respective architecture documents.



\---



# 4\. Data Sources



Before defining the data model, the origin of every piece of information must be identified.

Different data sources carry different levels of authority, trust and update frequency. The Bird Data Model does not treat all data equally.

Every data element stored by the system shall record its originating source wherever practical.



## 4.01 Canonical Species Dataset



The primary source of bird species information is the curated Birds of Madhya Pradesh workbook maintained by Bhopal Camera Club.

This workbook forms the initial seed dataset for the Birds of Bhopal project and provides the baseline species repository from which all future updates begin.

The workbook is considered the authoritative source only during the initial import process. Once imported, the platform database becomes the operational source of truth.



## 4.02 External Scientific Authorities



Scientific taxonomy, nomenclature and conservation information originate from internationally recognised authorities.

Examples include:

IOC World Bird List
eBird / Clements Checklist
BirdLife International
IUCN Red List

These authorities provide reference data only.

They do not replace locally maintained observation records.



## 4.03 Community Observations



Photographs and field observations submitted by BCC members form the primary evidence layer of the system.

Community observations from any geographic location may be recorded within the platform. Each observation shall retain its complete geographic attribution. Public projects such as Birds of Bhopal determine visibility through project-defined geographic filters rather than by restricting data capture :

occurrence
location
seasonality
behaviour
photographic evidence

Observations never modify canonical species data directly.



## 4.04 Curator-maintained Data



Certain information is maintained manually by authorised project curators.

Examples include:

local names
identification notes
habitat descriptions
distribution notes
featured photographs
editorial content

Curator-maintained data supplements scientific information but does not replace it.



## 4.05 Derived Data

Some information is generated automatically by the platform.

Examples include:

observation counts
contributor rankings
species statistics
seasonal charts
life lists
location summaries

Derived data is never treated as primary data and may be regenerated at any time.



## 4.06 Imported Historical Data



Future imports may include historical bird records from trusted publications, surveys or institutional datasets.

Imported historical records shall retain their original source attribution and shall remain distinguishable from community observations.



## 4.07 Data Ownership Principles



For every data element, the system should clearly identify its origin.

Data	Primary Owner
Species taxonomy	Scientific authority
Classification	BCC
Local names	BCC
Species attributes	Scientific authority / BCC
Observation	Contributor
Photograph	Photographer
Verification	Verifier
Statistics	System
Editorial content	BCC



# 5\. Canonical Data Principles



The Birds of Bhopal data model is governed by the following principles. These principles apply to every dataset, database table, import process and future enhancement.



## 5.01 Single Source of Truth



Each logical piece of information shall exist only once within the database.

Duplicate storage of the same information is prohibited unless explicitly required for performance or historical preservation.



## 5.02 Stable Identity



Every bird species shall possess a permanent internal identifier.

Scientific names, common names and taxonomic classifications may change over time, but the internal identifier shall remain immutable.



## 5.03 Separation of Data Types



The platform distinguishes between different categories of information.

These categories include:

Canonical species data
Scientific classification
Community observations
Photographic evidence
Geographic information
Editorial content
Derived statistics

Each category shall be stored independently and linked through defined relationships.



## 5.04 Data Provenance



Every significant data element should retain information about its origin.

Where practical, the system shall record:

original source
import batch
contributor
curator
creation date
modification history



## 5.05 Scientific Integrity



Scientific taxonomy shall follow recognised international authorities.

Local editorial content may supplement scientific information but shall never alter accepted taxonomy.



## 5.06 Local Knowledge



The project recognises that regional knowledge forms an important part of the Birds of Bhopal initiative.

Information such as:

local names
habitat notes
behavioural observations
seasonal occurrence
regional distribution

may be maintained independently by authorised curators.



## 5.07 Non-destructive Evolution



Imported data shall enrich the existing dataset rather than replace it.

Where conflicts occur, the system shall preserve existing information until the conflict is resolved through defined governance procedures.



## 5.08 Traceability



Every significant modification to canonical bird data shall be attributable to:

an import process,
an authorised curator, or
a system-generated process.

Anonymous modification of canonical data is not permitted.



## 5.09 Extensibility Through Composition



Additional bird attributes may be introduced without requiring changes to existing canonical species identities.

The model shall favour extension through related data structures rather than modification of established core records.



## 5.10 Platform Authority



After successful import into the Bhopal Camera Club platform, the platform database becomes the operational authority for all project-specific bird data.

External references remain authoritative only for their respective scientific domains.



## 5.11 Geographic Independence



The Birds of Bhopal project is geographically focused on the city of Bhopal.

However, the underlying bird data model shall not be geographically restricted.

All observations, locations and related records shall support a hierarchical geographic structure consisting of at least:

City
State / Province
Country

This allows observations from outside Bhopal to be stored within the same canonical database while maintaining clear geographic attribution.

Project-specific features, reports and public displays may apply geographic filters to include or exclude records without affecting the underlying data.



## 5.12 



The Bird Species shall serve as the central canonical entity within the Birds data model. Educational classifications, scientific taxonomy, habitats, feeding behaviours, geographic occurrence, migratory status, conservation status, and future ecological attributes shall be modelled as independent, queryable dimensions associated with the species. Where an attribute varies by geography (such as migratory status), it shall be modelled in relation to the relevant geographic context rather than as an intrinsic property of the species. The platform shall support multi-faceted discovery, allowing species to be explored through educational, ecological, geographic, behavioural, and scientific perspectives without privileging any single classification system as the primary navigation mechanism.



\---



# 6\. Bird Species Data Model



## 6.01 Overview



A Bird Species represents a unique biological species recognised by the Birds of Bhopal project.

The species record serves as the canonical identity for all information associated with that species, including taxonomy, classification, observations, photographs, distribution and editorial content.

Every species shall exist only once within the system.

Species records are permanent and remain identifiable even if scientific taxonomy or common names change over time.



## 6.02 Species Identity



Every Bird Species shall possess a permanent internal identity.

The internal identity shall never change during the lifetime of the project.

Names, taxonomy and classifications may evolve, but the species identity remains immutable.



## 6.03 Species Record



A Bird Species record represents the canonical definition of a species.

It is not:

an observation
a sighting
a photograph
a checklist entry
a member contribution

Those are independent records linked back to the Bird Species.



## 6.04 Core Information



Every Bird Species should contain, where available:

Scientific Name
English Common Name
Hindi Name
Local Name(s)
Family
Order
Taxonomic Authority
Conservation Status
Residency Status
Broad Classification

Habitat Classification
Feeding Classification
Activity Pattern
Breeding Information
Identification Notes
Editorial Notes

Some fields may initially be empty and completed over time.



## 6.05 Relationships



A Bird Species may be associated with:

Multiple observations
Multiple photographs
Multiple locations
Multiple seasonal records
Multiple contributors
Multiple verification records

These relationships do not alter the canonical species identity.



## 6.06 Lifecycle



The lifecycle of a Bird Species record consists of:

Initial import
Validation
Publication
Editorial enrichment
Scientific revision (when required)

Deletion of canonical species records should be avoided.

Where a species is deprecated due to taxonomic revision, historical references should remain preserved.



## 6.07 Canonical Rule



A Bird Species represents the biological entity.

Everything else in the Birds of Bhopal project references that entity.

The species record is therefore the central anchor of the entire bird data model.



\---



# 7\. Classification Systems

## 

## 7.01 Purpose



Classification systems provide standardized vocabularies used throughout the Birds of Bhopal project.

They ensure that species are categorized consistently, simplify searching and filtering, and eliminate ambiguity caused by free-text data.

All classifications should use controlled vocabularies maintained by the project.



## 7.02 Classification Principles



A classification describes one aspect of a species.
A species may belong to multiple classifications where appropriate.
Classification values should be standardized and reusable.
Classification systems may evolve over time without changing the identity of a Bird Species.
Where scientific authorities differ, the project shall adopt a single canonical vocabulary for operational consistency.



## 7.03 Classification Domains



The Birds of Bhopal project currently recognizes the following classification domains:

Scientific Classification
Order
Family
Genus
Species
Conservation Classification
IUCN Status
Wildlife Protection Status
CITES Status
Residency Classification
Resident
Winter Visitor
Summer Visitor
Passage Migrant
Vagrant
Habitat Classification

(To be defined)

Feeding Classification

(To be defined)

Activity Classification

(To be defined)

Breeding Classification

(To be defined)

Behaviour Classification

(To be defined)

Geographic Classification

(To be defined)



## 7.04 Controlled Vocabulary



Each classification domain shall maintain a controlled list of permissible values.

Free-text classification values should not be used where a controlled vocabulary exists.



## 7.05 Future Classification Domains



Additional classification domains may be introduced without affecting existing Bird Species identities, provided they comply with the Canonical Data Principles defined in this document.



\---



# 8\. Geographic Model

## 

## 8.01 Purpose



The Geographic Model defines how locations are represented throughout the Birds of Bhopal project.

It provides a consistent geographic hierarchy for species distribution, observations, hotspots and future geographic analysis.

The geographic model is independent of any specific public project.

Projects such as Birds of Bhopal determine visibility through geographic filters rather than restricting stored data.



## 8.02 Geographic Hierarchy



The canonical geographic hierarchy is:

Country
↓
State / Province
↓
District (optional)
↓
City
↓
Local Area (optional)
↓
Hotspot / Location 
↓
Observation

Each lower level belongs to exactly one parent within the hierarchy.



## 8.03 Species Distribution



Species distribution represents the known geographic range of a species.

Distribution information is independent of individual observations.

A species may be associated with multiple geographic regions.

Distribution data describes where a species is expected to occur and does not constitute evidence of a specific sighting.



## 8.04 Observation Location



Every Bird Observation shall reference a single geographic location.

Where available, an observation may also include:

GPS coordinates
Elevation
Observation precision
Locality description

Observation locations represent evidence.

Species distributions represent knowledge.

These concepts shall remain independent.



## 8.05 Geographic Boundaries



The Birds of Bhopal project defines one or more geographic boundaries for public presentation.

Observations outside these boundaries:

remain part of the canonical database,
remain associated with the contributing member,
may participate in future projects,
are excluded from Birds of Bhopal public views unless explicitly included.



## 8.06 Geographic Reference Data



The platform shall maintain standardized geographic reference data wherever practical.

Examples include:

Countries
States
Districts
Cities
Hotspots

Reference data should be reused rather than duplicated across observations.



## 8.07 Geographic Principles



The geographic model follows these principles:

Every observation has one location.
Every location belongs to one geographic hierarchy.
Species distributions are independent of observations.
Geographic filtering shall determine project visibility.
Geographic data shall remain reusable across future projects.



\---



# 9\. Canonical Domain Model

## 

## 9.01 Overview



The Birds of Bhopal platform models bird-related information using a collection of independent canonical entities centred around the Bird Species.

Each entity represents a distinct aspect of ornithological, ecological, educational or geographic knowledge.

Rather than storing all information within a single species record, the platform separates classifications, habitats, feeding behaviours, migration patterns, conservation status and geographic occurrence into independently managed entities. This approach improves data integrity, supports future expansion, enables flexible querying and allows multiple perspectives through which bird species may be discovered and understood.

The Canonical Domain Model is independent of any individual workbook, import format or external data source. All imports shall populate these canonical entities using the transformation rules defined later in this specification.



## 9.02 Bird Species

### 

### Purpose



The Bird Species represents the canonical biological entity within the Birds of Bhopal platform.

Every other canonical entity, including classifications, habitats, feeding behaviours, conservation status, geographic occurrence and observations, ultimately relates to a Bird Species.

Each species shall exist only once within the canonical database regardless of the number of observations, photographs, projects or geographic regions in which it appears.



### Canonical Identity



Each Bird Species shall possess a single canonical identity.

The identity shall remain stable throughout the lifetime of the platform regardless of future taxonomic revisions, editorial enhancements or data imports.



### Responsibilities



A Bird Species shall serve as the authoritative record for:

Common Name
Scientific Name
Taxonomic relationships
Educational classifications
Ecological attributes
Geographic occurrence
Observation records
Media associations
Conservation information



### Relationship Principles



A Bird Species may be associated with:

One Broad Classification
One Common Family
One Scientific Family
One eBird Classification
One or more Habitats
One or more Feeding Habits
One or more Geographic Occurrences
One Conservation Status
Many Observations
Many Photographs



### Canonical Rules



A Bird Species shall never be duplicated.

Editorial improvements shall enhance the existing record rather than create new species.

Future imports shall reconcile against the canonical species identity.

9.03 Broad Classification



### Purpose



Broad Classification provides the highest-level educational grouping of bird species.

It offers a simple and intuitive method for organising birds into major categories that are easily understood by photographers, beginners and the general public.

Broad Classification is intended for navigation and learning rather than scientific taxonomy.



### Responsibilities



Broad Classification supports:

Educational browsing
Navigation
Learning pathways
Introductory field guides
Collection organisation
Discovery interfaces



### Relationship Principles



One Broad Classification may contain many Bird Species.

Each Bird Species shall belong to one Broad Classification.



### Canonical Rules



Broad Classification shall remain independent of scientific taxonomy.

Changes to scientific classification shall not require changes to Broad Classification unless editorially justified.

9.04 Common Family



### Purpose



Common Family represents the familiar field-guide grouping used by photographers, birdwatchers and the general public.

It provides recognisable names such as Kingfishers, Babblers, Flycatchers and Warblers that simplify identification and browsing.

Common Family is an educational and navigational concept rather than a scientific taxonomic rank.



### Responsibilities



Common Family supports:

Species discovery
Field guides
Educational publications
Search
Filtering
Public-facing navigation



### Relationship Principles



One Common Family may contain many Bird Species.

A Common Family may correspond to one or more Scientific Families.

Likewise, a Scientific Family may encompass multiple Common Families.

These relationships are resolved through Bird Species rather than by directly linking Common Families and Scientific Families.



### Canonical Rules



Common Family names shall remain stable unless editorial review determines that revision is necessary.

Scientific taxonomic changes shall not automatically alter Common Family classifications.

9.05 Scientific Family



### Purpose



Scientific Family represents the recognised biological family to which a Bird Species belongs according to the adopted taxonomic authority.

It forms part of the formal scientific taxonomy of the platform and supports biological accuracy, interoperability and future taxonomic expansion.



### Responsibilities



Scientific Family supports:

Scientific taxonomy
External data exchange
Taxonomic navigation
Biological reporting
Research
Future integration with recognised taxonomic authorities



### Relationship Principles



One Scientific Family may contain many Bird Species.

A Scientific Family may include species belonging to multiple Common Families.

Scientific Family and Common Family represent different classification systems and shall remain independent canonical entities.



### Canonical Rules



Scientific Family shall follow the currently adopted taxonomic authority.

Future revisions arising from taxonomic updates shall preserve historical traceability wherever practical.



## 9.06 eBird Classification

### 

### Purpose



The eBird Classification represents the standardized bird grouping adopted by the eBird project and related international birding resources.

It provides compatibility with globally recognised birding classifications while remaining independent of both Broad Classification and Common Family.



### Responsibilities



The eBird Classification supports:

Compatibility with eBird datasets
International birding terminology
Cross-platform interoperability
Advanced filtering and search
Educational comparisons
Future data integration



### Relationship Principles



One eBird Classification may contain many Bird Species.

Each Bird Species shall reference one primary eBird Classification.

The eBird Classification shall remain independent of Broad Classification, Common Family and Scientific Family.



### Canonical Rules



The adopted eBird Classification shall remain consistent across the platform.

Updates resulting from revisions to the eBird taxonomy shall preserve historical traceability where practical.



## 9.07 Habitat

### 

### Purpose



Habitat represents the natural environments in which a Bird Species is commonly found.

Habitats support ecological understanding, educational content and location-independent species discovery.

A Bird Species may occupy multiple habitats throughout its lifecycle or geographic distribution.



### Responsibilities



Habitat supports:

Habitat-based discovery
Educational field guides
Ecological reporting
Search and filtering
Dynamic publications
Conservation awareness



### Relationship Principles



A Bird Species may be associated with one or more Habitats.

A Habitat may be associated with many Bird Species.

Habitats shall exist as independent canonical entities and shall not be stored as free text within species records.



### Canonical Rules



Habitat definitions shall use controlled vocabulary.

Editorial descriptions may be expanded without affecting the canonical relationship between species and habitat.



## 9.08 Feeding Habit

### 

### Purpose



Feeding Habit describes the primary dietary preferences and feeding behaviour of a Bird Species.

It enables ecological understanding and supports educational, analytical and search capabilities.

A Bird Species may exhibit multiple feeding habits.



### Responsibilities



Feeding Habit supports:

Dietary guides
Educational publications
Ecological analysis
Species discovery
Search and filtering
Behavioural comparisons



### Relationship Principles



A Bird Species may possess one or more Feeding Habits.

Each Feeding Habit may be associated with many Bird Species.

Feeding Habits shall exist as canonical reference entities.



### Canonical Rules



Feeding Habits shall be maintained using controlled vocabulary.

Species may be associated with multiple feeding categories where supported by authoritative sources.



## 9.09 Conservation Status

### 

### Purpose



Conservation Status records the recognised conservation assessment assigned to a Bird Species by the adopted conservation authority.

It provides an internationally recognised measure of conservation concern while supporting education, reporting and conservation awareness.



### Responsibilities



Conservation Status supports:

Conservation reporting
Educational content
Public awareness
Search and filtering
Priority-based publications
Future conservation initiatives



### Relationship Principles



Each Bird Species shall reference one current Conservation Status.

Many Bird Species may share the same Conservation Status.

Historical conservation assessments may be retained where required for audit or longitudinal analysis.



### Canonical Rules



The platform shall adopt a recognised conservation authority for all conservation assessments.

Changes to conservation status shall update the species record while preserving historical traceability where appropriate.



## 9.10 Species Occurrence

### 

### Purpose



Species Occurrence represents the presence of a Bird Species within a defined geographic region.

It captures geographic attributes that may vary between locations while preserving a single canonical Bird Species record.

Species Occurrence acts as the bridge between the biological species and a geographic location.



### Responsibilities



Species Occurrence supports:

Regional species checklists
Geographic distribution
Local abundance
Seasonal occurrence
Migratory behaviour
Regional conservation initiatives
Future atlas projects



### Relationship Principles



A Bird Species may possess many Species Occurrence records.

Each Species Occurrence shall relate to one Bird Species and one Geographic Location.

Species Occurrence shall contain only attributes that are geographically dependent.



### Canonical Rules



Species Occurrence shall not duplicate information stored within the Bird Species record.

Multiple geographic regions may describe the same Bird Species using independent occurrence records.

Future projects may introduce additional occurrence attributes without affecting the canonical Bird Species.



## 9.11 Migratory Status

### 

### Purpose



Migratory Status describes the seasonal movement pattern of a Bird Species within a specific geographic region.

Migratory Status is not an intrinsic property of the Bird Species.

It is a characteristic of the Species Occurrence for a defined location.



### Responsibilities



Migratory Status supports:

Seasonal checklists
Migration reports
Educational guides
Search and filtering
Dynamic publications
Citizen science initiatives



### Relationship Principles



Each Species Occurrence shall possess one Migratory Status.

The same Bird Species may possess different Migratory Status values in different geographic regions.

Examples include:

Resident in one region
Winter Visitor in another
Summer Visitor elsewhere
Passage Migrant along migration routes
Canonical Rules

Migratory Status shall never be stored directly as a permanent property of the Bird Species.

Regional occurrence records shall determine the applicable Migratory Status.



## 9.12 Bird Observation

### 

### Purpose



A Bird Observation represents a recorded sighting or evidence of a Bird Species at a particular place and time.

Observations provide the factual evidence supporting distribution, occurrence, photography and citizen science activities.



### Responsibilities



Bird Observation supports:

Species recording
Distribution mapping
Citizen science
Photography
Seasonal analysis
Historical records
Verification workflows
Project reporting



### Relationship Principles



Each Bird Observation shall reference:

One Bird Species
One Geographic Location
One Observer
One Observation Date

An observation may additionally reference:

One or more Photographs
Behaviour
Habitat
Weather
Notes
Verification status

Multiple observations may exist for the same Bird Species.



### Canonical Rules



Bird Observations shall record evidence rather than redefine species characteristics.

Changes to a Bird Observation shall never modify the canonical Bird Species record.

Observations contribute knowledge to the platform while preserving the integrity of the canonical reference data.



## 9.13 Classification Definition

### 

### Purpose



Classification Definitions provide explanatory information for the controlled vocabularies used throughout the Birds of Bhopal platform.

They transform classifications from simple labels into educational knowledge resources.



### Responsibilities



Classification Definitions support:

Educational content
Field guides
Glossaries
Context-sensitive help
Public learning resources
Editorial consistency



### Relationship Principles



Each controlled vocabulary value may possess one Classification Definition.

Definitions may include:

Description
Identification notes
Examples
Editorial notes
Illustrations
References



### Canonical Rules



Definitions shall explain classifications without altering their canonical meaning.

Editorial enhancements shall preserve consistency across the platform.



## 9.14 Domain Relationships

### 

### Purpose



The Canonical Domain Model is composed of independent yet interconnected entities centred around the Bird Species.

Each entity represents a distinct aspect of ornithological, ecological, educational or geographic knowledge.

Together they provide a flexible, extensible and scientifically consistent knowledge model capable of supporting photography, citizen science, education and biodiversity conservation.



### Relationship Summary



The principal domain relationships are:

Bird Species is the central canonical entity.
Bird Species belongs to one Broad Classification.
Bird Species belongs to one Common Family.
Bird Species belongs to one Scientific Family.
Bird Species belongs to one eBird Classification.
Bird Species may occupy one or more Habitats.
Bird Species may possess one or more Feeding Habits.
Bird Species possesses one Conservation Status.
Bird Species may possess multiple Species Occurrence records.
Each Species Occurrence relates to one Geographic Location.
Each Species Occurrence possesses one Migratory Status.
Bird Observations provide evidence for Species Occurrences.
Classification Definitions describe controlled vocabularies throughout the platform.



### Canonical Principle



The Canonical Domain Model shall remain independent of any specific import workbook, external taxonomy source or implementation technology.

All future imports, integrations and editorial workflows shall populate and maintain these canonical entities in accordance with the principles defined by this specification.



\---

# 

# 10\. Workbook Mapping

## 

## 10.01 Purpose



The Birds of Madhya Pradesh – Proper Classification workbook serves as the initial seed dataset for the Birds of Bhopal project.

It provides the foundational species catalogue together with ecological classifications and supporting reference information required to establish the canonical Bird Species Repository.

The workbook is treated as the authoritative source for the initial data import only. Once imported and validated, the platform database becomes the operational source of truth.



## 10.02 Workbook Structure



The workbook consists of three logical worksheets, each serving a distinct purpose within the import process.

Worksheet	Purpose	Import Role
Master Table	Canonical list of bird species and primary taxonomic information	Primary Species Repository
Master with Habitat and Food	Species catalogue enriched with habitat and feeding classifications	Species Enrichment
Classification Explained	Definitions and explanatory notes for the various classification systems used within the workbook	Reference Knowledge

Each worksheet represents a different layer of information and shall be processed independently during import.



## 10.03 Data Layers



The workbook contains three logical data layers.

Layer 1 — Canonical Species

Contains the master list of bird species together with their core biological and taxonomic attributes.

This layer establishes the canonical Bird Species records.

Layer 2 — Species Enrichment

Provides additional ecological information including habitat preferences and feeding behaviour.

This layer enriches existing species records and shall not create additional species.

Layer 3 — Reference Knowledge

Provides explanatory information describing the classification systems used throughout the workbook.

This layer supplies documentation and reference data for administrators, editors, volunteers and public educational interfaces.

It does not create species records.



## 10.04 Separation of Responsibilities



Each worksheet has a clearly defined responsibility.

The Master Table defines what species exist.
The Master with Habitat and Food defines additional characteristics of those species.
The Classification Explained worksheet defines the meaning of the classifications used elsewhere in the workbook.

These responsibilities shall remain distinct throughout the import process.



## 10.05 Import Principle



The workbook shall not be imported as a single table.

Each worksheet shall be interpreted according to its purpose and mapped into the appropriate canonical entities defined by this specification.

Information duplicated across worksheets shall be reconciled during import rather than stored redundantly.



## 10.06 Master Table Mapping

### 

### 10.06.01 Purpose



The Master Table worksheet defines the canonical list of bird species used by the Birds of Bhopal project.

Each row represents a single species and provides the minimum information required to establish its canonical identity and primary classifications.

The worksheet forms the foundation of the Bird Species Repository.

### 

### 10.06.02 Source Columns



The Master Table contains the following canonical source columns:

Workbook Column	Purpose

Bird Name	Primary common name of the species
Broad Classification	High-level grouping used for navigation and editorial organisation
Family (Common)	Common-language family name
E Bird Classification	eBird taxonomic grouping
Family (Scientific)	Scientific family name
Scientific Name	Scientific binomial
Migrant Status (5-level)	Residency / migration classification
Conservation Status	Conservation classification
Geography	Geographic distribution classification



### 10.06.03 Mapping Principles



Each row in the Master Table shall create one and only one Bird Species record.

No row shall create observations, photographs, locations, or contributor records.

Classification values contained within the worksheet shall be mapped to the appropriate controlled vocabularies defined elsewhere in this specification.

Duplicate species records shall not be created during import.



### 10.06.10 Bird Name

#### 

#### Purpose



The Bird Name column contains the primary common name used to identify a bird species within the workbook.

It serves as the principal human-readable name for the species and is the primary display name throughout the Birds of Bhopal project.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Bird Name	Bird Species	Common Name	Direct



#### Validation Rules



Every species shall have exactly one primary common name.
The common name shall not be empty.
Duplicate common names should be flagged for editorial review.
Leading and trailing whitespace shall be removed during import.
Unicode characters shall be preserved.



#### Canonical Notes



The Bird Name represents the project's preferred display name.

Alternative names, regional names, historical names and multilingual names shall be maintained separately and shall not replace the canonical common name.



#### Future Expansion



The Bird Name does not limit multilingual support.

Future language-specific names (Hindi, Sanskrit, regional languages, etc.) may be associated with the species without modifying the canonical common name.



### 10.06.11 Broad Classification

#### 

#### Purpose



The Broad Classification column groups bird species into familiar, field-oriented categories that are easily understood by photographers, birdwatchers, volunteers and the general public.

Unlike scientific taxonomy, Broad Classification is intended for education, navigation and field identification.

It complements scientific classification but does not replace it.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Broad Classification	Broad Classification	Name	Normalized



#### Canonical Entity



Each unique Broad Classification value shall create a single Broad Classification record.

Every Bird Species shall reference one Broad Classification.

Broad Classifications are canonical entities and may be enriched independently of individual species.



#### Validation Rules



Every Bird Species shall belong to one Broad Classification.
Broad Classification names shall be unique.
Duplicate values shall be merged during import.
Leading and trailing whitespace shall be removed.
Capitalization shall follow the project's editorial standards.
Empty values shall not be permitted.



#### Transformation Rules



During import:

Read the Broad Classification value.
Search for an existing Broad Classification with the same normalized name.
If none exists, create a new Broad Classification.
Associate the Bird Species with that Broad Classification.

No duplicate Broad Classifications shall be created.



#### Relationship Rules



One Broad Classification may contain many Bird Species.

Each Bird Species belongs to one primary Broad Classification.

Future revisions may allow a species to be associated with additional groups where scientifically and editorially justified, while preserving a single primary Broad Classification.



#### Canonical Notes



Broad Classifications are educational classifications.

They are intentionally independent of biological taxonomy.

For example, species within the same Broad Classification may belong to different scientific families, while species within the same scientific family may appear in different educational contexts.

The Broad Classification provides an intuitive way to organize birds for learning, browsing and discovery.



#### Intended Uses



Broad Classifications may be used throughout the platform for:

Field Guide navigation
Species browsing
Educational articles
Beginner identification guides
Search filters
Project statistics
Learning pathways
Gallery organisation
Mobile-first identification interfaces



#### Future Expansion



Broad Classifications may be enriched over time with additional editorial information, including:

Introduction
Identification overview
Characteristic features
Typical behaviour
Habitat summary
Representative photographs
Cover image
Display order
Iconography
Seasonal notes
Educational content

Such enhancements shall not affect the canonical Bird Species records.



### 10.06.12 Family (Common)

#### 

#### Purpose



The Family (Common) column contains the familiar field-guide grouping used by photographers, birdwatchers and the general public.

It identifies the Common Family associated with each Bird Species.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Family (Common)	Common Family	Name	Normalized



#### Validation Rules



Every Bird Species shall reference one Common Family.
Common Family names shall not be empty.
Duplicate Common Family values shall be merged during import.
Leading and trailing whitespace shall be removed.
Capitalization shall follow the project's editorial standards.



#### Transformation Rules



During import:

Read the Family (Common) value.
Normalize the value.
Search for an existing Common Family.
Create the Common Family if it does not exist.
Associate the Bird Species with the Common Family.



#### Import Notes



Common Family is an educational classification.

It shall remain independent of Scientific Family, even where names appear similar.



### 10.06.13 eBird Classification

#### 

#### Purpose



The E Bird Classification column assigns each Bird Species to the corresponding eBird Classification.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
E Bird Classification	eBird Classification	Name	Normalized



#### Validation Rules



Every Bird Species shall reference one eBird Classification.
Empty values shall be rejected unless explicitly permitted.
Duplicate values shall be merged.
Whitespace shall be normalized.



#### Transformation Rules



During import:

Read the eBird Classification value.
Normalize the value.
Resolve or create the corresponding eBird Classification.
Associate the Bird Species with the resolved classification.



### 10.06.14 Family (Scientific)

#### 

#### Purpose



The Family (Scientific) column records the accepted scientific family for the Bird Species.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Family (Scientific)	Scientific Family	Scientific Name	Normalized



#### Validation Rules



Every Bird Species shall reference one Scientific Family.
Scientific Family values shall not be empty.
Duplicate values shall be merged.
Scientific names shall preserve accepted spelling and capitalization.



#### Transformation Rules



During import:

Read the scientific family.
Normalize the value.
Resolve or create the Scientific Family.
Associate the Bird Species with the Scientific Family.



#### Import Notes



Scientific Family shall be preserved exactly as adopted by the project's chosen taxonomic authority.



### 10.06.15 Scientific Name

#### 

#### Purpose



The Scientific Name column provides the canonical scientific identity of the Bird Species.

#### 

#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Scientific Name	Bird Species	Scientific Name	Direct



#### Validation Rules



Every Bird Species shall possess one Scientific Name.
Scientific Names shall be unique.
Duplicate Scientific Names shall be flagged for editorial review.
Scientific names shall preserve accepted spelling, punctuation and capitalization.



#### Transformation Rules



During import:

Read the Scientific Name.
Normalize whitespace.
Validate uniqueness.
Store as the canonical scientific name.



#### Import Notes



Scientific Name shall be treated as the primary biological identifier for reconciliation during future imports.



### 10.06.16 Migrant Status (5-level)

#### 

#### Purpose



The Migrant Status (5-level) column defines the migration classification of a Bird Species within the geographic scope represented by the workbook.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Migrant Status (5-level)	Species Occurrence	Migratory Status	Reference



#### Validation Rules



Every imported Species Occurrence shall reference one Migratory Status.
Migratory Status values shall use the project's controlled vocabulary.
Unknown values shall be flagged for editorial review.



#### Transformation Rules



During import:

Read the Migrant Status value.
Resolve the corresponding Migratory Status.
Create or update the Species Occurrence for the workbook geography.
Associate the Migratory Status with the Species Occurrence.



#### Import Notes



Migratory Status is geographically dependent and shall not be stored as a permanent attribute of the Bird Species.



### 10.06.17 Conservation Status

#### 

#### Purpose



The Conservation Status column records the conservation assessment assigned to the Bird Species.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Conservation Status	Conservation Status	Name	Reference



#### Validation Rules



Every Bird Species shall reference one Conservation Status.
Conservation Status values shall conform to the adopted controlled vocabulary.
Invalid values shall be reported during import.



#### Transformation Rules



During import:

Read the Conservation Status value.
Resolve the corresponding Conservation Status.
Associate the Bird Species with the resolved status.



#### Import Notes



Conservation Status shall remain independent of local conservation priorities and reflect the adopted conservation authority.



### 10.06.18 Geography

#### 

#### Purpose



The Geography column identifies the geographic scope to which the imported species information applies.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Geography	Species Occurrence	Geographic Scope	Reference



#### Validation Rules



Every imported record shall reference one geographic scope.
Geographic values shall resolve to canonical geographic entities.
Unknown geographic values shall be flagged for editorial review.



#### Transformation Rules



During import:

Read the Geography value.
Resolve the corresponding geographic entity.
Create or update the Species Occurrence.
Associate the occurrence with the resolved geography.

Import Notes

The workbook currently represents a single geographic scope. Future imports may create additional Species Occurrence records for the same Bird Species in different geographic regions without creating duplicate species.



## 10.07 Master with Habitat and Food Mapping

### 

### 10.07.01 Purpose



The Master with Habitat and Food worksheet enriches Bird Species imported from the Master Table with additional ecological information.

It shall not create new Bird Species, classifications or taxonomic records.

Its sole purpose is to associate existing Bird Species with their corresponding Habitat and Feeding Habit entities.

Species matching shall be performed using the canonical Bird Species identity established during the Master Table import.



### 10.07.02 Source Columns



The worksheet contains all columns from the Master Table together with the following additional enrichment columns.

Workbook Column	Purpose
Habitat	Habitat(s) associated with the Bird Species
Feeds	Primary feeding habit(s) of the Bird Species

All remaining columns shall be used solely for species identification and reconciliation.



### 10.07.03 Mapping Principles



The Master with Habitat and Food worksheet is an enrichment dataset.

During import:

Existing Bird Species shall be identified using their canonical identity.
No new Bird Species shall be created.
Existing species records shall be enriched with Habitat and Feeding Habit relationships.
Duplicate enrichment relationships shall not be created.
Existing enrichment data shall be preserved unless explicitly updated through the defined import strategy.



### 10.07.10 Habitat

#### 

#### Purpose



The Habitat column identifies the natural environments in which a Bird Species is commonly found.

#### 

#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Habitat	Habitat	Name	Reference (Many-to-Many)



#### Validation Rules



Habitat values shall resolve to the project's controlled vocabulary.
Multiple habitat values shall be parsed according to the approved delimiter standard.
Duplicate habitat relationships shall not be created.
Unknown habitat values shall be flagged for editorial review.



#### Transformation Rules



During import:

Read the Habitat value.
Split multiple values where applicable.
Normalize each value.
Resolve or create the corresponding Habitat entity.
Associate the Bird Species with each Habitat.



#### Import Notes



A Bird Species may be associated with multiple Habitats.



### 10.07.11 Feeds

#### 

#### Purpose



The Feeds column identifies the primary food sources or feeding habits of the Bird Species.



#### Canonical Mapping



Workbook Column	Canonical Entity	Canonical Attribute	Mapping Type
Feeds	Feeding Habit	Name	Reference (Many-to-Many)



#### Validation Rules



Feeding values shall resolve to the project's controlled vocabulary.
Multiple feeding values shall be parsed according to the approved delimiter standard.
Duplicate feeding relationships shall not be created.
Unknown feeding values shall be flagged for editorial review.



#### Transformation Rules



During import:

Read the Feeds value.
Split multiple values where applicable.
Normalize each value.
Resolve or create the corresponding Feeding Habit.
Associate the Bird Species with each Feeding Habit.



#### Import Notes



A Bird Species may be possess multiple Feeding Habits.



### 10.08 Classification Explained Mapping

#### 

#### 10.08.01 Purpose



The Classification Explained worksheet provides explanatory information for the classification systems used throughout the workbook.

It does not define Bird Species or ecological relationships.

Its purpose is to populate the platform's Classification Definition repository, enabling consistent educational content and reference information across administrative and public interfaces.



#### 10.08.02 Source Content



The worksheet contains explanatory descriptions for one or more classification systems used within the workbook.

These descriptions shall be treated as reference knowledge rather than operational species data.

No Bird Species records shall be created or modified from this worksheet.



#### 10.08.03 Canonical Mapping



Workbook Content	Canonical Entity	Mapping Type
Classification explanations	Classification Definition	Direct
Supporting descriptions	Classification Definition	Direct


10.08.04 Validation Rules

---

Every definition shall reference a valid classification.
Duplicate definitions shall be reconciled during import.
Empty explanatory records shall be ignored.
Editorial formatting shall be preserved where practical.
10.08.05 Transformation Rules

During import:

Read each classification explanation.
Resolve the corresponding Classification Definition.
Create or update the definition.
Preserve existing definitions unless explicitly replaced by the import strategy.



#### 10.08.06 Import Notes



This worksheet imports reference knowledge only.

It shall not create or modify:

Bird Species
Habitats
Feeding Habits
Species Occurrences
Observations
Geographic entities


#### 10.09 Cross-Worksheet Integrity



The three workbook worksheets shall be interpreted as complementary data sources.

The import process shall preserve the following rules:

The Master Table establishes the canonical Bird Species repository.
The Master with Habitat and Food worksheet enriches existing Bird Species with ecological relationships.
The Classification Explained worksheet populates the Classification Definition repository.
No worksheet shall duplicate the responsibility of another.
Species identity shall remain consistent across all worksheets.



#### 10.10 Workbook Import Sequence



The workbook shall be imported in the following order:

Import the Master Table to establish the canonical Bird Species repository.
Import the Master with Habitat and Food worksheet to enrich existing Bird Species with Habitat and Feeding Habit relationships.
Import the Classification Explained worksheet to populate the Classification Definition repository.
Perform integrity validation across all imported data.
Generate an import report summarizing created, updated, skipped and flagged records.



\---



# 11\. Validation Rules

## 

## 11.01 Purpose



Validation Rules define the minimum quality, consistency and integrity requirements that all bird-related data shall satisfy before being accepted into the canonical Birds repository.

These rules apply equally to workbook imports, future data imports, administrative data entry and any other process that creates or modifies canonical bird data.



## 11.02 Validation Principles



All validation processes shall follow these principles:

Validation shall protect the integrity of the canonical data model.
Validation rules shall be applied consistently regardless of data source.
Validation shall identify errors before data is committed.
Invalid data shall never silently modify canonical records.
Validation failures shall be reported with sufficient detail to support corrective action.



## 11.03 Mandatory Data Validation



Mandatory attributes shall be present before a canonical record may be created or updated.

Where mandatory information is missing, the affected record shall be rejected or flagged according to the applicable import policy.

Mandatory requirements shall be defined for each canonical entity by the corresponding architecture or implementation specification.



## 11.04 Controlled Vocabulary Validation



Values referencing controlled vocabularies shall resolve to valid canonical entities.

Where permitted by the import policy, previously unknown values may be added following normalization and validation.

Otherwise, unresolved values shall be flagged for editorial review.

Free-text values shall not replace controlled vocabularies.



## 11.05 Canonical Identity Validation



Canonical identities shall be unique and stable.

Before creating a new canonical entity, the platform shall determine whether an equivalent entity already exists.

Where an existing canonical identity is identified, the incoming data shall update or enrich that entity rather than creating a duplicate.



## 11.06 Relationship Validation



Relationships between canonical entities shall reference valid existing records.

No relationship shall reference a non-existent or invalid canonical entity.

Duplicate relationships shall not be created.

Relationship cardinality shall conform to the canonical domain model defined in this specification.



## 11.07 Geographic Validation



Geographic references shall resolve to canonical geographic entities.

Where geographic hierarchies are used, parent-child relationships shall remain consistent.

Geographic validation shall ensure that occurrence and observation records remain correctly attributed to their respective geographic contexts.



## 11.08 Duplicate Detection



The platform shall detect potential duplicate canonical records before data is committed.

Duplicate detection may consider one or more identifying attributes depending on the canonical entity.

Potential duplicates requiring editorial judgement shall be reported rather than automatically merged.



## 11.09 Referential Integrity



Every reference between canonical entities shall remain valid throughout the lifetime of the platform.

Operations that would create orphaned records, broken relationships or inconsistent references shall be rejected or prevented.



## 11.10 Validation Report



Every validation process shall produce a validation report summarizing the outcome.

The report should include, where applicable:

Records processed
Records created
Records updated
Records skipped
Validation errors
Validation warnings
Potential duplicates
Unresolved reference values
Processing summary



The validation report provides the basis for reviewing data quality before the import process is finalized.



# 12\. Logical Relationship Model

## 

## 12.01 Purpose



The Logical Data Model defines the canonical entities, their relationships and the cardinality governing those relationships.

It provides an implementation-independent blueprint for database design while preserving the architectural principles established by this specification.

The logical model describes what relationships exist, not how they are physically implemented.



## 12.02 Design Principles



The Logical Data Model follows these principles:

Each canonical entity represents a single business concept.
Relationships shall be defined explicitly.
Information shall be stored only once wherever practical.
Many-to-many relationships shall be resolved through appropriate association structures.
Logical relationships shall remain independent of database technology.



## 12.03 Primary Canonical Entities



The Birds platform consists of the following primary canonical entities:

Bird Species
Broad Classification
Common Family
Scientific Family
eBird Classification
Habitat
Feeding Habit
Conservation Status
Geographic Location
Species Occurrence
Bird Observation
Classification Definition

Each entity represents a distinct aspect of bird knowledge and shall maintain its own canonical identity.



## 12.04 Core Relationships



The principal logical relationships are:

Parent Entity	Relationship	Child Entity
Broad Classification	One-to-Many	Bird Species
Common Family	One-to-Many	Bird Species
Scientific Family	One-to-Many	Bird Species
eBird Classification	One-to-Many	Bird Species
Conservation Status	One-to-Many	Bird Species
Bird Species	Many-to-Many	Habitat
Bird Species	Many-to-Many	Feeding Habit
Bird Species	One-to-Many	Species Occurrence
Geographic Location	One-to-Many	Species Occurrence
Species Occurrence	One-to-Many	Bird Observation
Classification Definition	One-to-One (Logical)	Classification Value



## 12.05 Species-Centred Model



Bird Species forms the central entity within the logical data model.

All classifications, ecological attributes, geographic occurrence and observations relate to Bird Species either directly or through defined intermediary entities.

No canonical entity shall duplicate the responsibilities of Bird Species.



## 12.06 Relationship Constraints



Logical relationships shall satisfy the following constraints:

Parent entities may exist without child records.
Child entities shall reference valid parent entities.
Duplicate relationships shall not be created.
Relationship cardinality shall conform to the Canonical Domain Model.
Deletion rules shall preserve referential integrity.



## 12.07 Logical Independence



The Logical Data Model is independent of:

database engine
table structure
ORM or query framework
programming language
API implementation

Physical implementation decisions shall preserve the logical relationships defined by this specification.



\---



# 13\. Import Workflow

## 

## 13.01 Purpose



The Import Workflow defines the canonical process for introducing bird data into the Birds repository.

It ensures that data is imported consistently, validated before acceptance, and integrated without compromising the integrity of the canonical data model.



## 13.02 Workflow Principles



Every import shall:

Preserve canonical identities.
Prevent duplicate records.
Validate data before commit.
Maintain referential integrity.
Produce a complete import report.

No import shall bypass the defined workflow.



## 13.03 Standard Import Sequence



Every import shall follow the following logical sequence:

Load source data.
Validate source structure.
Normalize source values.
Resolve canonical entities.
Validate relationships.
Detect duplicates.
Apply enrichment.
Commit validated data.
Generate validation and import reports.

Each stage shall complete successfully before the next stage begins.



## 13.04 Import Modes



The platform may support multiple import modes, including:

Initial seed import
Incremental import
Data enrichment
Corrective update
Full rebuild

Each import mode shall follow the same validation and integrity rules defined by this specification.



## 13.05 Error Handling



Validation failures shall not terminate the entire import unless required by the selected import policy.

Where practical, individual records shall be reported as:

Accepted
Updated
Skipped
Rejected
Requires Editorial Review



## 13.06 Import Audit



Every import shall retain sufficient audit information to support future review.

Audit information should include:

Import source
Import date
Import type
Records processed
Records created
Records updated
Records skipped
Validation errors
Processing outcome



\---



# 14\. Data Versioning

## 

## 14.01 Purpose



Data Versioning provides a controlled mechanism for managing changes to canonical bird data while preserving historical integrity.



## 14.02 Versioning Principles



Canonical Bird Species identities shall remain stable throughout the lifetime of the platform.

Changes to names, classifications or editorial content shall update the existing canonical record rather than create duplicate identities.



## 14.03 Scientific Revisions



Where scientific authorities revise taxonomy, nomenclature or classification:

Historical traceability should be preserved.
Existing observations shall remain associated with the correct Bird Species.
Previous scientific values may be retained for audit purposes where appropriate.



## 14.04 Editorial Revisions



Editorial content may evolve independently of scientific taxonomy.

Changes to descriptions, local names, educational content or media shall not alter the canonical identity of the Bird Species.



## 14.05 Import History



The platform should retain sufficient history to identify:

when a record was imported,
the source of the import,
the import batch,
and significant subsequent updates.



# 15\. Data Governance



## 15.01 Purpose



Data Governance defines the principles for maintaining the long-term quality, consistency and authority of the Birds repository.



## 15.02 Governance Principles



The Birds repository shall be managed according to the following principles:

Canonical identities are permanent.
Scientific accuracy shall be maintained.
Editorial content shall complement, not replace, scientific data.
Controlled vocabularies shall be managed consistently.
All significant changes shall be traceable.

## 15.03 Roles and Responsibilities



Responsibility for bird data may include:

Role	Responsibility
Scientific Authority	Taxonomic reference
BCC Curators	Editorial content and local knowledge
Contributors	Observations and photographs
Verifiers	Observation verification
Platform	Validation, integrity and audit

## 15.04 Change Management



Changes to canonical bird data shall occur only through approved workflows.

Direct modification that bypasses validation and governance procedures shall not be permitted.



## 15.05 Future Evolution

The Birds Data Model has been designed to support future expansion while preserving the integrity of the canonical repository.

New entities, classifications and ecological attributes may be introduced provided they comply with the Canonical Data Principles established by this specification.

