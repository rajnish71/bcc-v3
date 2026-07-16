// backend/src/modules/shared/phone-lookup.util.ts
//
// TEMPORARY COMPATIBILITY SHIM — scheduled for removal after migration 0074.
//
// Why this exists: the database may contain phone values in legacy formats
// (+91XXXXXXXXXX, 0XXXXXXXXXX) written before phone canonicalization was
// introduced. Until migration 0074 normalizes every existing row, a
// uniqueness check that only queries the canonical 10-digit form would miss
// legacy records and silently permit duplicate registrations.
//
// This file is the SINGLE location for that compatibility logic. No service
// may embed its own legacy phone lookup. All uniqueness checks route here.
//
// REMOVAL INSTRUCTIONS (run after migration 0074 is verified on production):
//   1. Delete this file.
//   2. In each caller listed below, replace `findUserByPhone(canonical)` with:
//        db.selectFrom('users').select(['id','phone'])
//          .where('phone', '=', canonical)
//          [.where('id', '!=', excludeUserId)]   ← include only if present
//          .executeTakeFirst()
//
// Callers (all must be updated on removal):
//   RegistrationService.requestPhoneOtp()
//   RegistrationService.verifyPhoneOtpAndRegister()
//   RegistrationService.adminCreateAccount()
//   RegistrationService.acceptInvitation()
//   HubProfileService.updateProfile()
//   HubMembershipService.submitApplication()
//   HubMembershipService.submitRenewal()

import { db } from '../../database/db';
import { normalize } from './phone.util';

export interface PhoneMatch {
  id: number;
  phone: string | null;
}

// Searches users by phone, matching all three legacy formats equivalent to
// the provided input. Optionally excludes one user ID — used when a member
// updates their own phone to the same number they already have (self-match
// should not be reported as a conflict).
export async function findUserByPhone(
  phoneInput: string,
  excludeUserId?: number,
): Promise<PhoneMatch | undefined> {
  const canonical = normalize(phoneInput);

  // Three forms cover: canonical (new records), +91 prefix (legacy E164),
  // leading 0 (legacy local trunk). All three are equivalent phone numbers.
  const q = db
    .selectFrom('users')
    .select(['id', 'phone'])
    .where(eb =>
      eb.or([
        eb('phone', '=', canonical),
        eb('phone', '=', `+91${canonical}`),
        eb('phone', '=', `0${canonical}`),
      ]),
    );

  if (excludeUserId !== undefined) {
    return q.where('id', '!=', excludeUserId).executeTakeFirst();
  }

  return q.executeTakeFirst();
}
