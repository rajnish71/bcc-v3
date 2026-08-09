// backend/src/modules/financial/financial-contribution.service.ts
//
// Financial Engine — Financial Contribution lifecycle.
// Owns: Contributions, Transactions, Receipts (PAY-001 §OWNERSHIP MATRIX).
// Business Modules interact via FinancialObligationInput and Financial Engine Events.
// No Business-Module-specific logic lives here; the engine is entirely generic.

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import { db, type DB } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import {
  ALLOWED_TRANSITIONS,
  CANCELLABLE_CONTRIBUTION_STATES,
  type ContributionState,
  type FinancialObligationInput,
  type SettlementOutcomeInput,
} from './financial.types';
import {
  FINANCIAL_EVENT_TYPES,
  STATE_TRANSITION_EVENTS,
  type FinancialEngineEventPayload,
  type FinancialEventType,
} from './financial.events';
import { FinancialEventBus } from './financial-event-bus.service';
import {
  SETTLEMENT_PROVIDER,
  type SettlementProvider,
} from './settlement-provider.interface';

// A committed-but-not-yet-published Business Event: the outbox row that
// backs it (for marking dispatched_at) plus the canonical payload to hand
// to FinancialEventBus. Returned up out of a transaction so publication can
// happen strictly after that transaction's COMMIT (PAY-001 Step 17 §invariant).
interface PendingFinancialEvent {
  outboxId: number;
  payload: FinancialEngineEventPayload;
}

@Injectable()
export class FinancialContributionService {
  constructor(
    private readonly eventBus: FinancialEventBus,
    @Inject(SETTLEMENT_PROVIDER) private readonly provider: SettlementProvider,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async createContribution(
    obligation: FinancialObligationInput,
  ): Promise<{ id: number; uuid: string }> {
    if (obligation.amountPaise < 0) {
      throw new BadRequestException('Contribution amount cannot be negative.');
    }

    let pending: PendingFinancialEvent | null = null;

    const created = await db.transaction().execute(async (trx) => {
      // Idempotency check (PAY-001 Principle 7): if this key already exists,
      // return the existing contribution — but only if the obligation data matches.
      const existing = await trx
        .selectFrom('financial_contributions')
        .select(['id', 'uuid', 'business_module', 'business_reference_id', 'amount_paise'])
        .where('idempotency_key', '=', obligation.idempotencyKey)
        .executeTakeFirst();

      if (existing) {
        if (
          String(existing.business_module) !== obligation.businessModule ||
          Number(existing.business_reference_id) !== obligation.businessReferenceId ||
          Number(existing.amount_paise) !== obligation.amountPaise
        ) {
          throw new ConflictException(
            `Idempotency key '${obligation.idempotencyKey}' already references a different obligation.`,
          );
        }
        // Already created (and its CONTRIBUTION_CREATED event already
        // published on the original call) — no new outbox row, no re-emit.
        return { id: Number(existing.id), uuid: existing.uuid };
      }

      const uuid = randomUUID();
      const currency = obligation.currency ?? 'INR';
      const result = await trx
        .insertInto('financial_contributions')
        .values({
          uuid,
          payer_user_id: obligation.payerUserId,
          business_module: obligation.businessModule,
          business_reference_id: obligation.businessReferenceId,
          purpose: obligation.purpose,
          amount_paise: obligation.amountPaise,
          currency,
          idempotency_key: obligation.idempotencyKey,
          expires_at: obligation.expiresAt ? toMysqlDatetime(obligation.expiresAt) : null,
        })
        .executeTakeFirstOrThrow();

      const id = Number(result.insertId);

      pending = await this.insertOutboxRow(trx, {
        eventType: FINANCIAL_EVENT_TYPES.CONTRIBUTION_CREATED,
        contributionId: id,
        businessModule: obligation.businessModule,
        businessReferenceId: obligation.businessReferenceId,
        amountPaise: obligation.amountPaise,
        currency,
        contributionState: 'CREATED',
      });

      return { id, uuid };
    });

    // Only after COMMIT: the durable outbox row for CONTRIBUTION_CREATED
    // now exists (or this was an idempotent replay and there is nothing to
    // publish) — publish to the in-process bus.
    if (pending) await this.publishPending([pending]);

    return created;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  // executor defaults to the module-level `db` for all pre-existing callers;
  // recordSettlementOutcome() passes its transaction handle so the read
  // participates in the same locked transaction (Kysely's Transaction<DB>
  // is itself a Kysely<DB>, so this is a source-compatible widening, not a
  // behaviour change for any existing call site).
  async getContribution(id: number, executor: Kysely<DB> = db) {
    const row = await executor
      .selectFrom('financial_contributions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) throw new NotFoundException(`Financial contribution ${id} not found.`);
    return row;
  }

  // Resolves a Settlement Provider order reference (e.g. a Razorpay order
  // id) back to the Financial Contribution whose CURRENT settlement attempt
  // it belongs to (PAY-001 Step 19 §CONTRIBUTION MATCHING). Scoped to
  // SETTLEMENT_IN_PROGRESS, matching active_settlement_reference's own
  // documented meaning (financial-contribution.service.ts applyTransition()
  // clears it the moment an attempt resolves) -- a webhook must never be
  // allowed to attach itself to a reference left over from a prior,
  // already-resolved attempt. Returns undefined (not an exception) when
  // nothing matches -- callers (a webhook handler) decide how to record
  // that safely rather than treating "unmatched" as an application error.
  async findContributionByActiveSettlementReference(providerOrderReference: string) {
    return db
      .selectFrom('financial_contributions')
      .selectAll()
      .where('active_settlement_reference', '=', providerOrderReference)
      .where('state', '=', 'SETTLEMENT_IN_PROGRESS')
      .executeTakeFirst();
  }

  // Looks up the Financial Contribution created for a given Business Module
  // obligation (Step 20: lets a Business Module's own read APIs -- e.g.
  // HubMembershipController's application/renewal prefill -- surface
  // "payment required" + the contribution id without depending on the
  // Business Module's own nullable pending_contribution_id column, which
  // membership-lifecycle.service.ts already clears back to null on
  // SETTLEMENT_FAILED (recordPaymentFailure()) even though the Contribution
  // itself is still retryable. createContribution()'s idempotency_key is
  // deterministic per (businessModule, businessReferenceId) obligation, so
  // there is at most one row per pair -- ORDER BY + LIMIT 1 is defensive,
  // not load-bearing. Read-only; never used by any state-machine path.
  async findLatestForBusinessReference(businessModule: string, businessReferenceId: number) {
    return db
      .selectFrom('financial_contributions')
      .selectAll()
      .where('business_module', '=', businessModule)
      .where('business_reference_id', '=', businessReferenceId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  // ── State machine ─────────────────────────────────────────────────────────

  // Transitions a contribution to a new state, validating the move against
  // ALLOWED_TRANSITIONS, writing to the DB, and durably recording the
  // corresponding PAY-001 Business Event in the same transaction as the
  // state write. All state changes must go through this method except
  // cancelContribution (which also writes cancellation_reason and has no
  // PAY-001 Business Event).
  //
  // Two calling shapes, both transactionally safe:
  //  • Called with an explicit `executor` (a caller-managed trx): the state
  //    write + outbox row happen inside the caller's transaction; the
  //    caller receives the PendingFinancialEvent and is responsible for
  //    publishing it via publishPending() AFTER its own transaction commits.
  //  • Called with the default `db` (no caller transaction, e.g. the
  //    zero-value path's three sequential calls, or Membership calling in
  //    directly): this method opens and commits its own single-purpose
  //    transaction, then publishes immediately after that commit.
  async transitionContribution(
    id: number,
    newState: ContributionState,
    executor: Kysely<DB> = db,
  ): Promise<PendingFinancialEvent | null> {
    if (executor === db) {
      let pending: PendingFinancialEvent | null = null;
      await db.transaction().execute(async (trx) => {
        pending = await this.applyTransition(id, newState, trx);
      });
      if (pending) await this.publishPending([pending]);
      return pending;
    }
    return this.applyTransition(id, newState, executor);
  }

  // Does the actual guarded state write + outbox insert, using whatever
  // executor (trx) it is given. Never publishes — that only happens after
  // the caller's transaction has committed.
  private async applyTransition(
    id: number,
    newState: ContributionState,
    executor: Kysely<DB>,
  ): Promise<PendingFinancialEvent | null> {
    const contribution = await this.getContribution(id, executor);
    const currentState = contribution.state as ContributionState;

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!(allowed as readonly ContributionState[]).includes(newState)) {
      throw new ConflictException(
        `Contribution ${id}: transition '${currentState}' → '${newState}' is not permitted. ` +
        `Allowed from '${currentState}': ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}.`,
      );
    }

    // active_settlement_reference (PAY-001 Step 18) is only meaningful while
    // SETTLEMENT_IN_PROGRESS -- clear it the moment that attempt resolves
    // (to SETTLED/FAILED/ABANDONED), so a future retry's fresh attempt can
    // never inherit a stale provider order reference from this one.
    const leavingSettlementInProgress = currentState === 'SETTLEMENT_IN_PROGRESS';

    await executor
      .updateTable('financial_contributions')
      .set({
        state: newState,
        ...(leavingSettlementInProgress ? { active_settlement_reference: null } : {}),
      })
      .where('id', '=', id)
      .execute();

    const eventType = STATE_TRANSITION_EVENTS[newState];
    if (!eventType) return null;

    return this.insertOutboxRow(executor, {
      eventType,
      contributionId: id,
      businessModule: String(contribution.business_module),
      businessReferenceId: Number(contribution.business_reference_id),
      amountPaise: Number(contribution.amount_paise),
      currency: String(contribution.currency),
      contributionState: newState,
    });
  }

  // Cancellation is initiated by the Business Module; executed by the
  // Financial Engine (PAY-001 §OWNERSHIP MATRIX). Handles cancellation_reason
  // separately from transitionContribution since it writes an extra column.
  async cancelContribution(id: number, reason: string): Promise<void> {
    const contribution = await this.getContribution(id);

    if (!(CANCELLABLE_CONTRIBUTION_STATES as readonly ContributionState[]).includes(
      contribution.state as ContributionState,
    )) {
      throw new ConflictException(
        `Contribution ${id} in state '${contribution.state}' cannot be cancelled. ` +
        `Cancellable states: ${CANCELLABLE_CONTRIBUTION_STATES.join(', ')}.`,
      );
    }

    await db
      .updateTable('financial_contributions')
      .set({ state: 'CANCELLED', cancellation_reason: reason })
      .where('id', '=', id)
      .execute();
    // CANCELLED has no PAY-001 canonical Business Event; no emit.
  }

  // ── Zero-value path ───────────────────────────────────────────────────────

  // Processes a zero-value contribution to Completed without any Settlement
  // Provider, Financial Transaction, or Receipt (frozen zero-value rule).
  //
  // Lifecycle:  CREATED → AWAITING_SETTLEMENT → SETTLED → COMPLETED
  // Events:     CONTRIBUTION_CREATED (already emitted) →
  //             AWAITING_SETTLEMENT → SETTLEMENT_COMPLETED → CONTRIBUTION_COMPLETED
  //
  // No Financial Transaction is created — zero-value bypasses Settlement.
  // No Receipt is issued — receipts are for monetary transactions only.
  // No gateway is contacted.
  async processZeroValueContribution(id: number): Promise<void> {
    const contribution = await this.getContribution(id);

    if (Number(contribution.amount_paise) !== 0) {
      throw new ConflictException(
        `Contribution ${id} has amount ${contribution.amount_paise} paise. ` +
        `Only zero-value contributions can use this path.`,
      );
    }

    const currentState = contribution.state as ContributionState;
    if (currentState !== 'CREATED' && currentState !== 'AWAITING_SETTLEMENT') {
      throw new ConflictException(
        `Zero-value processing requires state CREATED or AWAITING_SETTLEMENT; ` +
        `found '${currentState}'.`,
      );
    }

    // Transition to AWAITING_SETTLEMENT if not already there.
    if (currentState === 'CREATED') {
      await this.transitionContribution(id, 'AWAITING_SETTLEMENT');
    }

    // Bypass Settlement Provider — transition directly to SETTLED.
    await this.transitionContribution(id, 'SETTLED');

    // Lifecycle complete: Business Module can now respond to CONTRIBUTION_COMPLETED.
    await this.transitionContribution(id, 'COMPLETED');
  }

  // ── Start settlement (Step 11: manual settlement API) ───────────────────────
  //
  // Generic entry point into manual (or, in a future step, gateway) Settlement.
  // Moves a Contribution from AWAITING_SETTLEMENT to SETTLEMENT_IN_PROGRESS --
  // the state SettlementEvidenceService.submit() requires before it will
  // accept evidence. Row-locked for the same reason as recordSettlementOutcome().
  //
  // Explicitly rejects zero-value (PAY-001 Principle 12: zero-value bypasses
  // Settlement entirely via processZeroValueContribution(), never enters
  // SETTLEMENT_IN_PROGRESS) and any state other than AWAITING_SETTLEMENT --
  // including all four terminal states (COMPLETED, CANCELLED, EXPIRED,
  // REFUNDED), which ALLOWED_TRANSITIONS already forbids, but this method
  // surfaces a clear, settlement-specific error rather than the generic
  // transition-table message.
  //
  // Idempotent: a Contribution already SETTLEMENT_IN_PROGRESS returns
  // successfully rather than erroring -- a duplicate "start" request (e.g.
  // a client retry) is a no-op, not a failure.
  async startSettlement(contributionId: number): Promise<{ contributionState: ContributionState }> {
    let pending: PendingFinancialEvent | null = null;

    const result = await db.transaction().execute(async (trx) => {
      const contribution = await trx
        .selectFrom('financial_contributions')
        .selectAll()
        .where('id', '=', contributionId)
        .forUpdate()
        .executeTakeFirst();
      if (!contribution) {
        throw new NotFoundException(`Financial contribution ${contributionId} not found.`);
      }
      const currentState = contribution.state as ContributionState;

      if (currentState === 'SETTLEMENT_IN_PROGRESS') {
        return { contributionState: currentState };
      }

      if (Number(contribution.amount_paise) === 0) {
        throw new ConflictException(
          `Contribution ${contributionId} has amount 0; zero-value contributions settle automatically ` +
          `via processZeroValueContribution() and never enter manual settlement.`,
        );
      }

      if (currentState !== 'AWAITING_SETTLEMENT') {
        throw new ConflictException(
          `Contribution ${contributionId} is in state '${currentState}'; settlement can only be started ` +
          `from AWAITING_SETTLEMENT.`,
        );
      }

      pending = await this.transitionContribution(contributionId, 'SETTLEMENT_IN_PROGRESS', trx);
      return { contributionState: 'SETTLEMENT_IN_PROGRESS' as ContributionState };
    });

    // Only after COMMIT — see class-level note on transitionContribution().
    if (pending) await this.publishPending([pending]);
    return result;
  }

  // ── Provider settlement order initiation (Step 18: Razorpay) ────────────────
  //
  // Connects the existing startSettlement() flow to a Settlement Provider
  // for positive-value Contributions. This is ADDITIVE to the manual
  // UPI/bank-transfer path (SettlementEvidenceService): both share the same
  // AWAITING_SETTLEMENT → SETTLEMENT_IN_PROGRESS transition via
  // startSettlement(), which is reused unchanged here.
  //
  // What this method does NOT do (PAY-001 Step 18 §STATE SEMANTICS):
  //  • It never marks the Contribution SETTLED or COMPLETED. Creating a
  //    provider order means "settlement initiated", not "settlement
  //    succeeded" -- only recordSettlementOutcome() (called from a future
  //    webhook handler, Step 19) may make that claim.
  //  • It never writes financial_transactions. A Financial Transaction
  //    represents an already-known outcome (PAY-001 Principle 10); order
  //    creation has no outcome yet.
  //  • It never holds a MySQL transaction open across the network call to
  //    the provider (Step 18 Part 13) -- the two DB steps below (check/
  //    reuse, then persist) are each their own short, row-locked
  //    transaction; provider.createOrder() runs between them with no lock
  //    held.
  //
  // Step 18A -- order-initiation failure recovery: if provider.createOrder()
  // throws, or the order id it returns cannot be persisted, this method
  // calls markSettlementAttemptFailed() (SETTLEMENT_IN_PROGRESS -> FAILED,
  // an existing ALLOWED_TRANSITIONS entry) before rethrowing, so the
  // Contribution is never stranded in SETTLEMENT_IN_PROGRESS with no
  // retry path -- the caller sees the original error, and retrySettlement()
  // can reopen the now-FAILED Contribution exactly as it already does for
  // manual-settlement failures.
  //
  // Zero-value protection: reuses startSettlement()'s existing amount===0
  // guard -- a zero-value Contribution never reaches the provider call
  // below, because startSettlement() throws first.
  //
  // Idempotency (Step 18 Part 11): if this settlement attempt already has
  // an active_settlement_reference (a duplicate/retried request for the
  // same attempt), the existing reference is reused and the provider is
  // never called again. Retry (Step 18 Part 12): retrySettlement() clears
  // active_settlement_reference when reopening a FAILED/ABANDONED
  // Contribution (via applyTransition()'s leavingSettlementInProgress
  // clear), so the NEXT startSettlement() + initiateProviderSettlement()
  // call always creates a fresh provider order for the fresh attempt.
  //
  // Concurrency: two requests that both observe no active_settlement_reference
  // may both call the provider (the lock is not held across that network
  // call, by design -- Part 13). The persistence step below is a
  // conditional, row-locked UPDATE guarded on active_settlement_reference
  // still being NULL; whichever request's UPDATE lands first wins and its
  // reference becomes authoritative. The loser discards its own
  // (unused, orphaned) provider order and returns the winner's reference
  // instead -- the same "observe what the first request left behind"
  // pattern recordSettlementOutcome() already uses for its own idempotency
  // check. This narrow race is judged acceptable for a member-initiated
  // checkout click on a single-server platform; it is not a webhook path.
  async initiateProviderSettlement(contributionId: number): Promise<{
    contributionId: number;
    contributionState: ContributionState;
    providerName: string;
    providerOrderReference: string;
    amountPaise: number;
    currency: string;
    providerPublicKeyId?: string;
  }> {
    // Reused unchanged: transitions AWAITING_SETTLEMENT → SETTLEMENT_IN_PROGRESS
    // (idempotent if already there), rejects zero-value, publishes
    // SETTLEMENT_STARTED via the existing Step 17 outbox path.
    const { contributionState } = await this.startSettlement(contributionId);

    const existingReference = await this.readActiveSettlementReference(contributionId);
    if (existingReference) {
      const contribution = await this.getContribution(contributionId);
      return {
        contributionId,
        contributionState,
        providerName: this.provider.providerName,
        providerOrderReference: existingReference,
        amountPaise: Number(contribution.amount_paise),
        currency: String(contribution.currency),
      };
    }

    const contribution = await this.getContribution(contributionId);
    const amountPaise = Number(contribution.amount_paise);
    const currency = String(contribution.currency);

    // Business-Engine-generated receipt reference: ties the provider order
    // back to this Contribution for reconciliation without reusing the
    // same value across retried attempts (Razorpay requires receipt
    // uniqueness). <=40 chars: 'FC-' + contributionId + '-' + 8 hex chars.
    const receiptReference = `FC-${contributionId}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    // No lock held here -- this is the network call. A thrown error here
    // (Razorpay unreachable, misconfigured, rejected the request, etc.) is
    // an order-creation failure, not a settlement outcome -- no Financial
    // Transaction/Receipt exists to record it against. But left uncaught it
    // would strand the Contribution in SETTLEMENT_IN_PROGRESS forever:
    // retrySettlement() only reopens FAILED/ABANDONED, and this Contribution
    // never reached either. markSettlementAttemptFailed() below moves it to
    // the existing SETTLEMENT_IN_PROGRESS -> FAILED transition (PAY-001
    // already permits this; no new state or event is introduced), which
    // retrySettlement() already knows how to reopen.
    let order;
    try {
      order = await this.provider.createOrder({
        contributionId,
        amountPaise,
        currency,
        receiptReference,
        metadata: {
          businessModule: String(contribution.business_module),
          businessReferenceId: Number(contribution.business_reference_id),
        },
      });
    } catch (err) {
      await this.markSettlementAttemptFailed(contributionId);
      throw err;
    }

    // A thrown error here means the provider order WAS created but its
    // reference could not be durably linked to this Contribution (e.g. a
    // DB failure, not the ordinary lost-race case below, which returns
    // `false` rather than throwing). Never leave the Contribution claiming
    // a reference it cannot actually recover -- fail the attempt the same
    // way as an order-creation failure. The now-orphaned Razorpay order is
    // simply never referenced again (same as the lost-race case already
    // documented below).
    let persisted: boolean;
    try {
      persisted = await this.persistActiveSettlementReference(contributionId, order.providerOrderReference);
    } catch (err) {
      await this.markSettlementAttemptFailed(contributionId);
      throw err;
    }

    if (!persisted) {
      // Lost the race: a concurrent request's reference was persisted first.
      // Our own provider order is discarded (never referenced again); the
      // winner's reference is authoritative.
      const winnerReference = await this.readActiveSettlementReference(contributionId);
      if (winnerReference) {
        return {
          contributionId,
          contributionState,
          providerName: this.provider.providerName,
          providerOrderReference: winnerReference,
          amountPaise,
          currency,
        };
      }
      // The winner's attempt has already resolved (SETTLED/FAILED/ABANDONED)
      // between our persistence attempt and this read -- extremely narrow
      // window. Surface our own (unused) order rather than fail outright;
      // a subsequent call will re-evaluate current state correctly.
    }

    return {
      contributionId,
      contributionState,
      providerName: this.provider.providerName,
      providerOrderReference: order.providerOrderReference,
      amountPaise,
      currency,
      providerPublicKeyId: order.providerPublicKeyId,
    };
  }

  // Step 18A — order-initiation failure recovery. Moves a Contribution
  // stuck mid-attempt (provider.createOrder() threw, or the reference
  // could not be persisted) from SETTLEMENT_IN_PROGRESS to FAILED, using
  // the existing ALLOWED_TRANSITIONS entry and existing SETTLEMENT_FAILED
  // event -- no new state, no new event, and (via transitionContribution(),
  // not recordSettlementOutcome()) no Financial Transaction or Receipt.
  // applyTransition() already nulls active_settlement_reference on any exit
  // from SETTLEMENT_IN_PROGRESS, so a failed order-creation attempt never
  // leaves a reference behind for retrySettlement()'s next attempt to
  // inherit.
  //
  // Swallows its own error: if the Contribution already moved on (e.g. a
  // concurrent manual-evidence settlement resolved it between our read and
  // this write), transitionContribution() throws ConflictException on the
  // now-stale SETTLEMENT_IN_PROGRESS precondition -- that isn't a stranding,
  // so there is nothing to recover. The caller rethrows the original
  // provider/persistence error regardless of what happens here.
  private async markSettlementAttemptFailed(contributionId: number): Promise<void> {
    try {
      await this.transitionContribution(contributionId, 'FAILED');
    } catch {
      // Not stranded -- see method comment. Original error is rethrown by the caller.
    }
  }

  // Row-locked read: the authoritative check for Step 18 Part 11 idempotency.
  private async readActiveSettlementReference(contributionId: number): Promise<string | null> {
    return db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('financial_contributions')
        .select(['active_settlement_reference', 'state'])
        .where('id', '=', contributionId)
        .forUpdate()
        .executeTakeFirst();
      if (!row || row.state !== 'SETTLEMENT_IN_PROGRESS') return null;
      return row.active_settlement_reference;
    });
  }

  // Conditional, row-locked persist: only succeeds if no other request has
  // already written a reference for this attempt. Returns false on a lost
  // race (Step 18 Part 11 concurrency note above).
  private async persistActiveSettlementReference(
    contributionId: number,
    reference: string,
  ): Promise<boolean> {
    const result = await db
      .updateTable('financial_contributions')
      .set({ active_settlement_reference: reference })
      .where('id', '=', contributionId)
      .where('state', '=', 'SETTLEMENT_IN_PROGRESS')
      .where('active_settlement_reference', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0) === 1;
  }

  // ── Retry settlement (Step 12: financial settlement retry) ─────────────────
  //
  // Reopens a FAILED or ABANDONED Contribution for a new Settlement Attempt
  // by transitioning it back to AWAITING_SETTLEMENT. Both source states are
  // PAY-001-authorized retry points: "Failed is not a terminal state...
  // Additional Settlement attempts may be initiated" and "[Abandoned] may
  // be retried" -- already encoded in ALLOWED_TRANSITIONS (FAILED/ABANDONED
  // → AWAITING_SETTLEMENT), not introduced by this method.
  //
  // This method ONLY reopens the Contribution: it never creates a Financial
  // Transaction, Settlement Evidence, or Receipt, and never contacts a
  // Settlement Provider. The next attempt begins only when startSettlement()
  // is called again -- retry and start remain independently idempotent
  // operations (PAY-001 Principle 6: each attempt produces its own Financial
  // Transaction; Principle 10: prior Financial Transactions are never
  // touched). Zero-value contributions can never reach this method's
  // retryable states: processZeroValueContribution() never enters
  // SETTLEMENT_IN_PROGRESS, so a zero-value Contribution can never become
  // FAILED or ABANDONED (the only path to either state).
  //
  // Idempotent: a Contribution already AWAITING_SETTLEMENT (e.g. a prior
  // retry() call already reopened it) returns successfully rather than
  // erroring -- the same idempotency style as startSettlement()'s
  // duplicate-start handling.
  async retrySettlement(contributionId: number): Promise<{ contributionState: ContributionState }> {
    let pending: PendingFinancialEvent | null = null;

    const result = await db.transaction().execute(async (trx) => {
      const contribution = await trx
        .selectFrom('financial_contributions')
        .selectAll()
        .where('id', '=', contributionId)
        .forUpdate()
        .executeTakeFirst();
      if (!contribution) {
        throw new NotFoundException(`Financial contribution ${contributionId} not found.`);
      }
      const currentState = contribution.state as ContributionState;

      if (currentState === 'AWAITING_SETTLEMENT') {
        return { contributionState: currentState };
      }

      if (currentState !== 'FAILED' && currentState !== 'ABANDONED') {
        throw new ConflictException(
          `Contribution ${contributionId} is in state '${currentState}'; settlement can only be retried ` +
          `from FAILED or ABANDONED.`,
        );
      }

      pending = await this.transitionContribution(contributionId, 'AWAITING_SETTLEMENT', trx);
      return { contributionState: 'AWAITING_SETTLEMENT' as ContributionState };
    });

    // Only after COMMIT — see class-level note on transitionContribution().
    if (pending) await this.publishPending([pending]);
    return result;
  }

  // ── Settlement outcome (Step 10: manual settlement foundation) ─────────────
  //
  // Records the FINAL, already-known outcome of one Settlement Attempt as
  // exactly ONE immutable Financial Transaction (PAY-001 Principle 10/16 --
  // "each Financial Transaction represents an individual Settlement attempt";
  // "Financial Transactions shall never be modified after creation"). There
  // is no INSERT-PENDING-then-UPDATE path anywhere in the Financial Engine --
  // this method is only ever called once the outcome is known (after admin
  // approval/rejection of Settlement Evidence today; after a Settlement
  // Provider webhook in a future step). It never writes outcome='PENDING'.
  //
  // Concurrency (PAY-001 Principle 6: "only one successful Settlement shall
  // satisfy the Contribution"): the contribution row is locked with
  // SELECT ... FOR UPDATE for the duration of the transaction (same pattern
  // as MembershipNumberingService.assignPermanentNumber), so two concurrent
  // calls for the same contribution serialize. The second call observes
  // whatever the first left behind and is rejected or idempotently
  // short-circuited -- never producing a second successful Transaction.
  //
  // Idempotency (PAY-001 Principle 7): a duplicate call carrying the same
  // (contribution_id, provider_reference) is detected before any write and
  // returns the existing Financial Transaction rather than inserting a
  // second one -- this covers duplicate admin clicks and, in the future,
  // duplicate provider webhook redelivery, with the same code path.
  async recordSettlementOutcome(
    contributionId: number,
    outcome: SettlementOutcomeInput,
  ): Promise<{ transactionId: number; contributionState: ContributionState }> {
    // Collected in canonical order (PAY-001 Step 17 Part 13) as the
    // transaction below produces them; published strictly after COMMIT,
    // in this same order, so a listener never observes CONTRIBUTION_COMPLETED
    // before RECEIPT_GENERATED, or either before SETTLEMENT_COMPLETED.
    const pending: PendingFinancialEvent[] = [];

    const result = await db.transaction().execute(async (trx) => {
      const contribution = await trx
        .selectFrom('financial_contributions')
        .selectAll()
        .where('id', '=', contributionId)
        .forUpdate()
        .executeTakeFirst();
      if (!contribution) {
        throw new NotFoundException(`Financial contribution ${contributionId} not found.`);
      }
      const currentState = contribution.state as ContributionState;

      // Idempotency short-circuit -- checked BEFORE the state guard so a
      // duplicate/redelivered request for an already-resolved attempt
      // returns the prior result instead of failing on a state that has
      // legitimately moved on (e.g. SETTLED/COMPLETED) since the first call.
      if (outcome.providerReference) {
        const existingTxn = await trx
          .selectFrom('financial_transactions')
          .select(['id'])
          .where('contribution_id', '=', contributionId)
          .where('provider_reference', '=', outcome.providerReference)
          .executeTakeFirst();
        if (existingTxn) {
          return { transactionId: Number(existingTxn.id), contributionState: currentState };
        }
      }

      if (currentState !== 'SETTLEMENT_IN_PROGRESS') {
        throw new ConflictException(
          `Contribution ${contributionId} is in state '${currentState}'; settlement outcomes can ` +
          `only be recorded while the contribution is SETTLEMENT_IN_PROGRESS.`,
        );
      }

      // Zero-value contributions never reach here through the intended
      // caller (SettlementEvidenceService only operates on non-zero
      // contributions), but guard explicitly -- zero-value must exclusively
      // use processZeroValueContribution() (PAY-001 Principle 12: no
      // Settlement Provider, no Financial Transaction for zero-value).
      if (Number(contribution.amount_paise) === 0) {
        throw new ConflictException(
          `Contribution ${contributionId} has amount 0; use processZeroValueContribution() instead of ` +
          `recordSettlementOutcome() for zero-value contributions.`,
        );
      }

      if (outcome.amountPaise !== Number(contribution.amount_paise)) {
        throw new BadRequestException(
          `Settlement amount ${outcome.amountPaise} does not match contribution amount ${contribution.amount_paise}.`,
        );
      }

      const uuid = randomUUID();
      const inserted = await trx
        .insertInto('financial_transactions')
        .values({
          uuid,
          contribution_id: contributionId,
          provider: outcome.provider,
          provider_reference: outcome.providerReference,
          amount_paise: outcome.amountPaise,
          currency: contribution.currency,
          outcome: outcome.result,
          failure_reason: outcome.result === 'SUCCEEDED' ? null : (outcome.failureReason ?? null),
        })
        .executeTakeFirstOrThrow();
      const transactionId = Number(inserted.insertId);

      const businessModule = String(contribution.business_module);
      const businessReferenceId = Number(contribution.business_reference_id);
      const amountPaise = Number(contribution.amount_paise);
      const currency = String(contribution.currency);

      if (outcome.result === 'SUCCEEDED') {
        const settled = await this.transitionContribution(contributionId, 'SETTLED', trx);
        if (settled) pending.push(settled);
        const { pending: receiptPending } = await this.issueReceipt(
          contributionId, amountPaise, currency, businessModule, businessReferenceId, trx,
        );
        pending.push(receiptPending);
        const completed = await this.transitionContribution(contributionId, 'COMPLETED', trx);
        if (completed) pending.push(completed);
        return { transactionId, contributionState: 'COMPLETED' as ContributionState };
      }

      // FAILED / ABANDONED: PAY-001 -- "Failed is not a terminal state...
      // Additional Settlement attempts may be initiated." ALLOWED_TRANSITIONS
      // already routes both back to AWAITING_SETTLEMENT on the next attempt;
      // this method does not invent any new lifecycle beyond that.
      const targetState: ContributionState = outcome.result === 'FAILED' ? 'FAILED' : 'ABANDONED';
      const failedOrAbandoned = await this.transitionContribution(contributionId, targetState, trx);
      if (failedOrAbandoned) pending.push(failedOrAbandoned);
      return { transactionId, contributionState: targetState };
    });

    // Only after COMMIT — see class-level note on transitionContribution().
    // `pending` stays empty on the idempotency short-circuit path above
    // (returned before this point is reached), so a duplicate call never re-emits.
    if (pending.length) await this.publishPending(pending);
    return result;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  // Always called with recordSettlementOutcome()'s trx — receipt issuance
  // participates in the same atomic unit as the Transaction insert + state
  // transitions. RECEIPT_GENERATED is not part of STATE_TRANSITION_EVENTS
  // (it is not a state-transition event), so it is always emitted here,
  // unconditionally, via the same durable outbox mechanism.
  private async issueReceipt(
    contributionId: number,
    amountPaise: number,
    currency: string,
    businessModule: string,
    businessReferenceId: number,
    executor: Kysely<DB>,
  ): Promise<{ receiptId: number; pending: PendingFinancialEvent }> {
    const uuid = randomUUID();
    const now = new Date();
    // Format: BCC-RCP-{YYYYMM}-{000000contributionId}
    // Format governed by PAY-001 §OPERATIONAL CONFIGURATION — provisional until
    // receipt numbering configuration is implemented.
    const receiptNumber = [
      'BCC-RCP',
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`,
      String(contributionId).padStart(6, '0'),
    ].join('-');

    const result = await executor
      .insertInto('receipts')
      .values({
        uuid,
        contribution_id: contributionId,
        receipt_number: receiptNumber,
        amount_paise: amountPaise,
        currency,
      })
      .executeTakeFirstOrThrow();

    const receiptId = Number(result.insertId);

    const pending = await this.insertOutboxRow(executor, {
      eventType: FINANCIAL_EVENT_TYPES.RECEIPT_GENERATED,
      contributionId,
      businessModule,
      businessReferenceId,
      amountPaise,
      currency,
      contributionState: 'COMPLETED',
      metadata: { receiptId, receiptNumber },
    });

    return { receiptId, pending };
  }

  // Durably records ONE canonical Business Event occurrence in
  // financial_event_outbox, using the SAME executor (trx or db) as the
  // financial state change it accompanies (PAY-001 Step 17 Part 4). Never
  // publishes to FinancialEventBus — that is publishPending()'s job, called
  // only once the producing transaction has committed.
  private async insertOutboxRow(
    executor: Kysely<DB>,
    args: {
      eventType: FinancialEventType;
      contributionId: number;
      businessModule: string;
      businessReferenceId: number;
      amountPaise: number;
      currency: string;
      contributionState: ContributionState;
      metadata?: Record<string, unknown>;
    },
  ): Promise<PendingFinancialEvent> {
    const eventUuid = randomUUID();
    const occurredAt = new Date();

    const result = await executor
      .insertInto('financial_event_outbox')
      .values({
        event_uuid: eventUuid,
        event_type: args.eventType,
        contribution_id: args.contributionId,
        business_module: args.businessModule,
        business_reference_id: args.businessReferenceId,
        amount_paise: args.amountPaise,
        currency: args.currency,
        contribution_state: args.contributionState,
        metadata: args.metadata ?? null,
        occurred_at: toMysqlDatetime(occurredAt),
      })
      .executeTakeFirstOrThrow();

    const payload: FinancialEngineEventPayload = {
      eventType: args.eventType,
      contributionId: args.contributionId,
      businessModule: args.businessModule,
      businessReferenceId: args.businessReferenceId,
      amountPaise: args.amountPaise,
      currency: args.currency,
      contributionState: args.contributionState,
      occurredAt,
      metadata: args.metadata,
    };

    return { outboxId: Number(result.insertId), payload };
  }

  // Publishes already-committed Business Events to the in-process
  // FinancialEventBus, IN ORDER, then best-effort marks each outbox row's
  // dispatched_at. Must only ever be called with events whose outbox row
  // has already been committed — never from inside a transaction.
  //
  // dispatched_at means only "handed to FinancialEventBus.emit()", not
  // "every subscriber finished acting on it" (PAY-001 Step 17 Part 8):
  // EventEmitter listeners run synchronously up to their first await, and
  // this method does not (and cannot) wait for async listener work to
  // finish. A failure while marking dispatched_at is swallowed rather than
  // thrown -- the financial state is already durably committed, and the
  // row simply remains recoverable (dispatched_at IS NULL) for a future
  // recovery step, exactly as an undispatched row would be after a crash.
  private async publishPending(pending: PendingFinancialEvent[]): Promise<void> {
    for (const event of pending) {
      this.eventBus.emit(event.payload.eventType, event.payload);
      try {
        await db
          .updateTable('financial_event_outbox')
          .set({ dispatched_at: toMysqlDatetime(new Date()) })
          .where('id', '=', event.outboxId)
          .execute();
      } catch {
        // Recoverable — see method comment. Not rethrown: a dispatched_at
        // write failure must never be mistaken for a financial-state failure.
      }
    }
  }
}
