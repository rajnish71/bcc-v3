// backend/src/modules/financial/admin/financial-admin-metrics.ts
//
// Track 4 Overview metrics -- pure functions over one row PER CONTRIBUTION
// (contribution + its at-most-one refund and at-most-one receipt, the SQL
// classified flag, and its SUCCEEDED transaction count). One row per
// contribution means no join can double-count money, however many
// transactions or annotations exist.
//
// B2 money metrics (per currency, never aggregated across currencies):
//   gross   = SUM amount  where state IN (COMPLETED, REFUNDED) and NOT classified
//   refunds = SUM refund.amount where refund COMPLETED and contribution in that gross set
//   net     = gross - refunds
//   testMode.settled* = state IN (COMPLETED, REFUNDED) and classified
//   testMode.refund*  = refund COMPLETED and contribution classified
// CANCELLED is never subtracted; REFUNDED stays in gross; refunds use the
// refund row's own amount (and currency); test-mode refunds never reduce net.
//
// B3 operational metrics count every applicable record and IGNORE
// classification entirely.

export const MONEY_STATES = ['COMPLETED', 'REFUNDED'] as const;
export const RECEIPT_EXPECTED_STATES = ['SETTLED', 'COMPLETED', 'REFUNDED'] as const;
export const REFUND_IN_PROGRESS_STATUSES = ['REQUESTED', 'PROCESSING'] as const;

export const REVIEW_FLAGS = [
  'RECEIPT_STATE_UNEXPECTED',
  'RECEIPT_AMOUNT_MISMATCH',
  'REFUND_STATE_MISMATCH',
  'REFUND_EXCEEDS_CONTRIBUTION',
  'MULTIPLE_SUCCEEDED_TRANSACTIONS',
] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

export interface ContributionMetricRow {
  state: string;
  currency: string;
  amount_paise: unknown;
  classified: unknown;
  refund_status: string | null;
  refund_amount_paise: unknown;
  refund_currency: string | null;
  receipt_amount_paise: unknown; // null when no receipt exists
  succeeded_count: unknown;
}

function n(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function isClassified(row: Pick<ContributionMetricRow, 'classified'>): boolean {
  return Number(row.classified) === 1 || row.classified === true;
}

// Display-only review flags. Never remove, hide or correct a record.
export function reviewFlagsOf(row: {
  state: string;
  amount_paise: unknown;
  refund_status: string | null;
  refund_amount_paise: unknown;
  receipt_amount_paise: unknown;
  succeeded_count: unknown;
}): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const hasReceipt = row.receipt_amount_paise !== null && row.receipt_amount_paise !== undefined;
  const amount = n(row.amount_paise);
  if (hasReceipt && !(RECEIPT_EXPECTED_STATES as readonly string[]).includes(row.state)) flags.push('RECEIPT_STATE_UNEXPECTED');
  if (hasReceipt && n(row.receipt_amount_paise) !== amount) flags.push('RECEIPT_AMOUNT_MISMATCH');
  if (
    (row.state === 'REFUNDED' && row.refund_status !== 'COMPLETED') ||
    (row.refund_status === 'COMPLETED' && row.state !== 'REFUNDED')
  ) {
    flags.push('REFUND_STATE_MISMATCH');
  }
  if (row.refund_amount_paise !== null && row.refund_amount_paise !== undefined && n(row.refund_amount_paise) > amount) {
    flags.push('REFUND_EXCEEDS_CONTRIBUTION');
  }
  if (n(row.succeeded_count) > 1) flags.push('MULTIPLE_SUCCEEDED_TRANSACTIONS');
  return flags;
}

export interface MoneyMetrics {
  currency: string;
  grossCompletedExclTestModePaise: number;
  completedRefundsExclTestModePaise: number;
  netCompletedExclTestModePaise: number;
  testMode: { settledCount: number; settledPaise: number; refundCount: number; refundPaise: number };
}

export function computeMoneyMetrics(rows: ContributionMetricRow[]): MoneyMetrics[] {
  const byCurrency = new Map<string, MoneyMetrics>();
  const bucket = (currency: string): MoneyMetrics => {
    let m = byCurrency.get(currency);
    if (!m) {
      m = {
        currency,
        grossCompletedExclTestModePaise: 0,
        completedRefundsExclTestModePaise: 0,
        netCompletedExclTestModePaise: 0,
        testMode: { settledCount: 0, settledPaise: 0, refundCount: 0, refundPaise: 0 },
      };
      byCurrency.set(currency, m);
    }
    return m;
  };

  for (const row of rows) {
    const classified = isClassified(row);
    const inMoneyState = (MONEY_STATES as readonly string[]).includes(row.state);

    if (inMoneyState) {
      const m = bucket(row.currency);
      if (classified) {
        m.testMode.settledCount += 1;
        m.testMode.settledPaise += n(row.amount_paise);
      } else {
        m.grossCompletedExclTestModePaise += n(row.amount_paise);
      }
    }

    if (row.refund_status === 'COMPLETED') {
      const m = bucket(row.refund_currency ?? row.currency);
      if (classified) {
        m.testMode.refundCount += 1;
        m.testMode.refundPaise += n(row.refund_amount_paise);
      } else if (inMoneyState) {
        m.completedRefundsExclTestModePaise += n(row.refund_amount_paise);
      }
    }
  }

  return [...byCurrency.values()]
    .map((m) => ({ ...m, netCompletedExclTestModePaise: m.grossCompletedExclTestModePaise - m.completedRefundsExclTestModePaise }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface CurrencyCountPaise {
  currency: string;
  count: number;
  paise: number;
}

export interface OperationalMetrics {
  refundsInProgress: CurrencyCountPaise[];
  failedRefundsCount: number;
  settledPendingCompletion: CurrencyCountPaise[];
  cancelledCount: number;
  zeroValueCompletedCount: number;
  reviewCount: number;
}

// Classification is deliberately not read here.
export function computeOperationalMetrics(rows: ContributionMetricRow[]): OperationalMetrics {
  const inProgress = new Map<string, CurrencyCountPaise>();
  const settled = new Map<string, CurrencyCountPaise>();
  const add = (map: Map<string, CurrencyCountPaise>, currency: string, paise: number) => {
    const e = map.get(currency) ?? { currency, count: 0, paise: 0 };
    e.count += 1;
    e.paise += paise;
    map.set(currency, e);
  };
  let failedRefundsCount = 0;
  let cancelledCount = 0;
  let zeroValueCompletedCount = 0;
  let reviewCount = 0;

  for (const row of rows) {
    if (row.refund_status && (REFUND_IN_PROGRESS_STATUSES as readonly string[]).includes(row.refund_status)) {
      add(inProgress, row.refund_currency ?? row.currency, n(row.refund_amount_paise));
    }
    if (row.refund_status === 'FAILED') failedRefundsCount += 1;
    if (row.state === 'SETTLED') add(settled, row.currency, n(row.amount_paise));
    if (row.state === 'CANCELLED') cancelledCount += 1;
    if (row.state === 'COMPLETED' && n(row.amount_paise) === 0) zeroValueCompletedCount += 1;
    if (reviewFlagsOf(row).length > 0) reviewCount += 1;
  }

  const sorted = (map: Map<string, CurrencyCountPaise>) => [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    refundsInProgress: sorted(inProgress),
    failedRefundsCount,
    settledPendingCompletion: sorted(settled),
    cancelledCount,
    zeroValueCompletedCount,
    reviewCount,
  };
}
