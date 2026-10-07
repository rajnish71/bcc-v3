// backend/src/modules/financial/admin/financial-admin-receipts.ts
//
// Track 4 receipts list (C2) -- fixed filter/sort allow-lists and helpers.
// Every value that reaches SQL is either a bound parameter or chosen from a
// fixed map below; client input never becomes a column name or operator.

import { BadRequestException } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';

// Receipt status = the contribution's canonical state (receipts.contribution_id
// is 1:1). REVIEW = "Needs review" (any review flag) -- not a financial state.
export const RECEIPT_STATUS_FILTERS = ['SETTLED', 'COMPLETED', 'REFUNDED', 'REVIEW'] as const;
export type ReceiptStatusFilter = (typeof RECEIPT_STATUS_FILTERS)[number];

export const RECEIPT_SORT_KEYS = ['issued_at', 'receipt_number', 'amount_paise', 'contributor'] as const;
export type ReceiptSortKey = (typeof RECEIPT_SORT_KEYS)[number];
export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// Default issued_at DESC; receipt_number ASC is always the final tie-breaker.
export const DEFAULT_RECEIPT_SORT: ReceiptSortKey = 'issued_at';
export const DEFAULT_RECEIPT_ORDER: SortOrder = 'desc';

// Values are already allow-listed by the DTO; anything else falls back to
// the default. Without an explicit order: issued_at sorts DESC (newest
// first), every other key ASC.
export function resolveReceiptSort(sort?: string, order?: string): { sort: ReceiptSortKey; order: SortOrder } {
  const key = (RECEIPT_SORT_KEYS as readonly string[]).includes(sort ?? '') ? (sort as ReceiptSortKey) : DEFAULT_RECEIPT_SORT;
  const dir = (SORT_ORDERS as readonly string[]).includes(order ?? '')
    ? (order as SortOrder)
    : key === 'issued_at' ? DEFAULT_RECEIPT_ORDER : 'asc';
  return { sort: key, order: dir };
}

export function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Asia/Kolkata has no DST: a calendar day D starts at D 00:00 IST =
// (D-1) 18:30 UTC. Returns epoch seconds so the comparison against
// UNIX_TIMESTAMP(issued_at) is independent of server/session time zone.
const IST_OFFSET_SECONDS = 5.5 * 3600;

export function istDayStartEpoch(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new BadRequestException(`Invalid date: ${isoDate}`);
  }
  return utcMidnight / 1000 - IST_OFFSET_SECONDS;
}

export function issuedRange(from?: string, to?: string): { fromEpoch: number | null; toEpochExclusive: number | null } {
  const fromEpoch = from ? istDayStartEpoch(from) : null;
  const toEpochExclusive = to ? istDayStartEpoch(to) + 86400 : null;
  if (fromEpoch !== null && toEpochExclusive !== null && fromEpoch >= toEpochExclusive) {
    throw new BadRequestException('issuedFrom must be on or before issuedTo');
  }
  return { fromEpoch, toEpochExclusive };
}

// SQL form of reviewFlagsOf() (financial-admin-metrics.ts) for the REVIEW
// filter on the receipts query (aliases r, fc, fr). The two must agree.
// COALESCE: with no refund row several terms are NULL; the expression is
// always exactly 1 (needs review) or 0.
export const RECEIPT_NEEDS_REVIEW_SQL: RawBuilder<number> = sql<number>`COALESCE((
  fc.state NOT IN ('SETTLED', 'COMPLETED', 'REFUNDED')
  OR r.amount_paise <> fc.amount_paise
  OR (fc.state = 'REFUNDED' AND (fr.status IS NULL OR fr.status <> 'COMPLETED'))
  OR (fr.status = 'COMPLETED' AND fc.state <> 'REFUNDED')
  OR (fr.amount_paise IS NOT NULL AND fr.amount_paise > fc.amount_paise)
  OR (SELECT COUNT(*) FROM financial_transactions AS rft WHERE rft.contribution_id = fc.id AND rft.outcome = 'SUCCEEDED') > 1
), 0)`;
