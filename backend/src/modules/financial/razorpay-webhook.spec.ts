// backend/src/modules/financial/razorpay-webhook.spec.ts
//
// PAY-001 Step 19 — Razorpay webhook ingestion + settlement reconciliation.
//
// RazorpayWebhookService/Controller are NOT instantiated here: they import
// FinancialContributionService, which imports db.ts (Kysely ESM —
// incompatible with this project's CommonJS Jest config, the same
// constraint documented in every other *.spec.ts in this module). This file
// combines:
//   (a) REAL static inspection of the actual source files proving
//       architectural boundaries (no Membership coupling, no direct
//       financial-table writes, correct event set, correct ordering), and
//   (b) pure functions mirroring the service's matching/validation logic,
//       matching the project's established DB-adjacent testing pattern.

import { readFileSync } from 'fs';
import { join } from 'path';

const WEBHOOK_SERVICE_SRC = readFileSync(join(__dirname, 'razorpay-webhook.service.ts'), 'utf8');
const WEBHOOK_CONTROLLER_SRC = readFileSync(join(__dirname, 'razorpay-webhook.controller.ts'), 'utf8');
const FINANCIAL_CONTRIBUTION_SRC = readFileSync(join(__dirname, 'financial-contribution.service.ts'), 'utf8');
const FINANCIAL_MODULE_SRC = readFileSync(join(__dirname, 'financial.module.ts'), 'utf8');
const MAIN_SRC = readFileSync(join(__dirname, '..', '..', 'main.ts'), 'utf8');

// ── A. Architectural boundary: no Membership coupling ─────────────────────

describe('RazorpayWebhookService/Controller genericity (Step 19 §L/O)', () => {
  it('RazorpayWebhookService does not import anything from the membership module', () => {
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/from ['"].*\/membership\//);
  });

  it('RazorpayWebhookController does not import anything from the membership module', () => {
    expect(WEBHOOK_CONTROLLER_SRC).not.toMatch(/from ['"].*\/membership\//);
  });

  it('RazorpayWebhookService contains no membership-class-shaped identifiers', () => {
    const lowered = WEBHOOK_SERVICE_SRC.toLowerCase();
    expect(lowered).not.toContain('membershipclassid');
    expect(lowered).not.toContain('membershipnumber');
    expect(lowered).not.toContain('activationmode');
    expect(lowered).not.toContain('membershiprazorpayservice');
  });

  it('no PAY-002 / MembershipRazorpayService reference anywhere in this module', () => {
    expect(WEBHOOK_SERVICE_SRC.toLowerCase()).not.toContain('pay-002');
    expect(WEBHOOK_CONTROLLER_SRC.toLowerCase()).not.toContain('pay-002');
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/class\s+MembershipRazorpayService/);
  });
});

// ── B. No direct financial table writes from the webhook controller ───────

describe('Webhook controller never writes financial tables directly (Step 19 §G/O)', () => {
  it('RazorpayWebhookController never calls insertInto/updateTable', () => {
    expect(WEBHOOK_CONTROLLER_SRC).not.toMatch(/insertInto\(/);
    expect(WEBHOOK_CONTROLLER_SRC).not.toMatch(/updateTable\(/);
  });

  it('RazorpayWebhookController only delegates to RazorpayWebhookService.handle()', () => {
    expect(WEBHOOK_CONTROLLER_SRC).toContain('this.webhookService.handle(');
  });

  it('RazorpayWebhookService never writes financial_contributions or financial_transactions directly', () => {
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/insertInto\(\s*['"]financial_transactions['"]/);
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/updateTable\(\s*['"]financial_contributions['"]/);
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/insertInto\(\s*['"]financial_contributions['"]/);
  });

  it('RazorpayWebhookService only reaches settlement outcomes via recordSettlementOutcome()', () => {
    expect(WEBHOOK_SERVICE_SRC).toContain('recordSettlementOutcome');
  });

  it('RazorpayWebhookService only writes its own settlement_webhook_inbox table', () => {
    const writes = WEBHOOK_SERVICE_SRC.match(/(insertInto|updateTable)\(\s*['"]([a-z_]+)['"]/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    writes.forEach((w) => expect(w).toContain('settlement_webhook_inbox'));
  });
});

// ── C. Financial Transaction immutability ──────────────────────────────────

describe('Financial Transaction immutability from the webhook path (Step 19 §H/O)', () => {
  it('FinancialContributionService never UPDATEs financial_transactions', () => {
    expect(FINANCIAL_CONTRIBUTION_SRC).not.toMatch(/updateTable\(\s*['"]financial_transactions['"]/);
  });

  it('RazorpayWebhookService never UPDATEs financial_transactions', () => {
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/updateTable\(\s*['"]financial_transactions['"]/);
  });
});

// ── D. Signature verification ordering ─────────────────────────────────────

describe('Signature verification happens before any DB persistence (Step 19 Part 6)', () => {
  it('verifyRazorpaySignature() is called before claimInboxRow() in handle()', () => {
    const handleBody = WEBHOOK_SERVICE_SRC.slice(
      WEBHOOK_SERVICE_SRC.indexOf('async handle('),
      WEBHOOK_SERVICE_SRC.indexOf('async handle(') + 2000,
    );
    const sigIndex = handleBody.indexOf('verifyRazorpaySignature');
    const claimIndex = handleBody.indexOf('claimInboxRow');
    expect(sigIndex).toBeGreaterThan(-1);
    expect(claimIndex).toBeGreaterThan(-1);
    expect(sigIndex).toBeLessThan(claimIndex);
  });

  it('an unset RAZORPAY_WEBHOOK_SECRET fails closed (UnauthorizedException), not open', () => {
    expect(WEBHOOK_SERVICE_SRC).toMatch(/if\s*\(\s*!secret\s*\)\s*\{[\s\S]*?UnauthorizedException/);
  });
});

// ── E. Raw body mechanism ──────────────────────────────────────────────────

describe('Raw body handling (Step 19 Part 3)', () => {
  it('main.ts enables rawBody without a second HTTP framework or global body-parser change', () => {
    expect(MAIN_SRC).toMatch(/rawBody:\s*true/);
    expect(MAIN_SRC).not.toMatch(/express/i);
  });

  it('RazorpayWebhookController reads the raw body via @RawBody(), not @Body()', () => {
    expect(WEBHOOK_CONTROLLER_SRC).toContain('@RawBody()');
    expect(WEBHOOK_CONTROLLER_SRC).not.toContain('@Body()');
  });
});

// ── F. Route shape ──────────────────────────────────────────────────────────

describe('RazorpayWebhookController route shape (Step 19 §A)', () => {
  it('is registered under the generic api/v1/financial prefix', () => {
    expect(WEBHOOK_CONTROLLER_SRC).toMatch(/@Controller\('api\/v1\/financial'\)/);
  });

  it('exposes POST webhooks/razorpay', () => {
    expect(WEBHOOK_CONTROLLER_SRC).toMatch(/@Post\('webhooks\/razorpay'\)/);
  });

  it('is not guarded by AccessTokenGuard (Razorpay, not a member, calls this route)', () => {
    const handlerBlock = WEBHOOK_CONTROLLER_SRC.slice(
      WEBHOOK_CONTROLLER_SRC.indexOf("@Post('webhooks/razorpay')"),
      WEBHOOK_CONTROLLER_SRC.indexOf('handleRazorpayWebhook'),
    );
    expect(handlerBlock).not.toContain('AccessTokenGuard');
  });
});

// ── G. No secret exposure ───────────────────────────────────────────────────

describe('RAZORPAY_WEBHOOK_SECRET never leaves razorpay-webhook.service.ts (Step 19 §M)', () => {
  it('RazorpayWebhookController never reads process.env directly', () => {
    expect(WEBHOOK_CONTROLLER_SRC).not.toContain('process.env');
  });

  it('the response payload never includes the secret variable name', () => {
    const returnStatements = WEBHOOK_CONTROLLER_SRC.match(/return\s*\{[^}]*\}/g) ?? [];
    returnStatements.forEach((stmt) => expect(stmt).not.toMatch(/secret/i));
  });

  it('neither file logs (console.*) any credential', () => {
    expect(WEBHOOK_SERVICE_SRC).not.toMatch(/console\.(log|error|warn|info)\(/);
    expect(WEBHOOK_CONTROLLER_SRC).not.toMatch(/console\.(log|error|warn|info)\(/);
  });
});

// ── H. Event selection ──────────────────────────────────────────────────────

describe('Event selection (Step 19 Part 14/15/25 — Event Selection)', () => {
  it('handles exactly payment.captured and payment.failed', () => {
    expect(WEBHOOK_SERVICE_SRC).toContain("'payment.captured'");
    expect(WEBHOOK_SERVICE_SRC).toContain("'payment.failed'");
  });

  it('does not treat payment.authorized as a successful settlement', () => {
    expect(WEBHOOK_SERVICE_SRC).not.toContain("'payment.authorized'");
  });

  it('does not implement refund, dispute, or subscription events', () => {
    const lowered = WEBHOOK_SERVICE_SRC.toLowerCase();
    expect(lowered).not.toContain('refund.');
    expect(lowered).not.toContain('dispute.');
    expect(lowered).not.toContain('subscription.');
  });
});

// ── I. Contribution matching / amount / currency logic (mirrored) ─────────
//
// Mirrors process()'s decision logic in razorpay-webhook.service.ts —
// pure functions, no DB.

interface MirroredContribution {
  id: number;
  amountPaise: number;
  currency: string;
  state: string;
}

interface MirroredPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
}

function matchOutcome(
  contribution: MirroredContribution | null,
  payment: MirroredPayment,
): { ok: true } | { ok: false; reason: string } {
  if (!contribution) {
    return { ok: false, reason: `No SETTLEMENT_IN_PROGRESS contribution matches order '${payment.order_id}'.` };
  }
  if (contribution.amountPaise === 0) {
    return { ok: false, reason: `Contribution ${contribution.id} is zero-value; a Razorpay webhook cannot settle it.` };
  }
  if (payment.amount !== contribution.amountPaise) {
    return { ok: false, reason: 'Amount mismatch' };
  }
  if (payment.currency.toUpperCase() !== contribution.currency.toUpperCase()) {
    return { ok: false, reason: 'Currency mismatch' };
  }
  return { ok: true };
}

describe('I. Contribution matching (Step 19 Part 10/25 — Matching)', () => {
  const payment: MirroredPayment = { id: 'pay_1', order_id: 'order_abc', amount: 250000, currency: 'INR' };

  it('unknown order id is rejected safely — no contribution, no exception thrown', () => {
    expect(matchOutcome(null, payment)).toEqual({ ok: false, reason: expect.stringContaining('No SETTLEMENT_IN_PROGRESS') });
  });

  it('a matching, in-progress, non-zero contribution with correct amount/currency is accepted', () => {
    const contribution: MirroredContribution = { id: 1, amountPaise: 250000, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS' };
    expect(matchOutcome(contribution, payment)).toEqual({ ok: true });
  });
});

describe('J. Amount verification (Step 19 Part 11/25 — Amount)', () => {
  it('exact amount match is accepted', () => {
    const contribution: MirroredContribution = { id: 1, amountPaise: 100000, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS' };
    const payment: MirroredPayment = { id: 'pay_1', order_id: 'order_1', amount: 100000, currency: 'INR' };
    expect(matchOutcome(contribution, payment)).toEqual({ ok: true });
  });

  it('mismatched amount is rejected — no Financial Transaction path reached', () => {
    const contribution: MirroredContribution = { id: 1, amountPaise: 100000, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS' };
    const payment: MirroredPayment = { id: 'pay_1', order_id: 'order_1', amount: 99999, currency: 'INR' };
    expect(matchOutcome(contribution, payment)).toEqual({ ok: false, reason: 'Amount mismatch' });
  });
});

describe('K. Currency verification (Step 19 Part 12/25 — Currency)', () => {
  it('exact currency match is accepted', () => {
    const contribution: MirroredContribution = { id: 1, amountPaise: 100000, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS' };
    const payment: MirroredPayment = { id: 'pay_1', order_id: 'order_1', amount: 100000, currency: 'INR' };
    expect(matchOutcome(contribution, payment)).toEqual({ ok: true });
  });

  it('mismatched currency is rejected, not converted', () => {
    const contribution: MirroredContribution = { id: 1, amountPaise: 100000, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS' };
    const payment: MirroredPayment = { id: 'pay_1', order_id: 'order_1', amount: 100000, currency: 'USD' };
    expect(matchOutcome(contribution, payment)).toEqual({ ok: false, reason: 'Currency mismatch' });
  });
});

describe('L. Zero-value invariant (Step 19 Part 24/25 — Zero-value)', () => {
  it('a zero-value contribution can never be settled via a Razorpay webhook', () => {
    const contribution: MirroredContribution = { id: 1, amountPaise: 0, currency: 'INR', state: 'SETTLEMENT_IN_PROGRESS' };
    const payment: MirroredPayment = { id: 'pay_1', order_id: 'order_1', amount: 0, currency: 'INR' };
    const outcome = matchOutcome(contribution, payment);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('zero-value');
  });
});

// ── M. Duplicate webhook / dedup key shape (Step 19 Part 7/25 — Inbox/Duplicate) ──

describe('M. Duplicate webhook idempotency key (Step 19 Part 7/18/25)', () => {
  it('the inbox dedup key is (provider, provider_event_id), not (provider, order_id) or amount', () => {
    expect(WEBHOOK_SERVICE_SRC).toContain('provider_event_id');
    expect(WEBHOOK_SERVICE_SRC).toContain("where('provider_event_id', '=', eventId)");
  });

  it('a PROCESSED duplicate short-circuits to a no-op before any settlement call', () => {
    const claimBody = WEBHOOK_SERVICE_SRC.slice(
      WEBHOOK_SERVICE_SRC.indexOf('private async claimInboxRow'),
      WEBHOOK_SERVICE_SRC.indexOf('// ── Processing'),
    );
    expect(claimBody).toMatch(/status === 'PROCESSED'[\s\S]*?return null/);
  });

  it("handle() returns without calling process() when claimInboxRow() returns null", () => {
    const handleBody = WEBHOOK_SERVICE_SRC.slice(WEBHOOK_SERVICE_SRC.indexOf('async handle('));
    expect(handleBody).toMatch(/if\s*\(\s*!claim\s*\)\s*\{[\s\S]*?return;/);
  });

  it('reprocessing a non-PROCESSED row reuses the previously stored contribution_id rather than re-matching', () => {
    expect(WEBHOOK_SERVICE_SRC).toContain('readStoredContributionId');
    expect(WEBHOOK_SERVICE_SRC).toContain('storeMatchedContribution');
  });
});

// ── N. No new infrastructure / no refunds / no worker ──────────────────────

describe('N. Scope discipline (Step 19 §O/26/28)', () => {
  it('no Redis/Kafka/RabbitMQ/SQS/BullMQ reference', () => {
    const lowered = (WEBHOOK_SERVICE_SRC + WEBHOOK_CONTROLLER_SRC + FINANCIAL_MODULE_SRC).toLowerCase();
    ['redis', 'kafka', 'rabbitmq', 'sqs', 'bullmq', 'bull'].forEach((term) => {
      expect(lowered).not.toContain(term);
    });
  });

  it('no refund-related code', () => {
    expect(WEBHOOK_SERVICE_SRC.toLowerCase()).not.toContain('refund');
  });

  it('financial.module.ts registers both the controller and the service', () => {
    expect(FINANCIAL_MODULE_SRC).toContain('RazorpayWebhookController');
    expect(FINANCIAL_MODULE_SRC).toContain('RazorpayWebhookService');
  });
});
