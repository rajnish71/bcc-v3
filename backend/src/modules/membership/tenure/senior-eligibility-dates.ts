// backend/src/modules/membership/tenure/senior-eligibility-dates.ts
//
// TENURE-ARCH-001 v1.1 §4, §8.5, §8.6, §9 — pure age and eligibility-date
// primitives for the constitutional Senior paths (MEM-006 v1.1):
//   P1  age >= 60
//   P2  age >= 50 AND recognized service >= 60 months
//   P3  recognized service >= 120 months
//
// Computes eligibility_date only (the date the conditions became satisfied,
// as of T). It never awards Senior, never produces an achieved_date, and is
// not wired to any route, service or evaluator. Award recording, the D1
// removal block and the D2 ACTIVE-membership rule belong to later work
// packages.
//
// Age paths need a VERIFIED_FULL_DATE DOB; anything else makes them
// NOT_EVALUABLE and is never approximated (D3, R3). P3 needs no DOB.

import { addYears, compareCivilDates, maxCivilDate, parseCivilDate } from './civil-date';
import type { CivilDate } from './civil-date';
import { calculateRecognizedService, earliestServiceThresholdDate } from './tenure-calculator';
import type {
  DobAuthority,
  RecognizedServicePeriodInput,
  SeniorEligibilityDatesResult,
  SeniorPath,
  SeniorPathResult,
} from './tenure.types';

// Constitutional thresholds (MEM-006 v1.1). Not configurable.
export const SENIOR_THRESHOLDS = Object.freeze({
  P1_AGE_YEARS: 60,
  P2_AGE_YEARS: 50,
  P2_SERVICE_MONTHS: 60,
  P3_SERVICE_MONTHS: 120,
});

function verifiedFullDob(dob: DobAuthority): CivilDate | null {
  return dob.status === 'VERIFIED_FULL_DATE' ? parseCivilDate(dob.dateOfBirth) : null;
}

// §8.5: largest Y with addYears(DOB, Y) <= T. An age is reached on its
// calendar anniversary (29-Feb birthdays roll to 1-Mar in common years).
// The service T - 1 day convention does not apply to age.
export function ageOn(dob: DobAuthority, evaluationDate: CivilDate): number | null {
  const birth = verifiedFullDob(dob);
  if (birth === null) return null;
  const T = parseCivilDate(evaluationDate);
  if (compareCivilDates(T, birth) < 0) return 0;
  let years = Number(T.slice(0, 4)) - Number(birth.slice(0, 4));
  while (years > 0 && compareCivilDates(addYears(birth, years), T) > 0) years -= 1;
  while (compareCivilDates(addYears(birth, years + 1), T) <= 0) years += 1;
  return years;
}

// The calendar date on which the person reaches `years` (VERIFIED_FULL_DATE only).
export function dateOfReachingAge(dob: DobAuthority, years: number): CivilDate | null {
  const birth = verifiedFullDob(dob);
  return birth === null ? null : addYears(birth, years);
}

function result(path: SeniorPath, status: SeniorPathResult['status'], eligibilityDate: CivilDate | null, reason: string): SeniorPathResult {
  return { path, status, eligibilityDate, reason };
}

export function calculateSeniorEligibilityDates(input: {
  dob: DobAuthority;
  periods: ReadonlyArray<RecognizedServicePeriodInput>;
  evaluationDate: CivilDate;
}): SeniorEligibilityDatesResult {
  const T = parseCivilDate(input.evaluationDate);
  const service = calculateRecognizedService(input.periods, T);
  const dobEvaluable = verifiedFullDob(input.dob) !== null;
  const notEvaluableReason = `Age path requires a verified full-date DOB (DOB status: ${input.dob.status}).`;

  // P1
  let P1: SeniorPathResult;
  if (!dobEvaluable) {
    P1 = result('P1', 'NOT_EVALUABLE', null, notEvaluableReason);
  } else {
    const age60 = dateOfReachingAge(input.dob, SENIOR_THRESHOLDS.P1_AGE_YEARS) as CivilDate;
    P1 = compareCivilDates(age60, T) <= 0
      ? result('P1', 'ELIGIBLE', age60, `Age ${SENIOR_THRESHOLDS.P1_AGE_YEARS} reached on ${age60}.`)
      : result('P1', 'NOT_ELIGIBLE', null, `Age ${SENIOR_THRESHOLDS.P1_AGE_YEARS} not reached as of ${T}.`);
  }

  // P2 -- both conditions monotone in T, so the date is the later of the two.
  let P2: SeniorPathResult;
  if (!dobEvaluable) {
    P2 = result('P2', 'NOT_EVALUABLE', null, notEvaluableReason);
  } else {
    const age50 = dateOfReachingAge(input.dob, SENIOR_THRESHOLDS.P2_AGE_YEARS) as CivilDate;
    const service60 = earliestServiceThresholdDate(input.periods, SENIOR_THRESHOLDS.P2_SERVICE_MONTHS, T);
    if (compareCivilDates(age50, T) > 0) {
      P2 = result('P2', 'NOT_ELIGIBLE', null, `Age ${SENIOR_THRESHOLDS.P2_AGE_YEARS} not reached as of ${T}.`);
    } else if (service60 === null) {
      P2 = result('P2', 'NOT_ELIGIBLE', null, `${SENIOR_THRESHOLDS.P2_SERVICE_MONTHS} months of recognized service not reached as of ${T}.`);
    } else {
      const date = maxCivilDate(age50, service60);
      P2 = result('P2', 'ELIGIBLE', date, `Age ${SENIOR_THRESHOLDS.P2_AGE_YEARS} on ${age50}; ${SENIOR_THRESHOLDS.P2_SERVICE_MONTHS} months of service on ${service60}.`);
    }
  }

  // P3
  const service120 = earliestServiceThresholdDate(input.periods, SENIOR_THRESHOLDS.P3_SERVICE_MONTHS, T);
  const P3 = service120 === null
    ? result('P3', 'NOT_ELIGIBLE', null, `${SENIOR_THRESHOLDS.P3_SERVICE_MONTHS} months of recognized service not reached as of ${T}.`)
    : result('P3', 'ELIGIBLE', service120, `${SENIOR_THRESHOLDS.P3_SERVICE_MONTHS} months of recognized service on ${service120}.`);

  const all = [P1, P2, P3];
  const satisfied = all.filter((p) => p.status === 'ELIGIBLE');
  const eligibilityDate = satisfied.reduce<CivilDate | null>(
    (earliest, p) => (earliest === null || compareCivilDates(p.eligibilityDate as CivilDate, earliest) < 0 ? p.eligibilityDate : earliest),
    null,
  );

  return {
    evaluationDate: T,
    service,
    paths: { P1, P2, P3 },
    overall: {
      status: satisfied.length > 0 ? 'ELIGIBLE' : all.some((p) => p.status === 'NOT_EVALUABLE') ? 'INDETERMINATE' : 'NOT_ELIGIBLE',
      eligibilityDate,
      qualifyingPaths: satisfied.map((p) => p.path),
    },
  };
}
