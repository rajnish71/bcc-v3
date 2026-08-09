// backend/src/modules/financial/razorpay-webhook-signature.util.ts
//
// PAY-001 Step 19 — Razorpay webhook signature verification.
//
// Pure function, no db.ts dependency (unlike most of this module, so it can
// be imported directly by a Jest spec under this project's CommonJS config
// -- same rationale as razorpay-settlement.provider.ts).
//
// Algorithm per Razorpay's webhook documentation: HMAC-SHA256 over the raw
// (unparsed) request body, keyed with the webhook secret configured on the
// Razorpay dashboard, hex-encoded, compared against the X-Razorpay-Signature
// header. Comparison is constant-time (crypto.timingSafeEqual) rather than
// the Razorpay SDK's own `===` comparison, to close a timing side-channel
// the SDK helper does not address.

import { createHmac, timingSafeEqual } from 'crypto';

export function verifyRazorpaySignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const givenBuf = Buffer.from(signature, 'utf8');

  // timingSafeEqual throws on length mismatch rather than returning false --
  // guard explicitly so a malformed/short signature header is simply invalid.
  if (expectedBuf.length !== givenBuf.length) return false;

  return timingSafeEqual(expectedBuf, givenBuf);
}
