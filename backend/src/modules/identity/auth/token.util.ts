// backend/src/modules/identity/auth/token.util.ts
//
// Refresh tokens are opaque random strings, NOT JWTs -- they're validated by
// DB lookup against refresh_tokens.token_hash, not by signature. Only the
// hash is ever persisted; the raw token is returned to the client once, at
// issuance, and never stored or logged in plaintext.

import { randomBytes, createHash } from 'crypto';

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface AccessTokenPayload {
  sub: number;
  uuid: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
}
