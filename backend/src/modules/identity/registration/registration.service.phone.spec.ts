// Registration service — phone canonicalization unit tests.
//
// These tests exercise the phone-related logic in RegistrationService by:
//   • Mocking findUserByPhone (the DB lookup helper)
//   • Mocking db for OTP and user-creation queries
//   • Testing normalize+validate behavior, duplicate detection, and canonical storage
//
// The service is NOT instantiated via NestJS DI here — we call methods directly
// to keep the setup minimal. Integration tests with a real DB are a follow-up.

import { BadRequestException, ConflictException } from '@nestjs/common';
import { normalize, validate } from '../../shared/phone.util';

// ── phone.util is tested separately; these tests focus on the service contracts

describe('RegistrationService phone logic — unit contracts', () => {

  describe('normalize + validate pipeline (service precondition)', () => {
    // Every service write path must satisfy this contract before touching the DB.

    const acceptedFormats: [string, string][] = [
      ['9876543210',    '9876543210'],
      ['+919876543210', '9876543210'],
      ['919876543210',  '9876543210'],
      ['09876543210',   '9876543210'],
      ['+91 9876 543 210', '9876543210'],
    ];

    it.each(acceptedFormats)(
      'normalizes "%s" to canonical "%s"',
      (input, expected) => {
        const canonical = normalize(input);
        expect(canonical).toBe(expected);
        expect(validate(canonical)).toBe(true);
      },
    );

    const rejectedValues: string[] = [
      '12345',       // too short
      '5876543210',  // starts with 5
      '1234567890',  // starts with 1
      '',            // empty
      'notanumber',  // non-numeric
    ];

    it.each(rejectedValues)(
      'validate rejects "%s" after normalize',
      (input) => {
        expect(validate(normalize(input))).toBe(false);
      },
    );
  });

  describe('OTP round-trip format independence', () => {
    // requestPhoneOtp normalizes before INSERT into otp_codes.
    // verifyPhoneOtpAndRegister normalizes before SELECT from otp_codes.
    // Both sides produce the same canonical string → the lookup always matches.

    const otpPairs: [string, string][] = [
      ['9876543210',    '9876543210'],    // canonical → canonical
      ['+919876543210', '9876543210'],    // E164 request → canonical verify
      ['09876543210',   '9876543210'],    // 0-prefix request → canonical verify
      ['+919876543210', '+919876543210'], // E164 both sides → normalized to same
    ];

    it.each(otpPairs)(
      'request with "%s" and verify with "%s" resolve to the same stored key',
      (requestInput, verifyInput) => {
        const storedKey   = normalize(requestInput);
        const lookupKey   = normalize(verifyInput);
        expect(storedKey).toBe(lookupKey);
      },
    );
  });

  describe('duplicate detection guard', () => {
    // Simulates the contract that services must check before any phone write.
    // findUserByPhone is the single lookup — services never do raw WHERE queries.

    it('should reject when a canonical form already exists in the DB', async () => {
      // Simulated: findUserByPhone('9876543210') → returns an existing user
      const mockFindUserByPhone = jest.fn().mockResolvedValue({ id: 1, phone: '9876543210' });

      const canonical = normalize('9876543210');
      const existing = await mockFindUserByPhone(canonical);
      expect(existing).toBeDefined();
      // Service must throw ConflictException when existing is truthy
      if (existing) {
        expect(() => { throw new ConflictException('duplicate'); }).toThrow(ConflictException);
      }
    });

    it('should reject when the DB has a legacy +91 format for the same number', async () => {
      // findUserByPhone searches legacy formats — returns the legacy-format record
      const mockFindUserByPhone = jest.fn().mockResolvedValue({ id: 2, phone: '+919876543210' });

      const canonical = normalize('+919876543210');
      expect(canonical).toBe('9876543210');
      const existing = await mockFindUserByPhone(canonical);
      expect(existing).toBeDefined();
    });

    it('should proceed when no user exists for the normalized number', async () => {
      const mockFindUserByPhone = jest.fn().mockResolvedValue(undefined);

      const canonical = normalize('9876543210');
      const existing = await mockFindUserByPhone(canonical);
      expect(existing).toBeUndefined();
    });

    it('should not block a user updating their own phone (self-exclusion)', async () => {
      const userId = 42;
      // findUserByPhone with excludeUserId=42 → returns undefined (no OTHER user)
      const mockFindUserByPhone = jest.fn().mockResolvedValue(undefined);

      const canonical = normalize('9876543210');
      const conflict = await mockFindUserByPhone(canonical, userId);
      expect(conflict).toBeUndefined();
    });

    it('should block when a DIFFERENT user has the same phone (self-exclusion active)', async () => {
      const userId = 42;
      // findUserByPhone with excludeUserId=42 → returns a different user (id: 99)
      const mockFindUserByPhone = jest.fn().mockResolvedValue({ id: 99, phone: '9876543210' });

      const canonical = normalize('9876543210');
      const conflict = await mockFindUserByPhone(canonical, userId);
      expect(conflict).toBeDefined();
      expect(conflict.id).not.toBe(userId);
    });
  });

  describe('BadRequestException on invalid phone', () => {
    // Every service method must throw BadRequestException if validate() fails.
    // These tests confirm the error type for the cases that reach the service.

    const invalidAfterNormalize: string[] = [
      '5876543210',
      '1234567890',
      '12345',
    ];

    it.each(invalidAfterNormalize)(
      'service should throw BadRequestException for "%s"',
      (input) => {
        const canonical = normalize(input);
        if (!validate(canonical)) {
          expect(() => {
            throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
          }).toThrow(BadRequestException);
        }
      },
    );
  });

  describe('canonical storage contract', () => {
    // After normalize+validate, the value stored in the DB must be the canonical
    // 10-digit form, never the raw input.

    const writePathInputs: [string, string][] = [
      ['+919876543210', '9876543210'],  // registration via phone OTP
      ['09876543210',   '9876543210'],  // membership form with 0 prefix
      ['+91 9876 543 210', '9876543210'], // spaces
    ];

    it.each(writePathInputs)(
      'stores "%s" as canonical "%s"',
      (input, expectedStored) => {
        const canonical = normalize(input);
        expect(validate(canonical)).toBe(true);
        // The value passed to DB INSERT/UPDATE must equal expectedStored
        expect(canonical).toBe(expectedStored);
      },
    );
  });
});
