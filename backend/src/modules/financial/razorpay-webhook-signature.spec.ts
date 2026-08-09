// backend/src/modules/financial/razorpay-webhook-signature.spec.ts
//
// PAY-001 Step 19 — signature verification unit tests.
//
// verifyRazorpaySignature() has no db.ts dependency (see its own file
// header), so — unlike most of this module — it is imported and exercised
// directly here, not mirrored.

import { createHmac } from 'crypto';
import { verifyRazorpaySignature } from './razorpay-webhook-signature.util';

const SECRET = 'whsec_test_fake_webhook_secret';
const BODY = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } });

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyRazorpaySignature (Step 19 Part 6/21/25 — Signature)', () => {
  it('accepts a valid signature over the exact raw body', () => {
    expect(verifyRazorpaySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('accepts a valid signature when the raw body is supplied as a Buffer', () => {
    expect(verifyRazorpaySignature(Buffer.from(BODY, 'utf8'), sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(verifyRazorpaySignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(BODY, null, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(BODY, '', SECRET)).toBe(false);
  });

  it('rejects an invalid signature (wrong secret)', () => {
    expect(verifyRazorpaySignature(BODY, sign(BODY, 'wrong_secret'), SECRET)).toBe(false);
  });

  it('rejects a syntactically well-formed but incorrect signature', () => {
    const wrongButSameLength = sign(BODY).split('').reverse().join('');
    expect(verifyRazorpaySignature(BODY, wrongButSameLength, SECRET)).toBe(false);
  });

  it('rejects when the body is altered after signing (tamper detection)', () => {
    const validSignature = sign(BODY);
    const tamperedBody = BODY.replace('pay_1', 'pay_2');
    expect(verifyRazorpaySignature(tamperedBody, validSignature, SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(() => verifyRazorpaySignature(BODY, 'abc123', SECRET)).not.toThrow();
    expect(verifyRazorpaySignature(BODY, 'abc123', SECRET)).toBe(false);
  });

  it('is deterministic: the same body+secret always yields an acceptable signature', () => {
    const sig1 = sign(BODY);
    const sig2 = sign(BODY);
    expect(sig1).toBe(sig2);
    expect(verifyRazorpaySignature(BODY, sig1, SECRET)).toBe(true);
  });

  it('empty body still verifies correctly against its own signature', () => {
    const emptyBody = '';
    expect(verifyRazorpaySignature(emptyBody, sign(emptyBody), SECRET)).toBe(true);
    expect(verifyRazorpaySignature(emptyBody, sign(BODY), SECRET)).toBe(false);
  });
});
