// backend/src/modules/identity/distinctions/photographic-distinctions.service.ts
//
// Photographic Distinctions -- identity-domain reads and writes. Every
// state change commits atomically with its identity_audit_log row (a failed
// transaction leaves neither):
//   holder declare / re-declare / withdraw  -> actor = holder,  target = holder
//   admin remove / restore (reason required) -> actor = admin,   target = holder
//   catalogue create / change / delete       -> actor = manager, target = NULL
//
// Permission enforcement (identity.distinction.view / .remove /
// .catalogue.manage) belongs to PhotographicDistinctionsController via
// RbacGuard; this service never derives authority from membership or
// recognition. Holder methods take the userId from the access token only.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';
import { logIdentityAudit } from '../shared/identity-audit.util';
import { toMysqlDatetime } from '../shared/token-hash.util';
import { flag, getBadgeStatuses } from './photographic-distinction-badge';
import { catalogueCreatedEvent, catalogueDeletedEvent, catalogueUpdateEvents } from './photographic-distinction-catalogue-audit';
import {
  transitionDeclaration,
  type DeclarationSnapshot,
  type DistinctionAction,
} from './photographic-distinction-state';

const REASON_MAX = 500;

// Structured catalogue identifiers (mirrors the request DTOs; enforced here
// too so no caller can bypass them). There is never a generic OTHER
// institution.
const INSTITUTION_CODE = /^[A-Z]{2,20}$/;
const DISTINCTION_CODE = /^[A-Z0-9_]{2,50}$/;
// Canonical display form, e.g. EFIAP/d1, MFIP (Nature), GPU VIP 3. Official
// punctuation is legal here; the internal code stays machine-safe.
const DISPLAY_CODE = /^[A-Za-z0-9][A-Za-z0-9 \/().-]{0,49}$/;

function institutionCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!INSTITUTION_CODE.test(code)) throw new BadRequestException('Institution code must be 2-20 uppercase letters.');
  if (code === 'OTHER') throw new BadRequestException('There is no generic OTHER institution.');
  return code;
}

function distinctionCode(raw: string): string {
  const code = raw.trim();
  if (!DISTINCTION_CODE.test(code)) throw new BadRequestException('Distinction code must be 2-50 uppercase letters, digits or underscores.');
  return code;
}

function displayCode(raw: string | null): string | null {
  if (raw === null) return null;
  const code = raw.trim();
  if (code === '') return null;
  if (!DISPLAY_CODE.test(code)) throw new BadRequestException('Display code may contain letters, digits, spaces and / ( ) . - only.');
  return code;
}

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
  displayCode?: string | null;
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
          // An administrator's removal binds the holder: refused, not a conflict.
          if (t.code === 'REMOVED_BY_ADMINISTRATOR') throw new ForbiddenException(t.message);
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
      code: institutionCode(input.code),
      name: input.name.trim(),
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
      updated_by_user_id: actorId,
    };
    if (!values.name) throw new BadRequestException('Institution name is required.');
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
    if (patch.code !== undefined) set.code = institutionCode(patch.code);
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (set.name === '') throw new BadRequestException('Institution name is required.');
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
      code: distinctionCode(input.code),
      display_code: displayCode(input.displayCode ?? null),
      name: input.name.trim(),
      badge_eligible: input.badgeEligible,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
      updated_by_user_id: actorId,
    };
    if (!values.name) throw new BadRequestException('Distinction name is required.');
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
    if (patch.code !== undefined) set.code = distinctionCode(patch.code);
    if (patch.displayCode !== undefined) set.display_code = displayCode(patch.displayCode);
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (set.name === '') throw new BadRequestException('Distinction name is required.');
    if (patch.badgeEligible !== undefined) set.badge_eligible = patch.badgeEligible;
    if (patch.isActive !== undefined) set.is_active = patch.isActive;
    if (patch.sortOrder !== undefined) set.sort_order = patch.sortOrder;
    return this.catalogueWrite('This institution already has a distinction with that code.', async (trx) => {
      const before = await trx
        .selectFrom('photographic_distinctions')
        .select(['id', 'code', 'display_code', 'name', 'badge_eligible', 'is_active', 'sort_order'])
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

  async deleteInstitution(actorId: number, id: number) {
    return this.catalogueWrite('Institution is referenced and cannot be deleted.', async (trx) => {
      const before = await trx
        .selectFrom('photographic_institutions')
        .select(['id', 'code', 'name', 'is_active', 'sort_order'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before) throw new NotFoundException('Photographic institution not found.');
      const ref = await trx
        .selectFrom('photographic_distinctions')
        .select(['id'])
        .where('institution_id', '=', id)
        .limit(1)
        .executeTakeFirst();
      if (ref) throw new ConflictException('This institution has catalogue distinctions. Deactivate it instead.');
      await trx.deleteFrom('photographic_institutions').where('id', '=', id).execute();
      await logIdentityAudit(catalogueDeletedEvent('INSTITUTION', actorId, before), trx);
      return { id, deleted: true };
    });
  }

  async deleteDistinction(actorId: number, id: number) {
    return this.catalogueWrite('Distinction is referenced and cannot be deleted.', async (trx) => {
      const before = await trx
        .selectFrom('photographic_distinctions')
        .select(['id', 'institution_id', 'code', 'name', 'badge_eligible', 'is_active', 'sort_order'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before) throw new NotFoundException('Photographic distinction not found.');
      // Any holder row -- in ANY state, including WITHDRAWN/REMOVED history --
      // blocks deletion (fk_user_photo_dist_distinction is RESTRICT as well).
      const ref = await trx
        .selectFrom('user_photographic_distinctions')
        .select(['id'])
        .where('distinction_id', '=', id)
        .limit(1)
        .executeTakeFirst();
      if (ref) throw new ConflictException('Members have declared this distinction. Deactivate it instead.');
      await trx.deleteFrom('photographic_distinctions').where('id', '=', id).execute();
      await logIdentityAudit(catalogueDeletedEvent('DISTINCTION', actorId, before), trx);
      return { id, deleted: true };
    });
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /** Full catalogue (admin) or the declarable subset (active entries of active institutions). */
  async getCatalogue(opts: { includeInactive: boolean }) {
    let iq = db
      .selectFrom('photographic_institutions')
      .select(['id', 'code', 'name', 'is_active', 'sort_order'])
      .orderBy('sort_order', 'asc')
      .orderBy('code', 'asc');
    let dq = db
      .selectFrom('photographic_distinctions')
      .select(['id', 'institution_id', 'code', 'display_code', 'name', 'badge_eligible', 'is_active', 'sort_order'])
      .orderBy('sort_order', 'asc')
      .orderBy('code', 'asc');
    if (!opts.includeInactive) {
      iq = iq.where('is_active', '=', true);
      dq = dq.where('is_active', '=', true);
    }
    const [institutions, distinctions] = await Promise.all([iq.execute(), dq.execute()]);
    return institutions.map((i) => ({
      id: Number(i.id),
      code: i.code,
      name: i.name,
      isActive: flag(i.is_active),
      sortOrder: Number(i.sort_order),
      distinctions: distinctions
        .filter((d) => Number(d.institution_id) === Number(i.id))
        .map((d) => ({
          id: Number(d.id),
          code: d.code,
          displayCode: d.display_code ?? d.code,
          name: d.name,
          badgeEligible: flag(d.badge_eligible),
          isActive: flag(d.is_active),
          sortOrder: Number(d.sort_order),
        })),
    }));
  }

  /**
   * The holder's own view: every relationship they have (any state) plus the
   * declarable catalogue. REMOVED rows are shown as locked, never actionable.
   */
  async getHolderView(userId: number) {
    const [catalogue, declarations] = await Promise.all([
      this.getCatalogue({ includeInactive: false }),
      this.holderRows(userId),
    ]);
    return { catalogue, declarations };
  }

  /** Admin register of declarations (identity.distinction.view). */
  async listDeclarations(filters: { state?: 'DECLARED' | 'WITHDRAWN' | 'REMOVED'; userId?: number; q?: string }) {
    let q = db
      .selectFrom('user_photographic_distinctions as upd')
      .innerJoin('photographic_distinctions as d', 'd.id', 'upd.distinction_id')
      .innerJoin('photographic_institutions as i', 'i.id', 'd.institution_id')
      .innerJoin('users as u', 'u.id', 'upd.user_id')
      .select([
        'upd.user_id as user_id',
        'u.full_name as full_name',
        'u.username as username',
        'upd.distinction_id as distinction_id',
        'd.code as code',
        'd.display_code as display_code',
        'd.name as name',
        'i.code as institution_code',
        'upd.state as state',
        'upd.pre_removal_state as pre_removal_state',
        'upd.declared_at as declared_at',
        'upd.state_changed_at as state_changed_at',
      ])
      .orderBy('upd.state_changed_at', 'desc')
      .limit(500);
    if (filters.state) q = q.where('upd.state', '=', filters.state);
    if (filters.userId) q = q.where('upd.user_id', '=', filters.userId);
    if (filters.q) {
      const term = `%${filters.q}%`;
      q = q.where((eb) => eb.or([eb('u.full_name', 'like', term), eb('u.username', 'like', term)]));
    }
    const rows = await q.execute();
    const badges = await getBadgeStatuses(rows.map((r) => Number(r.user_id)));
    return rows.map((r) => ({
      userId: Number(r.user_id),
      // Derived at read time (never stored): whether this member currently
      // holds the BCC Distinguished Photographer Badge.
      badgeQualified: badges.get(Number(r.user_id))?.qualified ?? false,
      fullName: r.full_name,
      username: r.username ?? null,
      distinctionId: Number(r.distinction_id),
      institutionCode: r.institution_code,
      code: r.display_code ?? r.code,
      name: r.name,
      state: r.state,
      preRemovalState: r.pre_removal_state,
      declaredAt: r.declared_at,
      stateChangedAt: r.state_changed_at,
    }));
  }

  private async holderRows(userId: number) {
    const rows = await db
      .selectFrom('user_photographic_distinctions as upd')
      .innerJoin('photographic_distinctions as d', 'd.id', 'upd.distinction_id')
      .innerJoin('photographic_institutions as i', 'i.id', 'd.institution_id')
      .select([
        'upd.distinction_id as distinction_id',
        'd.code as code',
        'd.display_code as display_code',
        'd.name as name',
        'd.is_active as distinction_is_active',
        'i.code as institution_code',
        'i.name as institution_name',
        'i.is_active as institution_is_active',
        'upd.state as state',
        'upd.declared_at as declared_at',
        'upd.state_changed_at as state_changed_at',
      ])
      .where('upd.user_id', '=', userId)
      .orderBy('i.sort_order', 'asc')
      .orderBy('d.sort_order', 'asc')
      .execute();
    return rows.map((r) => ({
      distinctionId: Number(r.distinction_id),
      institutionCode: r.institution_code,
      institutionName: r.institution_name,
      code: r.display_code ?? r.code,
      name: r.name,
      state: r.state,
      // false once the catalogue entry or its institution is deactivated:
      // the row is history, not currently declarable.
      catalogueActive: flag(r.distinction_is_active) && flag(r.institution_is_active),
      declaredAt: r.declared_at,
      stateChangedAt: r.state_changed_at,
    }));
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
