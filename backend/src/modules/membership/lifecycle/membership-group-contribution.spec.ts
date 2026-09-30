// backend/src/modules/membership/lifecycle/membership-group-contribution.spec.ts
//
// Family / Corporate Financial Contribution creation —
// MembershipLifecycleService.createGroupApplicationContribution().
//
// The REAL lifecycle method and the REAL FinancialContributionService run
// against the recording FakeDb (test-support/fake-db.ts); only the
// collaborators irrelevant to contribution creation (numbering,
// communication) are inert stubs and EntitlementService is a stub serving
// the MEM-008 group_type_entitlements fee values.
//
// Proves: amount comes from group_type_entitlements.fee_inr (Family ₹6,000,
// Corporate ₹5,000 -- never hard-coded), currency INR, business reference is
// the memberships row, one obligation -> one Contribution (idempotent), and
// the operation never approves, activates, numbers, or touches delegates.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));
jest.mock('../numbering/membership-numbering.service', () => ({ MembershipNumberingService: class {} }));
jest.mock('../entitlements/entitlement.service', () => ({ EntitlementService: class {} }));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../../../database/db';
import { whereValue, type FakeDb, type FakeOp } from '../../../test-support/fake-db';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { FinancialAuditService } from '../../financial/audit/financial-audit.service';
import type { FinancialEventBus } from '../../financial/financial-event-bus.service';
import type { SettlementProvider } from '../../financial/settlement-provider.interface';
import type { CommunicationService } from '../../shared/communication/communication.service';
import type { EntitlementService } from '../entitlements/entitlement.service';
import type { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { MembershipLifecycleService } from './membership-lifecycle.service';

const fake = db as unknown as FakeDb;

const GROUP_TYPES: Record<number, { name: string; fee: string | null }> = {
  1: { name: 'Family Membership', fee: '6000' },
  2: { name: 'Corporate Membership', fee: '5000' },
};

interface Scenario {
  membership: Record<string, unknown>;
  primaryContact?: number | null;
  fee?: string | null;
}

function setup(s: Scenario) {
  const contributions: Array<Record<string, unknown>> = [];
  let nextContributionId = 300;

  fake.responder = (op: FakeOp) => {
    if (op.table === 'memberships' && op.kind === 'select') return [{ ...s.membership }];
    if (op.table === 'group_membership_types' && op.kind === 'select') {
      const t = GROUP_TYPES[whereValue(op, 'id') as number];
      return t ? [{ name: t.name }] : [];
    }
    if (op.table === 'group_entities' && op.kind === 'select') {
      return s.primaryContact === null ? [{ primary_contact_user_id: null }] : [{ primary_contact_user_id: s.primaryContact ?? 42 }];
    }
    if (op.table === 'financial_contributions') {
      if (op.kind === 'insert') {
        const id = nextContributionId++;
        contributions.push({ id, state: 'CREATED', ...op.values });
        return { insertId: BigInt(id) };
      }
      if (op.kind === 'select') {
        const key = whereValue(op, 'idempotency_key');
        const id = whereValue(op, 'id');
        return contributions
          .filter((c) => (key === undefined || c.idempotency_key === key) && (id === undefined || c.id === id))
          .map((c) => ({ ...c }));
      }
      if (op.kind === 'update') {
        const row = contributions.find((c) => c.id === whereValue(op, 'id'));
        if (row) Object.assign(row, op.set);
        return undefined;
      }
    }
    return op.kind === 'select' ? [] : undefined;
  };

  const bus = { emit: jest.fn() };
  const provider = { providerName: 'RAZORPAY', createOrder: jest.fn(), refund: jest.fn(), createPaymentLink: jest.fn() };
  const financial = new FinancialContributionService(
    bus as unknown as FinancialEventBus,
    provider as unknown as SettlementProvider,
    new FinancialAuditService(),
  );
  const numbering = { assignPermanentNumber: jest.fn() };
  const communication = { dispatch: jest.fn() };
  const entitlements = {
    getGroupTypeConfigValue: jest.fn(async (typeId: number, key: string) =>
      key === 'fee_inr' ? (s.fee !== undefined ? s.fee : GROUP_TYPES[typeId]?.fee ?? null) : null,
    ),
  };
  const lifecycle = new MembershipLifecycleService(
    numbering as unknown as MembershipNumberingService,
    communication as unknown as CommunicationService,
    entitlements as unknown as EntitlementService,
    financial,
  );
  return { lifecycle, contributions, bus, provider, numbering, communication, entitlements };
}

function groupMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: 9, owner_type: 'GROUP', user_id: null, group_entity_id: 5, membership_class_id: null,
    group_membership_type_id: 1, lifecycle_state: 'PENDING', ...overrides,
  };
}

function membershipWrites(): FakeOp[] {
  return fake.committed.filter((op) => op.table === 'memberships');
}

beforeEach(() => fake.reset());

describe('createGroupApplicationContribution() — Family / Corporate', () => {
  it('Family: one Contribution of ₹6,000 (600000 paise, INR) from group_type_entitlements.fee_inr', async () => {
    const { lifecycle, contributions, entitlements } = setup({ membership: groupMembership() });

    const result = await lifecycle.createGroupApplicationContribution(9);

    expect(entitlements.getGroupTypeConfigValue).toHaveBeenCalledWith(1, 'fee_inr');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]).toMatchObject({
      payer_user_id: 42,
      business_module: 'MEMBERSHIP',
      business_reference_id: 9,
      purpose: 'Family Membership fee',
      amount_paise: 600000,
      currency: 'INR',
      idempotency_key: 'MEMBERSHIP-9-CONTRIBUTION',
      state: 'AWAITING_SETTLEMENT',
    });
    expect(result).toEqual({ contributionId: 300, state: 'AWAITING_SETTLEMENT', amountPaise: 600000, currency: 'INR' });
  });

  it('Corporate: one Contribution of ₹5,000 (500000 paise, INR), payer = the group primary contact', async () => {
    const { lifecycle, contributions } = setup({
      membership: groupMembership({ id: 11, group_entity_id: 6, group_membership_type_id: 2 }),
      primaryContact: 77,
    });

    const result = await lifecycle.createGroupApplicationContribution(11);

    expect(contributions[0]).toMatchObject({
      payer_user_id: 77,
      business_reference_id: 11,
      purpose: 'Corporate Membership fee',
      amount_paise: 500000,
      currency: 'INR',
      idempotency_key: 'MEMBERSHIP-11-CONTRIBUTION',
    });
    expect(result.amountPaise).toBe(500000);
  });

  it('a repeat call returns the SAME Contribution: no duplicate, no second transition', async () => {
    const { lifecycle, contributions } = setup({ membership: groupMembership() });
    await lifecycle.createGroupApplicationContribution(9);
    const writesAfterFirst = fake.writes('financial_contributions').length;

    const again = await lifecycle.createGroupApplicationContribution(9);

    expect(contributions).toHaveLength(1);
    expect(again.contributionId).toBe(300);
    expect(fake.writes('financial_contributions').length).toBe(writesAfterFirst);
  });

  it('a Contribution whose attempt failed is left as-is for retry (no new Contribution)', async () => {
    const { lifecycle, contributions } = setup({ membership: groupMembership() });
    await lifecycle.createGroupApplicationContribution(9);
    contributions[0].state = 'FAILED';

    const again = await lifecycle.createGroupApplicationContribution(9);

    expect(contributions).toHaveLength(1);
    expect(again.state).toBe('FAILED');
  });

  // Frozen lifecycle (PAY -> APPROVE): the application obligation belongs to
  // a PENDING application only -- a decided application cannot acquire one.
  it.each(['APPROVED', 'ACTIVE', 'REJECTED', 'TERMINATED', 'EXPIRED', 'SUSPENDED'])(
    'refuses a %s membership (no Contribution)',
    async (state) => {
      const { lifecycle, contributions } = setup({ membership: groupMembership({ lifecycle_state: state }) });
      await expect(lifecycle.createGroupApplicationContribution(9)).rejects.toThrow(ConflictException);
      expect(contributions).toHaveLength(0);
    },
  );

  it('refuses an INDIVIDUAL membership (that path is createApplicationContribution())', async () => {
    const { lifecycle, contributions } = setup({
      membership: groupMembership({ owner_type: 'INDIVIDUAL', user_id: 3, group_entity_id: null, group_membership_type_id: null, membership_class_id: 4 }),
    });
    await expect(lifecycle.createGroupApplicationContribution(9)).rejects.toThrow(BadRequestException);
    expect(contributions).toHaveLength(0);
  });

  it.each([null, '', 'abc', '-1'])('a missing/invalid fee_inr (%p) is a loud configuration error, never a free obligation', async (fee) => {
    const { lifecycle, contributions } = setup({ membership: groupMembership(), fee });
    await expect(lifecycle.createGroupApplicationContribution(9)).rejects.toThrow(/no valid fee_inr/);
    expect(contributions).toHaveLength(0);
  });

  it('a group with no primary contact cannot get a payer', async () => {
    const { lifecycle, contributions } = setup({ membership: groupMembership(), primaryContact: null });
    await expect(lifecycle.createGroupApplicationContribution(9)).rejects.toThrow(/no primary contact/);
    expect(contributions).toHaveLength(0);
  });

  it('never approves, activates, numbers, notifies, or starts settlement', async () => {
    const { lifecycle, numbering, communication, provider } = setup({ membership: groupMembership() });
    await lifecycle.createGroupApplicationContribution(9);

    expect(numbering.assignPermanentNumber).not.toHaveBeenCalled();
    expect(communication.dispatch).not.toHaveBeenCalled();
    expect(provider.createPaymentLink).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
    // The only Membership write is the pending_contribution_id pointer.
    expect(membershipWrites().map((op) => op.set)).toEqual([{ pending_contribution_id: 300 }]);
    expect(fake.committed.some((op) => op.table === 'group_delegates')).toBe(false);
    expect(fake.writes('financial_transactions')).toHaveLength(0);
  });
});

describe('Static guards — no numbering / activation in contribution creation', () => {
  const LIFECYCLE_SRC = readFileSync(join(__dirname, 'membership-lifecycle.service.ts'), 'utf8').replace(/\r\n/g, '\n');
  const METHOD = LIFECYCLE_SRC.slice(
    LIFECYCLE_SRC.indexOf('async createGroupApplicationContribution('),
    LIFECYCLE_SRC.indexOf('private async getMembershipContribution('),
  );
  const APPLY = LIFECYCLE_SRC.slice(LIFECYCLE_SRC.indexOf('async apply('), LIFECYCLE_SRC.indexOf('async createApplicationContribution('));
  const APPROVE = LIFECYCLE_SRC.slice(LIFECYCLE_SRC.indexOf('async approve('), LIFECYCLE_SRC.indexOf('async reject('));

  it('the method never touches numbering, lifecycle_state, activation or delegates', () => {
    expect(METHOD).not.toMatch(/numberingService|assignPermanentNumber|membership_number/);
    expect(METHOD).not.toMatch(/lifecycle_state:/);
    expect(METHOD).not.toMatch(/\.activate\(|\.approve\(/);
    expect(METHOD).not.toContain('group_delegates');
  });

  it('prices are never hard-coded (MEM-008 values live in group_type_entitlements)', () => {
    ['6000', '5000', '600000', '500000'].forEach((v) => expect(METHOD).not.toContain(v));
    expect(METHOD).toContain("'fee_inr'");
  });

  // Frozen lifecycle: the contribution is created AT APPLICATION (payment
  // precedes approval); approval never creates or settles it.
  it('apply() creates it for GROUP applications; approve() never does', () => {
    expect(APPLY).toMatch(/if \(params\.ownerType === 'GROUP'\) \{\s*await this\.createGroupApplicationContribution\(id, auditContext\);/);
    expect(APPROVE).not.toContain('createGroupApplicationContribution');
  });
});
