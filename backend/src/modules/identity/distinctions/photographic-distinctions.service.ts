// backend/src/modules/identity/distinctions/photographic-distinctions.service.ts
//
// Photographic Distinctions -- identity-domain writes (Implementation
// Phase 1 foundation). Every state change commits atomically with its
// identity_audit_log row:
//   holder declare / re-declare / withdraw  -> actor = holder,  target = holder
//   admin remove / restore (reason required) -> actor = admin,   target = holder
//   catalogue create / change                -> actor = manager, target = NULL
//
// Permission enforcement (identity.distinction.view / .remove /
// .catalogue.manage) belongs to the controllers via RbacGuard; this
// service never derives authority from membership or recognition.
// No controller is exposed in Phase 1.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';
import { logIdentityAudit } from '../shared/identity-audit.util';
import { toMysqlDatetime } from '../shared/token-hash.util';
import { flag } from './photographic-distinction-badge';
import { catalogueCreatedEvent, catalogueUpdateEvents } from './photographic-distinction-catalogue-audit';
import {
  transitionDeclaration,
  type DeclarationSnapshot,
  type DistinctionAction,
} from './photographic-distinction-state';

const REASON_MAX = 500;

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: string; errno?: number } | null;
  return !!e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062);
}

function requireReason(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  if (!r) throw new BadRequestException('A reason is required.');
  if (r.length > REASON_MAX) throw new BadRequestException(`Reason must be at most ${REASON_MAX} characters.`);
  return r;
}

export interface InstitutionInput {
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface DistinctionInput {
  institutionId: number;
  code: string;
  name: string;
  badgeEligible: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class PhotographicDistinctionsService {
  // ── Holder lifecycle ──────────────────────────────────────────────────────

  declare(userId: number, distinctionId: number) {
    return this.applyTransition({ actorId: userId, userId, distinctionId, action: 'DECLARE', reason: null });
  }

  withdraw(userId: number, distinctionId: number) {
    return this.applyTransition({ actorId: userId, userId, distinctionId, action: 'WITHDRAW', reason: null });
  }

  // ── Administrator Remove / Restore (identity.distinction.remove) ─────────

  async remove(actorId: number, userId: number, distinctionId: number, reason: string) {
    return this.applyTransition({ actorId, userId, distinctionId, action: 'REMOVE', reason: requireReason(reason) });
  }

  async restore(actorId: number, userId: number, distinctionId: number, reason: string) {
    return this.applyTransition({ actorId, userId, distinctionId, action: 'RESTORE', reason: requireReason(reason) });
  }

  private async applyTransition(p: {
    actorId: number;
    userId: number;
    distinctionId: number;
    action: DistinctionAction;
    reason: string | null;
  }) {
    try {
      return await db.transaction().execute(async (trx) => {
        const distinction = await this.loadDistinction(trx, p.distinctionId);

        // Catalogue-bounded: a holder may only declare an active entry of an
        // active institution. Withdraw/remove/restore stay possible on
        // inactive entries so history can always be corrected.
        if (p.action === 'DECLARE' && !(flag(distinction.is_active) && flag(distinction.institution_is_active))) {
          throw new BadRequestException('This distinction is not currently available for declaration.');
        }

        const existing = await trx
          .selectFrom('user_photographic_distinctions')
          .select(['id', 'state', 'pre_removal_state'])
          .where('user_id', '=', p.userId)
          .where('distinction_id', '=', p.distinctionId)
          .forUpdate()
          .executeTakeFirst();

        const current: DeclarationSnapshot | null = existing
          ? { state: existing.state, pre_removal_state: existing.pre_removal_state }
          : null;
        const t = transitionDeclaration(current, p.action);
        if (!t.ok) {
          if (t.code === 'NOT_FOUND') throw new NotFoundException(t.message);
          throw new ConflictException(t.message);
        }

        const now = toMysqlDatetime(new Date());
        if (t.create) {
          await trx
            .insertInto('user_photographic_distinctions')
            .values({
              user_id: p.userId,
              distinction_id: p.distinctionId,
              state: t.next.state,
              pre_removal_state: t.next.pre_removal_state,
              declared_at: now,
              state_changed_at: now,
              state_changed_by_user_id: p.actorId,
            })
            .execute();
        } else {
          await trx
            .updateTable('user_photographic_distinctions')
            .set({
              state: t.next.state,
              pre_removal_state: t.next.pre_removal_state,
              state_changed_at: now,
              state_changed_by_user_id: p.actorId,
              ...(t.auditAction === 'PHOTOGRAPHIC_DISTINCTION_REDECLARED' ? { declared_at: now } : {}),
            })
            .where('id', '=', Number(existing!.id))
            .execute();
        }

        const ref = {
          distinction_id: p.distinctionId,
          institution_code: distinction.institution_code,
          distinction_code: distinction.code,
        };
        await logIdentityAudit(
          {
            actorId: p.actorId,
            targetUserId: p.userId, // user-level event: always the holder
            actionType: t.auditAction,
            oldValue: current ? { ...ref, ...current } : undefined,
            newValue: { ...ref, ...t.next },
            reason: p.reason,
          },
          trx,
        );

        return { userId: p.userId, distinctionId: p.distinctionId, ...t.next };
      });
    } catch (err) {
      // Concurrent first declarations collide on uq_user_photo_dist.
      if (isDuplicateKey(err)) throw new ConflictException('This distinction is already declared.');
      throw err;
    }
  }

  private async loadDistinction(trx: Kysely<DB>, distinctionId: number) {
    const row = await trx
      .selectFrom('photographic_distinctions as d')
      .innerJoin('photographic_institutions as i', 'i.id', 'd.institution_id')
      .select([
        'd.id as id',
        'd.code as code',
        'd.is_active as is_active',
        'i.code as institution_code',
        'i.is_active as institution_is_active',
      ])
      .where('d.id', '=', distinctionId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Photographic distinction not found.');
    return row;
  }

  // ── Catalogue management (identity.distinction.catalogue.manage) ─────────
  // Catalogue events are recorded with targetUserId = null.

  async createInstitution(actorId: number, input: InstitutionInput) {
    const values = {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
      updated_by_user_id: actorId,
    };
    if (!values.code || !values.name) throw new BadRequestException('Institution code and name are required.');
    return this.catalogueWrite('Institution code already exists.', async (trx) => {
      const r = await trx.insertInto('photographic_institutions').values(values).executeTakeFirstOrThrow();
      const id = Number(r.insertId);
      const { updated_by_user_id: _actor, ...created } = values;
      await logIdentityAudit(catalogueCreatedEvent('INSTITUTION', actorId, { id, ...created }), trx);
      return { id };
    });
  }

  async updateInstitution(actorId: number, id: number, patch: Partial<InstitutionInput>) {
    const set: Record<string, unknown> = {};
    if (patch.code !== undefined) set.code = patch.code.trim().toUpperCase();
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.isActive !== undefined) set.is_active = patch.isActive;
    if (patch.sortOrder !== undefined) set.sort_order = patch.sortOrder;
    return this.catalogueWrite('Institution code already exists.', async (trx) => {
      const before = await trx
        .selectFrom('photographic_institutions')
        .select(['id', 'code', 'name', 'is_active', 'sort_order'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before) throw new NotFoundException('Photographic institution not found.');
      const events = catalogueUpdateEvents('INSTITUTION', actorId, id, before, set);
      if (events.length === 0) return { id, changed: false };
      await trx
        .updateTable('photographic_institutions')
        .set({ ...set, updated_by_user_id: actorId })
        .where('id', '=', id)
        .execute();
      for (const e of events) await logIdentityAudit(e, trx);
      return { id, changed: true };
    });
  }

  async createDistinction(actorId: number, input: DistinctionInput) {
    const values = {
      institution_id: input.institutionId,
      code: input.code.trim(),
      name: input.name.trim(),
      badge_eligible: input.badgeEligible,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
      updated_by_user_id: actorId,
    };
    if (!values.code || !values.name) throw new BadRequestException('Distinction code and name are required.');
    return this.catalogueWrite('This institution already has a distinction with that code.', async (trx) => {
      const inst = await trx
        .selectFrom('photographic_institutions')
        .select(['id'])
        .where('id', '=', input.institutionId)
        .executeTakeFirst();
      if (!inst) throw new NotFoundException('Photographic institution not found.');
      const r = await trx.insertInto('photographic_distinctions').values(values).executeTakeFirstOrThrow();
      const id = Number(r.insertId);
      const { updated_by_user_id: _actor, ...created } = values;
      await logIdentityAudit(catalogueCreatedEvent('DISTINCTION', actorId, { id, ...created }), trx);
      return { id };
    });
  }

  async updateDistinction(actorId: number, id: number, patch: Partial<Omit<DistinctionInput, 'institutionId'>>) {
    const set: Record<string, unknown> = {};
    if (patch.code !== undefined) set.code = patch.code.trim();
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.badgeEligible !== undefined) set.badge_eligible = patch.badgeEligible;
    if (patch.isActive !== undefined) set.is_active = patch.isActive;
    if (patch.sortOrder !== undefined) set.sort_order = patch.sortOrder;
    return this.catalogueWrite('This institution already has a distinction with that code.', async (trx) => {
      const before = await trx
        .selectFrom('photographic_distinctions')
        .select(['id', 'code', 'name', 'badge_eligible', 'is_active', 'sort_order'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before) throw new NotFoundException('Photographic distinction not found.');
      const events = catalogueUpdateEvents('DISTINCTION', actorId, id, before, set);
      if (events.length === 0) return { id, changed: false };
      await trx
        .updateTable('photographic_distinctions')
        .set({ ...set, updated_by_user_id: actorId })
        .where('id', '=', id)
        .execute();
      for (const e of events) await logIdentityAudit(e, trx);
      return { id, changed: true };
    });
  }

  private async catalogueWrite<T>(duplicateMessage: string, fn: (trx: Kysely<DB>) => Promise<T>): Promise<T> {
    try {
      return await db.transaction().execute(fn);
    } catch (err) {
      if (isDuplicateKey(err)) throw new ConflictException(duplicateMessage);
      throw err;
    }
  }
}
