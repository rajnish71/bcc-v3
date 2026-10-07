// backend/src/modules/membership/tenure/service-period-resolution.ts
//
// TENURE-ARCH-001 v1.1 §6 (R1) — evidence-driven boundary resolution, and
// §5.4 / §5.5 — which periods may count at all.
//
// Date precision alone never decides resolution; the attestation does:
//   BOUNDARY: certain minimum -- start -> latest possible day,
//             end -> earliest possible day of the stated month/year.
//   PERIOD:   full stated period -- start -> first day, end -> last day.
//   EXACT:    the stated date.

import { TenureInputError, compareCivilDates, firstDayOfMonth, lastDayOfMonth, parseCivilDate } from './civil-date';
import type { CivilDate } from './civil-date';
import type {
  PeriodExclusionReason,
  RecognizedServicePeriodInput,
  ResolvedInterval,
  ServiceBoundaryInput,
} from './tenure.types';

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const YEAR_ONLY = /^(\d{4})$/;

export type BoundarySide = 'START' | 'END';

export function resolveBoundary(boundary: ServiceBoundaryInput, side: BoundarySide): CivilDate {
  if (boundary.precision === 'EXACT') return parseCivilDate(boundary.value);

  if (boundary.attestation !== 'BOUNDARY' && boundary.attestation !== 'PERIOD') {
    throw new TenureInputError(`Unknown boundary attestation '${String(boundary.attestation)}'.`);
  }
  // Certain minimum for a bare boundary; full extent for period evidence.
  const latestPossibleDay = side === 'START' ? boundary.attestation === 'BOUNDARY' : boundary.attestation === 'PERIOD';

  if (boundary.precision === 'MONTH') {
    const match = YEAR_MONTH.exec(boundary.value);
    if (!match) throw new TenureInputError(`Invalid MONTH boundary '${boundary.value}' (expected YYYY-MM).`);
    const y = Number(match[1]);
    const m = Number(match[2]);
    if (m < 1 || m > 12) throw new TenureInputError(`Invalid MONTH boundary '${boundary.value}'.`);
    return latestPossibleDay ? lastDayOfMonth(y, m) : firstDayOfMonth(y, m);
  }

  if (boundary.precision === 'YEAR') {
    const match = YEAR_ONLY.exec(boundary.value);
    if (!match) throw new TenureInputError(`Invalid YEAR boundary '${boundary.value}' (expected YYYY).`);
    const y = Number(match[1]);
    return latestPossibleDay ? lastDayOfMonth(y, 12) : firstDayOfMonth(y, 1);
  }

  throw new TenureInputError(`Unknown boundary precision '${String((boundary as { precision: unknown }).precision)}'.`);
}

// Why a period is ineligible to count, independent of the evaluation date.
// Only CURRENT + VERIFIED periods with established continuity count, and
// POINT evidence never counts (§5.4 invariant 2, §5.5, §6.3).
export function periodIneligibilityReason(period: RecognizedServicePeriodInput): PeriodExclusionReason | null {
  if (period.lifecycleState !== 'CURRENT') return 'NOT_CURRENT';
  if (period.verificationStatus !== 'VERIFIED') return 'NOT_VERIFIED';
  if (period.evidenceKind === 'POINT') return 'POINT_EVIDENCE';
  if (period.continuityEstablished !== true) return 'CONTINUITY_NOT_ESTABLISHED';
  return null;
}

// Resolves a countable period to its inclusive interval, or reports it as
// INVERTED when the resolved end precedes the resolved start (zero service).
export function resolvePeriodInterval(
  period: RecognizedServicePeriodInput,
): { interval: ResolvedInterval } | { reason: 'INVERTED_INTERVAL' } {
  const start = resolveBoundary(period.start, 'START');
  const end = period.end === null ? null : resolveBoundary(period.end, 'END');
  if (end !== null && compareCivilDates(end, start) < 0) return { reason: 'INVERTED_INTERVAL' };
  return { interval: { periodId: period.periodId, start, end } };
}
