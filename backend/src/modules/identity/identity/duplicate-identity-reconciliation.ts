// backend/src/modules/identity/identity/duplicate-identity-reconciliation.ts
//
// IDENTITY-ARCH-001 reconciliation amendment: bounded Duplicate Identity
// Reconciliation. Exposed ONLY through IdentityService.reconcileDuplicateIdentity()
// and gated at the route by 'identity.reconcile' (migration 0125, Super Admin
// only). This is NOT a generic user deletion -- deleting the duplicate row is
// an internal step of this one operation and is never exported on its own.
//
// SCOPE: one IDENTITY_PENDING duplicate (no username) that was created by a
// Google sign-in with a second Google account, folded into one
// IDENTITY_COMPLETE canonical identity. Each call reconciles exactly ONE pair
// in ONE transaction.
//
// TRANSACTION ORDER (any failure rolls the whole pair back):
//   1. lock canonical + duplicate users rows (ascending id, FOR UPDATE)
//   2. lock the expected auth_identities row (FOR UPDATE)
//   3. re-validate every supplied expectation under lock, including the
//      operator-reviewed canonical username and email (state drift -> 409)
//   4. discover every FK referencing users.id from information_schema and
//      verify the duplicate holds no dependency outside the approved set
//   5. write IDENTITY_DUPLICATE_RECONCILED against the CANONICAL user
//      (before the delete, so the duplicate's own audit cascade cannot take it)
//   6. re-link the auth_identities row: user_id ONLY (provider and
//      provider_user_id are never written)
//   7. delete the duplicate users row (defensive predicates, exactly 1 row)
//   8. optional finalEmail: canonical email := the duplicate's former email,
//      only now that the duplicate no longer holds the unique address
//
// dryRun runs steps 1-4 under the same locks, reports the plan, issues no
// write statement, and rolls the transaction back.
//
// NEVER TOUCHED: username, memberships, membership numbers, recognition,
// financial records, photos/content, RBAC, force_password_reset,
// email_verified_at (left as-is, matching AccountSettingsService.verifyEmailChange).
// provider_user_id is read under lock only to pin the re-link predicate; it is
// never returned, logged, or audited.

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';
import { logIdentityAudit } from '../shared/identity-audit.util';

export const IDENTITY_DUPLICATE_RECONCILED = 'IDENTITY_DUPLICATE_RECONCILED';

export interface ReconcileDuplicateIdentityInput {
  canonicalUserId: number;
  duplicateUserId: number;
  duplicateUuid: string;
  duplicateEmail: string;
  authIdentityId: number;
  reason: string;
  providerOwnershipAttestation: string;
  expectedCanonicalUsername: string;
  expectedCanonicalEmail: string;
  finalEmail?: string;
  dryRun: boolean;
}

export interface ReconcileDuplicateIdentityReport {
  dryRun: boolean;
  committed: boolean;
  canonical: {
    userId: number;
    username: string;
    emailBefore: string | null;
    emailAfter: string | null;
    emailChanged: boolean;
  };
  duplicate: {
    userId: number;
    uuid: string;
    email: string;
    createdAt: string | null;
  };
  authIdentity: { id: number; provider: 'GOOGLE'; fromUserId: number; toUserId: number };
  dependencies: {
    authIdentities: number;
    refreshTokensRevoked: number;
    duplicateAuditRowsDiscarded: number;
    loginHistoryRowsDetached: number;
  };
  audit: { actionType: string; actorUserId: number; targetUserId: number; payload: Record<string, unknown> };
}

// The ONLY users.id references a duplicate may hold, keyed "table.column",
// with the DELETE_RULE the approved deletion path depends on. Every other
// discovered FK must have zero rows for the duplicate. If one of these rules
// is ever changed, the operation refuses rather than guessing.
const APPROVED_FK_DEPENDENCIES: Record<string, string> = {
  'auth_identities.user_id': 'CASCADE',         // the expected row only; re-linked before the delete
  'refresh_tokens.user_id': 'CASCADE',          // duplicate's sessions, revoked by the delete
  'identity_audit_log.target_user_id': 'CASCADE', // duplicate's own audit rows
  'identity_audit_log.actor_id': 'SET NULL',    // only rows that also target the duplicate
  'login_history.user_id': 'SET NULL',          // history kept, user_id detached
};

// users.id references that carry no FK constraint (verified against
// information_schema during the 2026-10-07 duplicate identity audit), so FK
// discovery cannot see them. Any row here aborts the reconciliation.
const UNCONSTRAINED_USER_REFERENCES: Array<[string, string]> = [
  ['photo_comments', 'user_id'],
  ['photo_reactions', 'user_id'],
  ['membership_renewal_operations', 'decided_by_user_id'],
];

class DryRunRollback extends Error {
  constructor(readonly report: ReconcileDuplicateIdentityReport) {
    super('dry run: rolled back');
  }
}

function affected(result: unknown, key: 'numDeletedRows' | 'numUpdatedRows'): number {
  const n = (result as Record<string, unknown> | undefined)?.[key];
  return n == null ? 0 : Number(n);
}

function normEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

async function countRows(
  trx: Kysely<DB>,
  table: string,
  wheres: Array<[string, unknown]>,
): Promise<number> {
  let q = (trx as any).selectFrom(table).select((eb: any) => eb.fn.countAll().as('n'));
  for (const [col, val] of wheres) q = q.where(col, '=', val);
  const row = await q.executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function reconcileDuplicateIdentity(
  actorUserId: number,
  input: ReconcileDuplicateIdentityInput,
): Promise<ReconcileDuplicateIdentityReport> {
  const canonicalId = input.canonicalUserId;
  const duplicateId = input.duplicateUserId;
  const duplicateEmail = normEmail(input.duplicateEmail);
  const finalEmail = input.finalEmail === undefined ? undefined : normEmail(input.finalEmail);

  // ── Structural checks (no DB) ────────────────────────────────────────────
  if (canonicalId === duplicateId) {
    throw new BadRequestException('canonicalUserId and duplicateUserId must differ.');
  }
  if (!input.reason?.trim()) {
    throw new BadRequestException('A reason is required.');
  }
  if (!input.providerOwnershipAttestation?.trim()) {
    throw new BadRequestException('A provider ownership attestation is required.');
  }
  if (finalEmail !== undefined && finalEmail !== duplicateEmail) {
    // finalEmail may only hand the duplicate's own address to the canonical
    // identity -- this is not a general email-change API.
    throw new BadRequestException('finalEmail must equal the duplicate identity\'s current email.');
  }

  try {
    return await db.transaction().execute(async (trx) => {
      // ── 1. Lock both users rows (ascending id order) ──────────────────────
      const users = await trx
        .selectFrom('users')
        .select(['id', 'uuid', 'email', 'username', 'identity_status', 'created_at'])
        .where('id', 'in', [canonicalId, duplicateId].sort((a, b) => a - b))
        .orderBy('id', 'asc')
        .forUpdate()
        .execute();
      const canonical = users.find((u) => Number(u.id) === canonicalId);
      const duplicate = users.find((u) => Number(u.id) === duplicateId);

      // ── 2. Lock the expected auth identity ────────────────────────────────
      const authIdentity = await trx
        .selectFrom('auth_identities')
        .select(['id', 'user_id', 'provider', 'provider_user_id'])
        .where('id', '=', input.authIdentityId)
        .forUpdate()
        .executeTakeFirst();

      // ── 3. Re-validate under lock ─────────────────────────────────────────
      if (!canonical) throw new NotFoundException(`Canonical user ${canonicalId} not found.`);
      if (!duplicate) throw new NotFoundException(`Duplicate user ${duplicateId} not found.`);
      if (canonical.identity_status !== 'IDENTITY_COMPLETE') {
        throw new ConflictException('Canonical identity is not IDENTITY_COMPLETE.');
      }
      if (!canonical.username) {
        throw new ConflictException('Canonical identity has no username.');
      }
      // State drift: the canonical row must still be what the operator reviewed.
      if (canonical.username !== input.expectedCanonicalUsername) {
        throw new ConflictException('Canonical username does not match expectedCanonicalUsername.');
      }
      if (canonical.email === null || normEmail(canonical.email) !== normEmail(input.expectedCanonicalEmail)) {
        throw new ConflictException('Canonical email does not match expectedCanonicalEmail.');
      }
      if (duplicate.identity_status !== 'IDENTITY_PENDING') {
        throw new ConflictException('Duplicate identity is not IDENTITY_PENDING.');
      }
      if (duplicate.username !== null && duplicate.username !== undefined) {
        throw new ConflictException('Duplicate identity has a username; it is not a reconcilable duplicate.');
      }
      if (duplicate.uuid !== input.duplicateUuid) {
        throw new ConflictException('Duplicate UUID does not match the supplied value.');
      }
      if (normEmail(duplicate.email) !== duplicateEmail) {
        throw new ConflictException('Duplicate email does not match the supplied value.');
      }
      if (!authIdentity) throw new NotFoundException(`Auth identity ${input.authIdentityId} not found.`);
      if (Number(authIdentity.user_id) !== duplicateId) {
        throw new ConflictException('Auth identity does not belong to the duplicate identity.');
      }
      if (authIdentity.provider !== 'GOOGLE') {
        throw new ConflictException('Only GOOGLE auth identities can be reconciled.');
      }
      if (!authIdentity.provider_user_id) {
        throw new ConflictException('Auth identity has no provider subject.');
      }
      const canonicalEmailBefore = canonical.email ?? null;
      if (finalEmail !== undefined && canonicalEmailBefore === null) {
        throw new ConflictException('Canonical identity has no current email to pin the email update to.');
      }
      if (finalEmail !== undefined && normEmail(canonicalEmailBefore) === finalEmail) {
        throw new ConflictException('Canonical identity already holds finalEmail.');
      }

      // ── 4. Dependency verification from live FK metadata ──────────────────
      const fks: Array<{ table_name: string; column_name: string; delete_rule: string }> = await (trx as any)
        .selectFrom('information_schema.KEY_COLUMN_USAGE as k')
        .innerJoin('information_schema.REFERENTIAL_CONSTRAINTS as rc', (join: any) =>
          join
            .onRef('rc.CONSTRAINT_SCHEMA', '=', 'k.CONSTRAINT_SCHEMA')
            .onRef('rc.CONSTRAINT_NAME', '=', 'k.CONSTRAINT_NAME')
            .onRef('rc.TABLE_NAME', '=', 'k.TABLE_NAME'),
        )
        .select(['k.TABLE_NAME as table_name', 'k.COLUMN_NAME as column_name', 'rc.DELETE_RULE as delete_rule'])
        .where('k.TABLE_SCHEMA', '=', sql`DATABASE()`)
        .where('k.REFERENCED_TABLE_SCHEMA', '=', sql`DATABASE()`)
        .where('k.REFERENCED_TABLE_NAME', '=', 'users')
        .where('k.REFERENCED_COLUMN_NAME', '=', 'id')
        .execute();

      const discovered = new Map<string, string>();
      for (const fk of fks ?? []) discovered.set(`${fk.table_name}.${fk.column_name}`, String(fk.delete_rule).toUpperCase());

      for (const [key, rule] of Object.entries(APPROVED_FK_DEPENDENCIES)) {
        if (discovered.get(key) !== rule) {
          throw new ConflictException(
            `Foreign-key metadata for ${key} is ${discovered.get(key) ?? 'missing'}, expected ${rule}; refusing to reconcile.`,
          );
        }
      }

      const prohibited: string[] = [];
      let authIdentities = 0;
      let refreshTokens = 0;
      let ownAuditRows = 0;
      let loginHistoryRows = 0;

      for (const key of [...discovered.keys()].sort()) {
        const [table, column] = key.split('.');
        const n = await countRows(trx, table, [[column, duplicateId]]);
        switch (key) {
          case 'auth_identities.user_id': authIdentities = n; break;
          case 'refresh_tokens.user_id': refreshTokens = n; break;
          case 'identity_audit_log.target_user_id': ownAuditRows = n; break;
          case 'login_history.user_id': loginHistoryRows = n; break;
          case 'identity_audit_log.actor_id': {
            const ownActed = await countRows(trx, table, [[column, duplicateId], ['target_user_id', duplicateId]]);
            if (n - ownActed > 0) prohibited.push(`${key} (${n - ownActed} row(s) acting on other identities)`);
            break;
          }
          default:
            if (n > 0) prohibited.push(`${key} (${n})`);
        }
      }
      for (const [table, column] of UNCONSTRAINED_USER_REFERENCES) {
        const n = await countRows(trx, table, [[column, duplicateId]]);
        if (n > 0) prohibited.push(`${table}.${column} (${n})`);
      }
      if (authIdentities !== 1) {
        prohibited.push(`auth_identities.user_id (${authIdentities} rows; exactly the expected one is allowed)`);
      }
      if (prohibited.length > 0) {
        throw new ConflictException(
          `Duplicate identity has dependencies outside the approved set: ${prohibited.join(', ')}. Nothing was changed.`,
        );
      }

      // ── Plan ──────────────────────────────────────────────────────────────
      const canonicalEmailAfter = finalEmail ?? canonicalEmailBefore;
      const payload: Record<string, unknown> = {
        actor_user_id: actorUserId,
        duplicate_user_id: duplicateId,
        duplicate_uuid: duplicate.uuid,
        duplicate_email: duplicate.email,
        duplicate_created_at: isoOrNull(duplicate.created_at),
        provider: 'GOOGLE',
        auth_identity_id: Number(authIdentity.id),
        auth_identity_relinked: { from_user_id: duplicateId, to_user_id: canonicalId },
        refresh_tokens_revoked: refreshTokens,
        duplicate_audit_rows_discarded: ownAuditRows,
        login_history_rows_detached: loginHistoryRows,
        canonical_email_before: canonicalEmailBefore,
        canonical_email_after: canonicalEmailAfter,
        canonical_email_changed: finalEmail !== undefined,
        email_verified_at: 'unchanged',
        provider_ownership_attestation: input.providerOwnershipAttestation.trim(),
      };

      const report: ReconcileDuplicateIdentityReport = {
        dryRun: input.dryRun,
        committed: false,
        canonical: {
          userId: canonicalId,
          username: canonical.username,
          emailBefore: canonicalEmailBefore,
          emailAfter: canonicalEmailAfter,
          emailChanged: finalEmail !== undefined,
        },
        duplicate: {
          userId: duplicateId,
          uuid: duplicate.uuid,
          email: duplicate.email as string,
          createdAt: isoOrNull(duplicate.created_at),
        },
        authIdentity: { id: Number(authIdentity.id), provider: 'GOOGLE', fromUserId: duplicateId, toUserId: canonicalId },
        dependencies: {
          authIdentities,
          refreshTokensRevoked: refreshTokens,
          duplicateAuditRowsDiscarded: ownAuditRows,
          loginHistoryRowsDetached: loginHistoryRows,
        },
        audit: { actionType: IDENTITY_DUPLICATE_RECONCILED, actorUserId, targetUserId: canonicalId, payload },
      };

      if (input.dryRun) throw new DryRunRollback(report);

      // ── 5. Audit against the CANONICAL identity, before the delete ────────
      await logIdentityAudit(
        {
          actorId: actorUserId,
          targetUserId: canonicalId,
          actionType: IDENTITY_DUPLICATE_RECONCILED,
          oldValue: { canonical_email: canonicalEmailBefore, auth_identity_user_id: duplicateId },
          newValue: payload,
          reason: input.reason,
        },
        trx,
      );

      // ── 6. Re-link the provider identity (user_id only) ───────────────────
      const relinked = await trx
        .updateTable('auth_identities')
        .set({ user_id: canonicalId })
        .where('id', '=', Number(authIdentity.id))
        .where('user_id', '=', duplicateId)
        .where('provider', '=', 'GOOGLE')
        .where('provider_user_id', '=', authIdentity.provider_user_id)
        .executeTakeFirst();
      if (affected(relinked, 'numUpdatedRows') !== 1) {
        throw new ConflictException(
          `Auth identity re-link affected ${affected(relinked, 'numUpdatedRows')} rows, expected 1; rolled back.`,
        );
      }

      // ── 7. Remove the duplicate identity ──────────────────────────────────
      const removed = await trx
        .deleteFrom('users')
        .where('id', '=', duplicateId)
        .where('uuid', '=', input.duplicateUuid)
        .where('identity_status', '=', 'IDENTITY_PENDING')
        .where('username', 'is', null)
        .executeTakeFirst();
      if (affected(removed, 'numDeletedRows') !== 1) {
        throw new ConflictException(
          `Duplicate delete affected ${affected(removed, 'numDeletedRows')} rows, expected 1; rolled back.`,
        );
      }

      // ── 8. Optional: hand the freed address to the canonical identity ─────
      if (finalEmail !== undefined) {
        const emailed = await trx
          .updateTable('users')
          .set({ email: finalEmail })
          .where('id', '=', canonicalId)
          .where('email', '=', canonicalEmailBefore as string)
          .executeTakeFirst();
        if (affected(emailed, 'numUpdatedRows') !== 1) {
          throw new ConflictException(
            `Canonical email update affected ${affected(emailed, 'numUpdatedRows')} rows, expected 1; rolled back.`,
          );
        }
      }

      return { ...report, committed: true };
    });
  } catch (err) {
    if (err instanceof DryRunRollback) return err.report;
    throw err;
  }
}
