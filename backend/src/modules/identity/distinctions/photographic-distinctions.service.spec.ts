// Photographic Distinctions service -- state writes + identity_audit_log
// target rules, against the recording FakeDb (no real MySQL).
//
// Proves: user-level events target the holder; catalogue events target
// NULL; the actor is never substituted as target; each write and its audit
// row commit in one transaction (and roll back together); Remove/Restore
// require a reason; duplicate keys surface as conflicts.
//
// Does NOT prove the MySQL schema itself (uniqueness/CHECK enforcement) --
// see photographic-distinctions.migrations.spec.ts for the DDL assertions.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { PhotographicDistinctionsService } from './photographic-distinctions.service';

const fake = db as unknown as FakeDb;

const HOLDER = 27;
const ADMIN = 1;
const DIST = 5;

const activeDistinction = { id: DIST, code: 'AFIP', is_active: 1, institution_code: 'FIP', institution_is_active: 1 };

function script(opts: {
  distinction?: Record<string, unknown> | undefined;
  existing?: Record<string, unknown> | undefined;
  institution?: Record<string, unknown> | undefined;
  catalogueDistinction?: Record<string, unknown> | undefined;
}) {
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    switch (op.table) {
      case 'photographic_distinctions as d': return opts.distinction ? [opts.distinction] : [];
      case 'user_photographic_distinctions': return opts.existing ? [opts.existing] : [];
      case 'photographic_institutions': return opts.institution ? [opts.institution] : [];
      case 'photographic_distinctions': return opts.catalogueDistinction ? [opts.catalogueDistinction] : [];
      default: return [];
    }
  };
}

const audits = () => fake.writes('identity_audit_log', 'insert').map((o) => o.values!);

describe('PhotographicDistinctionsService', () => {
  let svc: PhotographicDistinctionsService;

  beforeEach(() => {
    fake.reset();
    svc = new PhotographicDistinctionsService();
  });

  describe('holder lifecycle', () => {
    it('declare inserts DECLARED and audits with the holder as target', async () => {
      script({ distinction: activeDistinction });
      await svc.declare(HOLDER, DIST);
      const [ins] = fake.writes('user_photographic_distinctions', 'insert');
      expect(ins.values).toMatchObject({ user_id: HOLDER, distinction_id: DIST, state: 'DECLARED', pre_removal_state: null, state_changed_by_user_id: HOLDER });
      expect(audits()).toEqual([
        expect.objectContaining({ actor_id: HOLDER, target_user_id: HOLDER, action_type: 'PHOTOGRAPHIC_DISTINCTION_DECLARED' }),
      ]);
      expect(ins.txId).not.toBeNull();
      expect(fake.writes('identity_audit_log')[0].txId).toBe(ins.txId);
    });

    it('withdraw updates the row (never deletes) and audits', async () => {
      script({ distinction: activeDistinction, existing: { id: 9, state: 'DECLARED', pre_removal_state: null } });
      await svc.withdraw(HOLDER, DIST);
      expect(fake.writes('user_photographic_distinctions', 'update')[0].set).toMatchObject({ state: 'WITHDRAWN' });
      expect(fake.writes('user_photographic_distinctions', 'delete')).toHaveLength(0);
      expect(audits()[0]).toMatchObject({ target_user_id: HOLDER, action_type: 'PHOTOGRAPHIC_DISTINCTION_WITHDRAWN' });
    });

    it('re-declaring a withdrawn distinction is allowed and audited as REDECLARED', async () => {
      script({ distinction: activeDistinction, existing: { id: 9, state: 'WITHDRAWN', pre_removal_state: null } });
      await svc.declare(HOLDER, DIST);
      expect(fake.writes('user_photographic_distinctions', 'update')[0].set).toMatchObject({ state: 'DECLARED' });
      expect(audits()[0]).toMatchObject({ action_type: 'PHOTOGRAPHIC_DISTINCTION_REDECLARED', target_user_id: HOLDER });
    });

    it('holder cannot re-declare a REMOVED distinction; nothing is written', async () => {
      script({ distinction: activeDistinction, existing: { id: 9, state: 'REMOVED', pre_removal_state: 'DECLARED' } });
      await expect(svc.declare(HOLDER, DIST)).rejects.toBeInstanceOf(ConflictException);
      expect(fake.committed).toHaveLength(0);
    });

    it('an inactive distinction or institution cannot be declared', async () => {
      script({ distinction: { ...activeDistinction, is_active: 0 } });
      await expect(svc.declare(HOLDER, DIST)).rejects.toBeInstanceOf(BadRequestException);
      script({ distinction: { ...activeDistinction, institution_is_active: 0 } });
      await expect(svc.declare(HOLDER, DIST)).rejects.toBeInstanceOf(BadRequestException);
      expect(fake.committed).toHaveLength(0);
    });

    it('unknown distinction -> 404 (catalogue-bounded, no free text)', async () => {
      script({});
      await expect(svc.declare(HOLDER, 999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a concurrent duplicate first declaration surfaces as a conflict', async () => {
      script({ distinction: activeDistinction });
      fake.failWhen = (op) => (op.kind === 'insert' && op.table === 'user_photographic_distinctions'
        ? Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }) : null);
      await expect(svc.declare(HOLDER, DIST)).rejects.toBeInstanceOf(ConflictException);
    });

    it('if the audit insert fails, the state change rolls back with it', async () => {
      script({ distinction: activeDistinction });
      fake.failWhen = (op) => (op.table === 'identity_audit_log' ? new Error('audit down') : null);
      await expect(svc.declare(HOLDER, DIST)).rejects.toThrow('audit down');
      expect(fake.committed).toHaveLength(0);
      expect(fake.rolledBack.some((o) => o.table === 'user_photographic_distinctions')).toBe(true);
    });
  });

  describe('administrator remove / restore', () => {
    it('remove: actor = admin, target = holder (not the actor), reason retained', async () => {
      script({ distinction: activeDistinction, existing: { id: 9, state: 'DECLARED', pre_removal_state: null } });
      await svc.remove(ADMIN, HOLDER, DIST, 'Complaint received; evidence not provided');
      expect(fake.writes('user_photographic_distinctions', 'update')[0].set).toMatchObject({ state: 'REMOVED', pre_removal_state: 'DECLARED', state_changed_by_user_id: ADMIN });
      expect(audits()[0]).toMatchObject({
        actor_id: ADMIN,
        target_user_id: HOLDER,
        action_type: 'PHOTOGRAPHIC_DISTINCTION_REMOVED',
        reason: 'Complaint received; evidence not provided',
      });
    });

    it('restore returns to the prior state and is audited with its reason', async () => {
      script({ distinction: activeDistinction, existing: { id: 9, state: 'REMOVED', pre_removal_state: 'WITHDRAWN' } });
      await svc.restore(ADMIN, HOLDER, DIST, 'Evidence supplied');
      expect(fake.writes('user_photographic_distinctions', 'update')[0].set).toMatchObject({ state: 'WITHDRAWN', pre_removal_state: null });
      expect(audits()[0]).toMatchObject({ target_user_id: HOLDER, action_type: 'PHOTOGRAPHIC_DISTINCTION_RESTORED', reason: 'Evidence supplied' });
    });

    it('remove and restore require a reason', async () => {
      script({ distinction: activeDistinction, existing: { id: 9, state: 'DECLARED', pre_removal_state: null } });
      await expect(svc.remove(ADMIN, HOLDER, DIST, '   ')).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.restore(ADMIN, HOLDER, DIST, '')).rejects.toBeInstanceOf(BadRequestException);
      expect(fake.committed).toHaveLength(0);
    });

    it('remove still works on an inactive catalogue entry (history stays correctable)', async () => {
      script({ distinction: { ...activeDistinction, is_active: 0 }, existing: { id: 9, state: 'DECLARED', pre_removal_state: null } });
      await svc.remove(ADMIN, HOLDER, DIST, 'cleanup');
      expect(audits()[0]).toMatchObject({ action_type: 'PHOTOGRAPHIC_DISTINCTION_REMOVED' });
    });
  });

  describe('catalogue events have a NULL target', () => {
    it('createInstitution audits with target_user_id NULL, never the actor', async () => {
      script({});
      await svc.createInstitution(ADMIN, { code: 'xyz', name: 'Example Institution', sortOrder: 60 });
      expect(fake.writes('photographic_institutions', 'insert')[0].values).toMatchObject({ code: 'XYZ', updated_by_user_id: ADMIN });
      expect(audits()).toEqual([expect.objectContaining({ actor_id: ADMIN, target_user_id: null, action_type: 'PHOTOGRAPHIC_INSTITUTION_CREATED' })]);
    });

    it('duplicate institution code -> conflict (uq_photo_inst_code)', async () => {
      script({});
      fake.failWhen = (op) => (op.kind === 'insert' && op.table === 'photographic_institutions'
        ? Object.assign(new Error('dup'), { errno: 1062 }) : null);
      await expect(svc.createInstitution(ADMIN, { code: 'FIP', name: 'Dup' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('institution deactivation is its own NULL-target event', async () => {
      script({ institution: { id: 3, code: 'GPU', name: 'Global Photographic Union', is_active: 1, sort_order: 50 } });
      await svc.updateInstitution(ADMIN, 3, { isActive: false });
      expect(audits()).toEqual([expect.objectContaining({ target_user_id: null, action_type: 'PHOTOGRAPHIC_INSTITUTION_DEACTIVATED' })]);
    });

    it('createDistinction stores badge eligibility and audits with NULL target', async () => {
      script({ institution: { id: 1 } });
      await svc.createDistinction(ADMIN, { institutionId: 1, code: 'AFIP', name: 'Example name', badgeEligible: true, sortOrder: 10 });
      expect(fake.writes('photographic_distinctions', 'insert')[0].values).toMatchObject({ institution_id: 1, code: 'AFIP', badge_eligible: true, is_active: true });
      expect(audits()).toEqual([expect.objectContaining({ target_user_id: null, action_type: 'PHOTOGRAPHIC_DISTINCTION_CATALOGUE_CREATED' })]);
    });

    it('createDistinction under an unknown institution -> 404', async () => {
      script({});
      await expect(svc.createDistinction(ADMIN, { institutionId: 99, code: 'X', name: 'X', badgeEligible: false })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('duplicate (institution, code) -> conflict (uq_photo_dist_institution_code)', async () => {
      script({ institution: { id: 1 } });
      fake.failWhen = (op) => (op.kind === 'insert' && op.table === 'photographic_distinctions'
        ? Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }) : null);
      await expect(svc.createDistinction(ADMIN, { institutionId: 1, code: 'AFIP', name: 'n', badgeEligible: false })).rejects.toBeInstanceOf(ConflictException);
    });

    it('badge eligibility + deactivation + rename -> three NULL-target events in one transaction', async () => {
      script({ catalogueDistinction: { id: DIST, code: 'AFIP', name: 'Old', badge_eligible: 0, is_active: 1, sort_order: 10 } });
      await svc.updateDistinction(ADMIN, DIST, { badgeEligible: true, isActive: false, name: 'New' });
      const a = audits();
      expect(a.map((e) => e.action_type).sort()).toEqual([
        'PHOTOGRAPHIC_DISTINCTION_BADGE_ELIGIBILITY_CHANGED',
        'PHOTOGRAPHIC_DISTINCTION_CATALOGUE_DEACTIVATED',
        'PHOTOGRAPHIC_DISTINCTION_CATALOGUE_UPDATED',
      ]);
      expect(a.every((e) => e.target_user_id === null && e.actor_id === ADMIN)).toBe(true);
      const txIds = new Set(fake.committed.map((o) => o.txId));
      expect(txIds.size).toBe(1);
    });

    it('a no-op update writes nothing', async () => {
      script({ catalogueDistinction: { id: DIST, code: 'AFIP', name: 'Same', badge_eligible: 1, is_active: 1, sort_order: 10 } });
      const r = await svc.updateDistinction(ADMIN, DIST, { name: 'Same', badgeEligible: true });
      expect(r).toEqual({ id: DIST, changed: false });
      expect(fake.committed).toHaveLength(0);
    });
  });
});
