# Pre-Production Maintenance Toolkit

**Status:** FROZEN — Production-Grade Maintenance Utility
**Last Updated:** 2026-07-16
**Location:** `/var/www/bcc-v3/scripts/tools/maintenance/`

---

## 1. Purpose & Objectives

The Pre-Production Maintenance Toolkit is a command-line utility built directly on the AWS server hosting the BCC Unified Platform V3. 

It is designed **ONLY** for pre-production database cleanup, specifically to safely and completely purge development, test, and terminated users from the database. 

> [!WARNING]  
> **NEVER CALL THIS TOOL FROM THE WEB APPLICATION.**  
> It is designed exclusively for manual CLI execution by authorized database administrators.

---

## 2. Safety Philosophy & Gates

Due to the destructive nature of hard-deletes, the toolkit implements a series of safety checks and gates to prevent accidental data loss:

1.  **Environment Check**: Refuses execution if `NODE_ENV=production` unless the operator supplies the explicit bypass override `--force-preproduction`.
2.  **FK Schema Protection**: Dynamically queries `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` at runtime. If any table referencing `users` is not covered by the registered handlers, the script immediately aborts with a fatal error.
3.  **Permanent Membership Blocking**: Hard-deleting users with assigned permanent BCC membership numbers is blocked by default to enforce membership record integrity. Bypassing this safety gate requires the explicit override flag `--allow-preproduction-permanent-delete`.
4.  **100% Read-Only Dry Run**: Running the script with `--dry-run` simulates the entire process (including manifest compilation and trigger validation) without initiating transaction blocks, dropping triggers, or executing any data modification queries.
5.  **Interactive Phrased Confirmation**: Real execution blocks until the operator types the exact confirmation phrase:  
    `I UNDERSTAND THIS WILL PERMANENTLY DELETE USER <id>` (or `USERS <id1>,<id2>`).

---

## 3. Handler-Based Architecture

Rather than using a single monolithic script, the toolkit relies on a **plugin-style architecture**. The orchestrator scripts import domain handlers from `handlers/` implementing the `MaintenanceHandler` interface defined in `handlers/base.ts`:

```typescript
export interface DeletionStep {
  table: string;
  action: 'delete' | 'nullify' | 'reassign';
  description: string;
  phase: number;
}

export interface MaintenanceHandler {
  inspect(db: Kysely<DB>, userIds: number[]): Promise<DependencyReport>;
  delete(db: Kysely<DB>, userIds: number[]): Promise<void>;
  getHandledFKs(): string[];
  getDeletionSteps(): DeletionStep[];
}
```

### Domain Handlers:
1.  **Auth Handler** (`auth.handler.ts`): purge refresh tokens, login history, magic links, OTP codes, and MFA methods.
2.  **Membership Handler** (`membership.handler.ts`): purge payments, consent records, number logs, recognitions, application documents/messages, and memberships.
3.  **Notification Handler** (`notification.handler.ts`): purge preferences, notifications, and notification logs.
4.  **Profile Handler** (`profile.handler.ts`): purge profiles, gear, awards, avatars, cover photos, social links, and system/operational roles.
5.  **Photo Handler** (`photo.handler.ts`): nullifies cycles and purges tag assignments, comments, reactions, album contents, albums, and photos.
6.  **Event Handler** (`event.handler.ts`): nullifies check-in records and purges volunteer logs, helper slots, registrations, invites, and events.

---

## 4. Deletion Execution Order (Phases)

To maintain referential integrity without turning off foreign key checks (`SET FOREIGN_KEY_CHECKS = 0` is strictly forbidden), database modifications occur in six ordered phases:

*   **Phase 1: Break FK Cycles**: Nullifies `cover_photo_id` on user's photo albums and `created_by` self-references on the `users` table.
*   **Phase 2: Purge Grandchildren**: Deletes dependent rows that reference parent records (e.g. comments, reactions, tag assignments, payments, approval stages, audit logs, event volunteer slots, registrations, invitations).
*   **Phase 3: Purge Intermediate Parents**: Deletes intermediate parent rows (e.g. photo albums, photos, memberships, events, notifications).
*   **Phase 4: Nullify / Reassign References**: Nullifies audit log and post author references, and reassigns role-granting actor columns to a dynamic active `SUPER_ADMIN` user not in the deletion list.
*   **Phase 5: Purge Direct User Tables**: Deletes user profile and credentials records (avatars, gear, social links, auth tokens, mfa methods).
*   **Phase 6: Purge Target User Records**: Deletes rows directly from the `users` table.

---

## 5. Trigger Preservation & MEM-007

Under the project constitution (MEM-007), a database trigger `trg_prevent_numbered_membership_delete` prevents deletions of memberships containing permanent membership numbers.

To bypass this during pre-production cleanup:
1.  The utility dynamically reads the trigger definition using `SHOW CREATE TRIGGER`.
2.  It computes a `SHA256` checksum of the trigger's SQL body before dropping it.
3.  It drops the trigger immediately before initiating the transaction.
4.  It executes the deletions inside the Kysely transaction block.
5.  In the `finally` block, it restores the trigger using the preserved definition.
6.  It re-fetches the trigger and verifies that its current `SHA256` checksum matches the original state byte-for-byte.

---

## 6. Database Integrity Verification

At the end of every real execution, the tool prints an audit card showing the status of database checks:

```text
====================================================
Database Integrity Verification
----------------------------------------------------
✓ FK validation passed
✓ Trigger restored
✓ Trigger checksum verified (SHA256 matches: xxx)
✓ Transaction committed
✓ No orphan records detected
====================================================
```
*Note: "No orphan records detected" is verified by performing a final inspection query on the purged user IDs immediately after transaction commit, ensuring all counts return exactly 0.*

---

## 7. Example Commands

Commands must be run from `/var/www/bcc-v3/backend/` and require environment variables `NODE_PATH` and `DOTENV_CONFIG_PATH` to resolve paths correctly:

### A. Run Dependency Inspection (Human-Readable)
```bash
NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env npx ts-node --transpile-only --project ../scripts/tools/tsconfig.json -r dotenv/config -r tsconfig-paths/register ../scripts/tools/maintenance/inspect-user.ts --users 44,47
```

### B. Run Dependency Inspection (JSON Mode for APIs/Webhooks)
```bash
NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env npx ts-node --transpile-only --project ../scripts/tools/tsconfig.json -r dotenv/config -r tsconfig-paths/register ../scripts/tools/maintenance/inspect-user.ts --users 44,47 --report
```

### C. Run Completely Read-Only Dry-Run Deletion
```bash
NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env npx ts-node --transpile-only --project ../scripts/tools/tsconfig.json -r dotenv/config -r tsconfig-paths/register ../scripts/tools/maintenance/delete-test-user.ts --users 44,47 --dry-run --allow-preproduction-permanent-delete
```

### D. Execute Real Database Deletion
```bash
NODE_PATH=/var/www/bcc-v3/backend/node_modules DOTENV_CONFIG_PATH=.env npx ts-node --transpile-only --project ../scripts/tools/tsconfig.json -r dotenv/config -r tsconfig-paths/register ../scripts/tools/maintenance/delete-test-user.ts --users 44,47 --allow-preproduction-permanent-delete
```
*(The operator will be prompted to type: `I UNDERSTAND THIS WILL PERMANENTLY DELETE USERS 44,47`)*

---

## 8. Adding Future Domain Handlers

When new database tables are introduced that reference `users`, the runtime FK validation check will fail until a handler registers the new foreign key.

To add support:
1.  Identify the domain handler that should own the new table (or create a new one under `handlers/`).
2.  Add the new foreign key in the format `table_name.column_name` to `getHandledFKs()`.
3.  Add Kysely query checks to `inspect()` to fetch count statistics.
4.  Add a `DeletionStep` containing the table, action type, description, and phase number to `getDeletionSteps()`.
5.  Add the Kysely execution query (delete, update, or nullify) to the handler's `delete()` method.
