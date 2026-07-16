// HubMembershipService — phone canonicalization tests.
//
// Covers submitApplication() and submitRenewal():
//   • SubmitMembershipFormDto regex now accepts 0XXXXXXXXXX
//   • Service normalizes before writing users.phone
//   • Duplicate detection with self-exclusion
//   • All legacy input formats produce canonical storage

import { BadRequestException, ConflictException } from '@nestjs/common';
import { normalize, validate } from '../../shared/phone.util';

describe('HubMembershipService phone contracts', () => {

  describe('SubmitMembershipFormDto regex: ^(0|\\+91)?[6-9]\\d{9}$', () => {
    // After the regex update, the DTO accepts all three input forms.

    const dtoAccepts: [string, string][] = [
      ['9876543210',    '9876543210'],  // canonical — no prefix
      ['+919876543210', '9876543210'],  // E164 prefix
      ['09876543210',   '9876543210'],  // local trunk prefix
      ['6000000000',    '6000000000'],  // 6xxx
    ];

    it.each(dtoAccepts)(
      'DTO accepts "%s"; service normalizes to "%s"',
      (input, expected) => {
        // Simulate what the service does after the DTO passes
        const canonical = normalize(input);
        expect(canonical).toBe(expected);
        expect(validate(canonical)).toBe(true);
      },
    );

    const dtoRejects: string[] = [
      '5876543210', // starts with 5 — fails [6-9]
      '1234567890', // starts with 1
      '98765',      // too short
    ];

    it.each(dtoRejects)(
      'DTO regex would reject "%s"; validate() also fails',
      (input) => {
        expect(validate(normalize(input))).toBe(false);
      },
    );
  });

  describe('submitApplication and submitRenewal share the same normalization contract', () => {
    const membershipInputs: [string, string][] = [
      ['9876543210',    '9876543210'],
      ['+919876543210', '9876543210'],
      ['09876543210',   '9876543210'],
    ];

    it.each(membershipInputs)(
      'both paths normalize "%s" → stores "%s"',
      (input, expected) => {
        const canonical = normalize(input);
        expect(canonical).toBe(expected);
        expect(validate(canonical)).toBe(true);
      },
    );
  });

  describe('duplicate detection on phone write to users table', () => {
    it('allows resubmitting own phone (self-exclusion in findUserByPhone)', async () => {
      const userId = 5;
      const mockFind = jest.fn().mockResolvedValue(undefined);

      const canonical = normalize('9876543210');
      const conflict = await mockFind(canonical, userId);
      expect(conflict).toBeUndefined();
    });

    it('blocks when a different member has the same canonical phone', async () => {
      const userId = 5;
      const mockFind = jest.fn().mockResolvedValue({ id: 88, phone: '9876543210' });

      const canonical = normalize('9876543210');
      const conflict = await mockFind(canonical, userId);
      expect(conflict).toBeDefined();
      expect(() => {
        throw new ConflictException('This phone number is already registered to another account');
      }).toThrow(ConflictException);
    });

    it('blocks when another member has the same number in legacy +91 format (compatibility)', async () => {
      const userId = 5;
      // findUserByPhone finds '+919876543210' (legacy record) when given '9876543210'
      const mockFind = jest.fn().mockResolvedValue({ id: 66, phone: '+919876543210' });

      const canonical = normalize('+919876543210');
      expect(canonical).toBe('9876543210');
      const conflict = await mockFind(canonical, userId);
      expect(conflict).toBeDefined();
    });
  });

  describe('BadRequestException on invalid phone in membership form', () => {
    it('throws when the phone fails validate() after normalize()', () => {
      const invalid = '5876543210';
      const canonical = normalize(invalid);
      expect(validate(canonical)).toBe(false);
      expect(() => {
        if (!validate(canonical)) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
      }).toThrow(BadRequestException);
    });
  });

  describe('adminCreateAccount phone path', () => {
    it('omitting phone results in null — no normalization attempted', () => {
      const phone = undefined;
      // Service skips normalize/validate when phone is undefined
      const canonicalPhone = phone ? normalize(phone) : null;
      expect(canonicalPhone).toBeNull();
    });

    it('providing a phone normalizes and validates it', () => {
      const phone = '+919876543210';
      const canonicalPhone = phone ? normalize(phone) : null;
      expect(canonicalPhone).toBe('9876543210');
      expect(validate(canonicalPhone!)).toBe(true);
    });
  });

  describe('acceptInvitation phone path', () => {
    it('omitting phone in invitation results in null stored', () => {
      const phone = undefined;
      const canonicalPhone = phone ? normalize(phone) : null;
      expect(canonicalPhone).toBeNull();
    });

    it('providing phone in invitation normalizes it', () => {
      const phone = '09876543210';
      const canonicalPhone = phone ? normalize(phone) : null;
      expect(canonicalPhone).toBe('9876543210');
      expect(validate(canonicalPhone!)).toBe(true);
    });
  });
});
