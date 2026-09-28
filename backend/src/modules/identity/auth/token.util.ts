// backend/src/modules/identity/auth/token.util.ts
//
// Refresh tokens are opaque random strings, NOT JWTs -- they're validated by
// DB lookup against refresh_tokens.token_hash, not by signature. Only the
// hash is ever persisted; the raw token is returned to the client once, at
// issuance, and never stored or logged in plaintext.

import { randomBytes, createHash, randomUUID } from 'crypto';

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

// OBS-03: a login mints a fresh session id; refresh rotation passes the
// existing row's session_id to inherit it. Rows created before migration
// 0100 have NULL and get a fresh id on their next rotation.
export function resolveSessionId(inherited?: string | null): string {
  return inherited ?? randomUUID();
}

export interface AccessTokenPayload {
  sub: number;
  uuid: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  // Session correlation id (OBS-03). Correlation metadata only -- grants no
  // authority and is never looked up by AccessTokenGuard. Optional because
  // access tokens issued before this change (<=15 min lifetime) lack it.
  sid?: string;
}
