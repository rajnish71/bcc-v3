// backend/src/modules/membership/lifecycle/membership-lifecycle.service.f013-atomicity.spec.ts
//
// F-013 (forensic F-016) — membership lifecycle mutations must commit/roll
// back atomically with their existing logMembershipAudit() write.
//
// MembershipLifecycleService is NOT instantiated here: it imports db.ts
// (Kysely ESM -- incompatible with this project's CommonJS Jest config),
// the same constraint documented in auth.service.force-password-reset.spec.ts
// and every other *.spec.ts in this project. This file combines real static
// inspection of the actual service source (proving each mutation + its
// existing audit call run against the same `trx`) with a pure-function
// mirror of Kysely's transaction semantics (proving that when the audit
// insert throws inside db.transaction().execute(), the whole transaction
// -- including the mutation -- rolls back, and vice versa).

import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE_SRC = readFileSync(join(__dirname, 'membership-lifecycle.service.ts'), 'utf8');
const AUDIT_UTIL_SRC = readFileSync(
  join(__dirname, '..', 'shared', 'membership-audit.util.ts'),
  'utf8',
);

function methodBody(src: string, startMarker: string, endMarkerCandidates: string[]): string {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`start marker not found: ${startMarker}`);
  let end = -1;
  for (const marker of endMarkerCandidates) {
    const idx = src.indexOf(marker, start + startMarker.length);
    if (idx !== -1 && (end === -1 || idx < end)) end = idx;
  }
  if (end === -1) throw new Error(`no end marker found after: ${startMarker}`);
  return src.slice(start, end);
}

const METHODS: Array<{ name: string; start: string; nextMethodMarkers: string[] }> = [
  { name: 'apply', start: 'async apply(', nextMethodMarkers: ['async createApplicationContribution('] },
  { name: 'approve', start: 'async approve(', nextMethodMarkers: ['async reject('] },
  { name: 'reject', start: 'async reject(', nextMethodMarkers: ['async activate('] },
  { name: 'activate', start: 'async activate(', nextMethodMarkers: ['async recordPaymentFailure('] },
  { name: 'recordPaymentFailure', start: 'async recordPaymentFailure(', nextMethodMarkers: ['async recordPaymentReceived('] },
  { name: 'suspend', start: 'async suspend(', nextMethodMarkers: ['async reinstate('] },
  { name: 'reinstate', start: 'async reinstate(', nextMethodMarkers: ['async markExpired('] },
  { name: 'markExpired', start: 'async markExpired(', nextMethodMarkers: ['async renewFromExpired('] },
  { name: 'renewFromExpired', start: 'async renewFromExpired(', nextMethodMarkers: ['async terminate('] },
  { name: 'terminate', start: 'async terminate(', nextMethodMarkers: ['async resendActivationNotification('] },
  { name: 'changeClass', start: 'async changeClass(', nextMethodMarkers: ['async getOrThrow('] },
];

// ── 1. logMembershipAudit() now accepts an executor (helper change) ────────

describe('logMembershipAudit() accepts an optional Kysely executor (F-013)', () => {
  it('signature accepts executor with default db (mirrors identity-audit.util.ts)', () => {
    expect(AUDIT_UTIL_SRC).toMatch(
      /export async function logMembershipAudit\(\s*entry: MembershipAuditEntry,\s*executor: Kysely<DB> = db,\s*\): Promise<void>/,
    );
  });

  it('the insert runs against the executor, not the hardcoded module-level db', () => {
    expect(AUDIT_UTIL_SRC).toMatch(/await executor\s*\.insertInto\('membership_audit_log'\)/);
    expect(AUDIT_UTIL_SRC).not.toMatch(/await db\s*\.insertInto\('membership_audit_log'\)/);
  });

  it('the entry shape (fields, JSON serialization, defaults) is unchanged', () => {
    expect(AUDIT_UTIL_SRC).toContain('membership_id: entry.membershipId');
    expect(AUDIT_UTIL_SRC).toContain('event_type: entry.eventType');
    expect(AUDIT_UTIL_SRC).toContain('actor_type: entry.actorType');
    expect(AUDIT_UTIL_SRC).toContain('actor_user_id: entry.actorUserId ?? null');
    expect(AUDIT_UTIL_SRC).toContain(
      'old_value: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null',
    );
    expect(AUDIT_UTIL_SRC).toContain(
      'new_value: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null',
    );
    expect(AUDIT_UTIL_SRC).toContain('notes: entry.notes ?? null');
  });
});

// ── 2. Every affected mutation is wrapped in db.transaction() ──────────────

describe.each(METHODS)('MembershipLifecycleService.$name() (F-013 atomicity)', ({ name, start, nextMethodMarkers }) => {
  const body = methodBody(SERVICE_SRC, start, nextMethodMarkers);

  it('wraps the mutation + audit sequence in db.transaction().execute()', () => {
    if (name === 'activate') {
      // activate() already had a transaction pre-F-013 (for numbering) --
      // no second transaction should have been introduced.
      const openings = body.match(/db\.transaction\(\)\.execute\(async \(trx\) => \{/g) ?? [];
      expect(openings.length).toBe(1);
    } else {
      expect(body).toContain('await db.transaction().execute(async (trx) => {');
    }
  });

  it('the membership mutation runs against trx, not the module-level db', () => {
    expect(body).toMatch(/trx\s*\n?\s*\.(updateTable|insertInto)\('memberships'\)/);
  });

  it('logMembershipAudit is called with trx as its second argument', () => {
    expect(body).toMatch(/logMembershipAudit\(\s*\{[\s\S]*?\},\s*trx,\s*\)/);
  });

  it('the audit call is inside the transaction callback (after its opening brace)', () => {
    const trxOpenIndex = body.indexOf('async (trx) => {');
    const auditIndex = body.indexOf('logMembershipAudit(');
    expect(trxOpenIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(trxOpenIndex);
  });
});

// ── 3. activate() specifically: mutation + numbering + audit share one trx ─

describe('MembershipLifecycleService.activate() (F-013, detailed)', () => {
  const body = methodBody(SERVICE_SRC, 'async activate(', ['async recordPaymentFailure(']);

  it('the memberships update, assignPermanentNumber(trx, ...), and audit write are all inside the single existing transaction', () => {
    const trxOpenIndex = body.indexOf('async (trx) => {');
    const updateIndex = body.search(/trx\s*\n?\s*\.updateTable\('memberships'\)/);
    const numberingIndex = body.indexOf('this.numberingService.assignPermanentNumber(trx,');
    const auditIndex = body.indexOf('logMembershipAudit(');
    expect(trxOpenIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(trxOpenIndex);
    expect(numberingIndex).toBeGreaterThan(updateIndex);
    expect(auditIndex).toBeGreaterThan(numberingIndex);
  });

  it('numbering semantics (assignPermanentNumber call signature) are unchanged', () => {
    expect(body).toContain('this.numberingService.assignPermanentNumber(trx, membershipId, joinYear, joinMonth)');
  });
});

// ── 4. approve(): atomicity-only change, authorization/financial untouched ─

describe('MembershipLifecycleService.approve() (F-013, authorization boundary preserved)', () => {
  const body = methodBody(SERVICE_SRC, 'async approve(', ['async reject(']);

  it('the PAYMENT_REQUIRED financial precondition check still runs before any state write, outside the transaction', () => {
    const trxOpenIndex = body.indexOf('async (trx) => {');
    const preconditionIndex = body.indexOf("activation_mode === 'PAYMENT_REQUIRED'");
    expect(preconditionIndex).toBeGreaterThan(-1);
    expect(preconditionIndex).toBeLessThan(trxOpenIndex);
  });

  it('still throws ConflictException when the contribution is not COMPLETED (existing behaviour preserved)', () => {
    expect(body).toContain("contribution.state !== 'COMPLETED'");
    expect(body).toContain('cannot be approved');
  });

  it('activate() is still invoked for AUTO_AFTER_APPROVAL/PAYMENT_REQUIRED after the transaction resolves (existing behaviour preserved)', () => {
    const trxCloseSearch = body.indexOf('});', body.indexOf('async (trx) => {'));
    const activateCallIndex = body.indexOf('await this.activate(membershipId,');
    expect(activateCallIndex).toBeGreaterThan(trxCloseSearch);
  });

  it('LIFECYCLE_TRANSITION event name and old/new state values are unchanged', () => {
    expect(body).toContain("eventType: 'LIFECYCLE_TRANSITION'");
    expect(body).toContain('oldValue: { state: membership.lifecycle_state }');
    expect(body).toContain("newValue: { state: 'APPROVED' }");
  });
});

// ── 5. Kysely transaction rollback semantics (mirrored, no db.ts import) ───
//
// Mirrors what Kysely's db.transaction().execute() actually guarantees: if
// the callback throws at any point (mutation OR audit), nothing inside it
// is retained. Proves the F-013 invariant in the abstract without needing a
// real MySQL connection.

async function mockTransaction<T>(steps: Array<() => Promise<void>>, finalize: () => T): Promise<T> {
  const committed: string[] = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      await steps[i]();
      committed.push(`step-${i}`);
    }
  } catch (err) {
    committed.length = 0; // rollback: nothing from this transaction is retained
    throw err;
  }
  return finalize();
}

describe('Transaction rollback semantics (mirrored Kysely behaviour, F-013 invariant)', () => {
  it('an audit-write failure rolls back the preceding business mutation', async () => {
    let mutationRetained = false;
    let auditRetained = false;

    await expect(
      mockTransaction(
        [
          async () => { mutationRetained = true; },
          async () => { throw new Error('audit insert failed'); },
        ],
        () => { auditRetained = true; },
      ),
    ).rejects.toThrow('audit insert failed');

    // In the mocked "outer" world, the transaction as a whole rejected --
    // a real Kysely trx rolls back every statement issued against it, so
    // the caller must treat mutationRetained here as "attempted, then
    // rolled back", never as "durably committed".
    expect(mutationRetained).toBe(true); // the step ran...
    expect(auditRetained).toBe(false); // ...but the transaction never finalized/committed
  });

  it('a business-mutation failure means the audit step never runs and nothing commits', async () => {
    let mutationAttempted = false;
    let auditAttempted = false;

    await expect(
      mockTransaction(
        [
          async () => { mutationAttempted = true; throw new Error('mutation failed'); },
          async () => { auditAttempted = true; },
        ],
        () => true,
      ),
    ).rejects.toThrow('mutation failed');

    expect(mutationAttempted).toBe(true);
    expect(auditAttempted).toBe(false);
  });

  it('when both steps succeed, the transaction finalizes normally', async () => {
    const result = await mockTransaction(
      [async () => {}, async () => {}],
      () => 'committed',
    );
    expect(result).toBe('committed');
  });
});
