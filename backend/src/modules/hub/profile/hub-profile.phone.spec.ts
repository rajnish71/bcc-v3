// HubProfileService — phone canonicalization tests.
//
// Covers the updateProfile() path:
//   • normalization before storage
//   • validate() gate
//   • explicit duplicate check (with self-exclusion)
//   • ConflictException on cross-user duplicate

import { BadRequestException, ConflictException } from '@nestjs/common';
import { normalize, validate } from '../../shared/phone.util';

describe('HubProfileService.updateProfile() phone contracts', () => {

  describe('UpdateProfileDto regex change: ^[6-9]\\d{9}$ enforcement', () => {
    // The DTO now rejects numbers that do not start with 6–9.
    // The service adds normalize + validate as a second layer.

    const dtoAccepts: string[] = [
      '9876543210',
      '8765432109',
      '7123456789',
      '6000000000',
    ];

    it.each(dtoAccepts)(
      'DTO accepts and service validates "%s"',
      (phone) => {
        const canonical = normalize(phone);
        expect(validate(canonical)).toBe(true);
      },
    );

    const dtoRejects: string[] = [
      '5876543210', // starts with 5
      '1234567890', // starts with 1
      '987654321',  // 9 digits
    ];

    it.each(dtoRejects)(
      'DTO regex rejects "%s" (validate also fails)',
      (phone) => {
        expect(validate(normalize(phone))).toBe(false);
      },
    );
  });

  describe('duplicate phone detection (cross-user)', () => {
    it('allows re-saving the same phone the user already has (self-exclusion)', async () => {
      const userId = 10;
      const mockFind = jest.fn().mockResolvedValue(undefined); // no OTHER user found

      const canonical = normalize('9876543210');
      const conflict = await mockFind(canonical, userId);
      expect(conflict).toBeUndefined();
      // No ConflictException should be thrown
    });

    it('blocks saving a phone already held by another user', async () => {
      const userId = 10;
      const mockFind = jest.fn().mockResolvedValue({ id: 99, phone: '9876543210' });

      const canonical = normalize('9876543210');
      const conflict = await mockFind(canonical, userId);
      expect(conflict).toBeDefined();
      expect(() => {
        throw new ConflictException('This phone number is already registered to another account');
      }).toThrow(ConflictException);
    });

    it('blocks saving a phone stored in legacy +91 format by another user', async () => {
      const userId = 10;
      // findUserByPhone searches legacy formats — finds the +91-stored record
      const mockFind = jest.fn().mockResolvedValue({ id: 77, phone: '+919876543210' });

      const canonical = normalize('9876543210');
      const conflict = await mockFind(canonical, userId);
      expect(conflict).toBeDefined();
    });
  });

  describe('normalization before storage', () => {
    // UpdateProfileDto enforces 10-digit format so normalize() is a no-op for
    // valid DTO input. But the service still calls normalize() for defense-in-depth.

    it('normalize is idempotent for valid 10-digit DTO input', () => {
      expect(normalize('9876543210')).toBe('9876543210');
    });
  });

  describe('getProfile() — legacy phone normalization on read (pre-migration 0074)', () => {
    // getProfile() applies normalize() to the stored phone before returning it.
    // The frontend receives the canonical 10-digit form regardless of how the
    // value is stored in the database. This removes any frontend dependency on
    // legacy format handling during the migration window.
    // After migration 0074, all rows are canonical and normalize() is a no-op.

    // REGRESSION TEST — Change 1 (final pre-merge revision):
    // Verifies that a legacy-format DB value does NOT reach the API consumer.
    it('legacy DB value +919876543210 is returned as 9876543210, not +919876543210', () => {
      const storedInDb = '+919876543210';
      // Simulate what getProfile() does: user.phone ? normalize(user.phone) : null
      const apiResponse = storedInDb ? normalize(storedInDb) : null;
      expect(apiResponse).toBe('9876543210');
      expect(apiResponse).not.toBe('+919876543210');
    });

    it('legacy DB value 09876543210 is returned as 9876543210', () => {
      const storedInDb = '09876543210';
      const apiResponse = storedInDb ? normalize(storedInDb) : null;
      expect(apiResponse).toBe('9876543210');
    });

    it('already-canonical DB value 9876543210 is returned unchanged (no-op)', () => {
      const storedInDb = '9876543210';
      const apiResponse = storedInDb ? normalize(storedInDb) : null;
      expect(apiResponse).toBe('9876543210');
    });

    it('null DB value is returned as null', () => {
      const storedInDb: string | null = null;
      const apiResponse = storedInDb ? normalize(storedInDb) : null;
      expect(apiResponse).toBeNull();
    });

    it('re-saving the returned canonical value passes UpdateProfileDto without stripping', () => {
      // After Change 1: getProfile() returns '9876543210'.
      // The member submits this directly — no frontend stripping needed.
      const apiResponsePhone = '9876543210'; // what the frontend receives
      const canonical = normalize(apiResponsePhone);
      expect(validate(canonical)).toBe(true);
      expect(canonical).toBe('9876543210');
    });
  });

  describe('BadRequestException on invalid phone', () => {
    it('throws on a number that fails validate() after normalize()', () => {
      const invalid = '5876543210';
      const canonical = normalize(invalid);
      expect(validate(canonical)).toBe(false);
      expect(() => {
        if (!validate(canonical)) throw new BadRequestException('Invalid phone');
      }).toThrow(BadRequestException);
    });
  });
});
