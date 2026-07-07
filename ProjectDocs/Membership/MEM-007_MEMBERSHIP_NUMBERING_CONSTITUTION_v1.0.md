MEM-007 — Membership Numbering Constitution v1.0
Metadata
Document ID: MEM-007
Title: Membership Numbering Constitution v1.0
Classification: Constitutional Membership Artifact
Status: APPROVED / FROZEN / AUTHORITATIVE
Version: 1.1
Related Artifacts:

MEM-006 Membership Constitution \& Architecture
Membership Lifecycle Governance




1. Purpose
This document establishes the constitutional rules governing Membership Numbers within the BCC Unified Platform.
Membership Numbers provide:

Membership identification
Historical continuity
Migration normalization
Membership record permanence

Membership Numbers do not:

Define membership rights
Define membership categories
Define governance authority
Define entitlements

Those responsibilities remain governed by their respective constitutional artifacts.

2. Constitutional Principles
MP-001 — Permanence
Membership Numbers are permanent.
Once assigned, a Membership Number shall never change.

MP-002 — Uniqueness
A Membership Number shall belong to one membership record only.
No Membership Number may be assigned to more than one membership.

MP-003 — Non-Reuse
Membership Numbers shall never be reused.
Termination, expiration, suspension, resignation, death, or any other membership lifecycle event shall not release a number back into circulation.

MP-004 — Sequential Allocation
Membership Numbers shall be allocated sequentially from a unified numbering pool.

MP-005 — Historical Continuity
Membership Numbering shall preserve historical continuity wherever practical during migration and onboarding activities.

3. Unified Numbering Pool
A single numbering pool shall be used for all membership classes defined by MEM-006.
Membership category shall not create a separate numbering sequence.
4. Reserved Number Allocations
Founding Member Reservation
The following serial numbers are permanently reserved:
00001
00002
00003
00004
00005
00006
00007
These numbers are reserved exclusively for Founding Members.
These reservations are permanent.

Reserved Historical Allocation Block
The following serial range is permanently reserved:
00008 – 00020
This range exists for historical allocation purposes during migration and normalization activities.
The reserved block is intended for individuals who were not Founding Members but were associated with the organization during its formative years and whose historical continuity or contribution warrants preservation through reserved allocation.
Unused numbers within this range shall remain permanently reserved.

Operational Allocation Start
Operational sequential allocation begins at:
00021
All subsequent permanent allocations shall continue sequentially.

5. Historical Numbering Normalization
To preserve historical continuity, the following normalization formats are recognized:
BCC201911XXXXX
BCCYYYY01XXXXX
BCCYYYYMMXXXXX
Where:

YYYY = Original joining year
MM = Original joining month when known
01 = Default month when historical month information is unavailable
XXXXX = Historical sequential member serial



Pre-Incorporation Members
Members joining prior to legal incorporation in October 2019 shall use:
BCC201911XXXXX
for historical normalization purposes.

Historical Year Preservation
The joining year component shall remain frozen to the member's original year of joining.
Migration activities shall not alter this value.

6. Temporary Onboarding Identifiers
During onboarding, migration, or transitional operations, temporary identifiers may be issued.
Temporary format:
BCCTempXXXXX
Temporary identifiers exist solely to support onboarding and migration activities.
Temporary identifiers are not Membership Numbers.
Temporary identifiers possess no constitutional authority.

Retirement Rule
Upon assignment of a permanent Membership Number:
BCCTempXXXXX
shall be retired.
Temporary identifiers shall not remain active, displayed, searchable, or authoritative after permanent numbering is completed.
Following completion of the permanent numbering migration, temporary identifiers shall cease to be used.

7. One-Time Migration Allocation
Historical migration allocation is a one-time activity.
During migration, approved administrative processes may:

Assign Founding Member reservations
Assign Reserved Historical Allocation Block numbers
Normalize historical records
Import approved permanent allocations

After migration completion, permanent numbering becomes fully system-managed.

8. Permanent Number Allocation
Permanent Membership Numbers shall be allocated automatically by the system.
Manual number selection is prohibited.
Manual number assignment is prohibited.
Manual number modification is prohibited.

Allocation Trigger
Permanent allocation occurs as the final step of membership activation.
Membership application, review, payment processing, approval workflows, onboarding activities, and temporary identifiers shall not independently assign permanent Membership Numbers.

Allocation Method
The system shall allocate:
Next Available Sequential Number
from the unified numbering pool.

9. Immutability Rules
After assignment:

Numbers shall not be modified.
Numbers shall not be replaced.
Numbers shall not be reassigned.
Numbers shall not be reused.
Numbers shall not be reset.

These restrictions apply regardless of membership lifecycle state.

10. Governance Authority
System Authority
The system is responsible for:

Sequential allocation
Number generation
Allocation ordering
Permanent assignment



Administrative Authority
Administrative authority exists only for approved migration and historical normalization activities.
Administrative authority shall not manually allocate, edit, modify, replace, or override permanent Membership Numbers after migration completion.

11. Audit Requirements
Membership Numbering does not establish an independent audit framework.
Standard membership records, lifecycle records, and migration records provide sufficient traceability.
No separate numbering audit layer is required.
12. Constitutional Declaration
Membership Numbers are permanent constitutional identifiers assigned through a unified sequential numbering model.
The numbering system shall:

Preserve historical continuity
Prevent reuse
Prevent reassignment
Maintain numbering permanence
Operate through a single authoritative numbering sequence

No future implementation may introduce:

Multiple numbering pools
Manual allocation workflows
Reusable numbering
Editable permanent numbering

without a formally approved amendment to MEM-007.



AMENDMENT 001 — Historical Block Dissolution \& Deferred Sequential Allocation

Effective: July 2026 | Authority: Human Authority (Rajnish K. Khare)

A. Historical Reserved Block (§4) is dissolved.

The serial range 00008–00020 previously designated as "Historical Allocation Block" is released. These serials enter the unified manual allocation pool and may be assigned to any eligible member during the manual batch process (Amendment 001-B below). Serials 00001–00007 remain permanently reserved for Founding Members and are unaffected.

B. Temporary Identifiers are the default for all non-Founding Members.

All members except Founding Members shall receive a BCCTempXXXXX identifier at the point of membership activation. This identifier is operational and temporary; it does not constitute a Membership Number under MP-001.

C. Manual Batch Allocation precedes Sequential Auto-Allocation.

Permanent Membership Numbers for existing and early members shall be assigned manually by the Super Admin via an authoritative allocation register (spreadsheet or text file maintained outside the platform). The batch shall be imported into the platform in a single administrative operation. After the batch import is verified and closed, the membership\_number\_pool.last\_allocated\_serial shall be updated to the highest serial used in the batch. Sequential auto-allocation (MP-004) begins from that point forward and applies only to members who apply after the batch closes.

D. No serial shall be skipped or reused. MP-003 applies to the manual batch exactly as it applies to auto-allocation. The allocation register is the authoritative sequence ledger until sequential auto-allocation takes over.


Adoption Record
Document ID: MEM-007
Title:
Membership Numbering Constitution v1.0
Status:
APPROVED
FROZEN
AUTHORITATIVE
Authority:
MM-001
Mission:
MISSION-008A
Version:
1.0
Effective Date:
2026-06-24
Supersedes:
None
Superseded By:
N/A

