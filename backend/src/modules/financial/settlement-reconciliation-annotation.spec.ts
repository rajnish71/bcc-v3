// backend/src/modules/financial/settlement-reconciliation-annotation.spec.ts
//
// TEST_MODE_NON_GENUINE_SETTLEMENT annotation -- evidence mandatory,
// correction Contribution optional (HA decision 2026-10-07, extending the
// Option I mechanism for historical test-mode settlements 4, 9 and 13).
//
// The REAL FinancialContributionService + FinancialAuditService run against
// the recording FakeDb backed by an in-memory table store. Proves: COMPLETED
// and REFUNDED settlements can be classified with or without a correction
// Contribution; the provider account must come from the verified payload and
// be a Razorpay TEST account; evidence must be tied to the SUCCEEDED
// transaction; nothing but one append-only financial_audit_log row is ever
// written (no Contribution, Transaction, refund or state change).

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { db } from '../../database/db';
import type { FakeDb, FakeOp } from '../../test-support/fake-db';
import { FinancialAuditService } from './audit/financial-audit.service';
import {
  RAZORPAY_TEST_MODE_ACCOUNT_IDS,
  RECONCILIATION_REASON_MAX_LENGTH,
  type AuditContext,
} from './audit/financial-audit.types';
import { FinancialContributionService } from './financial-contribution.service';
import { FinancialEventBus } from './financial-event-bus.service';
import type { SettlementProvider } from './settlement-provider.interface';

const fake = db as unknown as FakeDb;

const TEST_ACCOUNT = 'acc_DJkWMSsLHLxU4a';
const LIVE_ACCOUNT = 'acc_TB6rt1Y9pstHJK';
const ADMIN: AuditContext = { actorType: 'ADMIN', provenance: { actorUserId: 1, requestId: 'req-admin' } };
const CLASSIFICATION = 'TEST_MODE_NON_GENUINE_SETTLEMENT' as const;

const REASON_NO_LIVE =
  'Historical Razorpay test-mode settlement. No genuine financial settlement occurred. No subsequent live-mode payment was received for this contribution.';
const REASON_REFUNDED =
  'Historical Razorpay test-mode settlement. No genuine financial settlement occurred. The recorded refund relates to the test-mode transaction and does not represent a genuine-money refund.';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function matches(row: Row, op: FakeOp): boolean {
  return op.wheres.every(([col, cmp, val]) => {
    const v = row[String(col)];
    if (cmp === '=') return v === val;
    if (cmp === 'in') return (val as unknown[]).includes(v);
    return true;
  });
}

function installStore(tables: Tables) {
  let nextId = 5000;
  fake.responder = (op: FakeOp) => {
    const rows = (tables[op.table] ??= []);
    if (op.kind === 'select') return rows.filter((r) => matches(r, op)).map((r) => ({ ...r }));
    if (op.kind === 'insert') {
      const id = nextId++;
      rows.push({ ...op.values, id });
      return { insertId: BigInt(id) };
    }
    if (op.kind === 'update') {
      const hit = rows.filter((r) => matches(r, op));
      hit.forEach((r) => Object.assign(r, op.set));
      return { numUpdatedRows: BigInt(hit.length) };
    }
    return undefined;
  };
}

function captured(accountId: string | undefined, paymentId: string) {
  return {
    event: 'payment.captured',
    ...(accountId !== undefined ? { account_id: accountId } : {}),
    payload: { payment: { entity: { id: paymentId, order_id: `order_for_${paymentId}` } } },
  };
}

interface Case {
  id: number;
  state: string;
  amountPaise: number;
  paymentId: string;
  accountId?: string;
  refund?: Row | null;
  inbox?: Row[];
  transactions?: Row[];
}

// Mirrors the production evidence shapes for contributions 4, 9 and 13
// (and 8 / 23 for the Option I correction relationship).
const C4: Case = { id: 4, state: 'COMPLETED', amountPaise: 250000, paymentId: 'pay_TOxTFStwZrj4Ht' };
const C13: Case = { id: 13, state: 'COMPLETED', amountPaise: 250000, paymentId: 'pay_Tf8hFy6By8tb3D' };
const C9: Case = {
  id: 9, state: 'REFUNDED', amountPaise: 50000, paymentId: 'pay_TdR96BijbGkxWB',
  refund: { id: 3, contribution_id: 9, status: 'COMPLETED', amount_paise: 50000 },
};
const C8: Case = { id: 8, state: 'COMPLETED', amountPaise: 120000, paymentId: 'pay_Td1Zs77xOJPVno' };

function world(c: Case, extra: Row[] = []): Tables {
  const tables: Tables = {
    financial_contributions: [
      { id: c.id, uuid: `c-${c.id}`, state: c.state, amount_paise: c.amountPaise, currency: 'INR', business_module: 'MEMBERSHIP' },
      ...extra,
    ],
    financial_transactions: c.transactions ?? [
      { id: 100 + c.id, contribution_id: c.id, provider: 'RAZORPAY', provider_reference: c.paymentId, amount_paise: c.amountPaise, outcome: 'SUCCEEDED' },
    ],
    financial_refunds: c.refund ? [c.refund] : [],
    settlement_webhook_inbox: c.inbox ?? [
      { id: 200 + c.id, event_type: 'payment.captured', status: 'PROCESSED', contribution_id: c.id, payload: captured(c.accountId ?? TEST_ACCOUNT, c.paymentId) },
    ],
    receipts: [{ id: 300 + c.id, contribution_id: c.id, amount_paise: c.amountPaise }],
    financial_audit_log: [],
  };
  installStore(tables);
  return tables;
}

function service() {
  const provider = { providerName: 'RAZORPAY' } as unknown as SettlementProvider;
  return new FinancialContributionService(new FinancialEventBus(), provider, new FinancialAuditService());
}

function annotate(id: number, input: { reason?: string; correctionContributionId?: number | null } = {}) {
  return service().annotateSettlementReconciliation(
    id,
    { classification: CLASSIFICATION, reason: input.reason ?? REASON_NO_LIVE, correctionContributionId: input.correctionContributionId },
    ADMIN,
  );
}

function annotations(tables: Tables): Row[] {
  return tables.financial_audit_log.filter((r) => r.event_type === 'SETTLEMENT_RECONCILIATION_ANNOTATED');
}

function writes(): FakeOp[] {
  return [...fake.committed, ...fake.rolledBack];
}

function nonAuditWrites(): FakeOp[] {
  return writes().filter((op) => op.table !== 'financial_audit_log');
}

beforeEach(() => fake.reset());

describe('annotation with mandatory evidence and optional correction', () => {
  it('1. COMPLETED + TEST evidence + no correction contribution -> valid (contribution 4)', async () => {
    const tables = world(C4);
    await expect(annotate(4)).resolves.toEqual({ annotated: true });

    const rows = annotations(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contribution_id: 4, transaction_id: 104, webhook_inbox_id: 204, refund_id: null,
      previous_state: 'COMPLETED', resulting_state: 'COMPLETED',
      provider_payment_ref: 'pay_TOxTFStwZrj4Ht', provider_order_ref: 'order_for_pay_TOxTFStwZrj4Ht',
    });
    const meta = JSON.parse(String(rows[0].metadata_json));
    expect(meta).toEqual({
      settlementClassification: CLASSIFICATION,
      providerAccountId: TEST_ACCOUNT,
      reconciliationReason: REASON_NO_LIVE,
    });
    expect('correctionContributionId' in meta).toBe(false);
  });

  it('1b. contribution 13 has the same evidence shape and is equally valid', async () => {
    const tables = world(C13);
    await expect(annotate(13)).resolves.toEqual({ annotated: true });
    expect(annotations(tables)[0]).toMatchObject({ contribution_id: 13, transaction_id: 113, webhook_inbox_id: 213 });
  });

  it('2. COMPLETED + TEST evidence + correction contribution -> valid, Option I shape preserved (8 -> 23)', async () => {
    const tables = world(C8, [{ id: 23, uuid: 'c-23', state: 'COMPLETED', amount_paise: 120000, currency: 'INR' }]);
    await expect(annotate(8, { correctionContributionId: 23, reason: 'Option I corrective payment' })).resolves.toEqual({ annotated: true });
    expect(JSON.parse(String(annotations(tables)[0].metadata_json))).toEqual({
      settlementClassification: CLASSIFICATION,
      providerAccountId: TEST_ACCOUNT,
      correctionContributionId: 23,
      reconciliationReason: 'Option I corrective payment',
    });
  });

  it('2b. a present correction contribution must exist and must not be the original itself', async () => {
    world(C8);
    await expect(annotate(8, { correctionContributionId: 23 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(annotate(8, { correctionContributionId: 8 })).rejects.toBeInstanceOf(BadRequestException);
    expect(writes()).toHaveLength(0);
  });

  it('2c. a null correctionContributionId is the same as an absent one', async () => {
    const tables = world(C4);
    await expect(annotate(4, { correctionContributionId: null })).resolves.toEqual({ annotated: true });
    expect('correctionContributionId' in JSON.parse(String(annotations(tables)[0].metadata_json))).toBe(false);
  });

  it('3. REFUNDED + TEST evidence + COMPLETED refund + no correction -> valid, refund linked (contribution 9)', async () => {
    const tables = world(C9);
    await expect(annotate(9, { reason: REASON_REFUNDED })).resolves.toEqual({ annotated: true });
    const row = annotations(tables)[0];
    expect(row).toMatchObject({
      contribution_id: 9, transaction_id: 109, webhook_inbox_id: 209, refund_id: 3,
      previous_state: 'REFUNDED', resulting_state: 'REFUNDED',
    });
    expect(JSON.parse(String(row.metadata_json))).toEqual({
      settlementClassification: CLASSIFICATION,
      providerAccountId: TEST_ACCOUNT,
      reconciliationReason: REASON_REFUNDED,
    });
  });

  it('3b. REFUNDED without a COMPLETED refund record is rejected', async () => {
    world({ ...C9, refund: null });
    await expect(annotate(9)).rejects.toBeInstanceOf(ConflictException);
    fake.reset();
    world({ ...C9, refund: { id: 3, contribution_id: 9, status: 'PROCESSING', amount_paise: 50000 } });
    await expect(annotate(9)).rejects.toBeInstanceOf(ConflictException);
    expect(writes()).toHaveLength(0);
  });

  it('3c. COMPLETED with any refund record is still rejected (unchanged)', async () => {
    world({ ...C4, refund: { id: 7, contribution_id: 4, status: 'PROCESSING', amount_paise: 250000 } });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    expect(writes()).toHaveLength(0);
  });

  it.each(['CREATED', 'AWAITING_SETTLEMENT', 'SETTLEMENT_IN_PROGRESS', 'SETTLED', 'FAILED', 'CANCELLED', 'EXPIRED', 'ABANDONED'])(
    '3d. state %s is rejected (only COMPLETED or REFUNDED)',
    async (state) => {
      world({ ...C4, state });
      await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
      expect(writes()).toHaveLength(0);
    },
  );
});

describe('provider evidence', () => {
  it('4. a LIVE provider account is rejected (contribution 23 shape)', async () => {
    world({ ...C4, accountId: LIVE_ACCOUNT });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    expect(writes()).toHaveLength(0);
  });

  it('4b. a verified payload with no account_id is rejected (account must be proven, not assumed)', async () => {
    world({ ...C4, inbox: [{ id: 204, event_type: 'payment.captured', status: 'PROCESSED', contribution_id: 4, payload: captured(undefined, C4.paymentId) }] });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    expect(writes()).toHaveLength(0);
  });

  it('4c. the TEST account allow-list is exactly the evidenced Razorpay test account', () => {
    expect([...RAZORPAY_TEST_MODE_ACCOUNT_IDS]).toEqual([TEST_ACCOUNT]);
    expect(RAZORPAY_TEST_MODE_ACCOUNT_IDS).not.toContain(LIVE_ACCOUNT);
  });

  it('5. missing provider evidence is rejected (no delivery / no SUCCEEDED transaction)', async () => {
    world({ ...C4, inbox: [] });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    fake.reset();
    world({ ...C4, transactions: [{ id: 104, contribution_id: 4, provider: 'RAZORPAY', provider_reference: C4.paymentId, outcome: 'FAILED' }] });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    expect(writes()).toHaveLength(0);
  });

  it('6. evidence not tied to the SUCCEEDED transaction is rejected', async () => {
    // TEST-account delivery for a different payment id
    world({ ...C4, inbox: [{ id: 204, event_type: 'payment.captured', status: 'PROCESSED', contribution_id: 4, payload: captured(TEST_ACCOUNT, 'pay_other') }] });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    fake.reset();
    // matching payment id but delivery not PROCESSED
    world({ ...C4, inbox: [{ id: 204, event_type: 'payment.captured', status: 'FAILED', contribution_id: 4, payload: captured(TEST_ACCOUNT, C4.paymentId) }] });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    fake.reset();
    // matching payment id but not a payment.captured delivery
    world({ ...C4, inbox: [{ id: 204, event_type: 'payment.failed', status: 'PROCESSED', contribution_id: 4, payload: captured(TEST_ACCOUNT, C4.paymentId) }] });
    await expect(annotate(4)).rejects.toBeInstanceOf(ConflictException);
    expect(writes()).toHaveLength(0);
  });
});

describe('idempotency and integrity', () => {
  it('7. a second annotation of the same contribution writes nothing (one-annotation rule)', async () => {
    const tables = world(C4);
    await annotate(4);
    await expect(annotate(4, { reason: 'different reason' })).resolves.toEqual({ annotated: false });
    expect(annotations(tables)).toHaveLength(1);
    expect(JSON.parse(String(annotations(tables)[0].metadata_json)).reconciliationReason).toBe(REASON_NO_LIVE);
  });

  it('8/9. without a correction contribution no Contribution or Transaction is created; only one audit row is written', async () => {
    const tables = world(C4);
    await annotate(4);
    expect(tables.financial_contributions).toHaveLength(1);
    expect(tables.financial_transactions).toHaveLength(1);
    expect(nonAuditWrites()).toEqual([]);
    expect(writes().filter((op) => op.kind === 'insert')).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ kind: 'insert', table: 'financial_audit_log' });
  });

  it('10. an existing Option I annotation (8 -> 23) is never rewritten', async () => {
    const tables = world(C8, [{ id: 23, uuid: 'c-23', state: 'COMPLETED', amount_paise: 120000, currency: 'INR' }]);
    tables.financial_audit_log.push({
      id: 17, contribution_id: 8, event_type: 'SETTLEMENT_RECONCILIATION_ANNOTATED',
      metadata_json: JSON.stringify({ settlementClassification: CLASSIFICATION, providerAccountId: TEST_ACCOUNT, correctionContributionId: 23, reconciliationReason: 'original' }),
    });
    const before = JSON.stringify(tables.financial_audit_log);
    await expect(annotate(8)).resolves.toEqual({ annotated: false });
    expect(JSON.stringify(tables.financial_audit_log)).toBe(before);
    expect(writes()).toHaveLength(0);
  });

  it('12. every audit attribution/evidence field is populated', async () => {
    const tables = world(C4);
    await annotate(4);
    const row = annotations(tables)[0];
    for (const field of ['uuid', 'event_type', 'contribution_id', 'transaction_id', 'webhook_inbox_id', 'actor_type', 'actor_user_id', 'provider_payment_ref', 'provider_order_ref', 'previous_state', 'resulting_state', 'metadata_json']) {
      expect(row[field]).not.toBeNull();
      expect(row[field]).not.toBeUndefined();
    }
    expect(row).toMatchObject({ actor_type: 'ADMIN', actor_user_id: 1, request_id: 'req-admin' });
  });

  it('13. reason is required and bounded to 500 characters', async () => {
    world(C4);
    await expect(annotate(4, { reason: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(annotate(4, { reason: 'x'.repeat(RECONCILIATION_REASON_MAX_LENGTH + 1) })).rejects.toBeInstanceOf(BadRequestException);
    expect(writes()).toHaveLength(0);
    expect(RECONCILIATION_REASON_MAX_LENGTH).toBe(500);
    await expect(annotate(4, { reason: 'x'.repeat(RECONCILIATION_REASON_MAX_LENGTH) })).resolves.toEqual({ annotated: true });
    expect(REASON_NO_LIVE.length).toBeLessThanOrEqual(500);
    expect(REASON_REFUNDED.length).toBeLessThanOrEqual(500);
  });

  it('14/15. REFUNDED stays REFUNDED; contribution, refund and transaction amounts are untouched', async () => {
    const tables = world(C9);
    const before = JSON.stringify({ c: tables.financial_contributions, r: tables.financial_refunds, t: tables.financial_transactions, rc: tables.receipts });
    await annotate(9, { reason: REASON_REFUNDED });
    expect(tables.financial_contributions[0]).toMatchObject({ state: 'REFUNDED', amount_paise: 50000 });
    expect(tables.financial_refunds[0]).toMatchObject({ status: 'COMPLETED', amount_paise: 50000 });
    expect(JSON.stringify({ c: tables.financial_contributions, r: tables.financial_refunds, t: tables.financial_transactions, rc: tables.receipts })).toBe(before);
    expect(nonAuditWrites()).toEqual([]);
  });
});

describe('authorization surface unchanged', () => {
  // 11. The mechanism gains no new HTTP entry point: its only caller is the
  // existing Option I settlement-correction flow, whose route still requires
  // membership.lifecycle.renew AND financial.settlement.verify
  // (membership-settlement-correction.spec.ts, 'admin route (D3)').
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });
  }

  it('11. annotateSettlementReconciliation() is called only by the existing correction flow', () => {
    const root = join(__dirname, '..');
    const callers = sources(root)
      .filter((f) => readFileSync(f, 'utf8').includes('annotateSettlementReconciliation('))
      .map((f) => f.slice(root.length + 1).replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual([
      'financial/financial-contribution.service.ts',
      'membership/lifecycle/membership-lifecycle.service.ts',
    ]);
  });
});
