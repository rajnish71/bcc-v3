// WP1 -- civil-date arithmetic (TENURE-ARCH-001 v1.1 §8.2, R5C).

import {
  TenureInputError,
  addDays,
  addMonths,
  addYears,
  civilDateInKolkata,
  compareCivilDates,
  daysBetween,
  daysInMonth,
  fromDayNumber,
  isLeapYear,
  parseCivilDate,
  toDayNumber,
} from './civil-date';

describe('addMonths -- TENURE-ARCH-001 §8.2 table (roll to 1st of next month, never clamp)', () => {
  it.each([
    ['2015-01-31', 1, '2015-03-01'],
    ['2016-01-31', 1, '2016-03-01'],
    ['2015-03-31', 1, '2015-05-01'],
    ['2016-02-29', 12, '2017-03-01'],
    ['2016-02-29', 48, '2020-02-29'],
    ['2016-02-29', 60, '2021-03-01'],
    ['2015-01-15', 1, '2015-02-15'],
  ])('%s + %i months = %s', (d, n, expected) => {
    expect(addMonths(d, n)).toBe(expected);
  });

  it('normal month transitions keep the day', () => {
    expect(addMonths('2015-04-10', 1)).toBe('2015-05-10');
    expect(addMonths('2015-12-10', 1)).toBe('2016-01-10');
    expect(addMonths('2015-11-30', 3)).toBe('2016-03-01'); // 30-Feb-2016 does not exist
    expect(addMonths('2015-02-28', 1)).toBe('2015-03-28');
    expect(addMonths('2016-02-29', 1)).toBe('2016-03-29');
    expect(addMonths('2015-01-29', 1)).toBe('2015-03-01'); // 29-Feb-2015 does not exist
    expect(addMonths('2016-01-29', 1)).toBe('2016-02-29'); // leap February keeps the 29th
    expect(addMonths('2015-08-31', 1)).toBe('2015-10-01');
    expect(addMonths('2015-07-31', 1)).toBe('2015-08-31');
    expect(addMonths('2015-06-15', 0)).toBe('2015-06-15');
  });

  it('REGRESSION: never produces the clamp-to-last-day result of generic libraries', () => {
    expect(addMonths('2015-01-31', 1)).not.toBe('2015-02-28');
    expect(addMonths('2016-01-31', 1)).not.toBe('2016-02-29');
    expect(addMonths('2016-02-29', 60)).not.toBe('2021-02-28');
    expect(addYears('2016-02-29', 1)).not.toBe('2017-02-28');
  });

  it('is strictly increasing in N (required by the M search)', () => {
    for (const start of ['2015-01-31', '2016-02-29', '2015-03-30', '2015-05-31', '2015-01-01']) {
      let prev = start;
      for (let n = 1; n <= 150; n += 1) {
        const next = addMonths(start, n);
        expect(compareCivilDates(next, prev)).toBe(1);
        prev = next;
      }
    }
  });

  it('rejects negative or fractional offsets', () => {
    expect(() => addMonths('2015-01-01', -1)).toThrow(TenureInputError);
    expect(() => addMonths('2015-01-01', 1.5)).toThrow(TenureInputError);
    expect(() => addYears('2015-01-01', -1)).toThrow(TenureInputError);
  });
});

describe('addYears', () => {
  it('29-Feb + N years in a common year = 1-Mar; in a leap year stays 29-Feb', () => {
    expect(addYears('2016-02-29', 5)).toBe('2021-03-01');
    expect(addYears('1964-02-29', 60)).toBe('2024-02-29');
    expect(addYears('1976-02-29', 50)).toBe('2026-03-01');
    expect(addYears('2000-02-29', 100)).toBe('2100-03-01'); // 2100 is not a leap year
    expect(addYears('2015-06-15', 10)).toBe('2025-06-15');
  });
});

describe('civil-date primitives', () => {
  it('leap-year rules incl. century years', () => {
    expect([2016, 2020, 2000, 2400].every(isLeapYear)).toBe(true);
    expect([2015, 2100, 1900, 2021].some(isLeapYear)).toBe(false);
    expect(daysInMonth(2016, 2)).toBe(29);
    expect(daysInMonth(2015, 2)).toBe(28);
    expect(daysInMonth(2015, 4)).toBe(30);
    expect(daysInMonth(2015, 12)).toBe(31);
  });

  it('day numbers round-trip and match the Unix epoch', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017);
    for (let z = -200000; z <= 200000; z += 997) expect(toDayNumber(fromDayNumber(z))).toBe(z);
  });

  it('addDays / daysBetween / compare', () => {
    expect(addDays('2016-02-28', 1)).toBe('2016-02-29');
    expect(addDays('2015-02-28', 1)).toBe('2015-03-01');
    expect(addDays('2015-12-31', 1)).toBe('2016-01-01');
    expect(addDays('2016-03-01', -1)).toBe('2016-02-29');
    expect(daysBetween('2016-03-01', '2021-03-01')).toBe(1826);
    expect(daysBetween('2021-03-01', '2016-03-01')).toBe(-1826);
    expect(compareCivilDates('2015-01-02', '2015-01-01')).toBe(1);
    expect(compareCivilDates('2015-01-01', '2015-01-01')).toBe(0);
  });

  it('rejects malformed or impossible dates', () => {
    for (const bad of ['2015-02-29', '2015-13-01', '2015-1-1', '15-01-01', '2015-04-31', '', 'x']) {
      expect(() => parseCivilDate(bad)).toThrow(TenureInputError);
    }
  });
});

describe('civilDateInKolkata (R5C)', () => {
  it('uses the Asia/Kolkata civil date, not the UTC date (UTC+05:30 boundary)', () => {
    expect(civilDateInKolkata(new Date('2026-10-06T18:29:59.999Z'))).toBe('2026-10-06');
    expect(civilDateInKolkata(new Date('2026-10-06T18:30:00.000Z'))).toBe('2026-10-07');
    // REGRESSION: the UTC date here would be 2026-10-06.
    expect(civilDateInKolkata(new Date('2026-10-06T20:00:00Z'))).toBe('2026-10-07');
    expect(civilDateInKolkata(new Date('2016-02-28T19:00:00Z'))).toBe('2016-02-29');
  });

  it('rejects an invalid instant', () => {
    expect(() => civilDateInKolkata(new Date('nope'))).toThrow(TenureInputError);
  });
});
