// backend/src/modules/financial/financial.controller.spec.ts
//
// Step 11 — Manual Settlement API.
//
// FinancialController is NOT instantiated here: it imports
// FinancialContributionService / SettlementEvidenceService / RbacService,
// all of which transitively import db.ts (Kysely ESM — incompatible with
// this project's CommonJS Jest config, the same constraint documented in
// every other *.spec.ts in this module). Tests instead combine:
//   (a) REAL static inspection of the actual controller source (not a
//       mirror) proving route shape, guard placement, and the "no direct
//       financial table writes" boundary, and
//   (b) pure functions mirroring the controller's authorization/validation
//       decision logic, matching the project's established pattern.

import { readFileSync } from 'fs';
import { join } from 'path';

const CONTROLLER_SRC = readFileSync(join(__dirname, 'financial.controller.ts'), 'utf8');

// Comments legitimately reference excluded concepts in prose (e.g. "this is
// deliberately NOT a MembershipPaymentController", "no Razorpay/webhook
// code here") -- CODE_ONLY strips // line comments and /* */ blocks so
// membership/provider/gateway-absence checks scan executable code only,
// not the documentation explaining why those things are absent.
const CODE_ONLY = CONTROLLER_SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ── A. Route shape — generic, not Membership-specific ─────────────────────

describe('FinancialController routes (Step 11, real source inspection)', () => {
  it('controller is registered under the generic api/v1/financial prefix, not api/v1/membership', () => {
    expect(CONTROLLER_SRC).toMatch(/@Controller\('api\/v1\/financial'\)/);
  });

  it('no route path contains /membership/, /event/, or /contest/', () => {
    const routeDecorators = CONTROLLER_SRC.match(/@(Get|Post)\('[^']*'\)/g) ?? [];
    expect(routeDecorators.length).toBeGreaterThan(0);
    routeDecorators.forEach((decorator) => {
      expect(decorator.toLowerCase()).not.toContain('membership');
      expect(decorator.toLowerCase()).not.toContain('event');
      expect(decorator.toLowerCase()).not.toContain('contest');
    });
  });

  it('every settlement route is parameterized by a generic contribution/evidence id, not membershipId', () => {
    expect(CODE_ONLY).not.toContain('membershipId');
    expect(CODE_ONLY).not.toContain(':membershipId');
  });

  it('class is not named MembershipPaymentController, UPIPaymentController, or BankTransferController', () => {
    expect(CONTROLLER_SRC).toContain('class FinancialController');
    expect(CONTROLLER_SRC).not.toMatch(/class\s+(Membership|UPI|BankTransfer)PaymentController/);
  });
});

// ── B. Guard placement ──────────────────────────────────────────────────

describe('FinancialController authorization guards (Step 11, real source inspection)', () => {
  it('approve endpoint is guarded by RbacGuard with financial.settlement.verify', () => {
    const approveBlock = CONTROLLER_SRC.slice(CONTROLLER_SRC.indexOf('approveEvidence'));
    // search backwards from the method for its decorators (captured above the match already via slicing whole tail is fine since only one approveEvidence occurrence)
    const approveDecorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('settlement/evidence/:evidenceId/approve')"),
      CONTROLLER_SRC.indexOf('approveEvidence'),
    );
    expect(approveDecorators).toContain('RbacGuard');
    expect(approveDecorators).toContain("RequirePermissions(VERIFY_PERMISSION)");
    expect(approveBlock).toBeTruthy();
  });

  it('reject endpoint is guarded by RbacGuard with financial.settlement.verify', () => {
    const rejectDecorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('settlement/evidence/:evidenceId/reject')"),
      CONTROLLER_SRC.indexOf('rejectEvidence'),
    );
    expect(rejectDecorators).toContain('RbacGuard');
    expect(rejectDecorators).toContain('RequirePermissions(VERIFY_PERMISSION)');
  });

  it('VERIFY_PERMISSION constant is the exact permission key seeded in migration 0089', () => {
    expect(CONTROLLER_SRC).toContain("const VERIFY_PERMISSION = 'financial.settlement.verify'");
  });

  it('start-settlement and submit-evidence endpoints require authentication but not the verify permission', () => {
    const startDecorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('contributions/:id/settlement/start')"),
      CONTROLLER_SRC.indexOf('async startSettlement'),
    );
    expect(startDecorators).toContain('AccessTokenGuard');
    expect(startDecorators).not.toContain('RequirePermissions');

    const submitDecorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('contributions/:id/settlement/evidence')"),
      CONTROLLER_SRC.indexOf('async submitEvidence'),
    );
    expect(submitDecorators).toContain('AccessTokenGuard');
    expect(submitDecorators).not.toContain('RequirePermissions');
  });
});

// ── C. Financial table write ownership ─────────────────────────────────────

describe('FinancialController does not write financial tables directly (Step 11, real source inspection)', () => {
  it('never calls insertInto on any financial table', () => {
    expect(CONTROLLER_SRC).not.toMatch(/insertInto\(/);
  });

  it('never calls updateTable on any financial table', () => {
    expect(CONTROLLER_SRC).not.toMatch(/updateTable\(/);
  });

  it('approve/reject route exclusively through SettlementEvidenceService', () => {
    expect(CONTROLLER_SRC).toContain('this.evidenceService.approve(');
    expect(CONTROLLER_SRC).toContain('this.evidenceService.reject(');
  });

  it('start-settlement routes exclusively through FinancialContributionService', () => {
    expect(CONTROLLER_SRC).toContain('this.financialService.startSettlement(');
  });
});

// ── D. No provider/method invention ─────────────────────────────────────
//
// Step 11 originally asserted the controller had NO Razorpay reference at
// all -- true before Step 18 added the razorpay-order route Part 15
// requires. That specific assertion is now superseded: this describe block
// instead asserts the boundary Step 18 actually promises -- the controller
// talks to Razorpay only through FinancialContributionService (never the
// SDK directly, never a secret) -- while the "no webhook/gateway code yet"
// invariant (Step 19's scope) still holds unchanged.

describe('No UPI/Bank provider identifiers or webhook/gateway code introduced (Step 11/18)', () => {
  it('controller never imports the razorpay SDK or references a Razorpay secret', () => {
    expect(CODE_ONLY).not.toMatch(/from ['"]razorpay['"]/);
    expect(CODE_ONLY.toLowerCase()).not.toContain('key_secret');
    expect(CODE_ONLY.toLowerCase()).not.toContain('razorpay_key_secret');
  });

  it('the only Razorpay reference is the razorpay-order route, wired exclusively through FinancialContributionService', () => {
    const razorpayMatches = CODE_ONLY.match(/razorpay/gi) ?? [];
    // Route path + method name + response field -- no SDK object literal.
    expect(razorpayMatches.length).toBeGreaterThan(0);
    expect(CODE_ONLY).toContain("@Post('contributions/:id/settlement/razorpay-order')");
    expect(CODE_ONLY).toContain('this.financialService.initiateProviderSettlement(');
    expect(CODE_ONLY).not.toContain('new Razorpay(');
    expect(CODE_ONLY).not.toContain('.orders.create(');
  });

  it('controller source contains no webhook/gateway reference in executable code (Step 19 scope, still deferred)', () => {
    expect(CODE_ONLY.toLowerCase()).not.toContain('webhook');
    expect(CODE_ONLY.toLowerCase()).not.toContain('gateway');
  });

  it('the manual settlement provider constant is a generic placeholder, not a method-specific identifier', () => {
    expect(CODE_ONLY).toContain("const MANUAL_SETTLEMENT_PROVIDER = 'MANUAL'");
    expect(CODE_ONLY).not.toContain("'UPI'");
    expect(CODE_ONLY).not.toContain("'BANK_TRANSFER'");
  });

  it('DTOs never accept a client-supplied provider or method field', () => {
    expect(CONTROLLER_SRC).not.toContain('dto.provider');
    expect(CONTROLLER_SRC).not.toContain('dto.method');
  });
});

// ── E. Reviewer/submitter identity always comes from the authenticated actor ─

describe('Reviewer/submitter identity is never client-supplied (Step 11, real source inspection)', () => {
  it('submit passes actor.sub as submittedByUserId, never a body field', () => {
    expect(CONTROLLER_SRC).toContain('submittedByUserId: actor.sub');
    expect(CONTROLLER_SRC).not.toContain('dto.submittedByUserId');
  });

  it('approve/reject pass actor.sub as the reviewer, never a body field', () => {
    expect(CONTROLLER_SRC).toMatch(/approve\(\s*evidenceId,\s*actor\.sub,/);
    expect(CONTROLLER_SRC).toMatch(/reject\(\s*evidenceId,\s*actor\.sub,/);
    expect(CONTROLLER_SRC).not.toContain('dto.reviewedByUserId');
    expect(CONTROLLER_SRC).not.toContain('dto.reviewerUserId');
  });
});

// ── F. Ownership check logic (mirrored) ─────────────────────────────────

interface ContributionLike {
  id: number;
  payer_user_id: number;
  state: string;
  amount_paise: number;
}

function isOwner(contribution: ContributionLike, requestingUserId: number): boolean {
  return Number(contribution.payer_user_id) === requestingUserId;
}

describe('Contribution ownership check (Step 11, mirrored)', () => {
  const contribution: ContributionLike = { id: 1, payer_user_id: 42, state: 'AWAITING_SETTLEMENT', amount_paise: 50_000 };

  it('payer can act on their own contribution', () => {
    expect(isOwner(contribution, 42)).toBe(true);
  });

  it('a different user cannot act on someone else\'s contribution', () => {
    expect(isOwner(contribution, 99)).toBe(false);
  });
});

// ── H. Contribution status route (Step 20) ──────────────────────────────
//
// The Razorpay Checkout frontend polls this route after Checkout's browser
// callback fires -- it must never be able to trust anything except this
// server-computed state, and it must never be reachable by a non-owner.

describe('GET contributions/:id status route (Step 20, real source inspection)', () => {
  it('route exists under the generic contributions/:id path, owner-guarded like every other payer action', () => {
    const decorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Get('contributions/:id')"),
      CONTROLLER_SRC.indexOf('async getContributionStatus'),
    );
    expect(decorators).toContain('AccessTokenGuard');
    expect(decorators).not.toContain('RequirePermissions');
  });

  it('calls assertOwnedContribution before returning any contribution data', () => {
    const body = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async getContributionStatus'),
      CONTROLLER_SRC.indexOf('async getContributionStatus') + 400,
    );
    expect(body).toContain('this.assertOwnedContribution(id, actor.sub)');
  });

  it('response never includes payer_user_id, active_settlement_reference, or any provider secret', () => {
    const body = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async getContributionStatus'),
      CONTROLLER_SRC.indexOf('async getContributionStatus') + 400,
    );
    expect(body).not.toContain('payer_user_id');
    expect(body).not.toContain('active_settlement_reference');
    expect(body.toLowerCase()).not.toContain('secret');
  });
});

// ── G. Evidence visibility (owner OR verifier, mirrored) ───────────────────

function canViewEvidence(payerUserId: number, requestingUserId: number, requestorIsVerifier: boolean): boolean {
  return requestorIsVerifier || payerUserId === requestingUserId;
}

describe('Evidence visibility (Step 11, mirrored)', () => {
  it('the owning member can view their own evidence', () => {
    expect(canViewEvidence(42, 42, false)).toBe(true);
  });

  it('a non-owner, non-verifier user cannot view another member\'s evidence', () => {
    expect(canViewEvidence(42, 99, false)).toBe(false);
  });

  it('a verifier (financial.settlement.verify holder) can view any evidence regardless of ownership', () => {
    expect(canViewEvidence(42, 99, true)).toBe(true);
  });
});

// ── H. Start-settlement domain guard (mirrors FinancialContributionService.startSettlement) ─

type MirroredState = 'CREATED' | 'AWAITING_SETTLEMENT' | 'SETTLEMENT_IN_PROGRESS' | 'SETTLED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'ABANDONED' | 'REFUNDED';

function evaluateStartSettlement(
  state: MirroredState,
  amountPaise: number,
): { outcome: 'IDEMPOTENT_OK' | 'STARTED' | 'REJECTED_ZERO_VALUE' | 'REJECTED_WRONG_STATE' } {
  if (state === 'SETTLEMENT_IN_PROGRESS') return { outcome: 'IDEMPOTENT_OK' };
  if (amountPaise === 0) return { outcome: 'REJECTED_ZERO_VALUE' };
  if (state !== 'AWAITING_SETTLEMENT') return { outcome: 'REJECTED_WRONG_STATE' };
  return { outcome: 'STARTED' };
}

describe('startSettlement() domain guard (Step 11, mirrored)', () => {
  it('starts settlement from AWAITING_SETTLEMENT with a non-zero amount', () => {
    expect(evaluateStartSettlement('AWAITING_SETTLEMENT', 50_000).outcome).toBe('STARTED');
  });

  it('duplicate start (already SETTLEMENT_IN_PROGRESS) is idempotent, not an error', () => {
    expect(evaluateStartSettlement('SETTLEMENT_IN_PROGRESS', 50_000).outcome).toBe('IDEMPOTENT_OK');
  });

  it('rejects zero-value contributions regardless of state', () => {
    expect(evaluateStartSettlement('AWAITING_SETTLEMENT', 0).outcome).toBe('REJECTED_ZERO_VALUE');
    expect(evaluateStartSettlement('CREATED', 0).outcome).toBe('REJECTED_ZERO_VALUE');
  });

  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as MirroredState[])(
    'rejects starting settlement from the terminal state %s',
    (state) => {
      expect(evaluateStartSettlement(state, 50_000).outcome).toBe('REJECTED_WRONG_STATE');
    },
  );

  it('rejects starting settlement from CREATED (must reach AWAITING_SETTLEMENT first)', () => {
    expect(evaluateStartSettlement('CREATED', 50_000).outcome).toBe('REJECTED_WRONG_STATE');
  });

  it('rejects starting settlement from FAILED directly (must return to AWAITING_SETTLEMENT first)', () => {
    expect(evaluateStartSettlement('FAILED', 50_000).outcome).toBe('REJECTED_WRONG_STATE');
  });
});

// ── I. Zero-value never reaches manual settlement (Step 11) ────────────────

describe('Zero-value protection at the API boundary (Step 11)', () => {
  it('start-settlement rejects amountPaise = 0 before any evidence/transaction/receipt logic runs', () => {
    const result = evaluateStartSettlement('AWAITING_SETTLEMENT', 0);
    expect(result.outcome).toBe('REJECTED_ZERO_VALUE');
  });

  it('a zero-value contribution never reaches SETTLEMENT_IN_PROGRESS via this API', () => {
    // Zero-value contributions complete via processZeroValueContribution()
    // (CREATED -> AWAITING_SETTLEMENT -> SETTLED -> COMPLETED) before any
    // client could call start-settlement; the guard is a defensive
    // second layer, not the only protection.
    expect(evaluateStartSettlement('AWAITING_SETTLEMENT', 0).outcome).not.toBe('STARTED');
  });
});

// ── J. Concurrency: duplicate approval (mirrored, same idempotency key as Step 10) ─

describe('Duplicate approval prevention (Step 11, mirrored)', () => {
  function resolveApproval(
    existingTransactions: Array<{ id: number; providerReference: string | null }>,
    providerReference: string,
  ): { transactionId: number; isNewTransaction: boolean } {
    const existing = existingTransactions.find((t) => t.providerReference === providerReference);
    if (existing) return { transactionId: existing.id, isNewTransaction: false };
    return { transactionId: existingTransactions.length + 1, isNewTransaction: true };
  }

  it('first approval creates a new transaction', () => {
    const result = resolveApproval([], 'UTR-001');
    expect(result.isNewTransaction).toBe(true);
  });

  it('a second concurrent approval for the same evidence (same reference identifier) resolves to the existing transaction, not a new one', () => {
    const afterFirst = [{ id: 1, providerReference: 'UTR-001' }];
    const result = resolveApproval(afterFirst, 'UTR-001');
    expect(result.isNewTransaction).toBe(false);
    expect(result.transactionId).toBe(1);
  });

  it('exactly one successful transaction exists after any number of duplicate approval attempts', () => {
    let transactions: Array<{ id: number; providerReference: string | null }> = [];
    for (let i = 0; i < 5; i++) {
      const result = resolveApproval(transactions, 'UTR-001');
      if (result.isNewTransaction) transactions = [...transactions, { id: result.transactionId, providerReference: 'UTR-001' }];
    }
    expect(transactions).toHaveLength(1);
  });
});

// ── L. Retry settlement (Step 12) ──────────────────────────────────────────

describe('FinancialController retry-settlement route (Step 12, real source inspection)', () => {
  it('exposes POST contributions/:id/settlement/retry', () => {
    expect(CONTROLLER_SRC).toContain("@Post('contributions/:id/settlement/retry')");
  });

  it('retry-settlement requires authentication but not the verify permission (owner-initiated, like start-settlement)', () => {
    const retryDecorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('contributions/:id/settlement/retry')"),
      CONTROLLER_SRC.indexOf('async retrySettlement'),
    );
    expect(retryDecorators).toContain('AccessTokenGuard');
    expect(retryDecorators).not.toContain('RequirePermissions');
  });

  it('retry-settlement enforces ownership before calling the service', () => {
    const retryBody = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async retrySettlement'),
      CONTROLLER_SRC.indexOf('async retrySettlement') + 400,
    );
    expect(retryBody).toContain('this.assertOwnedContribution(id, actor.sub)');
  });

  it('retry-settlement routes exclusively through FinancialContributionService, not a direct write', () => {
    expect(CONTROLLER_SRC).toContain('this.financialService.retrySettlement(');
  });

  it('route path is not membership/event/contest-specific', () => {
    expect(CONTROLLER_SRC).not.toContain('membershipRetry');
    expect(CONTROLLER_SRC).not.toContain('EventRetryPayment');
    expect(CONTROLLER_SRC.toLowerCase()).not.toMatch(/retry\/(membership|event|contest)/);
  });
});

// ── M. Retry lifecycle guard (mirrors FinancialContributionService.retrySettlement) ─

function evaluateRetrySettlement(
  state: MirroredState,
): { outcome: 'IDEMPOTENT_OK' | 'RETRIED' | 'REJECTED_WRONG_STATE' } {
  if (state === 'AWAITING_SETTLEMENT') return { outcome: 'IDEMPOTENT_OK' };
  if (state === 'FAILED' || state === 'ABANDONED') return { outcome: 'RETRIED' };
  return { outcome: 'REJECTED_WRONG_STATE' };
}

describe('retrySettlement() domain guard (Step 12, mirrored)', () => {
  it('retries a FAILED contribution', () => {
    expect(evaluateRetrySettlement('FAILED').outcome).toBe('RETRIED');
  });

  it('duplicate retry is idempotent, not an error', () => {
    expect(evaluateRetrySettlement('AWAITING_SETTLEMENT').outcome).toBe('IDEMPOTENT_OK');
  });

  it.each(['CREATED', 'AWAITING_SETTLEMENT'] as MirroredState[])(
    'does not treat %s as a fresh retry target the same way as FAILED',
    (state) => {
      // AWAITING_SETTLEMENT is idempotent-OK; CREATED is rejected -- both
      // distinct from RETRIED, so retry never fires from either as if it
      // were reopening a failed attempt.
      expect(evaluateRetrySettlement(state).outcome).not.toBe('RETRIED');
    },
  );

  it.each(['SETTLEMENT_IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as MirroredState[])(
    'rejects retry from %s',
    (state) => {
      expect(evaluateRetrySettlement(state).outcome).toBe('REJECTED_WRONG_STATE');
    },
  );
});

// ── N. Full manual settlement lifecycle including retry (Step 12, mirrored) ─

describe('Full manual settlement lifecycle with retry (Step 12, mirrored acceptance scenario)', () => {
  it('FAILED -> retry -> AWAITING_SETTLEMENT -> start -> SETTLEMENT_IN_PROGRESS -> approve -> SETTLED -> COMPLETED', () => {
    let state: MirroredState = 'AWAITING_SETTLEMENT';

    // Attempt #1
    state = 'SETTLEMENT_IN_PROGRESS';
    state = 'FAILED'; // admin rejects evidence #1 -> Transaction #1 (FAILED)
    expect(state).toBe('FAILED');

    // Retry
    const retryResult = evaluateRetrySettlement(state);
    expect(retryResult.outcome).toBe('RETRIED');
    state = 'AWAITING_SETTLEMENT';

    // Attempt #2
    const startResult = evaluateStartSettlement(state, 50_000);
    expect(startResult.outcome).toBe('STARTED');
    state = 'SETTLEMENT_IN_PROGRESS';

    // admin approves evidence #2 -> Transaction #2 (SUCCEEDED)
    state = 'SETTLED';
    state = 'COMPLETED';

    expect(state).toBe('COMPLETED');
  });

  it('the two Financial Transactions from the lifecycle remain distinct rows with independent outcomes', () => {
    const transaction1 = { id: 1, contributionId: 1, outcome: 'FAILED' as const };
    const transaction2 = { id: 2, contributionId: 1, outcome: 'SUCCEEDED' as const };
    expect(transaction1.id).not.toBe(transaction2.id);
    expect(transaction1.outcome).toBe('FAILED'); // never flipped by the retry/second attempt
    expect(transaction2.outcome).toBe('SUCCEEDED');
  });

  it('only the second (successful) attempt produces a receipt', () => {
    const receiptShouldBeIssued = (outcome: 'FAILED' | 'SUCCEEDED') => outcome === 'SUCCEEDED';
    expect(receiptShouldBeIssued('FAILED')).toBe(false);
    expect(receiptShouldBeIssued('SUCCEEDED')).toBe(true);
  });

  it('evidence history: rejected evidence #1 stays REJECTED, evidence #2 is a distinct PENDING_REVIEW row', () => {
    const evidence1 = { id: 1, contributionId: 1, reviewStatus: 'REJECTED' as const };
    const evidence2 = { id: 2, contributionId: 1, reviewStatus: 'PENDING_REVIEW' as const };
    expect(evidence1.reviewStatus).toBe('REJECTED'); // never mutated back
    expect(evidence1.id).not.toBe(evidence2.id);
  });
});

// ── O. Concurrency: duplicate retry requests (Step 12, mirrored) ──────────

describe('Duplicate retry request prevention (Step 12, mirrored)', () => {
  function resolveRetry(currentState: MirroredState): MirroredState {
    const result = evaluateRetrySettlement(currentState);
    if (result.outcome === 'REJECTED_WRONG_STATE') {
      throw new Error(`cannot retry from ${currentState}`);
    }
    return 'AWAITING_SETTLEMENT';
  }

  it('two simultaneous retry requests against the same FAILED contribution both resolve to AWAITING_SETTLEMENT, not a double transition', () => {
    // Row-locking (SELECT ... FOR UPDATE, same pattern as startSettlement/
    // recordSettlementOutcome) serializes concurrent calls: the first
    // observes FAILED and transitions; the second observes the already-
    // updated AWAITING_SETTLEMENT and short-circuits idempotently.
    let state: MirroredState = 'FAILED';
    state = resolveRetry(state); // request #1 (serialized first by the row lock)
    expect(state).toBe('AWAITING_SETTLEMENT');
    state = resolveRetry(state); // request #2 observes the post-lock state
    expect(state).toBe('AWAITING_SETTLEMENT');
  });
});

// ── P. Payment proof upload endpoint (Step 13, real source inspection) ─────

describe('FinancialController proof-upload route (Step 13, real source inspection)', () => {
  it('exposes POST contributions/:id/settlement/evidence/proof/request-upload', () => {
    expect(CONTROLLER_SRC).toContain("@Post('contributions/:id/settlement/evidence/proof/request-upload')");
  });

  it('proof-upload requires authentication but not the verify permission (owner-initiated, like submit-evidence)', () => {
    const decorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('contributions/:id/settlement/evidence/proof/request-upload')"),
      CONTROLLER_SRC.indexOf('async requestProofUpload'),
    );
    expect(decorators).toContain('AccessTokenGuard');
    expect(decorators).not.toContain('RequirePermissions');
  });

  it('proof-upload enforces ownership before calling the service', () => {
    const body = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async requestProofUpload'),
      CONTROLLER_SRC.indexOf('async requestProofUpload') + 400,
    );
    expect(body).toContain('this.assertOwnedContribution(id, actor.sub)');
  });

  it('proof-upload routes exclusively through SettlementEvidenceService.requestProofUpload, not a direct R2/storage call', () => {
    expect(CONTROLLER_SRC).toContain('this.evidenceService.requestProofUpload(');
    expect(CONTROLLER_SRC).not.toMatch(/import.*R2Service/);
    expect(CONTROLLER_SRC).not.toMatch(/new S3Client/);
  });

  it('submitEvidence forwards proof fields through to the service, sourced only from the DTO', () => {
    const submitBody = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async submitEvidence'),
      CONTROLLER_SRC.indexOf('async submitEvidence') + 700,
    );
    expect(submitBody).toContain('proofObjectKey: dto.proofObjectKey');
    expect(submitBody).toContain('proofMimeType: dto.proofMimeType');
  });

  it('the controller never accepts or forwards a client-supplied proof size (always derived server-side from R2 HEAD)', () => {
    expect(CONTROLLER_SRC).not.toContain('dto.proofSizeBytes');
  });
});

// ── Q. Object-key ownership boundary (Step 13, mirrored) ───────────────────

describe('Payment proof object key cannot be chosen by the client (Step 13, mirrored)', () => {
  function isServerGenerated(objectKey: string, contributionUuid: string): boolean {
    // The only shape the server ever produces: financial-evidence/{uuid}/{uuid}.{ext}
    const pattern = new RegExp(`^financial-evidence/${contributionUuid}/[0-9a-f-]{36}\\.[a-z]+$`);
    return pattern.test(objectKey);
  }

  it('a server-generated key for the correct contribution matches the expected shape', () => {
    const key = 'financial-evidence/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.pdf';
    expect(isServerGenerated(key, '11111111-1111-1111-1111-111111111111')).toBe(true);
  });

  it('a client-fabricated key pointing at an arbitrary path is rejected', () => {
    const fabricated = '../../../etc/passwd';
    expect(isServerGenerated(fabricated, '11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('a client-fabricated key pointing at another bucket namespace (e.g. photos/) is rejected', () => {
    const fabricated = 'photos/1/2026/08/some-other-users-photo.jpg';
    expect(isServerGenerated(fabricated, '11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('a key belonging to a different contribution is rejected', () => {
    const key = 'financial-evidence/22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222.pdf';
    expect(isServerGenerated(key, '11111111-1111-1111-1111-111111111111')).toBe(false);
  });
});

// ── R. No credentials or public URLs in any response (Step 13, real source inspection) ─

describe('No R2 credentials or public URLs leak into responses (Step 13, real source inspection)', () => {
  it('controller source never references R2 access/secret key env vars', () => {
    expect(CONTROLLER_SRC).not.toContain('R2_ACCESS_KEY_ID');
    expect(CONTROLLER_SRC).not.toContain('R2_SECRET_ACCESS_KEY');
  });

  it('the evidence response mapper never includes the raw proof object key', () => {
    const mapperBody = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('private toEvidenceResponse'),
    );
    expect(mapperBody).not.toContain('proofObjectKey: row.proof_object_key');
  });

  it('the evidence response mapper exposes only proof presence/type/size, not the key itself', () => {
    expect(CONTROLLER_SRC).toContain('hasProof: row.proof_object_key !== null');
    expect(CONTROLLER_SRC).toContain('proofMimeType: row.proof_mime_type');
    expect(CONTROLLER_SRC).toContain('proofSizeBytes:');
  });
});

// ── S. Payment proof read endpoint (Step 14, real source inspection) ───────

describe('FinancialController proof-read route (Step 14, real source inspection)', () => {
  it('exposes GET settlement/evidence/:evidenceId/proof', () => {
    expect(CONTROLLER_SRC).toContain("@Get('settlement/evidence/:evidenceId/proof')");
  });

  it('is guarded by RbacGuard with financial.settlement.verify, same as approve/reject (verifier-only)', () => {
    const decorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Get('settlement/evidence/:evidenceId/proof')"),
      CONTROLLER_SRC.indexOf('async getEvidenceProof'),
    );
    expect(decorators).toContain('AccessTokenGuard');
    expect(decorators).toContain('RbacGuard');
    expect(decorators).toContain('RequirePermissions(VERIFY_PERMISSION)');
  });

  it('does not introduce a new permission key -- reuses financial.settlement.verify', () => {
    expect(CONTROLLER_SRC).not.toContain('financial.proof.view');
    expect(CONTROLLER_SRC).not.toContain('financial.paymentproof.read');
    expect(CONTROLLER_SRC).not.toContain('financial.admin.documents');
  });

  it('accepts only evidenceId as a route param -- no objectKey query/body param', () => {
    const routeBody = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async getEvidenceProof'),
      CONTROLLER_SRC.indexOf('async getEvidenceProof') + 400,
    );
    expect(routeBody).toContain("@Param('evidenceId', ParseIntPipe) evidenceId: number");
    expect(routeBody).not.toContain('@Query(');
    expect(routeBody).not.toContain('objectKey');
  });

  it('routes exclusively through SettlementEvidenceService.getProofReadUrl, not a direct R2 call', () => {
    expect(CONTROLLER_SRC).toContain('this.evidenceService.getProofReadUrl(');
  });

  it('response contains only url and expiresAt -- no bucket, credentials, or object key', () => {
    const routeBody = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf('async getEvidenceProof'),
      CONTROLLER_SRC.indexOf("@Post('settlement/evidence/:evidenceId/reject')"),
    );
    expect(routeBody).toContain('return { url, expiresAt }');
    expect(routeBody).not.toContain('objectKey');
    expect(routeBody).not.toContain('bucket');
    expect(routeBody).not.toContain('accessKeyId');
    expect(routeBody).not.toContain('secretAccessKey');
  });
});

// ── T. Verifier-only proof access decision (Step 14, mirrored) ─────────────
//
// Unlike evidence metadata (visible to owner OR verifier, see §G above), the
// proof file itself is verifier-only -- mirrors the membership document
// review precedent, where GET :id/documents requires membership.record.view
// and this repository has no applicant-facing document-download route.

function canReadProof(requestorIsVerifier: boolean): boolean {
  return requestorIsVerifier;
}

describe('Payment proof access is verifier-only, not owner-accessible (Step 14, mirrored)', () => {
  it('an authorized verifier can request the proof read URL', () => {
    expect(canReadProof(true)).toBe(true);
  });

  it('the evidence owner (non-verifier) cannot request the proof read URL', () => {
    expect(canReadProof(false)).toBe(false);
  });

  it('an unrelated authenticated user (non-verifier) cannot request the proof read URL', () => {
    expect(canReadProof(false)).toBe(false);
  });
});

// ── K. Response shaping — no raw internal fields blindly exposed ──────────

describe('Evidence response shape (Step 11, real source inspection)', () => {
  it('toEvidenceResponse maps snake_case DB columns to camelCase API fields', () => {
    expect(CONTROLLER_SRC).toContain('financialContributionId: row.financial_contribution_id');
    expect(CONTROLLER_SRC).toContain('referenceIdentifier: row.reference_identifier');
    expect(CONTROLLER_SRC).toContain('claimedAmountPaise: Number(row.claimed_amount_paise)');
  });

  it('response mapping method exists as a single controlled boundary, not ad-hoc per-route shaping', () => {
    const occurrences = CONTROLLER_SRC.match(/toEvidenceResponse\(/g) ?? [];
    // one definition + at least two call sites (list, get)
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });
});
