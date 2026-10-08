// WP5 -- entitlement layer 2 considers Recognition Classes only, in a
// deterministic order. Senior Overlay entitlement contribution is UNDECIDED
// governance and is deliberately NOT encoded: no Senior ordering/modifier rule.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../shared/membership-audit.util', () => ({ logMembershipAudit: jest.fn() }));

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { RECOGNITION_CLASS_CODES } from '../recognition/senior-status.reader';
import { EntitlementService } from './entitlement.service';

const fake = db as unknown as FakeDb;
type Row = Record<string, any>;
const svc = new EntitlementService();

// Production-shaped: Honorary classes carry modifiers; Senior codes have none.
const MODIFIERS: Row[] = [
  { recognition_code: 'HONORARY_MEMBER', entitlement_key: 'portfolio_max_photos', modifier_value: 'unlimited' },
  { recognition_code: 'HONORARY_MEMBER', entitlement_key: 'digital_card', modifier_value: 'true' },
];

function install(recognitions: Row[], modifiers: Row[] = MODIFIERS) {
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    if (op.table === 'memberships') return [{ id: 92, owner_type: 'INDIVIDUAL', membership_class_id: 5, group_membership_type_id: null }];
    if (op.table === 'class_entitlements') return [{ entitlement_key: 'portfolio_max_photos', entitlement_value: '10' }];
    if (op.table === 'individual_overrides') return [];
    if (op.table === 'member_recognitions as mr') {
      const codes = (op.wheres.find(([c, cmp]) => c === 'mr.recognition_code' && cmp === 'in')?.[2] as string[] | undefined) ?? null;
      const rows = recognitions
        .filter((r) => r.status === 'ACTIVE' && (codes === null || codes.includes(r.recognition_code)))
        .sort((a, b) => (op.orderBys?.some(([c]) => c === 'mr.id') ? a.id - b.id : 0));
      return rows.flatMap((r) => modifiers.filter((m) => m.recognition_code === r.recognition_code).map((m) => ({ ...m, membership_id: 92 })));
    }
    return [];
  };
}

beforeEach(() => fake.reset());

const layer2 = () => fake.selects.find((s) => s.table === 'member_recognitions as mr')!;

describe('entitlement layer 2 -- Recognition Classes only, deterministic', () => {
  it('10. restricts to Recognition Class codes and orders by recognition id', async () => {
    install([{ id: 4, recognition_code: 'HONORARY_MEMBER', status: 'ACTIVE' }]);
    await svc.resolve(92);
    const op = layer2();
    const inClause = op.wheres.find(([c, cmp]) => c === 'mr.recognition_code' && cmp === 'in')!;
    expect(inClause[2]).toEqual([...RECOGNITION_CLASS_CODES]);
    expect(inClause[2]).not.toContain('SENIOR_MEMBER');
    expect(op.orderBys).toEqual([['mr.id', 'asc']]);
  });

  it('same bulk resolver: class-only filter and deterministic order', async () => {
    install([{ id: 4, recognition_code: 'HONORARY_MEMBER', status: 'ACTIVE' }]);
    await svc.resolveMany([92], ['portfolio_max_photos']);
    const op = layer2();
    expect(op.wheres.find(([c, cmp]) => c === 'mr.recognition_code' && cmp === 'in')![2]).toEqual([...RECOGNITION_CLASS_CODES]);
    expect(op.orderBys).toEqual([['mr.id', 'asc']]);
  });

  it('production-shaped Honorary member: outcome unchanged (class modifier overrides base)', async () => {
    install([{ id: 4, recognition_code: 'HONORARY_MEMBER', status: 'ACTIVE' }]);
    const r = await svc.resolve(92);
    expect(r.resolved).toEqual({ portfolio_max_photos: 'unlimited', digital_card: 'true' });
    expect(r.provenance.filter((p) => p.source === 'RECOGNITION').map((p) => p.detail)).toEqual(['HONORARY_MEMBER', 'HONORARY_MEMBER']);
  });

  it('a legacy Senior row contributes nothing to layer 2 (same outcome as no recognition)', async () => {
    install([{ id: 8, recognition_code: 'SENIOR_MEMBER', status: 'ACTIVE' }], [
      ...MODIFIERS,
      { recognition_code: 'SENIOR_MEMBER', entitlement_key: 'portfolio_max_photos', modifier_value: 'SHOULD_NOT_APPLY' },
    ]);
    const r = await svc.resolve(92);
    expect(r.resolved).toEqual({ portfolio_max_photos: '10' });
  });

  it('Honorary Senior is a Recognition Class and is still considered', async () => {
    install([{ id: 17, recognition_code: 'HONORARY_SENIOR_MEMBER', status: 'ACTIVE' }], [
      { recognition_code: 'HONORARY_SENIOR_MEMBER', entitlement_key: 'digital_card', modifier_value: 'true' },
    ]);
    expect((await svc.resolve(92)).resolved).toMatchObject({ digital_card: 'true' });
  });

  it('is read-only', async () => {
    install([{ id: 4, recognition_code: 'HONORARY_MEMBER', status: 'ACTIVE' }]);
    await svc.resolve(92);
    await svc.resolveMany([92], ['digital_card']);
    expect(fake.committed).toHaveLength(0);
  });
});
