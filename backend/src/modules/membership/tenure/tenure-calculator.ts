// backend/src/modules/membership/tenure/tenure-calculator.ts
//
// TENURE-ARCH-001 v1.1 §8.3 — recognized service aggregation (normative).
//
//   1. Resolve each countable period to an inclusive [start, end] (§6, R1).
//   2. Clip to T: service is counted through T - 1 day, so
//      exclusiveEnd = min(end + 1 day, T); open-ended -> T. Drop if <= start.
//   3. Coalesce overlapping AND contiguous intervals (R5A).
//   4. Per interval: M = largest whole months with addMonths(start, M) <=
//      exclusiveEnd; residual = exclusiveEnd - addMonths(start, M) in days.
//   5. totalMonths = sum(M) + floor(sum(residual) / 31); remainder kept.
//
// Integer-only, pure, synchronous, order-independent. No database, no Date
// arithmetic, no configuration: the method is subordinate architecture and
// changes only by amending TENURE-ARCH-001.

import {
  TenureInputError,
  addMonths,
  compareCivilDates,
  fromDayNumber,
  parseCivilDate,
  toDayNumber,
} from './civil-date';
import type { CivilDate } from './civil-date';
import { periodIneligibilityReason, resolvePeriodInterval } from './service-period-resolution';
import type {
  CountedInterval,
  PeriodExclusionReason,
  RecognizedServicePeriodInput,
  RecognizedServiceResult,
  ResolvedInterval,
} from './tenure.types';

export const RESIDUAL_DAYS_PER_MONTH = 31;

// Largest whole M with addMonths(start, M) <= exclusiveEnd (start < exclusiveEnd).
// addMonths is strictly increasing in M, so a local search from the
// calendar-month difference converges in a step or two.
export function wholeCalendarMonths(start: CivilDate, exclusiveEnd: CivilDate): number {
  if (compareCivilDates(exclusiveEnd, start) < 0) {
    throw new TenureInputError(`exclusiveEnd ${exclusiveEnd} precedes start ${start}.`);
  }
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = exclusiveEnd.split('-').map(Number);
  let months = Math.max(0, (ey - sy) * 12 + (em - sm));
  while (months > 0 && compareCivilDates(addMonths(start, months), exclusiveEnd) > 0) months -= 1;
  while (compareCivilDates(addMonths(start, months + 1), exclusiveEnd) <= 0) months += 1;
  return months;
}

interface Partitioned {
  resolved: ResolvedInterval[];
  excluded: Array<{ periodId: string; reason: PeriodExclusionReason }>;
}

function partition(periods: ReadonlyArray<RecognizedServicePeriodInput>): Partitioned {
  const seen = new Set<string>();
  const resolved: ResolvedInterval[] = [];
  const excluded: Partitioned['excluded'] = [];
  for (const period of periods) {
    if (typeof period.periodId !== 'string' || period.periodId === '') {
      throw new TenureInputError('Every service period needs a non-empty periodId.');
    }
    if (seen.has(period.periodId)) throw new TenureInputError(`Duplicate periodId '${period.periodId}'.`);
    seen.add(period.periodId);

    const ineligible = periodIneligibilityReason(period);
    if (ineligible) {
      excluded.push({ periodId: period.periodId, reason: ineligible });
      continue;
    }
    const outcome = resolvePeriodInterval(period);
    if ('reason' in outcome) excluded.push({ periodId: period.periodId, reason: outcome.reason });
    else resolved.push(outcome.interval);
  }
  return { resolved, excluded };
}

const byPeriodId = <T extends { periodId: string }>(a: T, b: T) =>
  a.periodId < b.periodId ? -1 : a.periodId > b.periodId ? 1 : 0;

export function calculateRecognizedService(
  periods: ReadonlyArray<RecognizedServicePeriodInput>,
  evaluationDate: CivilDate,
): RecognizedServiceResult {
  const T = parseCivilDate(evaluationDate);
  const tDay = toDayNumber(T);
  const { resolved, excluded } = partition(periods);

  // Step 2 -- clip at T (day numbers; exclusive end).
  const clipped: Array<{ periodId: string; s: number; x: number }> = [];
  for (const interval of resolved) {
    const s = toDayNumber(interval.start);
    const x = interval.end === null ? tDay : Math.min(toDayNumber(interval.end) + 1, tDay);
    if (x <= s) excluded.push({ periodId: interval.periodId, reason: 'NO_SERVICE_BEFORE_EVALUATION_DATE' });
    else clipped.push({ periodId: interval.periodId, s, x });
  }

  // Step 3 -- coalesce overlapping and contiguous (next.s <= current.x).
  clipped.sort((a, b) => a.s - b.s || a.x - b.x || (a.periodId < b.periodId ? -1 : 1));
  const merged: Array<{ s: number; x: number; ids: string[] }> = [];
  for (const c of clipped) {
    const last = merged[merged.length - 1];
    if (last && c.s <= last.x) {
      last.x = Math.max(last.x, c.x);
      last.ids.push(c.periodId);
    } else {
      merged.push({ s: c.s, x: c.x, ids: [c.periodId] });
    }
  }

  // Steps 4 and 5.
  let monthsSum = 0;
  let residualSum = 0;
  const countedIntervals: CountedInterval[] = merged.map(({ s, x, ids }) => {
    const start = fromDayNumber(s);
    const exclusiveEnd = fromDayNumber(x);
    const months = wholeCalendarMonths(start, exclusiveEnd);
    const residualDays = x - toDayNumber(addMonths(start, months));
    monthsSum += months;
    residualSum += residualDays;
    return { periodIds: [...ids].sort(), start, exclusiveEnd, months, residualDays };
  });

  return {
    evaluationDate: T,
    totalMonths: monthsSum + Math.floor(residualSum / RESIDUAL_DAYS_PER_MONTH),
    remainderDays: residualSum % RESIDUAL_DAYS_PER_MONTH,
    residualDaysTotal: residualSum,
    resolvedIntervals: [...resolved].sort(byPeriodId),
    countedIntervals,
    excluded: excluded.sort(byPeriodId),
  };
}

// §8.3 threshold semantics: the first date T' <= asOf whose service accrued
// through T' - 1 day reaches `thresholdMonths`; null if not reached by asOf.
// totalMonths(T') never decreases as T' advances, so a binary search over
// day numbers is exact.
export function earliestServiceThresholdDate(
  periods: ReadonlyArray<RecognizedServicePeriodInput>,
  thresholdMonths: number,
  asOf: CivilDate,
): CivilDate | null {
  if (!Number.isInteger(thresholdMonths) || thresholdMonths <= 0) {
    throw new TenureInputError(`Threshold ${thresholdMonths} must be a positive whole number of months.`);
  }
  const hiDate = parseCivilDate(asOf);
  const atAsOf = calculateRecognizedService(periods, hiDate);
  if (atAsOf.totalMonths < thresholdMonths) return null;

  // At T' = earliest counted start no service has accrued yet.
  let lo = toDayNumber(atAsOf.countedIntervals[0].start);
  let hi = toDayNumber(hiDate);
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (calculateRecognizedService(periods, fromDayNumber(mid)).totalMonths >= thresholdMonths) hi = mid;
    else lo = mid + 1;
  }
  return fromDayNumber(lo);
}
