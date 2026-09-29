// Stage 1 reconciliation: historical Activity date handling must never force
// false precision and must keep non-historical Activities strictly dated.

jest.mock('kysely', () => ({ sql: () => ({}) }));
jest.mock('../../database/db', () => ({ db: {} }));
jest.mock('../shared/storage/imagekit.util', () => ({ ikUrl: () => null }));
jest.mock('../shared/communication/communication.service', () => ({
  CommunicationService: class {},
}));

import { BadRequestException } from '@nestjs/common';
import { datePrecision, resolveHistoricalDate } from './events.service';

describe('resolveHistoricalDate', () => {
  it('requires an exact starts_at for a non-historical Activity', () => {
    expect(() => resolveHistoricalDate(false, {})).toThrow(BadRequestException);
    expect(resolveHistoricalDate(false, { starts_at: '2026-08-09T06:30:00Z' })).toEqual({
      starts_at: '2026-08-09T06:30:00Z',
      historical_year: null,
      historical_month: null,
    });
  });

  it('rejects historical year/month on a non-historical Activity', () => {
    expect(() =>
      resolveHistoricalDate(false, { starts_at: '2026-08-09T06:30:00Z', historical_year: 2019 }),
    ).toThrow(BadRequestException);
  });

  it('accepts year-only (approximate) date without inventing an exact date', () => {
    expect(resolveHistoricalDate(true, { historical_year: 2019 })).toEqual({
      starts_at: null,
      historical_year: 2019,
      historical_month: null,
    });
  });

  it('accepts year+month and a fully unknown date', () => {
    expect(resolveHistoricalDate(true, { historical_year: 2019, historical_month: 11 })).toEqual({
      starts_at: null,
      historical_year: 2019,
      historical_month: 11,
    });
    expect(resolveHistoricalDate(true, {})).toEqual({
      starts_at: null,
      historical_year: null,
      historical_month: null,
    });
  });

  it('rejects a month without a year', () => {
    expect(() => resolveHistoricalDate(true, { historical_month: 3 })).toThrow(BadRequestException);
  });

  it('exact date wins and clears partial fields (single source of truth)', () => {
    expect(
      resolveHistoricalDate(true, {
        starts_at: '2019-11-03T00:00:00Z',
        historical_year: 2019,
        historical_month: 11,
      }),
    ).toEqual({ starts_at: '2019-11-03T00:00:00Z', historical_year: null, historical_month: null });
  });
});

describe('datePrecision', () => {
  it('derives precision from stored fields', () => {
    expect(datePrecision({ starts_at: new Date() })).toBe('EXACT');
    expect(datePrecision({ starts_at: null, historical_year: 2019, historical_month: 11 })).toBe('MONTH');
    expect(datePrecision({ starts_at: null, historical_year: 2019, historical_month: null })).toBe('YEAR');
    expect(datePrecision({ starts_at: null, historical_year: null, historical_month: null })).toBe('UNKNOWN');
  });
});
