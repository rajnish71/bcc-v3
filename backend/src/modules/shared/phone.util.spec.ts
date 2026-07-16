import { normalize, validate, toE164, toDisplay } from './phone.util';

describe('phone.util', () => {

  // ── normalize() ──────────────────────────────────────────────────────────

  describe('normalize()', () => {
    it('passes through a canonical 10-digit number unchanged', () => {
      expect(normalize('9876543210')).toBe('9876543210');
    });

    it('handles 6xxx numbers', () => {
      expect(normalize('6000000000')).toBe('6000000000');
    });

    it('strips +91 E164 prefix', () => {
      expect(normalize('+919876543210')).toBe('9876543210');
    });

    it('strips 91 prefix without plus (12 digits starting with 91)', () => {
      expect(normalize('919876543210')).toBe('9876543210');
    });

    it('strips leading zero (local trunk prefix)', () => {
      expect(normalize('09876543210')).toBe('9876543210');
    });

    it('strips spaces from E164', () => {
      expect(normalize('+91 98765 43210')).toBe('9876543210');
    });

    it('strips hyphens from E164', () => {
      expect(normalize('+91-9876-543210')).toBe('9876543210');
    });

    it('strips spaces from 10-digit input', () => {
      expect(normalize('98765 43210')).toBe('9876543210');
    });

    it('strips parentheses and other non-digit characters', () => {
      expect(normalize('(+91) 9876-543-210')).toBe('9876543210');
    });

    it('strips space after local zero', () => {
      expect(normalize('0 9876543210')).toBe('9876543210');
    });

    it('leaves unrecognized short input unchanged (validate will reject)', () => {
      expect(normalize('12345')).toBe('12345');
    });

    it('returns empty string for all-non-digit input', () => {
      expect(normalize('abcdefghij')).toBe('');
    });

    it('does not strip a 12-digit number that does not start with 91', () => {
      // e.g. a UK mobile +447911123456 → after stripping + → 447911123456
      // Does not start with 91 so must not be stripped. validate() will reject.
      expect(normalize('+447911123456')).toBe('447911123456');
    });

    it('does not strip 11-digit number not starting with 0', () => {
      // 11 digits, starts with 9 — not a trunk prefix, pass through unchanged
      expect(normalize('98765432101')).toBe('98765432101');
    });

    it('is idempotent: normalizing an already-canonical number is a no-op', () => {
      const canonical = '9876543210';
      expect(normalize(canonical)).toBe(canonical);
      expect(normalize(normalize(canonical))).toBe(canonical);
    });
  });

  // ── validate() ───────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('accepts a valid 9xxx number', () => {
      expect(validate('9876543210')).toBe(true);
    });

    it('accepts a valid 8xxx number', () => {
      expect(validate('8765432109')).toBe(true);
    });

    it('accepts a valid 7xxx number', () => {
      expect(validate('7123456789')).toBe(true);
    });

    it('accepts a valid 6xxx number', () => {
      expect(validate('6000000000')).toBe(true);
    });

    it('rejects a number starting with 5', () => {
      expect(validate('5876543210')).toBe(false);
    });

    it('rejects a number starting with 1', () => {
      expect(validate('1234567890')).toBe(false);
    });

    it('rejects a number starting with 0', () => {
      expect(validate('0876543210')).toBe(false);
    });

    it('rejects a number that is too short (9 digits)', () => {
      expect(validate('987654321')).toBe(false);
    });

    it('rejects a number that is too long (11 digits)', () => {
      expect(validate('98765432100')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validate('')).toBe(false);
    });

    it('rejects a string with non-digit characters', () => {
      expect(validate('9876543a10')).toBe(false);
    });

    it('rejects a +91-prefixed string (not normalized)', () => {
      expect(validate('+919876543210')).toBe(false);
    });
  });

  // ── toE164() ─────────────────────────────────────────────────────────────

  describe('toE164()', () => {
    it('prepends +91 to a canonical number', () => {
      expect(toE164('9876543210')).toBe('+919876543210');
    });

    it('works for 6xxx numbers', () => {
      expect(toE164('6000000000')).toBe('+916000000000');
    });
  });

  // ── toDisplay() ───────────────────────────────────────────────────────────

  describe('toDisplay()', () => {
    it('formats a canonical number for human display', () => {
      expect(toDisplay('9876543210')).toBe('+91 98765 43210');
    });

    it('formats a 6xxx number correctly', () => {
      expect(toDisplay('6000000000')).toBe('+91 60000 00000');
    });
  });

  // ── normalize → validate pipeline ────────────────────────────────────────

  describe('normalize + validate pipeline', () => {
    const validCases: [string, string][] = [
      ['+919876543210', '9876543210'],
      ['919876543210',  '9876543210'],
      ['09876543210',   '9876543210'],
      ['+91 98765 43210', '9876543210'],
      ['9876543210',    '9876543210'],
    ];

    it.each(validCases)(
      'normalizes %s → %s and validate() returns true',
      (input, expected) => {
        const canonical = normalize(input);
        expect(canonical).toBe(expected);
        expect(validate(canonical)).toBe(true);
      },
    );

    const invalidCases: string[] = [
      '12345',
      '5876543210',
      '1234567890',
      'notanumber',
      '',
    ];

    it.each(invalidCases)(
      'normalize + validate rejects %s',
      (input) => {
        expect(validate(normalize(input))).toBe(false);
      },
    );
  });
});
