BIRD-DB-001
Bird Database Implementation Specification
Version 1.0



# 1\. Purpose



## 1.1 Objective



This document defines the **physical relational database implementation** for the Bhopal Camera Club Bird Database.



It translates the logical entities and relationships defined in **BIRD-DATA-001 — Bird Data Constitution** into a normalized relational schema suitable for implementation using:



MySQL

* Kysely
* NestJS
* Fastify



This document specifies:



* Physical tables
* Columns
* Keys
* Constraints
* Indexes
* Audit strategy
* Migration order
* Storage conventions



It intentionally avoids defining business rules, validation logic, workflows, API behaviour, or user interface implementation.



\---



## 1.2 Relationship to BIRD-DATA-001



**BIRD-DATA-001** is the authoritative business specification for the Bird Database.

This document exists solely to define its physical implementation within a relational database.

Where any ambiguity exists, **BIRD-DATA-001 takes precedence.**

No business rules shall be duplicated, reinterpreted, or redefined within this document.



\---



## 1.3 Scope



This specification covers:



* Physical database architecture
* Table definitions
* Column specifications
* Primary keys
* Foreign keys
* Junction tables
* Constraints
* Index strategy
* Audit fields
* Soft deletion strategy
* Migration sequencing
* Performance considerations



The following are explicitly outside the scope of this document:



* Business rules
* Validation logic
* Taxonomy definitions
* API design
* NestJS services
* Repository implementation
* Import workflow logic
* Administrative interfaces
* User interface behaviour



\---



## 1.4 Design Goals



The Bird Database has been designed around the following principles.



### Stability



The schema should remain valid for many years with minimal structural changes.



### Normalization



Reference data shall be normalized wherever practical to minimise duplication while maintaining data integrity.



### Performance



The schema shall support efficient querying across large datasets while maintaining straightforward indexing strategies.



### Extensibility



Future enhancements—including multilingual names, regional datasets, migration information, conservation records, and additional taxonomic attributes—should be achievable through additive schema evolution rather than structural redesign.



### Maintainability



Table names, column names, keys, and relationships shall remain consistent with the conventions adopted across the BCC Unified Platform.



### Referential Integrity



Relationships between entities shall be enforced through foreign keys wherever appropriate.



\---



## 1.5 Intended Audience



This document is intended for:



* Database architects
* Backend developers
* Migration authors
* System maintainers
* Future contributors to the Bird Database subsystem



It is not intended to serve as business documentation, API documentation, or end-user documentation.



\---



# 2\. Database Design Principles



This section defines the architectural principles governing the physical implementation of the Bird Database. These principles apply to every table, relationship, index, and migration defined throughout this specification.



\---



## 2.1 Single Source of Truth



The Bird Database shall maintain a single authoritative record for each logical entity.

Duplicate storage of the same business information shall be avoided unless explicitly required for performance optimisation or historical preservation.



\---



## 2.2 Normalization



The schema shall be normalized to at least **Third Normal Form (3NF)**.

Reference data such as families, orders, conservation statuses, habitats, and similar lookup entities shall be stored in dedicated reference tables rather than duplicated across records.

Denormalization may be introduced only after measurable performance analysis and shall always be documented.



\---



## 2.3 Surrogate Primary Keys



All primary entities shall use surrogate integer primary keys.

Primary keys shall:

* be auto-generated
* remain immutable
* have no business meaning
* never be exposed as editable values

Business identifiers, if required, shall be stored separately from the primary key.



\---



## 2.4 Referential Integrity



Relationships between entities shall be enforced using foreign key constraints wherever practical.

Every foreign key shall reference an existing parent record unless the relationship is explicitly optional.

Application code shall complement—but never replace—database-enforced referential integrity.



\---



## 2.5 Immutable Reference Data



Reference tables representing controlled vocabularies should be treated as operationally static.

Examples include:



* Broad Classifications
* Bird Families
* Conservation Statuses
* Residency Types
* Habitat Types



These datasets may receive periodic additions or corrections but shall not be routinely modified during normal application use.



\---

## 

## 2.6 Nullability



Columns shall be declared **NOT NULL** wherever a meaningful value is required for valid operation.

Nullable columns shall only be used where the absence of information is both expected and semantically valid.

Null shall never be used to represent "Unknown" when an explicit value can be defined.



\---



## 2.7 Data Integrity



Integrity shall be enforced primarily at the database level using:



* Primary keys
* Foreign keys
* Unique constraints
* Check constraints (where supported)
* Default values



Application-level validation provides additional protection but does not replace database constraints.



\---



## 2.8 Consistent Data Types



Equivalent concepts shall use identical data types throughout the schema.

For example:

* all foreign keys referencing the same entity shall use identical integer types
* timestamps shall use a consistent datetime type
* boolean values shall use a consistent boolean representation
* textual identifiers shall use consistent character lengths



\---



## 2.9 Soft Deletion



Operational entities shall support soft deletion rather than immediate physical removal.



Soft deletion preserves:



* historical relationships
* audit trails
* future recovery
* reporting consistency



Reference tables should normally not support soft deletion unless explicitly required.



\---



## 2.10 Auditability



Operational entities shall include audit metadata to record:

* creation
* modification
* optional deletion



Audit information supports operational maintenance, troubleshooting, and future governance requirements.



\---



## 2.11 Performance First, Complexity Second



The schema should favour clarity and maintainability while supporting efficient query execution.

Indexes shall be introduced based on expected query patterns rather than speculative optimisation.

Complex structures intended solely for theoretical performance gains should be avoided unless supported by measurable evidence.



\---



## 2.12 Future Expansion



The database architecture shall support future enhancement without requiring structural redesign.



Examples include:



* multilingual common names
* regional checklists
* migration records
* breeding information
* media associations
* citizen science integrations
* taxonomic revisions



Future capabilities should be accommodated through additive schema evolution rather than disruptive restructuring.



\---



# 3\. Naming Conventions



Consistency in naming is essential for long-term maintainability, readability, and predictable query construction. The conventions defined in this section shall be applied uniformly throughout the Bird Database.



\---



## 3.1 General Principles



Database object names shall be:



* descriptive
* singular where representing a single entity
* lowercase
* separated using underscores
* free from spaces and special characters
* stable over time



Abbreviations shall be avoided unless they are universally understood.



\---



## 3.2 Table Names



Entity tables shall use singular nouns.



Examples:



* `bird`
* `common\\\_family`
* `bird\\\_classification`
* `habitat`
* `conservation\\\_status`



Junction tables shall combine the participating entity names.



Examples:



* `bird\\\_habitat`
* `bird\_feeding\_habit`
* `geographic\\\_location`



\---



## 3.3 Column Names



Column names shall:



* use lowercase
* use snake\_case
* describe the stored value rather than its presentation



Examples:



```text

scientific\\\_name

common\\\_name

display\\\_order

is\\\_active

created\\\_at

updated\\\_at

deleted\\\_at

```



\---



## 3.4 Primary Keys



Primary keys shall always be named:



```text

id

```



Examples:



```text

bird.id

common\\\_family.id

habitat.id

```



\---



## 3.5 Foreign Keys



Foreign key columns shall use the referenced table name followed by `\\\_id`.



Examples:



```text

family\\\_id

order\\\_id

status\\\_id

habitat\\\_id

```



Foreign key names shall remain consistent throughout the schema.



\---



## 3.6 Boolean Columns



Boolean columns shall begin with:



* `is\\\_`
* `has\\\_`
* `can\\\_`



Examples:



```text

is\\\_active

is\\\_endemic

is\\\_migratory

has\\\_seasonal\\\_variation

can\\\_display\\\_publicly

```



\---



## 3.7 Date and Time Columns



Timestamp columns shall follow consistent naming.



Examples:



```text

created\\\_at

updated\\\_at

deleted\\\_at

published\\\_at

verified\\\_at

```



All timestamps shall use UTC.



\---



## 3.8 Sort Order Columns



Where manual ordering is required, the column name shall be:



```text

display\\\_order

```



This naming shall be used consistently across all lookup and reference tables.



\---



## 3.9 Status Columns



Status columns shall use descriptive names rather than generic values.



Examples:



```text

status

verification\\\_status

publication\\\_status

```



Avoid ambiguous names such as:



```text

state

flag

mode

type

```



unless their meaning is explicitly defined.



\---



## 3.10 Constraint Naming



Constraints shall follow consistent naming patterns.



Primary Keys



```text

pk\\\_<table>

```



Examples:



```text

pk\\\_bird

pk\\\_common\\\_family

```



Foreign Keys



```text

fk\\\_<table>\\\_<referenced\\\_table>

```



Examples:



```text

fk\\\_common\\\_family

fk\\\_bird\\\_classification

fk\\\_bird\\\_status

```



Unique Constraints



```text

uk\\\_<table>\\\_<column>

```



Examples:



```text

uk\\\_bird\\\_scientific\\\_name

uk\\\_family\\\_name

```



Check Constraints



```text

chk\\\_<table>\\\_<column>

```



Examples:



```text

chk\\\_bird\\\_display\\\_order

chk\\\_status\\\_code

```



\---



## 3.11 Index Naming



Indexes shall use the prefix:



```text

idx\\\_

```



Examples:



```text

idx\\\_bird\\\_common\\\_name

idx\\\_common\\\_family

idx\\\_bird\\\_status

idx\\\_bird\\\_scientific\\\_name

```



Composite indexes shall include the participating columns in order.



Example:



```text

idx\\\_common\\\_family\\\_status

```



\---



## 3.12 Junction Table Naming



Many-to-many relationship tables shall combine both entity names in a predictable order.



Examples:



```text

bird\\\_habitat

bird\_feeding\_habit

geographic\\\_location


```



Each junction table shall contain only the foreign keys required to define the relationship unless additional relationship metadata is required.



\---



## 3.13 Reserved Words



Database object names shall avoid SQL reserved keywords.



Examples to avoid:



```text

order

group

user

index

key

select

table

```



Where necessary, names shall be expanded to remain explicit.



Examples:



```text

bird\\\_classification

user\\\_account

photo\\\_group

```



\---



## 3.14 Naming Consistency



Once a table, column, or constraint name has been adopted, it shall remain stable.



Renaming database objects should be considered a schema-breaking change and avoided except where absolutely necessary.



\---



# 4\. Physical Entity Model



This section defines the physical entity model implementing the logical architecture established by **BIRD-DATA-001**.



It provides a high-level overview of the relational schema before the detailed table specifications presented in the following sections.



The entities described here represent the permanent structural foundation of the Bird Database. Detailed column definitions, constraints, indexes, and storage characteristics are intentionally deferred to the individual table
specifications.



\---



## 4.1 Entity Categories



The Bird Database is organized into four logical categories of entities.



### Core Entity



The Core Entity represents the canonical record for each Bird Species and serves as the primary parent entity throughout the database.



* Bird



\---



### Reference Entities



Reference Entities define the controlled vocabularies and canonical classifications shared across the platform. These entities are relatively stable, independently maintainable, and provide standardized values referenced by operational
records.



Reference Entities include:



* Broad Classification
* Common Family
* Scientific Family
* eBird Classification
* Conservation Status
* Habitat
* Feeding Habit
* Migratory Status
* Geographic Location
* Language



Reference entities shall remain synchronized with the classifications defined in **BIRD-DATA-001**.



\---



### Operational Entities



Operational Entities record information directly associated with Bird Species and represent the primary working data of the Bird Database.



Operational Entities include:



* Bird Name
* Species Occurrence
* Bird Observation



These entities capture multilingual names, ecological distribution, and individual observation records while maintaining normalization through foreign key relationships.



\---



### Junction Entities



Many-to-many relationships shall be implemented using dedicated junction tables.



Current Junction Entities include:



* Bird Habitat
* Bird Feeding Habit



Junction entities shall contain only relationship data unless the relationship itself requires additional descriptive attributes.



\---



## 4.2 Entity Relationships



Relationships between entities shall be implemented using database-enforced foreign keys.



The physical schema supports the following relationship types:



* One-to-One
* One-to-Many
* Many-to-One
* Many-to-Many



Many-to-many relationships shall always be resolved through dedicated junction tables.



Each relationship shall be explicitly documented within the corresponding table specification.



\---



## 4.3 Reference Data Model



Reference Entities represent canonical datasets that are shared across multiple operational records.



These entities shall:



* contain relatively stable data
* support referential integrity
* avoid duplication of descriptive values
* remain independently maintainable
* contain no operational or transactional data



Changes to reference data should occur only through controlled administrative processes.



\---



## 4.4 Junction Model



Many-to-many associations shall be implemented using dedicated junction entities.



Each junction entity shall:



* reference both parent entities
* enforce uniqueness of each relationship
* prevent duplicate associations
* remain independent of application logic



Additional attributes shall only be introduced where the relationship itself possesses meaningful business significance.



\---



## 4.5 Schema Evolution



The physical entity model has been designed to support future enhancement through additive schema evolution.



Future revisions may introduce new reference entities, operational entities, or junction entities without requiring structural redesign of the existing schema.



Examples include:



* additional multilingual content
* taxonomic revisions
* ecological attributes
* media associations
* citizen science integrations
* conservation monitoring
* analytical datasets



Backward compatibility should be preserved wherever practical.



\---



## 4.6 Architectural Principles



The physical entity model follows the following guiding principles:



* one responsibility per entity
* normalized reference data
* database-enforced referential integrity
* minimal data duplication
* predictable entity relationships
* stable surrogate identifiers
* scalable relational design
* additive schema evolution



These principles apply uniformly across every table defined within this specification.



# 5\. Table Specifications



This section defines the physical implementation of every table within the Bird Database.



Each table specification includes:



* Purpose
* Columns
* Data Types
* Primary Key
* Foreign Keys
* Constraints
* Default Values
* Relationships
* Recommended Indexes
* Notes



All tables shall conform to the architectural principles defined earlier in this specification.



\---



## 5.1 Table Specification Template



Each table shall be documented using the following format.



### Purpose



Describes the responsibility of the table.



### Columns



| Column | Data Type | Null | Default | Description |

|---------|-----------|------|----------|-------------|



### Primary Key



Defines the table's primary key.



### Foreign Keys



Lists all foreign key relationships.



### Constraints



Lists unique constraints, check constraints, and business-enforced database constraints.



### Indexes



Lists recommended indexes supporting expected query patterns.



### Relationships



Summarizes parent and child relationships.



### Notes



Implementation notes specific to the table.



\---



## 5.2 Table Catalogue



The following sections define the implementation of every table within the Bird Database.



The order presented here also represents the recommended logical reading order of the schema.



The table catalogue shall remain synchronized with **BIRD-DATA-001**.



\---



### 5.2.1 Core Entity



* Bird



\---



### 5.2.2 Reference Entities



* Broad Classification
* Common Family
* Scientific Family
* eBird Classification
* Conservation Status
* Habitat
* Feeding Habit
* Migratory Status
* Geographic Location
* Language



\---



### 5.2.3 Operational Entities



* Bird Name
* Species Occurrence
* Bird Observation



\---



### 5.2.4 Junction Entities



* Bird Habitat
* Bird Feeding Habit



## 5.3 Recommended Migration Order



The following sequence is recommended when creating the Bird Database schema to ensure that all foreign key dependencies are satisfied.



1. Language
2. Broad Classification
3. Common Family
4. Scientific Family
5. eBird Classification
6. Conservation Status
7. Habitat
8. Feeding Habit
9. Migratory Status
10. Geographic Location
11. Bird
12. Bird Name
13. Bird Habitat
14. Bird Feeding Habit
15. Species Occurrence
16. Bird Observation



This ordering is advisory and reflects the dependency hierarchy of the relational schema.



## 5.4 Bird



### Purpose

(Already completed)



### Columns



| Column | Type | Null | Key | Default | Notes |

|--------|------|------|-----|---------|------|

| id | BIGINT UNSIGNED | No | PK | Auto Increment | Surrogate primary key |

| common\_name | VARCHAR(200) | No | | | Canonical English display name |

| scientific\_name | VARCHAR(255) | No | UNIQUE | | Canonical scientific name |

| broad\_classification\_id | BIGINT UNSIGNED | No | FK | | References broad\_classification |

| common\_family\_id | BIGINT UNSIGNED | No | FK | | References common\_family |

| scientific\_family\_id | BIGINT UNSIGNED | No | FK | | References scientific\_family |

| ebird\_classification\_id | BIGINT UNSIGNED | No | FK | | References ebird\_classification |

| conservation\_status\_id | BIGINT UNSIGNED | No | FK | | References conservation\_status |

| identification\_notes | TEXT | Yes | | NULL | Identification guidance |

| editorial\_notes | TEXT | Yes | | NULL | Internal editorial information |

| created\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Record creation |

| updated\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Auto-updated |

| deleted\_at | TIMESTAMP | Yes | | NULL | Soft delete |



\---



### Relationships



The `bird` table is the canonical parent entity.



Each Bird shall:



* belong to one Broad Classification.
* belong to one Common Family.
* belong to one Scientific Family.
* belong to one eBird Classification.
* belong to one Conservation Status.



Each Bird may:



* possess multiple Bird Names.
* possess multiple Habitat relationships.
* possess multiple Feeding Habit relationships.
* possess multiple Species Occurrence records.
* possess multiple Bird Observation records.



All many-to-many relationships shall be implemented using dedicated junction tables.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `scientific\\\_name`.
* Foreign Keys shall enforce referential integrity.
* `common\\\_name` shall be mandatory.
* `scientific\\\_name` shall be mandatory.
* Classification foreign keys shall be mandatory.
* Soft deletion shall preserve historical relationships.
* Canonical Bird identities shall never be reused.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_BIRD | id | Primary key |

| UQ\_BIRD\_SCIENTIFIC\_NAME | scientific\_name | Species reconciliation |

| IX\_BIRD\_COMMON\_NAME | common\_name | Public search |

| IX\_BIRD\_BROAD\_CLASSIFICATION | broad\_classification\_id | Filtering |

| IX\_BIRD\_COMMON\_FAMILY | common\_family\_id | Filtering |

| IX\_BIRD\_SCIENTIFIC\_FAMILY | scientific\_family\_id | Filtering |

| IX\_BIRD\_EBIRD | ebird\_classification\_id | Filtering |

| IX\_BIRD\_CONSERVATION | conservation\_status\_id | Filtering |

| IX\_BIRD\_DELETED | deleted\_at | Active record filtering |



\---



### Default Values



| Column | Default |

|--------|---------|

| created\_at | CURRENT\_TIMESTAMP |

| updated\_at | CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP |

| deleted\_at | NULL |



No default values shall be assigned to business attributes.



\---



### Notes



* The Bird table stores only intrinsic species attributes.
* Habitat, Feeding Habit, Geography, Species Occurrence and Observations are implemented as independent canonical entities.
* Multilingual names shall be implemented through the `bird\\\_name` entity and shall not be stored directly in this table.
* Scientific taxonomy may evolve without changing the Bird identity.
* The surrogate primary key remains immutable for the lifetime of the platform.



## 5.5 Broad Classification



### Purpose



The `broad\\\_classification` table stores the canonical educational classifications used to organize Bird Species into high-level groups for navigation, learning and public discovery.



Broad Classification is an editorial classification and is intentionally independent of scientific taxonomy.



Each Broad Classification shall exist only once within the database and may be referenced by many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Default | Notes |

|--------|------|------|-----|---------|------|

| id | BIGINT UNSIGNED | No | PK | Auto Increment | Surrogate primary key |

| name | VARCHAR(100) | No | UNIQUE | | Canonical classification name |

| description | TEXT | Yes | | NULL | Educational description |

| introduction | TEXT | Yes | | NULL | Introductory content |

| identification\_overview | TEXT | Yes | | NULL | Identification guidance |

| habitat\_summary | TEXT | Yes | | NULL | General habitat notes |

| behaviour\_summary | TEXT | Yes | | NULL | Typical behaviour |

| display\_order | INT UNSIGNED | No | | 0 | UI ordering |

| cover\_photo\_id | BIGINT UNSIGNED | Yes | FK | NULL | Representative image |

| icon | VARCHAR(100) | Yes | | NULL | Icon identifier |

| is\_active | BOOLEAN | No | | TRUE | Active status |

| created\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Record creation |

| updated\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Auto updated |

| deleted\_at | TIMESTAMP | Yes | | NULL | Soft delete |



\---



### Relationships



Each Broad Classification may:



* contain multiple Bird Species.
* possess one representative Cover Photograph.
* be associated with one Classification Definition.



Bird Species shall reference exactly one Broad Classification.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Classification names shall not be empty.
* Foreign key integrity shall be enforced.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_BROAD\_CLASSIFICATION | id | Primary key |

| UQ\_BROAD\_CLASSIFICATION\_NAME | name | Uniqueness |

| IX\_BROAD\_CLASSIFICATION\_ORDER | display\_order | UI ordering |

| IX\_BROAD\_CLASSIFICATION\_ACTIVE | is\_active | Active filtering |

| IX\_BROAD\_CLASSIFICATION\_DELETED | deleted\_at | Soft delete filtering |



\---



### Default Values



| Column | Default |

|--------|---------|

| display\_order | 0 |

| is\_active | TRUE |

| created\_at | CURRENT\_TIMESTAMP |

| updated\_at | CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP |

| deleted\_at | NULL |



\---



### Notes



* Broad Classification is an educational grouping and shall remain independent of scientific taxonomy.
* Future editorial content may be added without affecting Bird Species records.
* Classification names shall remain stable unless revised through approved editorial workflows.



## 5.6 Common Family



### Purpose



The `common\\\_family` table stores the canonical common-language family groupings used throughout the Birds of Bhopal platform.



Common Families represent familiar field-guide groupings used by photographers, birdwatchers and the general public. They are educational classifications and are intentionally independent of scientific taxonomy.



Each Common Family shall exist only once within the database and may be referenced by many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Default | Notes |

|--------|------|------|-----|---------|------|

| id | BIGINT UNSIGNED | No | PK | Auto Increment | Surrogate primary key |

| name | VARCHAR(150) | No | UNIQUE | | Canonical common family name |

| description | TEXT | Yes | | NULL | Editorial description |

| display\_order | INT UNSIGNED | No | | 0 | UI ordering |

| is\_active | BOOLEAN | No | | TRUE | Active status |

| created\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Record creation |

| updated\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Auto updated |

| deleted\_at | TIMESTAMP | Yes | | NULL | Soft delete |



\---



### Relationships



Each Common Family may:



* contain multiple Bird Species.



Each Bird Species shall reference one Common Family.



Common Family shall remain independent of Scientific Family.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Family names shall not be empty.
* Foreign key integrity shall be enforced.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_COMMON\_FAMILY | id | Primary key |

| UQ\_COMMON\_FAMILY\_NAME | name | Uniqueness |

| IX\_COMMON\_FAMILY\_ORDER | display\_order | UI ordering |

| IX\_COMMON\_FAMILY\_ACTIVE | is\_active | Active filtering |

| IX\_COMMON\_FAMILY\_DELETED | deleted\_at | Soft delete filtering |



\---



### Default Values



| Column | Default |

|--------|---------|

| display\_order | 0 |

| is\_active | TRUE |

| created\_at | CURRENT\_TIMESTAMP |

| updated\_at | CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP |

| deleted\_at | NULL |



\---



### Notes



* Common Family is an educational classification and is independent of Scientific Family.
* Relationships between Common Family and Scientific Family are resolved through the Bird table.
* Editorial content may be expanded without affecting Bird Species records.



## 5.7 Scientific Family



### Purpose



The `scientific\\\_family` table stores the canonical scientific families adopted by the Birds of Bhopal platform.



Scientific Families represent formal biological taxonomy according to the project's adopted taxonomic authority.



Each Scientific Family shall exist only once within the database and may be referenced by many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Default | Notes |

|--------|------|------|-----|---------|------|

| id | BIGINT UNSIGNED | No | PK | Auto Increment | Surrogate primary key |

| scientific\_name | VARCHAR(150) | No | UNIQUE | | Canonical scientific family name |

| authority | VARCHAR(150) | Yes | | NULL | Taxonomic authority |

| description | TEXT | Yes | | NULL | Editorial description |

| is\_active | BOOLEAN | No | | TRUE | Active status |

| created\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Record creation |

| updated\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Auto updated |

| deleted\_at | TIMESTAMP | Yes | | NULL | Soft delete |



\---



### Relationships



Each Scientific Family may:



* contain multiple Bird Species.



Each Bird Species shall reference one Scientific Family.



Scientific Family shall remain independent of Common Family.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `scientific\\\_name`.
* Scientific Family names shall not be empty.
* Foreign key integrity shall be enforced.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_SCIENTIFIC\_FAMILY | id | Primary key |

| UQ\_SCIENTIFIC\_FAMILY\_NAME | scientific\_name | Uniqueness |

| IX\_SCIENTIFIC\_FAMILY\_ACTIVE | is\_active | Active filtering |

| IX\_SCIENTIFIC\_FAMILY\_DELETED | deleted\_at | Soft delete filtering |



\---



### Default Values



| Column | Default |

|--------|---------|

| is\_active | TRUE |

| created\_at | CURRENT\_TIMESTAMP |

| updated\_at | CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP |

| deleted\_at | NULL |



\---



### Notes



* Scientific Family follows the project's adopted taxonomic authority.
* Scientific taxonomic revisions shall preserve historical traceability wherever practical.
* Relationships between Scientific Family and Common Family are resolved through the Bird table.





## 5.8 eBird Classification



### Purpose



The `ebird\\\_classification` table stores the canonical eBird classification values adopted by the Birds of Bhopal platform.



The table provides compatibility with internationally recognised birding resources while remaining independent of Broad Classification, Common Family and Scientific Family.



Each eBird Classification shall exist only once within the database and may be referenced by many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Default | Notes |

|--------|------|------|-----|---------|------|

| id | BIGINT UNSIGNED | No | PK | Auto Increment | Surrogate primary key |

| name | VARCHAR(150) | No | UNIQUE | | Canonical eBird classification |

| description | TEXT | Yes | | NULL | Editorial description |

| is\_active | BOOLEAN | No | | TRUE | Active status |

| created\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Record creation |

| updated\_at | TIMESTAMP | No | | CURRENT\_TIMESTAMP | Auto updated |

| deleted\_at | TIMESTAMP | Yes | | NULL | Soft delete |



\---



### Relationships



Each eBird Classification may:



* classify multiple Bird Species.



Each Bird Species shall reference one eBird Classification.



The eBird Classification shall remain independent of Broad Classification, Common Family and Scientific Family.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Classification names shall not be empty.
* Foreign key integrity shall be enforced.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_EBIRD\_CLASSIFICATION | id | Primary key |

| UQ\_EBIRD\_CLASSIFICATION\_NAME | name | Uniqueness |

| IX\_EBIRD\_CLASSIFICATION\_ACTIVE | is\_active | Active filtering |

| IX\_EBIRD\_CLASSIFICATION\_DELETED | deleted\_at | Soft delete filtering |



\---



### Default Values



| Column | Default |

|--------|---------|

| is\_active | TRUE |

| created\_at | CURRENT\_TIMESTAMP |

| updated\_at | CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP |

| deleted\_at | NULL |



\---



### Notes



* eBird Classification exists to maintain compatibility with internationally recognised birding standards.
* Updates resulting from future eBird taxonomy revisions should preserve historical traceability where practical.
* This classification remains independent of the platform's educational classifications.





## 5.9 Conservation Status



### Purpose



The `conservation\\\_status` table stores the canonical conservation assessment values adopted by the Birds of Bhopal platform.



Conservation Status provides a standardized measure of conservation concern based on the project's adopted conservation authority. Each status shall exist only once within the database and may be referenced by many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| name | VARCHAR(100) | No | UNIQUE | Canonical conservation status |

| code | VARCHAR(20) | Yes | UNIQUE | Standard code (e.g. LC, NT, VU, EN, CR) |

| description | TEXT | Yes | | Editorial description |

| authority | VARCHAR(100) | Yes | | Adopted conservation authority |

| is\_active | BOOLEAN | No | | Active status |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Conservation Status may be referenced by multiple Bird Species.



Each Bird Species shall reference one current Conservation Status.



Historical conservation assessments, where required, shall be maintained separately from the canonical reference data.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Unique constraint on `code`, where populated.
* Conservation Status names shall not be empty.
* Foreign key integrity shall be enforced.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_CONSERVATION\_STATUS | id | Primary key |

| UQ\_CONSERVATION\_STATUS\_NAME | name | Uniqueness |

| UQ\_CONSERVATION\_STATUS\_CODE | code | Standard code lookup |

| IX\_CONSERVATION\_STATUS\_ACTIVE | is\_active | Active filtering |

| IX\_CONSERVATION\_STATUS\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Conservation Status shall follow the project's adopted conservation authority.
* Changes to conservation assessments shall preserve historical traceability where appropriate.
* This table stores only canonical reference values and not the conservation history of individual species.



## 5.10 Habitat



### Purpose



The `habitat` table stores the canonical habitat classifications used throughout the Birds of Bhopal platform.



Habitats represent the natural environments in which Bird Species occur and provide a standardized vocabulary for ecological classification, search, filtering and educational content.



Each Habitat shall exist only once within the database and may be associated with many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| name | VARCHAR(100) | No | UNIQUE | Canonical habitat name |

| description | TEXT | Yes | | Editorial description |

| is\_active | BOOLEAN | No | | Active status |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Habitat may be associated with multiple Bird Species.



Each Bird Species may occupy multiple Habitats.



The relationship between Bird Species and Habitat shall be implemented through the `bird\\\_habitat` junction table.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Habitat names shall not be empty.
* Habitat values shall be maintained using the project's controlled vocabulary.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_HABITAT | id | Primary key |

| UQ\_HABITAT\_NAME | name | Uniqueness |

| IX\_HABITAT\_ACTIVE | is\_active | Active filtering |

| IX\_HABITAT\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Habitat is an independent canonical entity.
* Habitat values shall never be stored directly in the `bird` table.
* Multiple Habitats may be associated with a single Bird Species through the canonical junction table.
* Editorial descriptions may evolve without affecting Bird Species records.



## 5.11 Feeding Habit



### Purpose



The `feeding\\\_habit` table stores the canonical feeding habit classifications used throughout the Birds of Bhopal platform.



Feeding Habits describe the primary dietary behaviour of Bird Species and provide a standardized vocabulary for ecological classification, filtering, search and educational content.



Each Feeding Habit shall exist only once within the database and may be associated with many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| name | VARCHAR(100) | No | UNIQUE | Canonical feeding habit |

| description | TEXT | Yes | | Editorial description |

| is\_active | BOOLEAN | No | | Active status |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Feeding Habit may be associated with multiple Bird Species.



Each Bird Species may possess multiple Feeding Habits.



The relationship between Bird Species and Feeding Habit shall be implemented through the `bird\\\_feeding\\\_habit` junction table.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Feeding Habit names shall not be empty.
* Feeding Habit values shall be maintained using the project's controlled vocabulary.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_FEEDING\_HABIT | id | Primary key |

| UQ\_FEEDING\_HABIT\_NAME | name | Uniqueness |

| IX\_FEEDING\_HABIT\_ACTIVE | is\_active | Active filtering |

| IX\_FEEDING\_HABIT\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Feeding Habit is an independent canonical entity.
* Feeding Habit values shall never be stored directly in the `bird` table.
* Multiple Feeding Habits may be associated with a single Bird Species through the canonical junction table.
* Editorial descriptions may evolve without affecting Bird Species records.



## 5.12 Migratory Status



### Purpose



The `migratory\\\_status` table stores the canonical migratory classifications used throughout the Birds of Bhopal platform.



Migratory Status describes the typical migration behaviour of a Bird Species within the geographical scope of the project. Each status shall exist only once within the database and may be referenced by many Bird Species.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| name | VARCHAR(100) | No | UNIQUE | Canonical migratory status |

| description | TEXT | Yes | | Editorial description |

| is\_active | BOOLEAN | No | | Active status |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Migratory Status may be assigned to multiple Bird Species.



Each Species Occurrence shall reference one Migratory Status.



Detailed regional and seasonal occurrences shall be maintained separately within the `species\\\_occurrence` table.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Migratory Status names shall not be empty.
* Migratory Status values shall be maintained using the project's controlled vocabulary.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_MIGRATORY\_STATUS | id | Primary key |

| UQ\_MIGRATORY\_STATUS\_NAME | name | Uniqueness |

| IX\_MIGRATORY\_STATUS\_ACTIVE | is\_active | Active filtering |

| IX\_MIGRATORY\_STATUS\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Migratory Status represents the canonical migration behaviour of a species within the project's geographical scope.
* Seasonal occurrence and regional variations shall not be stored in this table.
* Detailed migration records shall be maintained through the `species\\\_occurrence` entity.



## 5.13 Geographic Location



### Purpose



The `geographic\\\_location` table stores the canonical geographical locations used throughout the Birds of Bhopal platform.



A Geographic Location represents a defined physical area where Bird Species may occur, be observed or be recorded. Locations provide the geographical framework for species occurrence, bird observations, hotspot management, reporting and
future mapping features.



Each Geographic Location shall exist only once within the database and may be referenced by many Species Occurrences and Bird Observations.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| name | VARCHAR(200) | No | UNIQUE | Canonical location name |

| parent\_location\_id | BIGINT UNSIGNED | Yes | FK | Parent location for hierarchical geography |

| location\_type | VARCHAR(50) | No | | District, City, Wetland, Forest, Lake, Sanctuary, National Park, etc. |

| latitude | DECIMAL(10,7) | Yes | | Geographic coordinate |

| longitude | DECIMAL(10,7) | Yes | | Geographic coordinate |

| description | TEXT | Yes | | Editorial description |

| is\_active | BOOLEAN | No | | Active status |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Geographic Location may:



* contain multiple child Geographic Locations.
* be referenced by multiple Species Occurrences.
* be referenced by multiple Bird Observations.



Each Species Occurrence shall reference one Geographic Location.



Each Bird Observation shall reference one Geographic Location.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Foreign key on `parent\\\_location\\\_id`.
* Geographic hierarchy shall not contain circular references.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_GEOGRAPHIC\_LOCATION | id | Primary key |

| UQ\_GEOGRAPHIC\_LOCATION\_NAME | name | Uniqueness |

| IX\_LOCATION\_PARENT | parent\_location\_id | Hierarchy traversal |

| IX\_LOCATION\_TYPE | location\_type | Filtering |

| IX\_LOCATION\_ACTIVE | is\_active | Active filtering |

| IX\_LOCATION\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Geographic Locations form a hierarchical structure.
* The hierarchy enables navigation from broad regions to specific birding hotspots.
* Geographic Locations are independent of Bird Species.
* Species distribution is recorded through the `species\\\_occurrence` entity.
* Individual sightings are recorded through the `bird\\\_observation` entity.



## 5.14 Language



### Purpose



The `language` table stores the canonical languages supported by the Birds of Bhopal platform.



Languages provide the foundation for multilingual bird names and future multilingual content throughout the platform.



Each Language shall exist only once within the database and may be referenced by many Bird Name records.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| name | VARCHAR(100) | No | UNIQUE | Language name |

| iso\_code | VARCHAR(10) | No | UNIQUE | ISO 639 language code (e.g. en, hi, mr) |

| native\_name | VARCHAR(100) | Yes | | Language name in its native script |

| display\_order | INT UNSIGNED | No | | UI ordering |

| is\_active | BOOLEAN | No | | Active status |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Language may be associated with multiple Bird Names.



Each Bird Name shall reference one Language.



\---



### Constraints



* Primary Key on `id`.
* Unique constraint on `name`.
* Unique constraint on `iso\\\_code`.
* Language names shall not be empty.
* ISO language codes shall follow the project's adopted standard.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_LANGUAGE | id | Primary key |

| UQ\_LANGUAGE\_NAME | name | Uniqueness |

| UQ\_LANGUAGE\_ISO | iso\_code | ISO code lookup |

| IX\_LANGUAGE\_ACTIVE | is\_active | Active filtering |

| IX\_LANGUAGE\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Language is an independent canonical reference entity.
* The table supports multilingual Bird Names without requiring changes to the Bird entity.
* Additional languages may be introduced through normal administrative workflows without requiring schema changes.
* This entity may be reused by future multilingual modules across the BCC Unified Platform.



## 5.15 Bird Name



### Purpose



The `bird\\\_name` table stores all names associated with a Bird Species across multiple languages.



This table provides multilingual support by allowing each Bird Species to have one or more names in one or more languages. It supports common names, regional names, local names and future language expansion without requiring changes to
the Bird entity.



Each Bird Name shall belong to one Bird Species and one Language.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| bird\_id | BIGINT UNSIGNED | No | FK | References Bird |

| language\_id | BIGINT UNSIGNED | No | FK | References Language |

| name | VARCHAR(200) | No | | Bird name in the specified language |

| is\_primary | BOOLEAN | No | | Primary name within the language |

| display\_order | INT UNSIGNED | No | | Ordering when multiple names exist |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Bird may possess multiple Bird Names.



Each Language may be associated with multiple Bird Names.



Each Bird Name shall belong to one Bird Species and one Language.



\---



### Constraints



* Primary Key on `id`.
* Foreign Key on `bird\\\_id`.
* Foreign Key on `language\\\_id`.
* Bird names shall not be empty.
* Only one Bird Name per Bird per Language may be marked as `is\\\_primary = TRUE`.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_BIRD\_NAME | id | Primary key |

| IX\_BIRD\_NAME\_BIRD | bird\_id | Bird lookup |

| IX\_BIRD\_NAME\_LANGUAGE | language\_id | Language lookup |

| IX\_BIRD\_NAME\_PRIMARY | bird\_id, language\_id, is\_primary | Primary name lookup |

| IX\_BIRD\_NAME\_NAME | name | Name search |

| IX\_BIRD\_NAME\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* A Bird Species may have multiple names within the same language.
* Only one name per Bird per Language may be designated as the primary display name.
* This architecture supports regional variations, synonyms and future language expansion without modifying the Bird table.
* The Bird entity shall contain only the canonical scientific and primary common identifiers; all multilingual names shall reside in this table.



## 5.16 Bird Habitat



### Purpose



The `bird\\\_habitat` table implements the many-to-many relationship between Bird Species and Habitat.



It records the habitats in which a Bird Species is known to occur while maintaining normalization between the canonical Bird and Habitat entities.



Each record represents one Bird Species being associated with one Habitat.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| bird\_id | BIGINT UNSIGNED | No | PK, FK | References Bird |

| habitat\_id | BIGINT UNSIGNED | No | PK, FK | References Habitat |

| created\_at | TIMESTAMP | No | | Record creation |



\---



### Relationships



Each Bird Species may be associated with multiple Habitats.



Each Habitat may be associated with multiple Bird Species.



Each record represents one unique Bird–Habitat association.



\---



### Constraints



* Composite Primary Key (`bird\\\_id`, `habitat\\\_id`).
* Foreign Key on `bird\\\_id`.
* Foreign Key on `habitat\\\_id`.
* Duplicate Bird–Habitat associations shall not be permitted.
* Deleting a Bird or Habitat shall respect the project's referential integrity policy.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_BIRD\_HABITAT | bird\_id, habitat\_id | Composite primary key |

| IX\_BIRD\_HABITAT\_HABITAT | habitat\_id | Reverse lookup |



\---



### Notes



* This is a pure junction table.
* No habitat names or bird details shall be duplicated in this table.
* Additional ecological attributes (such as habitat preference, breeding habitat or seasonal habitat usage) may be introduced in future versions without altering the relationship model.



## 5.17 Bird Feeding Habit



### Purpose



The `bird\\\_feeding\\\_habit` table implements the many-to-many relationship between Bird Species and Feeding Habit.



It records the feeding habits exhibited by a Bird Species while maintaining normalization between the canonical Bird and Feeding Habit entities.



Each record represents one Bird Species being associated with one Feeding Habit.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| bird\_id | BIGINT UNSIGNED | No | PK, FK | References Bird |

| feeding\_habit\_id | BIGINT UNSIGNED | No | PK, FK | References Feeding Habit |

| created\_at | TIMESTAMP | No | | Record creation |



\---



### Relationships



Each Bird Species may be associated with multiple Feeding Habits.



Each Feeding Habit may be associated with multiple Bird Species.



Each record represents one unique Bird–Feeding Habit association.



\---



### Constraints



* Composite Primary Key (`bird\\\_id`, `feeding\\\_habit\\\_id`).
* Foreign Key on `bird\\\_id`.
* Foreign Key on `feeding\\\_habit\\\_id`.
* Duplicate Bird–Feeding Habit associations shall not be permitted.
* Deleting a Bird or Feeding Habit shall respect the project's referential integrity policy.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_BIRD\_FEEDING\_HABIT | bird\_id, feeding\_habit\_id | Composite primary key |

| IX\_BIRD\_FEEDING\_HABIT\_FEEDING | feeding\_habit\_id | Reverse lookup |



\---



### Notes



* This is a pure junction table.
* No feeding habit names or bird details shall be duplicated in this table.
* Additional ecological attributes (such as primary feeding habit, seasonal feeding behaviour, breeding diet or opportunistic feeding) may be introduced in future versions without altering the relationship model.



## 5.18 Species Occurrence



### Purpose



The `species\\\_occurrence` table records the known occurrence of a Bird Species within a specific Geographic Location.



It serves as the primary distribution model for the Birds of Bhopal platform by describing where a species occurs and providing ecological context such as migratory behaviour, seasonal presence, abundance and breeding status.



Each record represents the occurrence of one Bird Species at one Geographic Location.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| bird\_id | BIGINT UNSIGNED | No | FK | References Bird |

| geographic\_location\_id | BIGINT UNSIGNED | No | FK | References Geographic Location |

| migratory\_status\_id | BIGINT UNSIGNED | No | FK | References Migratory Status |

| seasonal\_presence | VARCHAR(100) | Yes | | Year-round, Winter, Summer, Monsoon, Passage, etc. |

| abundance | VARCHAR(50) | Yes | | Common, Uncommon, Rare, Very Rare, Accidental |

| breeding\_status | VARCHAR(100) | Yes | | Resident Breeder, Probable Breeder, Confirmed Breeder, Non-breeding Visitor |

| occurrence\_notes | TEXT | Yes | | Editorial notes |

| first\_recorded\_at | DATE | Yes | | Earliest known occurrence |

| last\_verified\_at | DATE | Yes | | Latest verification |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Bird Species may possess multiple Species Occurrences.



Each Geographic Location may contain multiple Bird Species.



Each Species Occurrence shall reference one Bird Species, one Geographic Location and one Migratory Status.



\---



### Constraints



* Primary Key on `id`.
* Foreign Keys on `bird\\\_id`, `geographic\\\_location\\\_id` and `migratory\\\_status\\\_id`.
* Duplicate Bird–Location occurrence records shall not be permitted.
* Soft deletion shall preserve historical references.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_SPECIES\_OCCURRENCE | id | Primary key |

| UQ\_SPECIES\_OCCURRENCE | bird\_id, geographic\_location\_id | Prevent duplicate occurrence records |

| IX\_SPECIES\_OCCURRENCE\_LOCATION | geographic\_location\_id | Location lookup |

| IX\_SPECIES\_OCCURRENCE\_MIGRATION | migratory\_status\_id | Migration filtering |

| IX\_SPECIES\_OCCURRENCE\_ABUNDANCE | abundance | Ecological filtering |

| IX\_SPECIES\_OCCURRENCE\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Species Occurrence represents the ecological distribution of a Bird Species rather than an individual sighting.
* Individual bird sightings shall be recorded in the Bird Observation entity.
* Migratory Status may vary by Geographic Location and therefore forms part of the occurrence record rather than the Bird entity.
* This entity provides the foundation for species distribution maps, hotspot checklists, seasonal filtering and regional bird lists.



## 5.19 Bird Observation



### Purpose



The `bird\\\_observation` table records individual observations of Bird Species within the Birds of Bhopal platform.



Each observation represents a single documented occurrence of one Bird Species at a specific Geographic Location and point in time. Observations provide the evidence supporting species occurrence, distribution, seasonal records and
future analytical reporting.



Bird Observations are operational records and shall remain independent of the canonical ecological data stored within the Species Occurrence entity.



\---



### Columns



| Column | Type | Null | Key | Notes |

|--------|------|------|-----|------|

| id | BIGINT UNSIGNED | No | PK | Surrogate primary key |

| bird\_id | BIGINT UNSIGNED | No | FK | References Bird |

| geographic\_location\_id | BIGINT UNSIGNED | No | FK | References Geographic Location |

| observed\_at | DATETIME | No | | Date and time of observation |

| observer\_name | VARCHAR(200) | Yes | | Observer or contributor |

| observation\_method | VARCHAR(100) | Yes | | Visual, Audio, Photograph, Video, Specimen, etc. |

| quantity | INT UNSIGNED | Yes | | Number of individuals observed |

| behaviour\_notes | TEXT | Yes | | Behaviour recorded during observation |

| weather\_notes | TEXT | Yes | | Weather or environmental conditions |

| observation\_notes | TEXT | Yes | | Additional notes |

| verification\_status | VARCHAR(50) | No | | Pending, Verified, Rejected |

| verified\_by | VARCHAR(200) | Yes | | Reviewer or verifier |

| verified\_at | DATETIME | Yes | | Verification timestamp |

| created\_at | TIMESTAMP | No | | Record creation |

| updated\_at | TIMESTAMP | No | | Record update |

| deleted\_at | TIMESTAMP | Yes | | Soft delete |



\---



### Relationships



Each Bird Observation shall reference one Bird Species.



Each Bird Observation shall reference one Geographic Location.



Each Bird Species may possess multiple Bird Observations.



Each Geographic Location may contain multiple Bird Observations.



\---



### Constraints



* Primary Key on `id`.
* Foreign Key on `bird\\\_id`.
* Foreign Key on `geographic\\\_location\\\_id`.
* `observed\\\_at` shall be mandatory.
* `verification\\\_status` shall use the project's controlled vocabulary.
* Soft deletion shall preserve historical records.



\---



### Indexes



| Index | Columns | Purpose |

|--------|---------|---------|

| PK\_BIRD\_OBSERVATION | id | Primary key |

| IX\_OBSERVATION\_BIRD | bird\_id | Bird lookup |

| IX\_OBSERVATION\_LOCATION | geographic\_location\_id | Location lookup |

| IX\_OBSERVATION\_DATE | observed\_at | Chronological queries |

| IX\_OBSERVATION\_STATUS | verification\_status | Verification workflow |

| IX\_OBSERVATION\_DELETED | deleted\_at | Soft delete filtering |



\---



### Notes



* Bird Observation records individual sightings and supporting evidence.
* Ecological distribution shall be maintained through the `species\\\_occurrence` entity.
* Multiple observations may support a single Species Occurrence.
* Observations may exist without requiring photographic evidence.
* Future enhancements may associate observations with photographs, audio recordings, checklists or external citizen-science datasets without altering the core observation model.



\---



# Freeze Declaration



**Document:** BIRD-DB-001 – Bird Database Implementation Specification



**Version:** 1.0



**Status:** FROZEN



This document defines the canonical physical database implementation for the Bird Database.



It implements the logical architecture defined by **BIRD-DATA-001** and shall remain synchronized with that specification.



Changes to the physical schema shall not be made through ad-hoc modification. Any structural changes shall be introduced only through a formally versioned revision of this specification and its corresponding implementation.



This document is considered the authoritative reference for database table structure, relationships, constraints, and physical schema organization for the Bird Database.

