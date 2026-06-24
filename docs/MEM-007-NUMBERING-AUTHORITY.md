# MEM-007 — Membership Numbering Constitution v1.0
Status: APPROVED / FROZEN / AUTHORITATIVE
Authority: MM-001
Date: 2026-06-24

MP-001: Permanence — numbers never change once assigned
MP-002: Uniqueness — one number per membership record
MP-003: Non-Reuse — numbers never recycled
MP-004: Sequential Allocation — single unified pool
MP-005: Historical Continuity — preserve original joining year/month

Reserved Blocks:
  00001–00007: Founding Members (permanent reservation)
  00008–00020: Historical Allocation Block (permanent reservation)
  00021+:      Operational sequential allocation

Number Format: BCC + YYYY + MM + 5-digit-serial
Temporary Format: BCCTempXXXXX (migration only, not a membership number)
Allocation Trigger: APPROVED → ACTIVE transition ONLY
