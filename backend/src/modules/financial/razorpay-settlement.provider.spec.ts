// backend/src/modules/financial/razorpay-settlement.provider.spec.ts
//
// PAY-001 Step 18 — RazorpaySettlementProvider unit tests.
//
// Unlike the other *.spec.ts files in this module, this file CAN import the
// class under test directly: razorpay-settlement.provider.ts has no
// transitive dependency on db.ts (Kysely, ESM-only) -- it only imports
// @nestjs/common and the `razorpay` SDK (CommonJS, per its package.json
// "main" field), both safe under this project's CommonJS Jest config.
// The `razorpay` SDK itself is mocked below -- no real network call ever
// happens in this suite.

import { ServiceUnavailableException } from '@nestjs/common';

const ordersCreate = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation((config: { key_id: string; key_secret: string }) => ({
    __config: config,
    orders: { create: ordersCreate },
  }));
});

import { RazorpaySettlementProvider, RAZORPAY_PROVIDER_NAME } from './razorpay-settlement.provider';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('RazorpaySettlementProvider — configuration (Step 18 Part 4/21)', () => {
  it('throws ServiceUnavailableException when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are unset', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const provider = new RazorpaySettlementProvider();

    await expect(
      provider.createOrder({
        contributionId: 1,
        amountPaise: 150000,
        currency: 'INR',
        receiptReference: 'FC-1-abc12345',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('the "not configured" error message contains no partial credential value', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const provider = new RazorpaySettlementProvider();

    try {
      await provider.createOrder({
        contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-x',
      });
      throw new Error('expected createOrder to throw');
    } catch (err) {
      expect(String((err as Error).message)).not.toMatch(/RAZORPAY_KEY_SECRET=/);
    }
  });

  it('providerName is the generic RAZORPAY tag stored on financial_transactions.provider', () => {
    const provider = new RazorpaySettlementProvider();
    expect(provider.providerName).toBe('RAZORPAY');
    expect(RAZORPAY_PROVIDER_NAME).toBe('RAZORPAY');
  });
});

describe('RazorpaySettlementProvider — order translation (Step 18 Part 6/9)', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'fake_secret_never_returned';
  });

  it('passes amountPaise through unchanged -- no INR conversion inside the provider', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKE123', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 42, amountPaise: 150000, currency: 'INR', receiptReference: 'FC-42-aaaaaaaa',
    });

    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 150000, currency: 'INR' }),
    );
  });

  it('currency comes from the contribution, not hard-coded', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKE456', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 7, amountPaise: 500, currency: 'USD', receiptReference: 'FC-7-bbbbbbbb',
    });

    expect(ordersCreate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD' }));
  });

  it('receipt is forwarded as the Business-Engine-generated reference, not re-derived by the provider', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKE789', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 9, amountPaise: 100, currency: 'INR', receiptReference: 'FC-9-ccccccccc',
    });

    expect(ordersCreate).toHaveBeenCalledWith(expect.objectContaining({ receipt: 'FC-9-ccccccccc' }));
  });

  it('metadata is forwarded as Razorpay "notes" verbatim -- no membership-specific transformation', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKE999', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 5, amountPaise: 100, currency: 'INR', receiptReference: 'FC-5-dddddddd',
      metadata: { businessModule: 'MEMBERSHIP', businessReferenceId: 12 },
    });

    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notes: { businessModule: 'MEMBERSHIP', businessReferenceId: 12 } }),
    );
  });

  it('the provider never invents/adds fields to the request beyond what it was given', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKEAAA', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-eeeeeeee',
    });

    const callArgs = ordersCreate.mock.calls[0][0];
    expect(Object.keys(callArgs).sort()).toStrictEqual(['amount', 'currency', 'notes', 'receipt'].sort());
  });

  it('returns providerOrderReference from the Razorpay order id', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_XYZ001', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    const result = await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-ffffffff',
    });

    expect(result.providerOrderReference).toBe('order_XYZ001');
    expect(result.amountPaise).toBe(100);
    expect(result.currency).toBe('INR');
  });

  it('returns the PUBLIC key id for the future checkout frontend', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_XYZ002', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    const result = await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-gggggggg',
    });

    expect(result.providerPublicKeyId).toBe('rzp_test_fake_key_id');
  });
});

describe('RazorpaySettlementProvider — secret never exposed (Step 18 Part 21/22)', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'super_secret_value_must_never_leak';
  });

  it('createOrder() result never contains the key secret in any field', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_SECRETCHECK', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    const result = await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-hhhhhhhh',
    });

    expect(JSON.stringify(result)).not.toContain('super_secret_value_must_never_leak');
  });

  it('the Razorpay order request body never contains the key secret', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_SECRETCHECK2', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-iiiiiiii',
    });

    const callArgs = ordersCreate.mock.calls[0][0];
    expect(JSON.stringify(callArgs)).not.toContain('super_secret_value_must_never_leak');
  });

  it('provider source file never logs (console.log/console.error) any credential', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src: string = require('fs').readFileSync(
      require('path').join(__dirname, 'razorpay-settlement.provider.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/console\.(log|error|warn|info)\(/);
  });
});

describe('RazorpaySettlementProvider — order-creation failure (Step 18 Part 14)', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'fake_secret';
  });

  it('propagates a Razorpay API error rather than returning a fabricated success', async () => {
    ordersCreate.mockRejectedValue(new Error('Razorpay API: authentication failed'));
    const provider = new RazorpaySettlementProvider();

    await expect(
      provider.createOrder({ contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-jjjjjjjj' }),
    ).rejects.toThrow('Razorpay API: authentication failed');
  });
});
