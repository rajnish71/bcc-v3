# LEGACY-001-ADDENDUM-001
# FINAL PRE-2019 HISTORICAL MEMBERSHIP VERIFICATION WINDOW v1.0

---

## Document Status

APPROVED / FROZEN / AUTHORITATIVE.

Approved by administrator Rajnish K. Khare on 2026-08-11, with final
verification deadline set per Section 4. This status applies only to the
mechanism and window defined in this document — it does not reopen
LEGACY-001, does not authorize any future migration activity, and confers
no standing power beyond the scope and deadline stated below.

---

## Document ID

LEGACY-001-ADDENDUM-001

---

## Amends

LEGACY-001 — Legacy Membership Migration Constitution v1.0
(`ProjectDocs/Architecture/LEGACY-001_LEGACY_MEMBERSHIP_MIGRATION_CONSTITUTION_v1.md`)

LEGACY-001 is NOT edited, rewritten, renumbered, or reopened as a migration
by this document. It remains FROZEN in its original form. This addendum is
a separate, narrowly scoped governance record that sits alongside it.

---

## Authority

Human Authority

Rajnish K. Khare

---

## 1. Constitutional Reasoning — why this is a reconciliation window, not a migration rerun

LEGACY-001 froze **migration 0080**, which mechanically upgraded the 37
usernames present in a specific historical source document
(`BCC_Permanent_Membership_Number_Allocation.xlsx`, also underlying
migration 0078's 49-member allocation) into the `LEGACY_MEMBER` class. That
migration is complete, its transaction is committed, and LEGACY-001 correctly
states it must never be re-run, re-validated, or have its target list altered.

What this addendum authorizes is categorically different from re-running
that migration:

- **It does not touch migration 0080 or 0078.** Neither file is edited,
  re-executed, or referenced as a data source for new writes. Their
  validation gates (the fixed counts of 37 and 49) are untouched and will
  continue to report exactly 37 and 49 forever.
- **It does not add rows to the historical source register.** The Excel
  workbook that fed 0078/0080 remains what it always was — the closed
  record of who migration 0080 upgraded. This addendum does not claim
  Gita Rani Gupta or Abhishek Shivhare were "omitted" from that register.
  They were not in it. Their historical status is being established through
  a *different* evidentiary path: direct, personal administrator
  confirmation, dated 2026, of pre-2019 association — the same category of
  authority (Rajnish K. Khare, Human Authority) that authorized LEGACY-001
  itself.
- **It is bounded and self-terminating.** Unlike a migration, which is a
  one-time bulk operation against a fixed dataset, this is a time-boxed
  administrative verification process with an explicit closing date, after
  which the mechanism permanently stops functioning — see Section 4.
- **It is transparent about what it is.** This addendum does not claim
  LEGACY-001's closure never happened. It explicitly acknowledges that
  Legacy Membership was closed by LEGACY-001, and that this document is a
  deliberate, narrow, human-authorized exception to that closure — not a
  reinterpretation of LEGACY-001, not a claim that the closure was in error.

In short: LEGACY-001 forbids *re-running the migration* and *silently
recreating Legacy Membership*. This addendum does neither — it is a
separate, explicitly authorized, time-limited administrative act,
distinguished from migration 0080 by its evidentiary basis (personal
administrator confirmation vs. workbook membership), its mechanism (the
existing `changeClass()` admin API, not a SQL migration file), and its
finite duration.

---

## 2. Governance Rule — conditions for granting Legacy status during the window

During the window defined in Section 4, a person may be granted Legacy
status ONLY when ALL of the following hold:

1. The BCC administrator (Rajnish K. Khare) personally confirms the person
   was an active/associated BCC member on or before 31 December 2019.
2. The person is being reconciled as a historical BCC member — their
   recognition explicitly acknowledges pre-2019 association. They are not
   represented, in any record, as someone whose BCC membership began in 2026.
3. The administrator explicitly authorizes that specific named individual
   to be added during the window (per-person authorization; no blanket or
   implied authorization).
4. The action is recorded in `membership_audit_log` with the reason string:
   `"Final pre-2019 historical membership reconciliation — administrator confirmed."`

No person may be added through this mechanism without an explicit,
individually-named authorization meeting all four conditions. This is not
a standing administrative power — it exists only for the named individuals
listed in Section 3 and any additional individuals appended under Section 5
before the window in Section 4 closes.

---

## 3. Initial Authorized Cases

The following two individuals are authorized under this addendum:

1. **Gita Rani Gupta** (`users.id = 78`, `username = gita`,
   `membership_number = BCC20260800057`)
2. **Abhishek Shivhare** (`users.id = 80`, `username = abk_shivhare`,
   `membership_number = BCC20260800058`)

Both are confirmed by the administrator to have been associated with /
members of Bhopal Camera Club before 31 December 2019. Neither appears in
the historical source register used by migrations 0078/0080 — they are not
being described as omissions from that register, but as historically
pre-2019 members identified and confirmed by the administrator independently
of it, during this final verification window.

---

## 4. Closure Window

**Opens:** 2026-08-11 (date of this addendum).

**Closes:** 15 August 2026, 11:59 PM IST.

Enforcement of closure:

- After the stated deadline, no further Legacy status grants may be
  performed under this addendum, regardless of any new confirmation the
  administrator later makes.
- No further historical Legacy reconciliation may be performed under this
  window after closure.
- This window cannot be silently or informally extended. Extending it
  requires a new, separately dated and separately authorized addendum
  document — not an edit to this one's deadline field.
- After closure, the Legacy Member class returns to being permanently
  closed exactly as LEGACY-001 originally stated, with no standing
  mechanism (administrative or otherwise) to add further members to it.
- Any future need to add a Legacy member after this window closes requires
  a formal constitutional amendment/review, not an administrative action
  under this or any prior addendum.

This addendum does not reopen LEGACY-001 as a migration, does not authorize
any future migration activity, and does not create a general or standing
administrative power to create Legacy members.

---

## 5. Recording Additional Cases During the Window

Should the administrator identify one or two additional pre-2019 members
during the window, each is appended to Section 3 of this document (by
editing this addendum, not by creating a new one) as a new numbered entry,
following the same format used for Gita Rani Gupta and Abhishek Shivhare:
name, `users.id`, `username`, `membership_number`. Each new entry requires
the same explicit, individually-named administrator authorization described
in Section 2. No entry may be added after the Section 4 deadline, even if
this document is edited after that date.

---

## 6. Database Fields Changed (proposed — not yet executed)

For each of the two individuals in Section 3, executed via the existing
`MembershipLifecycleService.changeClass()` admin mechanism
(`POST /:id/upgrade`, no new code or migration):

| Field | Change |
|---|---|
| `memberships.membership_class_id` | `BASIC_MEMBER` → `LEGACY_MEMBER` |
| `memberships.expires_at` | Becomes `NULL`. This is **not prescribed by this addendum** — it is the existing, unmodified behavior of `computeExpiry()`, which returns `null` whenever the target class has `is_renewable = FALSE` (true for `LEGACY_MEMBER` since migration 0082, regardless of `is_lifetime`, which is also `FALSE` for this class but is not what triggers the null). No expiry rule is being invented or configured by this addendum; the existing class config already produces a non-expiring result. |
| `membership_audit_log` | New row: `event_type = CLASS_CHANGED`, `actor_type = ADMIN`, `notes = "Final pre-2019 historical membership reconciliation — administrator confirmed."` — passed through the existing `reason` parameter of `changeClass()`, no code change required. |
| `users.year_joined_bcc` | Set to `2019` only if currently NULL/missing or later than 2019; a genuinely earlier existing value is preserved. Recorded via a separate admin data-correction `UPDATE`, with its own audit log entry noting the normalization reason. |

### Legacy Expiry Verification (per administrator request)

- `LEGACY_MEMBER` class config: `is_renewable = FALSE`, `is_lifetime = FALSE`, `is_closed = TRUE` (`database/migrations/0082_mem008_new_membership_classes.sql:31-37`).
- `computeExpiry()` logic (`membership-lifecycle.service.ts:113`): `if (isLifetime || !isRenewable) return null;` — `is_renewable = FALSE` alone is sufficient to return `null`.
- No MEM-008 or MEM-006 text was found prescribing a specific Legacy validity period; MEM-008 describes Legacy as a "Grandfathered Category" without a stated term.
- Conclusion: `expires_at` will end up `NULL` (non-expiring) as an automatic consequence of calling the existing, unmodified `changeClass()` — this addendum makes no claim about what Legacy expiry *should* be and does not configure or alter class expiry behavior in any way.

Fields explicitly NOT changed for either individual:

- `memberships.membership_number` (`BCC20260800057` / `BCC20260800058`) —
  unchanged. MEM-007 write-once immutability applies and is enforced at the
  database trigger level (`trg_membership_number_immutable`), independent of
  this addendum.
- `memberships.number_serial` (`57` / `58`) — unchanged, same trigger.
- No membership number is rewritten, reformatted, or made to resemble a
  historical (`BCC201911XXXXX`) number. The number continues to reflect the
  actual 2026 operational-sequential allocation date; only the membership
  *class* and `year_joined_bcc` reflect the confirmed historical association.

No migration file is created or modified. No row in `schema_migrations` is
touched. `membership_class_id` and `year_joined_bcc` are the only mutated
columns, both via existing, already-built admin code paths.

---

## 7. Confirmation — Permanent Numbers Unchanged

`BCC20260800057` (Gita Rani Gupta) and `BCC20260800058` (Abhishek Shivhare)
remain exactly as already assigned. This addendum does not request, imply,
or permit any change to either number. MEM-007 permanent-number immutability
remains fully applicable and is not being worked around — the historical
recognition is carried entirely by `membership_class_id` and
`year_joined_bcc`, not by the number.

---

## Closure Summary

This addendum authorizes a single, time-boxed, individually-scoped
reconciliation mechanism for pre-2019 BCC members whom the administrator
personally identifies and confirms, distinct from — and without reopening —
the migration 0080/0078 process that LEGACY-001 froze. It expires
permanently at the deadline stated in Section 4. After that point, Legacy
Membership is closed with no further exception mechanism, per LEGACY-001's
original intent, unless a new constitutional amendment is separately
authorized.

---

## Approval

Status: APPROVED — administrator Rajnish K. Khare, 2026-08-11. Final
verification deadline: 15 August 2026, 11:59 PM IST.

Execution for Gita Rani Gupta and Abhishek Shivhare is authorized under
this addendum via `scripts/tools/legacy-reconciliation-gita-abhishek.ts`,
recorded in git history per this repository's standing convention for
one-time administrative data corrections.
