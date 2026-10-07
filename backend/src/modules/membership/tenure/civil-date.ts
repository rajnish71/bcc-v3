// backend/src/modules/membership/tenure/civil-date.ts
//
// TENURE-ARCH-001 v1.1 §8.2 — deterministic civil-calendar arithmetic.
//
// A CivilDate is a calendar date with no time-of-day and no time zone,
// written 'YYYY-MM-DD'. All arithmetic runs on integer day numbers
// (proleptic Gregorian, days since 1970-01-01), never on JS Date objects,
// so results cannot drift with the process time zone or DST.
//
// addMonths() deliberately does NOT clamp to the end of the month: when the
// source day does not exist in the target month the result is the FIRST day
// of the following month (29-Feb + 1 year = 1-Mar). Generic date libraries
// clamp (29-Feb + 1 year = 28-Feb); that behaviour is non-conforming.
//
// Platform timestamps are converted with civilDateInKolkata() (R5C) before
// any tenure arithmetic. That function takes an absolute instant; callers
// must establish what instant a stored column represents before using it.

export type CivilDate = string;

export class TenureInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenureInputError';
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1000;
const MAX_YEAR = 9999;

export const TENURE_CIVIL_TIME_ZONE = 'Asia/Kolkata';

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function assertYear(y: number): void {
  if (!Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR) {
    throw new TenureInputError(`Year ${y} is outside the supported range ${MIN_YEAR}-${MAX_YEAR}.`);
  }
}

function toYmd(date: CivilDate): Ymd {
  const match = typeof date === 'string' ? ISO_DATE.exec(date) : null;
  if (!match) throw new TenureInputError(`Invalid civil date '${String(date)}' (expected YYYY-MM-DD).`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  assertYear(y);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new TenureInputError(`Invalid civil date '${date}' (no such calendar day).`);
  }
  return { y, m, d };
}

function fromYmd({ y, m, d }: Ymd): CivilDate {
  assertYear(y);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Howard Hinnant's days_from_civil / civil_from_days (integer-only).
function dayNumberOf({ y, m, d }: Ymd): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function ymdOfDayNumber(z: number): Ymd {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function parseCivilDate(value: string): CivilDate {
  return fromYmd(toYmd(value));
}

export function toDayNumber(date: CivilDate): number {
  return dayNumberOf(toYmd(date));
}

export function fromDayNumber(dayNumber: number): CivilDate {
  if (!Number.isInteger(dayNumber)) throw new TenureInputError(`Day number ${dayNumber} is not an integer.`);
  return fromYmd(ymdOfDayNumber(dayNumber));
}

export function compareCivilDates(a: CivilDate, b: CivilDate): number {
  const diff = toDayNumber(a) - toDayNumber(b);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function minCivilDate(a: CivilDate, b: CivilDate): CivilDate {
  return compareCivilDates(a, b) <= 0 ? a : b;
}

export function maxCivilDate(a: CivilDate, b: CivilDate): CivilDate {
  return compareCivilDates(a, b) >= 0 ? a : b;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  if (!Number.isInteger(days)) throw new TenureInputError(`Day offset ${days} is not an integer.`);
  return fromDayNumber(toDayNumber(date) + days);
}

// Whole days from `from` to `to` (to - from); negative when `to` is earlier.
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function firstDayOfMonth(year: number, month: number): CivilDate {
  return fromYmd({ y: year, m: month, d: 1 });
}

export function lastDayOfMonth(year: number, month: number): CivilDate {
  return fromYmd({ y: year, m: month, d: daysInMonth(year, month) });
}

// TENURE-ARCH-001 §8.2. N calendar months forward, keeping the day of month;
// a day that does not exist in the target month rolls to the 1st of the
// following month. Never clamps.
export function addMonths(date: CivilDate, months: number): CivilDate {
  if (!Number.isInteger(months) || months < 0) {
    throw new TenureInputError(`Month offset ${months} must be a non-negative integer.`);
  }
  const { y, m, d } = toYmd(date);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  if (d <= daysInMonth(ty, tm)) return fromYmd({ y: ty, m: tm, d });
  const next = index + 1;
  return fromYmd({ y: Math.floor(next / 12), m: (next % 12) + 1, d: 1 });
}

export function addYears(date: CivilDate, years: number): CivilDate {
  if (!Number.isInteger(years) || years < 0) {
    throw new TenureInputError(`Year offset ${years} must be a non-negative integer.`);
  }
  return addMonths(date, 12 * years);
}

// R5C: the Asia/Kolkata civil date of an absolute instant. The caller is
// responsible for knowing which instant a stored timestamp represents.
const KOLKATA_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TENURE_CIVIL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function civilDateInKolkata(instant: Date): CivilDate {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new TenureInputError('civilDateInKolkata() requires a valid Date instant.');
  }
  const parts = Object.fromEntries(KOLKATA_DATE_FORMAT.formatToParts(instant).map((p) => [p.type, p.value]));
  return parseCivilDate(`${parts.year}-${parts.month}-${parts.day}`);
}
