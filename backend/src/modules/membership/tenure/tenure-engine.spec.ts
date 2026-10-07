// WP1 -- recognized service aggregation, evidence resolution, age and Senior
// eligibility-date primitives (TENURE-ARCH-001 v1.1 §5, §6, §8, §9).

import * as fs from 'fs';
import * as path from 'path';
import { addDays, addMonths, compareCivilDates, fromDayNumber, toDayNumber } from './civil-date';
import { resolveBoundary } from './service-period-resolution';
import { SENIOR_THRESHOLDS, ageOn, calculateSeniorEligibilityDates, dateOfReachingAge } from './senior-eligibility-dates';
import { calculateRecognizedService, earliestServiceThresholdDate, wholeCalendarMonths } from './tenure-calculator';
import type { DobAuthority, RecognizedServicePeriodInput, ServiceBoundaryInput } from './tenure.types';

// ── helpers ──────────────────────────────────────────────────────────────────

const exact = (value: string): ServiceBoundaryInput => ({ precision: 'EXACT', value });
const month = (value: string, attestation: 'BOUNDARY' | 'PERIOD'): ServiceBoundaryInput => ({ precision: 'MONTH', value, attestation });
const year = (value: string, attestation: 'BOUNDARY' | 'PERIOD'): ServiceBoundaryInput => ({ precision: 'YEAR', value, attestation });

let seq = 0;
function period(
  start: ServiceBoundaryInput | string,
  end: ServiceBoundaryInput | string | null,
  over: Partial<RecognizedServicePeriodInput> = {},
): RecognizedServicePeriodInput {
  seq += 1;
  return {
    periodId: `p${String(seq).padStart(4, '0')}`,
    start: typeof start === 'string' ? exact(start) : start,
    end: end === null ? null : typeof end === 'string' ? exact(end) : end,
    evidenceKind: 'PERIOD',
    continuityEstablished: true,
    verificationStatus: 'VERIFIED',
    lifecycleState: 'CURRENT',
    ...over,
  };
}

const svc = (periods: RecognizedServicePeriodInput[], T: string) => calculateRecognizedService(periods, T);
const FULL = (dateOfBirth: string): DobAuthority => ({ status: 'VERIFIED_FULL_DATE', dateOfBirth });

// Deterministic PRNG for property checks (no Math.random).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// ── Evidence resolution (R1, §6.3) ───────────────────────────────────────────

describe('evidence resolution (R1)', () => {
  it.each([
    ['EXACT start', exact('2015-06-17'), 'START', '2015-06-17'],
    ['EXACT end', exact('2015-06-17'), 'END', '2015-06-17'],
    ['BOUNDARY/MONTH start -> last day', month('2015-03', 'BOUNDARY'), 'START', '2015-03-31'],
    ['BOUNDARY/MONTH end -> first day', month('2018-03', 'BOUNDARY'), 'END', '2018-03-01'],
    ['BOUNDARY/YEAR start -> 31 Dec', year('2015', 'BOUNDARY'), 'START', '2015-12-31'],
    ['BOUNDARY/YEAR end -> 1 Jan', year('2018', 'BOUNDARY'), 'END', '2018-01-01'],
    ['PERIOD/MONTH start -> first day', month('2015-03', 'PERIOD'), 'START', '2015-03-01'],
    ['PERIOD/MONTH end -> last day', month('2015-03', 'PERIOD'), 'END', '2015-03-31'],
    ['PERIOD/MONTH leap February end', month('2016-02', 'PERIOD'), 'END', '2016-02-29'],
    ['BOUNDARY/MONTH leap February start', month('2016-02', 'BOUNDARY'), 'START', '2016-02-29'],
    ['PERIOD/YEAR start -> 1 Jan', year('2015', 'PERIOD'), 'START', '2015-01-01'],
    ['PERIOD/YEAR end -> 31 Dec', year('2015', 'PERIOD'), 'END', '2015-12-31'],
  ] as const)('%s', (_label, boundary, side, expected) => {
    expect(resolveBoundary(boundary, side)).toBe(expected);
  });

  it('PERIOD/YEAR 2015 is the full calendar year (12 months)', () => {
    const r = svc([period(year('2015', 'PERIOD'), year('2015', 'PERIOD'))], '2030-01-01');
    expect(r.resolvedIntervals[0]).toMatchObject({ start: '2015-01-01', end: '2015-12-31' });
    expect(r.totalMonths).toBe(12);
  });

  it('REGRESSION: BOUNDARY "joined 2015, left 2015" is inverted and contributes zero', () => {
    const r = svc([period(year('2015', 'BOUNDARY'), year('2015', 'BOUNDARY'))], '2030-01-01');
    expect(r.totalMonths).toBe(0);
    expect(r.excluded).toEqual([{ periodId: expect.any(String), reason: 'INVERTED_INTERVAL' }]);
  });

  it('REGRESSION: BOUNDARY "joined 2015, left 2018" never credits the uncertain years in full', () => {
    const p = period(year('2015', 'BOUNDARY'), year('2018', 'BOUNDARY'));
    const r = svc([p], '2030-01-01');
    expect(r.resolvedIntervals[0]).toMatchObject({ start: '2015-12-31', end: '2018-01-01' });
    // [2015-12-31, 2018-01-02): 24 months + 2 days -- not the 48 months a first/last-day reading gives.
    expect(r.totalMonths).toBe(24);
    expect(r.remainderDays).toBe(2);
  });

  it('POINT evidence never counts, establishes no boundary and no continuity', () => {
    const r = svc([period('2016-05-10', '2016-05-10', { evidenceKind: 'POINT' })], '2030-01-01');
    expect(r.totalMonths).toBe(0);
    expect(r.countedIntervals).toEqual([]);
    expect(r.excluded[0].reason).toBe('POINT_EVIDENCE');
  });

  it('REGRESSION: two dates do not establish continuity unless the input says so', () => {
    const r = svc([period('2010-01-01', '2020-12-31', { evidenceKind: 'BOUNDARY', continuityEstablished: false })], '2030-01-01');
    expect(r.totalMonths).toBe(0);
    expect(r.excluded[0].reason).toBe('CONTINUITY_NOT_ESTABLISHED');
  });

  it('rejects malformed imprecise boundaries', () => {
    expect(() => resolveBoundary(month('2015-3', 'PERIOD'), 'START')).toThrow();
    expect(() => resolveBoundary(month('2015-13', 'PERIOD'), 'START')).toThrow();
    expect(() => resolveBoundary(year('15', 'PERIOD'), 'START')).toThrow();
    expect(() => resolveBoundary(exact('2015-02-30'), 'START')).toThrow();
  });
});

// ── Which periods count (§5.4) ───────────────────────────────────────────────

describe('only CURRENT + VERIFIED periods with established continuity count', () => {
  it.each([
    ['UNVERIFIED', { verificationStatus: 'UNVERIFIED' }, 'NOT_VERIFIED'],
    ['REJECTED', { verificationStatus: 'REJECTED' }, 'NOT_VERIFIED'],
    ['SUPERSEDED', { lifecycleState: 'SUPERSEDED' }, 'NOT_CURRENT'],
    ['CORRECTED', { lifecycleState: 'CORRECTED' }, 'NOT_CURRENT'],
  ] as const)('%s is excluded', (_label, over, reason) => {
    const counted = period('2010-01-01', '2019-12-31');
    const other = period('2000-01-01', '2009-12-31', over as Partial<RecognizedServicePeriodInput>);
    const r = svc([counted, other], '2030-01-01');
    expect(r.totalMonths).toBe(120);
    expect(r.excluded).toEqual([{ periodId: other.periodId, reason }]);
  });

  it('rejects duplicate or empty period identifiers', () => {
    const p = period('2010-01-01', '2010-12-31');
    expect(() => svc([p, { ...p }], '2030-01-01')).toThrow(/Duplicate periodId/);
    expect(() => svc([{ ...p, periodId: '' }], '2030-01-01')).toThrow();
  });
});

// ── TENURE-ARCH-001 §8.4 worked examples ─────────────────────────────────────

describe('TENURE-ARCH-001 §8.4 worked examples', () => {
  it('Example A -- [2015-01-01, 2019-12-31] = 60 months, reached on 2020-01-01', () => {
    const p = [period('2015-01-01', '2019-12-31')];
    expect(svc(p, '2020-01-01')).toMatchObject({ totalMonths: 60, remainderDays: 0 });
    expect(svc(p, '2019-12-31').totalMonths).toBe(59);
    expect(earliestServiceThresholdDate(p, 60, '2030-01-01')).toBe('2020-01-01');
  });

  it('Example B -- two periods with a gap = 53 months, 3 residual days', () => {
    const p1 = period('2010-01-15', '2012-06-20');
    const p2 = period('2014-03-01', '2016-02-28');
    const r = svc([p1, p2], '2016-02-29');
    expect(r.countedIntervals.map((i) => [i.months, i.residualDays])).toEqual([[29, 6], [23, 28]]);
    expect(r.residualDaysTotal).toBe(34);
    expect(r.totalMonths).toBe(53);
    expect(r.remainderDays).toBe(3);
    expect(svc([p1, p2], '2026-10-07')).toMatchObject({ totalMonths: 53, remainderDays: 3 }); // gap never filled
  });

  it('Example C -- leap-day start reaches 60 months on 2021-03-01, not 2021-02-28', () => {
    const p = [period('2016-02-29', null)];
    expect(svc(p, '2021-02-28')).toMatchObject({ totalMonths: 59, remainderDays: 30 });
    expect(svc(p, '2021-03-01')).toMatchObject({ totalMonths: 60, remainderDays: 0 });
    expect(earliestServiceThresholdDate(p, 60, '2030-01-01')).toBe('2021-03-01');
  });

  it('Example D -- BOUNDARY vs PERIOD "March 2015"', () => {
    const boundary = [period(month('2015-03', 'BOUNDARY'), null)];
    const full = [period(month('2015-03', 'PERIOD'), null)];
    expect(earliestServiceThresholdDate(boundary, 60, '2030-01-01')).toBe('2020-03-31');
    expect(earliestServiceThresholdDate(full, 60, '2030-01-01')).toBe('2020-03-01');
  });

  it('Example E -- overlapping periods coalesce to 18 months, not 24', () => {
    const r = svc([period('2015-01-01', '2015-12-31'), period('2015-07-01', '2016-06-30')], '2016-07-01');
    expect(r.countedIntervals).toHaveLength(1);
    expect(r.countedIntervals[0]).toMatchObject({ start: '2015-01-01', exclusiveEnd: '2016-07-01', months: 18, residualDays: 0 });
    expect(r.totalMonths).toBe(18);
  });
});

// ── Aggregation behaviour ────────────────────────────────────────────────────

describe('service aggregation (§8.3)', () => {
  it('open-ended period counts through T - 1 day', () => {
    const r = svc([period('2015-01-01', null)], '2016-01-01');
    expect(r.countedIntervals[0]).toMatchObject({ exclusiveEnd: '2016-01-01', months: 12 });
  });

  it('period ending on T - 1 counts in full; ending on T is clipped (day T not yet served)', () => {
    expect(svc([period('2015-01-01', '2015-12-31')], '2016-01-01').totalMonths).toBe(12);
    const clipped = svc([period('2015-01-01', '2016-01-01')], '2016-01-01');
    expect(clipped.countedIntervals[0].exclusiveEnd).toBe('2016-01-01');
    expect(clipped).toMatchObject({ totalMonths: 12, remainderDays: 0 });
  });

  it('service beginning on T (or later) contributes nothing yet', () => {
    const r = svc([period('2016-01-01', null), period('2017-05-05', '2018-01-01')], '2016-01-01');
    expect(r.totalMonths).toBe(0);
    expect(r.excluded.map((e) => e.reason)).toEqual(['NO_SERVICE_BEFORE_EVALUATION_DATE', 'NO_SERVICE_BEFORE_EVALUATION_DATE']);
  });

  it('a single day of service is one residual day', () => {
    expect(svc([period('2016-01-01', '2016-01-01')], '2020-01-01')).toMatchObject({ totalMonths: 0, remainderDays: 1 });
  });

  it('contiguous periods merge into one interval', () => {
    const r = svc([period('2015-01-15', '2015-02-14'), period('2015-02-15', '2015-03-14')], '2020-01-01');
    expect(r.countedIntervals).toHaveLength(1);
    expect(r.countedIntervals[0]).toMatchObject({ start: '2015-01-15', exclusiveEnd: '2015-03-15', months: 2, residualDays: 0 });
  });

  it('REGRESSION: a one-day gap is never filled', () => {
    const r = svc([period('2015-01-01', '2015-06-30'), period('2015-07-02', '2015-12-31')], '2020-01-01');
    expect(r.countedIntervals).toHaveLength(2);
    expect(r).toMatchObject({ totalMonths: 11, remainderDays: 30 }); // a filled gap would give 12
  });

  it('REGRESSION: duplicate and nested periods are not double-counted', () => {
    const r = svc(
      [period('2015-01-01', '2015-12-31'), period('2015-01-01', '2015-12-31'), period('2015-03-01', '2015-04-30')],
      '2020-01-01',
    );
    expect(r.countedIntervals).toHaveLength(1);
    expect(r.totalMonths).toBe(12);
  });

  it('residual days from separate intervals convert at 31 days per month', () => {
    // 20 + 20 residual days across two gapped intervals -> 1 month, 9 days.
    const r = svc([period('2015-01-01', '2015-01-20'), period('2015-03-01', '2015-03-20')], '2020-01-01');
    expect(r.countedIntervals.map((i) => [i.months, i.residualDays])).toEqual([[0, 20], [0, 20]]);
    expect(r).toMatchObject({ residualDaysTotal: 40, totalMonths: 1, remainderDays: 9 });
    // exactly 30 residual days stays below a month
    const r30 = svc([period('2015-01-01', '2015-01-15'), period('2015-03-01', '2015-03-15')], '2020-01-01');
    expect(r30).toMatchObject({ totalMonths: 0, remainderDays: 30 });
  });

  it('REGRESSION: no 365.25-day years -- 60 months from 2016-03-01 is reached on 2021-03-01 (1826 days)', () => {
    const p = [period('2016-03-01', null)];
    expect(earliestServiceThresholdDate(p, 60, '2030-01-01')).toBe('2021-03-01');
    // 365.25 * 5 = 1826.25 days would not yet count 5 years on that date.
    expect(addDays('2016-03-01', Math.ceil(365.25 * 5))).not.toBe('2021-03-01');
    // and 10 years from 2016-01-01 is exactly 120 calendar months later
    expect(earliestServiceThresholdDate([period('2016-01-01', null)], 120, '2030-01-01')).toBe('2026-01-01');
  });

  it('wholeCalendarMonths matches the definition on the §8.2 roll-forward cases', () => {
    expect(wholeCalendarMonths('2015-01-31', '2015-03-01')).toBe(1);
    expect(wholeCalendarMonths('2015-01-31', '2015-02-28')).toBe(0);
    expect(wholeCalendarMonths('2015-01-31', '2015-03-31')).toBe(2);
    expect(wholeCalendarMonths('2015-01-01', '2015-01-01')).toBe(0);
  });

  it('threshold not reached by T returns null; invalid thresholds throw', () => {
    expect(earliestServiceThresholdDate([period('2020-01-01', null)], 60, '2024-12-31')).toBeNull();
    expect(earliestServiceThresholdDate([], 60, '2024-12-31')).toBeNull();
    expect(() => earliestServiceThresholdDate([], 0, '2024-12-31')).toThrow();
    expect(() => earliestServiceThresholdDate([], 1.5, '2024-12-31')).toThrow();
  });
});

// ── Determinism / property checks ────────────────────────────────────────────

describe('determinism', () => {
  function randomPeriods(rand: () => number, n: number): RecognizedServicePeriodInput[] {
    const base = toDayNumber('2000-01-01');
    return Array.from({ length: n }, (_, i) => {
      const s = base + Math.floor(rand() * 9000);
      const open = rand() < 0.15;
      const e = s + Math.floor(rand() * 1500) - 30; // occasionally inverted
      const states: Array<Partial<RecognizedServicePeriodInput>> = [{}, {}, {}, { verificationStatus: 'UNVERIFIED' }, { lifecycleState: 'SUPERSEDED' }];
      return {
        ...period(fromDayNumber(s), open ? null : fromDayNumber(e), states[Math.floor(rand() * states.length)]),
        periodId: `r${i}`,
      };
    });
  }

  it('input order never changes the result; repeated calls are identical', () => {
    const rand = lcg(20261007);
    for (let trial = 0; trial < 40; trial += 1) {
      const ps = randomPeriods(rand, 1 + Math.floor(rand() * 7));
      const T = fromDayNumber(toDayNumber('2000-01-01') + Math.floor(rand() * 11000));
      const baseline = svc(ps, T);
      expect(svc(ps, T)).toEqual(baseline);
      expect(svc([...ps].reverse(), T)).toEqual(baseline);
      const shuffled = [...ps].sort(() => (rand() < 0.5 ? -1 : 1));
      expect(svc(shuffled, T)).toEqual(baseline);
    }
  });

  it('tenure never decreases as T advances, and the threshold search matches a day-by-day scan', () => {
    const rand = lcg(42);
    for (let trial = 0; trial < 12; trial += 1) {
      const ps = randomPeriods(rand, 1 + Math.floor(rand() * 5));
      const N = 1 + Math.floor(rand() * 40);
      const end = '2026-12-31';
      let prev = 0;
      let firstReached: string | null = null;
      for (let d = toDayNumber('1999-12-01'); d <= toDayNumber(end); d += 1) {
        const months = svc(ps, fromDayNumber(d)).totalMonths;
        expect(months).toBeGreaterThanOrEqual(prev);
        prev = months;
        if (firstReached === null && months >= N) firstReached = fromDayNumber(d);
      }
      expect(earliestServiceThresholdDate(ps, N, end)).toBe(firstReached);
    }
  });

  it('addMonths results never exceed a calendar-month step of 31 days (residual < 31 per interval)', () => {
    const rand = lcg(7);
    for (let i = 0; i < 400; i += 1) {
      const s = fromDayNumber(toDayNumber('2000-01-01') + Math.floor(rand() * 9000));
      const x = addDays(s, 1 + Math.floor(rand() * 4000));
      const M = wholeCalendarMonths(s, x);
      const r = toDayNumber(x) - toDayNumber(addMonths(s, M));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(31);
      expect(compareCivilDates(addMonths(s, M + 1), x)).toBe(1);
    }
  });
});

// ── Age (§8.5) ───────────────────────────────────────────────────────────────

describe('age (§8.5)', () => {
  it('anniversary-based: reached on the birthday, not the day before', () => {
    const dob = FULL('1966-10-07');
    expect(ageOn(dob, '2026-10-06')).toBe(59);
    expect(ageOn(dob, '2026-10-07')).toBe(60);
    expect(ageOn(dob, '2026-10-08')).toBe(60);
    expect(ageOn(dob, '1966-10-07')).toBe(0);
  });

  it('REGRESSION: no month-only approximation (birthday later in the same month)', () => {
    expect(ageOn(FULL('1966-10-20'), '2026-10-07')).toBe(59);
  });

  it('leap-day birthdays', () => {
    expect(dateOfReachingAge(FULL('2016-02-29'), 5)).toBe('2021-03-01');
    expect(ageOn(FULL('2016-02-29'), '2021-02-28')).toBe(4);
    expect(ageOn(FULL('2016-02-29'), '2021-03-01')).toBe(5);
    expect(dateOfReachingAge(FULL('1964-02-29'), 60)).toBe('2024-02-29');
    expect(ageOn(FULL('1964-02-29'), '2024-02-29')).toBe(60);
    expect(ageOn(FULL('1964-02-29'), '2024-02-28')).toBe(59);
    expect(dateOfReachingAge(FULL('1976-02-29'), 50)).toBe('2026-03-01');
  });

  it.each([
    [{ status: 'VERIFIED_MONTH_ONLY' }],
    [{ status: 'VERIFIED_YEAR_ONLY' }],
    [{ status: 'UNVERIFIED' }],
    [{ status: 'ABSENT' }],
  ] as const)('%o has no age and no anniversary date (never approximated)', (dob) => {
    expect(ageOn(dob as DobAuthority, '2026-10-07')).toBeNull();
    expect(dateOfReachingAge(dob as DobAuthority, 60)).toBeNull();
  });
});

// ── Senior eligibility-date primitives (§4, §8.6) ────────────────────────────

describe('Senior eligibility dates (P1/P2/P3)', () => {
  it('thresholds are the constitutional values and frozen', () => {
    expect(SENIOR_THRESHOLDS).toEqual({ P1_AGE_YEARS: 60, P2_AGE_YEARS: 50, P2_SERVICE_MONTHS: 60, P3_SERVICE_MONTHS: 120 });
    expect(Object.isFrozen(SENIOR_THRESHOLDS)).toBe(true);
  });

  it('P1 -- age 60 on addYears(DOB, 60); not eligible the day before', () => {
    const before = calculateSeniorEligibilityDates({ dob: FULL('1966-10-08'), periods: [], evaluationDate: '2026-10-07' });
    expect(before.paths.P1).toMatchObject({ status: 'NOT_ELIGIBLE', eligibilityDate: null });
    const on = calculateSeniorEligibilityDates({ dob: FULL('1966-10-07'), periods: [], evaluationDate: '2026-10-07' });
    expect(on.paths.P1).toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2026-10-07' });
    expect(on.overall).toEqual({ status: 'ELIGIBLE', eligibilityDate: '2026-10-07', qualifyingPaths: ['P1'] });
  });

  it('P2 -- later of age-50 date and 60-month service date (service later)', () => {
    const r = calculateSeniorEligibilityDates({
      dob: FULL('1970-05-01'), // age 50 on 2020-05-01
      periods: [period('2018-01-01', null)], // 60 months on 2023-01-01
      evaluationDate: '2026-10-07',
    });
    expect(r.paths.P2).toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2023-01-01' });
  });

  it('P2 -- later of the two (age later)', () => {
    const r = calculateSeniorEligibilityDates({
      dob: FULL('1974-02-28'), // age 50 on 2024-02-28
      periods: [period('2010-01-01', null)],
      evaluationDate: '2026-10-07',
    });
    expect(r.paths.P2).toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2024-02-28' });
    expect(r.paths.P3).toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2020-01-01' });
    expect(r.overall).toEqual({ status: 'ELIGIBLE', eligibilityDate: '2020-01-01', qualifyingPaths: ['P2', 'P3'] });
  });

  it('P2 -- not eligible when age 50 reached but service short', () => {
    const r = calculateSeniorEligibilityDates({ dob: FULL('1960-01-01'), periods: [period('2024-01-01', null)], evaluationDate: '2026-10-07' });
    expect(r.paths.P2.status).toBe('NOT_ELIGIBLE');
    expect(r.paths.P1).toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2020-01-01' });
  });

  it('P3 -- 120 months irrespective of DOB; age paths NOT_EVALUABLE without a verified full DOB', () => {
    const r = calculateSeniorEligibilityDates({ dob: { status: 'UNVERIFIED' }, periods: [period('2015-01-01', null)], evaluationDate: '2026-10-07' });
    expect(r.paths.P1.status).toBe('NOT_EVALUABLE');
    expect(r.paths.P2.status).toBe('NOT_EVALUABLE');
    expect(r.paths.P3).toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2025-01-01' });
    expect(r.overall).toEqual({ status: 'ELIGIBLE', eligibilityDate: '2025-01-01', qualifyingPaths: ['P3'] });
  });

  it.each(['VERIFIED_MONTH_ONLY', 'VERIFIED_YEAR_ONLY', 'UNVERIFIED', 'ABSENT'] as const)(
    'partial/unverified DOB (%s) never qualifies through approximation -> INDETERMINATE',
    (status) => {
      const r = calculateSeniorEligibilityDates({ dob: { status } as DobAuthority, periods: [period('2020-01-01', null)], evaluationDate: '2026-10-07' });
      expect(r.paths.P1).toMatchObject({ status: 'NOT_EVALUABLE', eligibilityDate: null });
      expect(r.paths.P2).toMatchObject({ status: 'NOT_EVALUABLE', eligibilityDate: null });
      expect(r.paths.P3.status).toBe('NOT_ELIGIBLE');
      expect(r.overall).toEqual({ status: 'INDETERMINATE', eligibilityDate: null, qualifyingPaths: [] });
    },
  );

  it('NOT_ELIGIBLE only when every path was evaluable', () => {
    const r = calculateSeniorEligibilityDates({ dob: FULL('1990-01-01'), periods: [period('2020-01-01', null)], evaluationDate: '2026-10-07' });
    expect(r.overall).toEqual({ status: 'NOT_ELIGIBLE', eligibilityDate: null, qualifyingPaths: [] });
  });

  it('eligibility dates are never later than T and come from service through T - 1', () => {
    const p = [period('2016-10-07', null)]; // 120 months on 2026-10-07
    expect(calculateSeniorEligibilityDates({ dob: { status: 'ABSENT' }, periods: p, evaluationDate: '2026-10-06' }).paths.P3.status).toBe('NOT_ELIGIBLE');
    expect(calculateSeniorEligibilityDates({ dob: { status: 'ABSENT' }, periods: p, evaluationDate: '2026-10-07' }).paths.P3)
      .toMatchObject({ status: 'ELIGIBLE', eligibilityDate: '2026-10-07' });
  });

  it('produces eligibility_date only -- no achieved/award date anywhere in the result', () => {
    const r = calculateSeniorEligibilityDates({ dob: FULL('1950-01-01'), periods: [period('2000-01-01', null)], evaluationDate: '2026-10-07' });
    expect(JSON.stringify(r)).not.toMatch(/achiev|award/i);
  });
});

// ── Engine isolation (WP1 boundary) ──────────────────────────────────────────

describe('WP1 engine isolation', () => {
  const DIR = __dirname;
  const sources = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

  it('imports nothing outside the tenure directory (no db, Nest, network or legacy tenure fields)', () => {
    for (const file of sources) {
      // Code only: comments may name the legacy fields they refuse to use.
      const src = fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      expect(imports.every((i) => i.startsWith('./'))).toBe(true);
      expect(src).not.toMatch(/join_year|join_month|year_joined_bcc|member_recognitions|recognition_criteria|date_of_birth/);
      expect(src).not.toMatch(/365\.25|Date\.now\(|new Date\(/);
    }
  });

  it('is not imported by any other backend source file yet (no evaluator/route wiring)', () => {
    const SRC = path.resolve(DIR, '../../..');
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    const outside = walk(SRC).filter((f) => !f.startsWith(DIR) && /membership\/tenure\//.test(fs.readFileSync(f, 'utf8')));
    expect(outside).toEqual([]);
  });
});
