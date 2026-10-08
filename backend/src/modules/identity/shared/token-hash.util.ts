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

// Formats an instant as a UTC wall-clock 'YYYY-MM-DD HH:MM:SS'. The DB pool
// (database/db.ts) runs the driver with timezone 'Z' and each connection with
// time_zone '+00:00', so UTC wall-clock text is the exact instant on every
// host regardless of the Node process TZ (TENURE-ARCH-001 WP3 timezone pin).
// Never use toISOString().slice(...) variants here: keep this the one helper.
export function toMysqlDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}
