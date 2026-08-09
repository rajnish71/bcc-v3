// backend/src/modules/financial/settlement-evidence.spec.ts
//
// Step 10 — Manual Settlement Foundation.
//
// SettlementEvidenceService itself is NOT instantiated here: it imports
// FinancialContributionService, which imports db.ts (Kysely ESM —
// incompatible with CommonJS Jest, same constraint as
// financial-contribution.spec.ts and membership-financial.listener.spec.ts).
//
// This file covers two things the mirrored-logic tests in
// financial-contribution.spec.ts do not:
//   1. Genericity — REAL static inspection of the actual source files
//      (not a mirror) proving the Financial Engine contains no
//      Membership-specific coupling and no direct financial_transactions
//      writes outside FinancialContributionService.
//   2. Evidence submission domain rules (mirrored, matching the project's
//      established DB-adjacent testing pattern).

import { readFileSync } from 'fs';
import { join } from 'path';

const SETTLEMENT_EVIDENCE_SRC = readFileSync(join(__dirname, 'settlement-evidence.service.ts'), 'utf8');
const FINANCIAL_CONTRIBUTION_SRC = readFileSync(join(__dirname, 'financial-contribution.service.ts'), 'utf8');
const FINANCIAL_MODULE_SRC = readFileSync(join(__dirname, 'financial.module.ts'), 'utf8');
const R2_SERVICE_SRC = readFileSync(join(__dirname, '..', 'shared', 'storage', 'r2.service.ts'), 'utf8');

// ── A. Genericity: no Membership coupling ──────────────────────────────────

describe('Financial Engine genericity (Step 10, real source inspection)', () => {
  it('SettlementEvidenceService does not import anything from the membership module', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).not.toMatch(/from ['"].*\/membership\//);
  });

  it('FinancialContributionService does not import anything from the membership module', () => {
    expect(FINANCIAL_CONTRIBUTION_SRC).not.toMatch(/from ['"].*\/membership\//);
  });

  it('FinancialModule does not import anything from the membership module', () => {
    expect(FINANCIAL_MODULE_SRC).not.toMatch(/from ['"].*\/membership\//);
  });

  it('SettlementEvidenceService contains no membership-class-shaped identifiers', () => {
    const lowered = SETTLEMENT_EVIDENCE_SRC.toLowerCase();
    expect(lowered).not.toContain('membershipclassid');
    expect(lowered).not.toContain('membershipnumber');
    expect(lowered).not.toContain('activationmode');
  });
});

// ── B. No direct financial_transactions writes outside FinancialContributionService ─

describe('financial_transactions write ownership (Step 10, real source inspection)', () => {
  it('SettlementEvidenceService never inserts into financial_transactions directly', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).not.toMatch(/insertInto\(\s*['"]financial_transactions['"]/);
  });

  it('SettlementEvidenceService only reaches financial_transactions state changes via recordSettlementOutcome()', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).toContain('recordSettlementOutcome');
  });

  it('FinancialContributionService is the sole inserter of financial_transactions rows', () => {
    const matches = FINANCIAL_CONTRIBUTION_SRC.match(/insertInto\(\s*['"]financial_transactions['"]/g) ?? [];
    expect(matches.length).toBe(1); // exactly one INSERT site, inside recordSettlementOutcome()
  });
});

// ── C. No Financial Transaction UPDATE statements anywhere ─────────────────

describe('Financial Transaction immutability — no UPDATE statements exist (Step 10, real source inspection)', () => {
  it('financial-contribution.service.ts never updates financial_transactions', () => {
    expect(FINANCIAL_CONTRIBUTION_SRC).not.toMatch(/updateTable\(\s*['"]financial_transactions['"]/);
  });

  it('settlement-evidence.service.ts never updates financial_transactions', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).not.toMatch(/updateTable\(\s*['"]financial_transactions['"]/);
  });

  it('settlement-evidence.service.ts only ever updates financial_settlement_evidence (a mutable, non-canonical record)', () => {
    const matches = SETTLEMENT_EVIDENCE_SRC.match(/updateTable\(\s*['"]([a-z_]+)['"]/g) ?? [];
    matches.forEach((m) => expect(m).toContain('financial_settlement_evidence'));
  });
});

// ── D. Evidence submission domain rules (mirrored) ─────────────────────────

interface SubmitEvidenceLike {
  financialContributionId: number;
  referenceIdentifier: string;
  paymentDate: Date;
  claimedAmountPaise: number;
  submittedByUserId: number;
  proofObjectKey?: string | null;
}

describe('Settlement evidence submission shape (Step 10, mirrored)', () => {
  it('evidence references a financial_contribution_id only — no business-module FK', () => {
    const input: SubmitEvidenceLike = {
      financialContributionId: 42,
      referenceIdentifier: 'UTR-001',
      paymentDate: new Date('2026-08-01'),
      claimedAmountPaise: 50_000,
      submittedByUserId: 7,
    };
    const keys = Object.keys(input);
    expect(keys).toContain('financialContributionId');
    expect(keys).not.toContain('membershipId');
    expect(keys).not.toContain('eventId');
    expect(keys).not.toContain('contestId');
    expect(keys).not.toContain('courseId');
  });

  it('proof object key is optional — reference identifier alone is sufficient to test the workflow', () => {
    const input: SubmitEvidenceLike = {
      financialContributionId: 42,
      referenceIdentifier: 'UTR-002',
      paymentDate: new Date('2026-08-01'),
      claimedAmountPaise: 50_000,
      submittedByUserId: 7,
    };
    expect(input.proofObjectKey).toBeUndefined();
  });

  it('submission requires the contribution to be SETTLEMENT_IN_PROGRESS (mirrors submit() guard)', () => {
    function canSubmitEvidence(contributionState: string): boolean {
      return contributionState === 'SETTLEMENT_IN_PROGRESS';
    }
    expect(canSubmitEvidence('SETTLEMENT_IN_PROGRESS')).toBe(true);
    expect(canSubmitEvidence('AWAITING_SETTLEMENT')).toBe(false);
    expect(canSubmitEvidence('SETTLED')).toBe(false);
    expect(canSubmitEvidence('COMPLETED')).toBe(false);
  });
});

// ── E. Approval amount-mismatch guard (mirrored) ───────────────────────────

describe('Evidence approval amount validation (Step 10, mirrored)', () => {
  function canApprove(claimedAmountPaise: number, contributionAmountPaise: number): boolean {
    return claimedAmountPaise === contributionAmountPaise;
  }

  it('approval proceeds when claimed amount matches the contribution amount', () => {
    expect(canApprove(50_000, 50_000)).toBe(true);
  });

  it('approval is blocked when claimed amount does not match the contribution amount', () => {
    expect(canApprove(40_000, 50_000)).toBe(false);
  });
});

// ── F. Payment proof storage reuse (Step 13, real source inspection) ───────
//
// Verifies the Financial Engine reuses the EXISTING R2Service/StorageModule
// abstraction rather than inventing a Financial-specific storage adapter
// (Step 13 scope: "Do NOT create FinancialR2Service / PaymentProofStorageService").

describe('Payment proof storage reuse (Step 13, real source inspection)', () => {
  it('SettlementEvidenceService imports the existing R2Service, not a new storage class', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).toContain("from '../shared/storage/r2.service'");
  });

  it('no Financial-specific storage adapter class is defined anywhere in this file', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).not.toMatch(/class\s+(Financial|PaymentProof)(R2|Storage)Service/);
  });

  it('proof upload is presigned via the existing presignUpload() method, not a new S3/R2 client', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).toContain('this.r2.presignUpload(');
    expect(SETTLEMENT_EVIDENCE_SRC).not.toContain('new S3Client');
    expect(SETTLEMENT_EVIDENCE_SRC).not.toContain('PutObjectCommand');
  });

  it('proof existence is confirmed via the existing headObject() method', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).toContain('this.r2.headObject(');
  });

  it('submit() never trusts a client-supplied proof size -- it is always read from head.sizeBytes', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).toContain('proofSizeBytes = head.sizeBytes');
    expect(SETTLEMENT_EVIDENCE_SRC).not.toContain('input.proofSizeBytes');
  });

  it('approve() and reject() never touch proof fields -- proof is immutable once evidence is created', () => {
    const approveBody = SETTLEMENT_EVIDENCE_SRC.slice(
      SETTLEMENT_EVIDENCE_SRC.indexOf('async approve('),
      SETTLEMENT_EVIDENCE_SRC.indexOf('async reject('),
    );
    const rejectBody = SETTLEMENT_EVIDENCE_SRC.slice(SETTLEMENT_EVIDENCE_SRC.indexOf('async reject('));
    expect(approveBody).not.toContain('proof_object_key');
    expect(rejectBody).not.toContain('proof_object_key');
  });
});

// ── G. Object-key generation and namespacing (Step 13, mirrored) ───────────

describe('Payment proof object key generation (Step 13, mirrored)', () => {
  const PROOF_MIME_EXTENSIONS: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  function buildObjectKey(contributionUuid: string, uuid: string, mimeType: string): string {
    return `financial-evidence/${contributionUuid}/${uuid}.${PROOF_MIME_EXTENSIONS[mimeType]}`;
  }

  it('object key is namespaced under financial-evidence/{contribution.uuid}/', () => {
    const key = buildObjectKey('contrib-uuid-1', 'evidence-uuid-1', 'application/pdf');
    expect(key).toBe('financial-evidence/contrib-uuid-1/evidence-uuid-1.pdf');
    expect(key.startsWith('financial-evidence/contrib-uuid-1/')).toBe(true);
  });

  it('a key generated for one contribution does not match another contribution\'s namespace prefix', () => {
    const keyForA = buildObjectKey('contrib-A', 'evidence-uuid-1', 'image/jpeg');
    expect(keyForA.startsWith('financial-evidence/contrib-B/')).toBe(false);
  });

  function isKeyOwnedByContribution(objectKey: string, contributionUuid: string): boolean {
    return objectKey.startsWith(`financial-evidence/${contributionUuid}/`);
  }

  it('submit() rejects a proofObjectKey that does not belong to the target contribution', () => {
    const keyFromContributionA = buildObjectKey('contrib-A', 'evidence-1', 'image/png');
    expect(isKeyOwnedByContribution(keyFromContributionA, 'contrib-A')).toBe(true);
    expect(isKeyOwnedByContribution(keyFromContributionA, 'contrib-B')).toBe(false);
  });
});

// ── H. Payment proof upload validation (Step 13, mirrored) ─────────────────

describe('Payment proof upload validation (Step 13, mirrored)', () => {
  const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 10 * 1024 * 1024;

  function validateProofUpload(mimeType: string, sizeBytes: number): { ok: boolean; reason?: string } {
    if (!ALLOWED.includes(mimeType)) return { ok: false, reason: 'UNSUPPORTED_TYPE' };
    if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) return { ok: false, reason: 'BAD_SIZE' };
    return { ok: true };
  }

  it('accepts an allowed type within the size ceiling', () => {
    expect(validateProofUpload('application/pdf', 5 * 1024 * 1024).ok).toBe(true);
  });

  it('rejects a disallowed MIME type (e.g. an executable)', () => {
    expect(validateProofUpload('application/x-msdownload', 1024).ok).toBe(false);
  });

  it('rejects a file over the 10MB ceiling', () => {
    expect(validateProofUpload('image/png', 11 * 1024 * 1024).ok).toBe(false);
  });

  it('rejects a zero or negative size', () => {
    expect(validateProofUpload('image/png', 0).ok).toBe(false);
    expect(validateProofUpload('image/png', -1).ok).toBe(false);
  });

  it('proof upload can only be requested while the contribution is SETTLEMENT_IN_PROGRESS (mirrors requestProofUpload() guard)', () => {
    function canRequestProofUpload(contributionState: string): boolean {
      return contributionState === 'SETTLEMENT_IN_PROGRESS';
    }
    expect(canRequestProofUpload('SETTLEMENT_IN_PROGRESS')).toBe(true);
    expect(canRequestProofUpload('AWAITING_SETTLEMENT')).toBe(false);
    expect(canRequestProofUpload('COMPLETED')).toBe(false);
  });
});

// ── I. Proof optionality end-to-end (Step 13, mirrored) ────────────────────

describe('Payment proof remains optional (Step 13, mirrored)', () => {
  it('evidence with only reference/date/amount and no proof is a valid submission', () => {
    const input: SubmitEvidenceLike = {
      financialContributionId: 42,
      referenceIdentifier: 'UTR-NO-PROOF',
      paymentDate: new Date('2026-08-01'),
      claimedAmountPaise: 50_000,
      submittedByUserId: 7,
    };
    expect(input.proofObjectKey).toBeUndefined();
  });

  it('evidence with a valid proof reference is also a valid submission', () => {
    const input: SubmitEvidenceLike = {
      financialContributionId: 42,
      referenceIdentifier: 'UTR-WITH-PROOF',
      paymentDate: new Date('2026-08-01'),
      claimedAmountPaise: 50_000,
      submittedByUserId: 7,
      proofObjectKey: 'financial-evidence/contrib-uuid/evidence-uuid.pdf',
    };
    expect(input.proofObjectKey).toBeDefined();
  });

  it('approval outcome (amount match) is unaffected by whether proof was attached', () => {
    function canApprove(claimedAmountPaise: number, contributionAmountPaise: number): boolean {
      return claimedAmountPaise === contributionAmountPaise;
    }
    expect(canApprove(50_000, 50_000)).toBe(true); // same regardless of proof presence
  });
});

// ── J. Presigned read capability on R2Service (Step 14, real source inspection) ─

describe('R2Service presigned-read capability (Step 14, real source inspection)', () => {
  it('exposes presignRead() rather than a new storage class', () => {
    expect(R2_SERVICE_SRC).toContain('async presignRead(');
  });

  it('presignRead() signs a GetObjectCommand, not a new S3 client', () => {
    expect(R2_SERVICE_SRC).toContain('new GetObjectCommand(');
    expect(R2_SERVICE_SRC).toContain('getSignedUrl(client, command');
  });

  it('read TTL is short-lived and strictly less than the upload TTL', () => {
    const readTtlMatch = R2_SERVICE_SRC.match(/PRESIGN_READ_TTL_SECONDS = (\d+) \* (\d+)/);
    const uploadTtlMatch = R2_SERVICE_SRC.match(/PRESIGN_TTL_SECONDS = (\d+) \* (\d+)/);
    expect(readTtlMatch).not.toBeNull();
    expect(uploadTtlMatch).not.toBeNull();
    const readTtl = Number(readTtlMatch![1]) * Number(readTtlMatch![2]);
    const uploadTtl = Number(uploadTtlMatch![1]) * Number(uploadTtlMatch![2]);
    expect(readTtl).toBeLessThan(uploadTtl);
    expect(readTtl).toBeLessThanOrEqual(10 * 60); // no more than 10 minutes
  });

  it('presignRead() never accepts credentials or expiry from outside R2Service defaults', () => {
    const methodBody = R2_SERVICE_SRC.slice(
      R2_SERVICE_SRC.indexOf('async presignRead('),
      R2_SERVICE_SRC.indexOf('async headObject('),
    );
    expect(methodBody).not.toContain('accessKeyId');
    expect(methodBody).not.toContain('secretAccessKey');
  });
});

// ── K. Payment proof read resolution (Step 14, real source inspection) ─────

describe('SettlementEvidenceService.getProofReadUrl (Step 14, real source inspection)', () => {
  it('exists as a dedicated method, not inlined in the controller', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).toContain('async getProofReadUrl(');
  });

  it('resolves the object key from the evidence row only -- never accepts a caller-supplied key', () => {
    const methodBody = SETTLEMENT_EVIDENCE_SRC.slice(
      SETTLEMENT_EVIDENCE_SRC.indexOf('async getProofReadUrl('),
    );
    expect(methodBody).toContain('evidenceId: number');
    expect(methodBody).not.toContain('objectKey: string');
    expect(methodBody).toContain('evidence.proof_object_key');
  });

  it('re-validates the resolved key against the contribution namespace before signing', () => {
    const methodBody = SETTLEMENT_EVIDENCE_SRC.slice(
      SETTLEMENT_EVIDENCE_SRC.indexOf('async getProofReadUrl('),
    );
    expect(methodBody).toContain('expectedPrefix');
    expect(methodBody).toContain('.startsWith(expectedPrefix)');
  });

  it('confirms R2 object existence via headObject() before signing a read URL', () => {
    const methodBody = SETTLEMENT_EVIDENCE_SRC.slice(
      SETTLEMENT_EVIDENCE_SRC.indexOf('async getProofReadUrl('),
    );
    expect(methodBody).toContain('this.r2.headObject(');
    expect(methodBody).toContain('this.r2.presignRead(');
  });

  it('throws NotFoundException when evidence has no proof attached', () => {
    const methodBody = SETTLEMENT_EVIDENCE_SRC.slice(
      SETTLEMENT_EVIDENCE_SRC.indexOf('async getProofReadUrl('),
      SETTLEMENT_EVIDENCE_SRC.indexOf('const contribution', SETTLEMENT_EVIDENCE_SRC.indexOf('async getProofReadUrl(')),
    );
    expect(methodBody).toContain('!evidence.proof_object_key');
    expect(methodBody).toContain('NotFoundException');
  });

  it('does not create a new storage/download service class', () => {
    expect(SETTLEMENT_EVIDENCE_SRC).not.toMatch(/class\s+(Financial|PaymentProof)(Download|R2|Storage)Service/);
  });
});

// ── L. Proof remains readable across review states (Step 14, mirrored) ─────

describe('Proof read availability across review states (Step 14, mirrored)', () => {
  function canReadProof(reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED', hasProof: boolean): boolean {
    // getProofReadUrl() has no review_status guard -- readability depends
    // only on whether proof_object_key is set, not on review outcome.
    return hasProof;
  }

  it('proof is readable while PENDING_REVIEW', () => {
    expect(canReadProof('PENDING_REVIEW', true)).toBe(true);
  });

  it('proof remains readable after APPROVED', () => {
    expect(canReadProof('APPROVED', true)).toBe(true);
  });

  it('proof remains readable after REJECTED', () => {
    expect(canReadProof('REJECTED', true)).toBe(true);
  });

  it('getProofReadUrl() contains no review_status branch gating read access', () => {
    const methodBody = SETTLEMENT_EVIDENCE_SRC.slice(
      SETTLEMENT_EVIDENCE_SRC.indexOf('async getProofReadUrl('),
    );
    const firstBraceEnd = methodBody.indexOf('\n  }\n');
    const scoped = methodBody.slice(0, firstBraceEnd);
    expect(scoped).not.toContain('review_status');
  });
});
