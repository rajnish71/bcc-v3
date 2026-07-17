# ADR-001: Temporary Identifier Allocation Strategy

## Status
Accepted

## Context
1. **MEM-007 Governing Authority:** The allocation of temporary onboarding identifiers is governed by [MEM-007 Section 6](file:///e:/WebProjects/BCC-V3/ProjectDocs/Membership/MEM-007_MEMBERSHIP_NUMBERING_CONSTITUTION_v1.0.md#L104-L118) and **Amendment 001-B**.
2. **Constitutional Limits:** The governing documents specify:
    * **Format:** `BCCTempXXXXX` where `XXXXX` represents five digits.
    * **Purpose:** Exists solely to support onboarding, migration, and transitional activities, acting as the default for all non-Founding Members at the point of activation.
    * **Authority:** Temporary identifiers are not Membership Numbers and possess no constitutional authority. They must be retired upon assignment of a permanent number and cease to be used after migration completion.
3. **Constitutional Scope:** MEM-007 does not prescribe an allocation algorithm, sequence pool, or generation mechanism for temporary onboarding keys. 

## Decision
The BCC Unified Platform V3 adopts the following technical policies for temporary identifier allocation:
* **Monotonic, Sequential Allocation:** Temporary identifiers are generated sequentially as `MAX(existing_temp_identifier) + 1` (starting at `00001` if the table is empty).
* **No Reuse:** Deleted or retired temporary identifiers are not reused or recycled by the allocator.
* **Collision Resistance:** Allocation queries use `SELECT ... FOR UPDATE` to serialize concurrent requests, combined with a retry loop (up to 10 attempts) that increments the suffix if a duplicate key constraint violation is encountered.
* **ID Independence:** Business identifiers are completely independent of the database primary key `membership.id` to prevent conflicts from auto-increment sequence resets.

These policies represent an **implementation decision** and are not constitutionally mandated by MEM-007.

## Rationale
This approach was chosen for the following reasons:
1. **Uniqueness & Stability:** Guarantees unique values, avoiding `Duplicate entry` database constraint failures during concurrent activations.
2. **De-coupling:** Separating the business identifier from `membership.id` prevents bugs if membership table rows are deleted/re-seeded, keeping numbering sequential.
3. **Operational Simplicity:** Avoids the overhead of managing a separate sequence tracking database table for transitional numbering.
4. **Determinism:** Makes sorting, tracking, and debugging easy.
5. **Future-Proofing:** Decoupling the generation logic makes it easy to swap the allocation engine if requirements evolve.

## Consequences

### Positive
* Guaranteed uniqueness across all temporary identifiers.
* Clean, predictable, human-readable format.
* Highly collision-resistant and transaction-safe.
* Completely compliant with the `BCCTempXXXXX` format mandated by MEM-007.
* No changes to the core constitution document are required.

### Negative
* Retired or deleted temporary identifiers are permanently skipped (not reused).
* Serial gaps may appear in the numbering if transactions fail or memberships are deleted.
* Suffix numbering grows indefinitely over time.

## Future Considerations
If MEM-007 is amended in the future to prescribe a specific allocation strategy, only `MembershipNumberingService` should require modification to comply with the new rules. All downstream components (like profile services) that consume these identifiers query the DB directly and will remain unaffected.
