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
const paymentsFetch = jest.fn();
const refundsFetch = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation((config: { key_id: string; key_secret: string }) => ({
    __config: config,
    orders: { create: ordersCreate },
    payments: { fetch: paymentsFetch },
    refunds: { fetch: refundsFetch },
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

  it('getPublicKeyId() lazily configures the client and returns the PUBLIC key id, without ever calling the Razorpay API', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'fake_secret';
    const provider = new RazorpaySettlementProvider();
    expect(provider.getPublicKeyId()).toBe('rzp_test_fake_key_id');
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('getPublicKeyId() throws the same "not configured" error as createOrder() when unset', () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const provider = new RazorpaySettlementProvider();
    expect(() => provider.getPublicKeyId()).toThrow(ServiceUnavailableException);
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

  it('orders are created with payment_capture: true so a successful payment auto-captures instead of sitting authorized-but-uncaptured forever', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKEBBB', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-gggggggg',
    });

    expect(ordersCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_capture: true }));
  });

  it('the provider never invents/adds fields to the request beyond what it was given', async () => {
    ordersCreate.mockResolvedValue({ id: 'order_FAKEAAA', status: 'created' });
    const provider = new RazorpaySettlementProvider();

    await provider.createOrder({
      contributionId: 1, amountPaise: 100, currency: 'INR', receiptReference: 'FC-1-eeeeeeee',
    });

    const callArgs = ordersCreate.mock.calls[0][0];
    expect(Object.keys(callArgs).sort()).toStrictEqual(
      ['amount', 'currency', 'notes', 'receipt', 'payment_capture'].sort(),
    );
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

describe('RazorpaySettlementProvider — read-only projections (reconciliation / refund re-check)', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_projection';
    process.env.RAZORPAY_KEY_SECRET = 'secret_projection';
  });

  it('fetchPayment() projects only the reconciliation fields, including the refund footprint', async () => {
    paymentsFetch.mockResolvedValue({
      id: 'pay_TfXMUcGMyRqRQh', order_id: 'order_TfXLc0jngBp5Ov', status: 'captured', amount: 1000, currency: 'INR',
      method: 'upi', captured: true, error_code: null, created_at: 1790179320, amount_refunded: 0, refund_status: null,
      vpa: 'someone@upi', email: 'member@example.com', contact: '+919999999999', notes: { a: 'b' },
      card: { last4: '1111' }, bank: 'HDFC', acquirer_data: { rrn: '123' },
    });
    const snapshot = await new RazorpaySettlementProvider().fetchPayment('pay_TfXMUcGMyRqRQh');

    expect(paymentsFetch).toHaveBeenCalledWith('pay_TfXMUcGMyRqRQh');
    expect(snapshot).toEqual({
      id: 'pay_TfXMUcGMyRqRQh', orderId: 'order_TfXLc0jngBp5Ov', status: 'captured', amountPaise: 1000, currency: 'INR',
      method: 'upi', captured: true, errorCode: null, createdAt: 1790179320, amountRefundedPaise: 0, refundStatus: null,
    });
  });

  it('fetchPayment() reports a provider-side refund', async () => {
    paymentsFetch.mockResolvedValue({
      id: 'pay_X', order_id: 'order_Y', status: 'refunded', amount: 1000, currency: 'INR', captured: true,
      amount_refunded: 1000, refund_status: 'full',
    });
    const snapshot = await new RazorpaySettlementProvider().fetchPayment('pay_X');
    expect(snapshot).toMatchObject({ status: 'refunded', amountRefundedPaise: 1000, refundStatus: 'full' });
  });

  it('fetchRefund() projects only id/payment/amount/currency/status/created and leaks nothing else', async () => {
    refundsFetch.mockResolvedValue({
      id: 'rfnd_TiE7huCUUcJfWa', payment_id: 'pay_TiE5mAvC6Eexep', amount: 1000, currency: 'INR', status: 'processed',
      created_at: 1790241231, speed_processed: 'normal', notes: { reason: 'x' }, acquirer_data: { rrn: '9' }, receipt: null,
    });
    const snapshot = await new RazorpaySettlementProvider().fetchRefund('rfnd_TiE7huCUUcJfWa');

    expect(refundsFetch).toHaveBeenCalledWith('rfnd_TiE7huCUUcJfWa');
    expect(snapshot).toEqual({
      id: 'rfnd_TiE7huCUUcJfWa', paymentId: 'pay_TiE5mAvC6Eexep', amountPaise: 1000, currency: 'INR',
      status: 'processed', createdAt: 1790241231,
    });
  });
});
