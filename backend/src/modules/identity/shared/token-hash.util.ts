// backend/src/modules/identity/shared/token-hash.util.ts
//
// Same opaque-token-by-hash pattern as auth/token.util.ts's refresh tokens,
// generalised for the other one-time tokens in the identity domain (email
// verification, magic link, invitation). Raw token goes out in the
// email/SMS; only the hash is ever persisted.

import { randomBytes, createHash, randomInt } from 'crypto';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateNumericOtp(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(randomInt(min, max + 1));
}

// IMPORTANT: this must format using LOCAL time components (getFullYear,
// getHours, etc.), NOT toISOString() (which is always UTC). The server's
// MySQL instance runs with time_zone=SYSTEM=Asia/Kolkata (IST, UTC+5:30),
// and mysql2 reads DATETIME/TIMESTAMP values back interpreting them as the
// Node process's local time -- also IST on this box. A naive
// toISOString()-based formatter writes UTC wall-clock values into a column
// that both MySQL and the driver treat as IST wall-clock, silently shifting
// every JS-computed expiry by 5.5 hours. Caught via a phone-OTP smoke test
// reporting a freshly-issued code as already expired -- the exact same
// buggy pattern (`.toISOString().slice(0,19).replace('T',' ')`) was already
// present in the deployed AuthService (refresh token expiry, lockout
// timestamps) before this session; fixed there too, not just here.
export function toMysqlDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
