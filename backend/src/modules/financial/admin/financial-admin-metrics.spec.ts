// Track 4 reporting with test-mode classification -- pure metric, review
// flag, recognition and receipts-helper tests (B1/B2/B3/C2 edge cases).

// kysely is ESM-only at runtime under this Jest config; the recording `sql`
// tag below captures the template text and bound values verbatim.
jest.mock('kysely', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const expr = { sql: strings.join('?'), values, as: (alias: string) => ({ ...expr, alias }) };
    return expr;
  };
  (sql as unknown as { ref: (r: string) => unknown }).ref = (r: string) => ({ ref: r });
  return { sql };
});

import {
  CLASSIFICATION_EVENT_TYPE,
  TEST_MODE_MARKER,
  classifiedSql,
  notClassifiedSql,
  readAnnotationMetadata,
  toClassification,
} from './financial-admin-classification';
import {
  computeMoneyMetrics,
  computeOperationalMetrics,
  reviewFlagsOf,
  type ContributionMetricRow,
} from './financial-admin-metrics';
import { RECEIPT_NEEDS_REVIEW_SQL, istDayStartEpoch, issuedRange, resolveReceiptSort } from './financial-admin-receipts';

type Row = ContributionMetricRow & { id: number };

function row(id: number, state: string, amount: number, o: Partial<Row> = {}): Row {
  return {
    id, state, currency: 'INR', amount_paise: amount, classified: 0,
    refund_status: null, refund_amount_paise: null, refund_currency: null,
    receipt_amount_paise: null, succeeded_count: 0, ...o,
  };
}

// The 23 production contributions as verified read-only on 2026-10-07:
// classified (recognised annotation) = 4, 8, 9, 12, 13.
const PRODUCTION: Row[] = [
  row(1, 'CANCELLED', 50000),
  row(2, 'ABANDONED', 250000),
  row(4, 'COMPLETED', 250000, { classified: 1, receipt_amount_paise: 250000, succeeded_count: 1 }),
  row(8, 'COMPLETED', 120000, { classified: 1, receipt_amount_paise: 120000, succeeded_count: 1 }),
  row(9, 'REFUNDED', 50000, { classified: 1, refund_status: 'COMPLETED', refund_amount_paise: 50000, refund_currency: 'INR', receipt_amount_paise: 50000, succeeded_count: 1 }),
  row(10, 'COMPLETED', 0),
  row(11, 'COMPLETED', 0),
  row(12, 'COMPLETED', 250000, { classified: 1, receipt_amount_paise: 250000, succeeded_count: 1 }),
  row(13, 'COMPLETED', 250000, { classified: 1, receipt_amount_paise: 250000, succeeded_count: 1 }),
  ...[15, 16, 17, 18, 19].map((id) =>
    row(id, 'REFUNDED', 1000, { refund_status: 'COMPLETED', refund_amount_paise: 1000, refund_currency: 'INR', receipt_amount_paise: 1000, succeeded_count: 1 })),
  row(20, 'COMPLETED', 120000, { receipt_amount_paise: 120000, succeeded_count: 1 }),
  row(21, 'REFUNDED', 1000, { refund_status: 'COMPLETED', refund_amount_paise: 1000, refund_currency: 'INR', receipt_amount_paise: 1000, succeeded_count: 1 }),
  row(22, 'COMPLETED', 250000, { receipt_amount_paise: 250000, succeeded_count: 1 }),
  row(23, 'COMPLETED', 120000, { receipt_amount_paise: 120000, succeeded_count: 1 }),
  row(24, 'COMPLETED', 250000, { receipt_amount_paise: 250000, succeeded_count: 1 }),
  row(3, 'EXPIRED', 250000),
  row(5, 'FAILED', 250000),
  row(6, 'AWAITING_SETTLEMENT', 120000),
  row(7, 'SETTLEMENT_IN_PROGRESS', 120000),
];

describe('B2 money metrics', () => {
  it('1. verified production split: 4, 8, 9, 12, 13 excluded; 23 and 24 included', () => {
    expect(PRODUCTION).toHaveLength(23);
    expect(computeMoneyMetrics(PRODUCTION)).toEqual([{
      currency: 'INR',
      grossCompletedExclTestModePaise: 746000,
      completedRefundsExclTestModePaise: 6000,
      netCompletedExclTestModePaise: 740000,
      testMode: { settledCount: 5, settledPaise: 920000, refundCount: 1, refundPaise: 50000 },
    }]);
    // 23 and 24 are genuine: removing them reduces genuine gross by exactly their amounts.
    const without = computeMoneyMetrics(PRODUCTION.filter((r) => r.id !== 23 && r.id !== 24));
    expect(without[0].grossCompletedExclTestModePaise).toBe(746000 - 120000 - 250000);
  });

  it('2. a contribution is one row: classification is a flag, money is counted once', () => {
    const once = computeMoneyMetrics([row(1, 'COMPLETED', 250000, { classified: 1 })]);
    expect(once[0].testMode).toEqual({ settledCount: 1, settledPaise: 250000, refundCount: 0, refundPaise: 0 });
    // classified arrives as MySQL 1, boolean true, or string '1' -- all mean the same single flag
    for (const flag of [1, true, '1']) {
      expect(computeMoneyMetrics([row(1, 'COMPLETED', 250000, { classified: flag })])[0].testMode.settledPaise).toBe(250000);
    }
  });

  it('4. CANCELLED is neither gross nor a subtraction', () => {
    const base = [row(1, 'COMPLETED', 10000)];
    const withCancelled = [...base, row(2, 'CANCELLED', 99999)];
    expect(computeMoneyMetrics(withCancelled)).toEqual(computeMoneyMetrics(base));
  });

  it('5. REFUNDED test-mode: settled* and refund* in testMode, genuine net unaffected', () => {
    const genuine = [row(1, 'COMPLETED', 10000)];
    const m = computeMoneyMetrics([...genuine, row(9, 'REFUNDED', 50000, { classified: 1, refund_status: 'COMPLETED', refund_amount_paise: 50000, refund_currency: 'INR' })]);
    expect(m[0]).toMatchObject({ grossCompletedExclTestModePaise: 10000, completedRefundsExclTestModePaise: 0, netCompletedExclTestModePaise: 10000 });
    expect(m[0].testMode).toEqual({ settledCount: 1, settledPaise: 50000, refundCount: 1, refundPaise: 50000 });
  });

  it('genuine REFUNDED stays in gross and its refund row amount is subtracted (edge 6)', () => {
    const m = computeMoneyMetrics([row(1, 'REFUNDED', 10000, { refund_status: 'COMPLETED', refund_amount_paise: 4000, refund_currency: 'INR' })]);
    expect(m[0]).toMatchObject({ grossCompletedExclTestModePaise: 10000, completedRefundsExclTestModePaise: 4000, netCompletedExclTestModePaise: 6000 });
  });

  it('REQUESTED / PROCESSING / FAILED refunds are never subtracted', () => {
    for (const status of ['REQUESTED', 'PROCESSING', 'FAILED']) {
      const m = computeMoneyMetrics([row(1, 'COMPLETED', 10000, { refund_status: status, refund_amount_paise: 10000, refund_currency: 'INR' })]);
      expect(m[0].completedRefundsExclTestModePaise).toBe(0);
      expect(m[0].netCompletedExclTestModePaise).toBe(10000);
    }
  });

  it('a COMPLETED refund outside the genuine gross set is not subtracted', () => {
    const m = computeMoneyMetrics([row(1, 'CANCELLED', 10000, { refund_status: 'COMPLETED', refund_amount_paise: 10000, refund_currency: 'INR' })]);
    expect(m[0]).toMatchObject({ grossCompletedExclTestModePaise: 0, completedRefundsExclTestModePaise: 0, netCompletedExclTestModePaise: 0 });
  });

  it('SETTLED / EXPIRED are not gross', () => {
    const m = computeMoneyMetrics([row(1, 'SETTLED', 10000), row(2, 'EXPIRED', 10000)]);
    expect(m).toEqual([]);
  });

  it('edge 4: zero-value classified counts in testMode with ₹0 effect', () => {
    const m = computeMoneyMetrics([row(1, 'COMPLETED', 0, { classified: 1 }), row(2, 'COMPLETED', 0)]);
    expect(m[0]).toMatchObject({ grossCompletedExclTestModePaise: 0, netCompletedExclTestModePaise: 0 });
    expect(m[0].testMode).toEqual({ settledCount: 1, settledPaise: 0, refundCount: 0, refundPaise: 0 });
  });

  it('edge 5: a classified CANCELLED / ABANDONED / SETTLED contribution has no money effect', () => {
    for (const state of ['CANCELLED', 'ABANDONED', 'SETTLED']) {
      expect(computeMoneyMetrics([row(1, state, 10000, { classified: 1 })])).toEqual([]);
    }
  });

  it('edge 7/8: an unannotated (unclassified) record is genuine -- nothing is inferred', () => {
    const m = computeMoneyMetrics([row(1, 'COMPLETED', 250000, { classified: 0 })]);
    expect(m[0].grossCompletedExclTestModePaise).toBe(250000);
    expect(m[0].testMode.settledCount).toBe(0);
  });

  it('7. two currencies are never aggregated together', () => {
    const m = computeMoneyMetrics([
      row(1, 'COMPLETED', 10000),
      row(2, 'COMPLETED', 500, { currency: 'USD' }),
      row(3, 'REFUNDED', 300, { currency: 'USD', refund_status: 'COMPLETED', refund_amount_paise: 300, refund_currency: 'USD' }),
      row(4, 'COMPLETED', 7000, { currency: 'USD', classified: 1 }),
    ]);
    expect(m).toEqual([
      { currency: 'INR', grossCompletedExclTestModePaise: 10000, completedRefundsExclTestModePaise: 0, netCompletedExclTestModePaise: 10000, testMode: { settledCount: 0, settledPaise: 0, refundCount: 0, refundPaise: 0 } },
      { currency: 'USD', grossCompletedExclTestModePaise: 800, completedRefundsExclTestModePaise: 300, netCompletedExclTestModePaise: 500, testMode: { settledCount: 1, settledPaise: 7000, refundCount: 0, refundPaise: 0 } },
    ]);
  });
});

describe('B3 operational metrics', () => {
  it('6. ignore classification entirely', () => {
    const rows = [
      row(1, 'SETTLED', 10000),
      row(2, 'CANCELLED', 5000),
      row(3, 'COMPLETED', 0),
      row(4, 'COMPLETED', 9000, { refund_status: 'PROCESSING', refund_amount_paise: 9000, refund_currency: 'INR' }),
      row(5, 'COMPLETED', 9000, { refund_status: 'FAILED', refund_amount_paise: 9000, refund_currency: 'INR' }),
      row(6, 'COMPLETED', 9000, { receipt_amount_paise: 8000 }),
    ];
    const plain = computeOperationalMetrics(rows);
    const allClassified = computeOperationalMetrics(rows.map((r) => ({ ...r, classified: 1 })));
    expect(allClassified).toEqual(plain);
    expect(plain).toEqual({
      refundsInProgress: [{ currency: 'INR', count: 1, paise: 9000 }],
      failedRefundsCount: 1,
      settledPendingCompletion: [{ currency: 'INR', count: 1, paise: 10000 }],
      cancelledCount: 1,
      zeroValueCompletedCount: 1,
      reviewCount: 1,
    });
  });

  it('production: 1 cancelled, 2 zero-value completed, 0 settled, nothing in progress, 0 review', () => {
    expect(computeOperationalMetrics(PRODUCTION)).toEqual({
      refundsInProgress: [], failedRefundsCount: 0, settledPendingCompletion: [],
      cancelledCount: 1, zeroValueCompletedCount: 2, reviewCount: 0,
    });
  });
});

describe('review flags (display-only)', () => {
  const ok = { state: 'COMPLETED', amount_paise: 1000, refund_status: null, refund_amount_paise: null, receipt_amount_paise: 1000, succeeded_count: 1 };

  it('each of the five flags', () => {
    expect(reviewFlagsOf(ok)).toEqual([]);
    expect(reviewFlagsOf({ ...ok, state: 'CANCELLED' })).toContain('RECEIPT_STATE_UNEXPECTED');
    expect(reviewFlagsOf({ ...ok, receipt_amount_paise: 999 })).toEqual(['RECEIPT_AMOUNT_MISMATCH']);
    expect(reviewFlagsOf({ ...ok, state: 'REFUNDED' })).toEqual(['REFUND_STATE_MISMATCH']);
    expect(reviewFlagsOf({ ...ok, refund_status: 'COMPLETED', refund_amount_paise: 1000 })).toEqual(['REFUND_STATE_MISMATCH']);
    expect(reviewFlagsOf({ ...ok, state: 'REFUNDED', refund_status: 'COMPLETED', refund_amount_paise: 1500 })).toEqual(['REFUND_EXCEEDS_CONTRIBUTION']);
    expect(reviewFlagsOf({ ...ok, succeeded_count: 2 })).toEqual(['MULTIPLE_SUCCEEDED_TRANSACTIONS']);
  });

  it('16. classification never changes review flags (edge 3)', () => {
    const flagged = { ...ok, succeeded_count: 2 };
    expect(reviewFlagsOf({ ...flagged, classified: 1 } as typeof flagged)).toEqual(reviewFlagsOf(flagged));
  });

  it('the SQL REVIEW condition covers the same five conditions', () => {
    const text = (RECEIPT_NEEDS_REVIEW_SQL as unknown as { sql?: string }).sql ?? '';
    for (const fragment of [
      "fc.state NOT IN ('SETTLED', 'COMPLETED', 'REFUNDED')",
      'r.amount_paise <> fc.amount_paise',
      "fc.state = 'REFUNDED' AND (fr.status IS NULL OR fr.status <> 'COMPLETED')",
      "fr.status = 'COMPLETED' AND fc.state <> 'REFUNDED'",
      'fr.amount_paise > fc.amount_paise',
      "rft.outcome = 'SUCCEEDED') > 1",
    ]) expect(text).toContain(fragment);
    expect(text.startsWith('COALESCE((')).toBe(true);
  });
});

describe('B1 recognition', () => {
  function rendered(expr: unknown): { sql: string; values: unknown[] } {
    return expr as { sql: string; values: unknown[] };
  }

  it('matches contribution_id, then event_type, then a JSON_VALID-guarded exact key read (EXISTS)', () => {
    const { sql, values } = rendered(classifiedSql('fc.id'));
    const iContribution = sql.indexOf('fa.contribution_id = ?');
    const iEvent = sql.indexOf('fa.event_type = ?');
    const iGuard = sql.indexOf('CASE WHEN JSON_VALID(fa.metadata_json) THEN JSON_UNQUOTE(JSON_EXTRACT(fa.metadata_json, ?)) END');
    expect(sql.startsWith('EXISTS (SELECT 1 FROM financial_audit_log AS fa WHERE ')).toBe(true);
    expect(iContribution).toBeGreaterThan(-1);
    expect(iEvent).toBeGreaterThan(iContribution);
    expect(iGuard).toBeGreaterThan(iEvent);
    expect(sql).not.toMatch(/LIKE/i);
    expect(values).toEqual([{ ref: 'fc.id' }, CLASSIFICATION_EVENT_TYPE, '$.settlementClassification', TEST_MODE_MARKER]);
    // no JSON read outside the guard
    expect(sql.match(/JSON_EXTRACT/g)).toHaveLength(1);
  });

  it('UNCLASSIFIED is the exact negation', () => {
    expect(rendered(notClassifiedSql('fc.id')).sql).toBe('NOT ?');
    const inner = rendered(rendered(notClassifiedSql('fc.id')).values[0]);
    expect(inner.sql).toBe(rendered(classifiedSql('fc.id')).sql);
    expect(inner.values).toEqual(rendered(classifiedSql('fc.id')).values);
  });

  it('3. the application-side reader tolerates malformed / foreign metadata', () => {
    expect(readAnnotationMetadata(CLASSIFICATION_EVENT_TYPE, '{bad json')).toBeNull();
    expect(readAnnotationMetadata(CLASSIFICATION_EVENT_TYPE, '[1,2]')).toBeNull();
    expect(readAnnotationMetadata(CLASSIFICATION_EVENT_TYPE, null)).toBeNull();
    expect(readAnnotationMetadata(CLASSIFICATION_EVENT_TYPE, JSON.stringify({ note: TEST_MODE_MARKER }))).toBeNull();
    expect(readAnnotationMetadata('SETTLEMENT_OUTCOME_RECORDED', JSON.stringify({ settlementClassification: TEST_MODE_MARKER }))).toBeNull();
  });

  it('reads both documented forms (with and without correctionContributionId)', () => {
    const optionI = '{"settlementClassification":"TEST_MODE_NON_GENUINE_SETTLEMENT","providerAccountId":"acc_DJkWMSsLHLxU4a","correctionContributionId":23,"reconciliationReason":"r17"}';
    const historical = '{"settlementClassification":"TEST_MODE_NON_GENUINE_SETTLEMENT","providerAccountId":"acc_DJkWMSsLHLxU4a","reconciliationReason":"r41"}';
    expect(readAnnotationMetadata(CLASSIFICATION_EVENT_TYPE, optionI)).toEqual({ marker: TEST_MODE_MARKER, reason: 'r17', correctionContributionId: 23 });
    expect(readAnnotationMetadata(CLASSIFICATION_EVENT_TYPE, historical)).toEqual({ marker: TEST_MODE_MARKER, reason: 'r41', correctionContributionId: null });
  });

  it('toClassification maps the SQL flag to the marker or null', () => {
    expect(toClassification(1)).toBe(TEST_MODE_MARKER);
    expect(toClassification('1')).toBe(TEST_MODE_MARKER);
    expect(toClassification(0)).toBeNull();
    expect(toClassification(null)).toBeNull();
  });
});

describe('receipts helpers', () => {
  it('Asia/Kolkata day boundaries: a day starts at 18:30 UTC the previous day', () => {
    expect(istDayStartEpoch('2026-10-05')).toBe(Date.UTC(2026, 9, 4, 18, 30) / 1000);
    expect(issuedRange('2026-10-05', '2026-10-05')).toEqual({
      fromEpoch: Date.UTC(2026, 9, 4, 18, 30) / 1000,
      toEpochExclusive: Date.UTC(2026, 9, 5, 18, 30) / 1000,
    });
  });

  it('invalid calendar dates and inverted ranges are rejected', () => {
    expect(() => istDayStartEpoch('2026-02-30')).toThrow();
    expect(() => issuedRange('2026-10-06', '2026-10-05')).toThrow();
  });

  it('default sort is issued_at DESC; other keys default ASC', () => {
    expect(resolveReceiptSort()).toEqual({ sort: 'issued_at', order: 'desc' });
    expect(resolveReceiptSort('contributor')).toEqual({ sort: 'contributor', order: 'asc' });
    expect(resolveReceiptSort('amount_paise', 'desc')).toEqual({ sort: 'amount_paise', order: 'desc' });
  });
});
