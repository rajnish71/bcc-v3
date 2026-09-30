// frontend/src/lib/razorpay-checkout.ts
//
// Browser-side Razorpay Checkout for a PAY-001 Financial Contribution.
// Promoted from the identical inline logic in hub/merchandise/index.astro and
// components/hub/MembershipApplicationFlow.astro (those remain unchanged);
// first consumer: the Activity registration page.
//
// Uses ONLY the existing PAY-001 routes (api/v1/financial/contributions/:id,
// .../settlement/retry, .../settlement/razorpay-order). Nothing here decides
// payment success: Checkout's success callback only triggers polling of the
// Contribution's authoritative state, which only the signed Razorpay webhook
// resolves server-side.

declare const Razorpay: any;

const SDK_ID = 'bcc-razorpay-sdk';

export function loadRazorpayScript(): Promise<void> {
  if (typeof Razorpay !== 'undefined') return Promise.resolve();
  const existing = document.getElementById(SDK_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('razorpay-sdk-load-failed')));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SDK_ID;
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('razorpay-sdk-load-failed'));
    document.head.appendChild(script);
  });
}

export async function getContributionState(
  apiBase: string,
  token: string,
  contributionId: number,
): Promise<string | null> {
  const res = await fetch(`${apiBase}/financial/contributions/${contributionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.state ?? null;
}

export async function pollContributionUntilResolved(
  apiBase: string,
  token: string,
  contributionId: number,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await getContributionState(apiBase, token, contributionId);
    if (state && state !== 'SETTLEMENT_IN_PROGRESS') return state;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return 'UNKNOWN';
}

export interface PayContributionOptions {
  apiBase: string;
  token: string;
  contributionId: number;
  description: string;
  onVerifying?: () => void;
}

// Opens Checkout for the Contribution and resolves with its authoritative
// PAY-001 state once Checkout reports success (after polling), or
// 'DISMISSED' if the payer closes Checkout. A FAILED/ABANDONED Contribution
// is first reopened through PAY-001's retry route (same Contribution).
// Throws if PAY-001 refuses to start settlement.
export async function payContribution(opts: PayContributionOptions): Promise<string> {
  const { apiBase, token, contributionId } = opts;
  const auth = { Authorization: `Bearer ${token}` };

  const state = await getContributionState(apiBase, token, contributionId);
  if (state === 'COMPLETED') return state;
  if (state === 'FAILED' || state === 'ABANDONED') {
    const retry = await fetch(`${apiBase}/financial/contributions/${contributionId}/settlement/retry`, {
      method: 'POST',
      headers: auth,
    });
    if (!retry.ok) throw new Error('retry-failed');
  }

  const orderRes = await fetch(
    `${apiBase}/financial/contributions/${contributionId}/settlement/razorpay-order`,
    { method: 'POST', headers: auth },
  );
  if (!orderRes.ok) throw new Error('order-failed');
  const order = await orderRes.json();
  if (!order.providerPublicKeyId) throw new Error('order-failed');

  await loadRazorpayScript();

  return new Promise<string>((resolve) => {
    let settled = false;
    const finish = (s: string) => {
      if (!settled) {
        settled = true;
        resolve(s);
      }
    };
    const rzp = new Razorpay({
      key: order.providerPublicKeyId,
      order_id: order.orderReference,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'Bhopal Camera Club',
      description: opts.description,
      handler: async () => {
        opts.onVerifying?.();
        finish(await pollContributionUntilResolved(apiBase, token, contributionId));
      },
      modal: { ondismiss: () => finish('DISMISSED') },
    });
    rzp.open();
  });
}
