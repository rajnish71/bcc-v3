import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateDistinctionDto, DISPLAY_CODE_PATTERN, DISTINCTION_CODE_PATTERN } from './photographic-distinctions.dto';

const make = (o: Record<string, unknown>) =>
  plainToInstance(CreateDistinctionDto, { institutionId: 1, name: 'X', badgeEligible: false, ...o });

describe('distinction code rules', () => {
  it('accepts machine-safe internal codes with underscores, rejects official punctuation there', () => {
    expect(DISTINCTION_CODE_PATTERN.test('EFIAP_D1')).toBe(true);
    expect(DISTINCTION_CODE_PATTERN.test('EFIAP/d1')).toBe(false);
    expect(DISTINCTION_CODE_PATTERN.test('gpu-cr3')).toBe(false);
  });

  it.each(['EFIAP/d1', 'MFIP (Nature)', 'GPU VIP 3', 'AV-AFIAP', 'GMPSA/B', 'HonEFIAP', 'Hon. FIP', 'Hon. MFIP (Nature)', 'EFIP/g (Nature)', 'PFIAP/b', 'GFIP/pt'])(
    'accepts official display code %s', async (displayCode) => {
      expect(await validate(make({ code: 'X_1', displayCode }))).toHaveLength(0);
    });

  it.each(['<b>', 'a;b', '/lead', ''])('rejects invalid display code %p', async (displayCode) => {
    expect((await validate(make({ code: 'X_1', displayCode }))).length).toBeGreaterThan(0);
  });

  it('display pattern is anchored', () => {
    expect(DISPLAY_CODE_PATTERN.test('EFIAP/d1')).toBe(true);
    expect(DISPLAY_CODE_PATTERN.test('x'.repeat(51))).toBe(false);
  });
});
