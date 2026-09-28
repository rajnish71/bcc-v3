// backend/src/modules/financial/audit/financial-trace.service.ts
//
// Payment & Authentication Observability Remediation -- OBS-09.
//
// READ ONLY. Reconstructs the financial chain for one or more contributions
// from existing tables; never writes, never changes state.
//
// Provenance labelling (remediation Section 11):
//   RETAINED     -- recorded in financial_audit_log at the time it happened.
//   CANONICAL    -- read from the PAY-001 canonical records themselves
//                   (financial_transactions / receipts / contributions).
//   DERIVED      -- extracted after the fact from a stored webhook payload
//                   (pre-remediation order ids were never retained anywhere
//                   else once active_settlement_reference was cleared).
//   NOT_RETAINED -- the contribution has no audit rows at all (it predates
//                   migration 0099); request/session/IP provenance for it
//                   was never captured and is not reconstructed.
//
// Never returned: webhook payload bodies (only the two extracted ids),
// settlement-evidence proof object keys, tokens, or any request headers
// other than the User-Agent already stored on the audit row.

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../../database/db';
import {
  SETTLEMENT_PROVIDER,
  type ProviderOrderSnapshot,
  type ProviderPaymentSnapshot,
  type SettlementProvider,
} from '../settlement-provider.interface';

export interface TraceQuery {
  contributionId?: number;
  orderRef?: string;
  paymentRef?: string;
  requestId?: string;
  live?: boolean;
}

type ReferenceSource = 'RETAINED' | 'CANONICAL' | 'DERIVED';

const MAX_TRACED_CONTRIBUTIONS = 20;

const DERIVED_ORDER_ID = sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.payload.payment.entity.order_id'))`;
const DERIVED_PAYMENT_ID = sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.payload.payment.entity.id'))`;

function parseMetadata(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

@Injectable()
export class FinancialTraceService {
  constructor(@Inject(SETTLEMENT_PROVIDER) private readonly provider: SettlementProvider) {}

  async trace(query: TraceQuery) {
    const { contributionId, orderRef, paymentRef, requestId } = query;
    if (contributionId === undefined && !orderRef && !paymentRef && !requestId) {
      throw new BadRequestException('At least one of contributionId, orderRef, paymentRef, requestId is required.');
    }

    const resolution = await this.resolveContributionIds(query);
    const ids = [...resolution.ids].slice(0, MAX_TRACED_CONTRIBUTIONS);
    const traces: Array<Awaited<ReturnType<FinancialTraceService['traceContribution']>>> = [];
    for (const id of ids) {
      traces.push(await this.traceContribution(id, query.live === true));
    }

    return {
      lookup: { contributionId: contributionId ?? null, orderRef: orderRef ?? null, paymentRef: paymentRef ?? null, requestId: requestId ?? null },
      resolvedVia: resolution.via,
      truncated: resolution.ids.size > MAX_TRACED_CONTRIBUTIONS,
      contributions: traces,
    };
  }

  private async resolveContributionIds(query: TraceQuery): Promise<{ ids: Set<number>; via: ReferenceSource[] }> {
    const ids = new Set<number>();
    const via = new Set<ReferenceSource>();
    const add = (rows: Array<{ contribution_id: number | null }>, source: ReferenceSource) => {
      for (const row of rows) {
        if (row.contribution_id !== null) {
          ids.add(Number(row.contribution_id));
          via.add(source);
        }
      }
    };

    if (query.contributionId !== undefined) {
      ids.add(query.contributionId);
      via.add('CANONICAL');
    }

    if (query.requestId) {
      add(
        await db.selectFrom('financial_audit_log').select('contribution_id').where('request_id', '=', query.requestId).distinct().execute(),
        'RETAINED',
      );
    }

    if (query.orderRef) {
      add(
        await db.selectFrom('financial_audit_log').select('contribution_id').where('provider_order_ref', '=', query.orderRef).distinct().execute(),
        'RETAINED',
      );
      add(
        await db
          .selectFrom('financial_contributions')
          .select('id as contribution_id')
          .where('active_settlement_reference', '=', query.orderRef)
          .execute(),
        'CANONICAL',
      );
      add(
        await db.selectFrom('settlement_webhook_inbox').select('contribution_id').where(DERIVED_ORDER_ID, '=', query.orderRef).execute(),
        'DERIVED',
      );
    }

    if (query.paymentRef) {
      add(
        await db.selectFrom('financial_audit_log').select('contribution_id').where('provider_payment_ref', '=', query.paymentRef).distinct().execute(),
        'RETAINED',
      );
      add(
        await db.selectFrom('financial_transactions').select('contribution_id').where('provider_reference', '=', query.paymentRef).execute(),
        'CANONICAL',
      );
      add(
        await db.selectFrom('settlement_webhook_inbox').select('contribution_id').where(DERIVED_PAYMENT_ID, '=', query.paymentRef).execute(),
        'DERIVED',
      );
    }

    return { ids, via: [...via] };
  }

  private async traceContribution(contributionId: number, live: boolean) {
    const contribution = await db
      .selectFrom('financial_contributions')
      .select([
        'id', 'uuid', 'payer_user_id', 'business_module', 'business_reference_id', 'purpose',
        'amount_paise', 'currency', 'state', 'active_settlement_reference', 'created_at', 'updated_at',
      ])
      .where('id', '=', contributionId)
      .executeTakeFirst();

    if (!contribution) {
      return { contributionId, found: false as const };
    }

    const [auditRows, outboxRows, transactions, inboxRows, refunds, receipt, evidence] = await Promise.all([
      db.selectFrom('financial_audit_log').selectAll().where('contribution_id', '=', contributionId).orderBy('id', 'asc').execute(),
      db
        .selectFrom('financial_event_outbox')
        .select(['event_uuid', 'event_type', 'contribution_state', 'occurred_at', 'dispatched_at'])
        .where('contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
      db
        .selectFrom('financial_transactions')
        .select(['id', 'uuid', 'provider', 'provider_reference', 'amount_paise', 'currency', 'outcome', 'failure_reason', 'created_at'])
        .where('contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
      db
        .selectFrom('settlement_webhook_inbox')
        .select([
          'id', 'provider', 'provider_event_id', 'event_type', 'status', 'processing_error', 'received_at', 'processed_at',
          DERIVED_ORDER_ID.as('derived_order_ref'),
          DERIVED_PAYMENT_ID.as('derived_payment_ref'),
        ])
        .where('contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
      db
        .selectFrom('financial_refunds')
        .select([
          'id', 'uuid', 'amount_paise', 'currency', 'provider', 'provider_reference', 'status', 'reason',
          'failure_reason', 'requested_by_type', 'requested_by_user_id', 'requested_at', 'resolved_at',
        ])
        .where('contribution_id', '=', contributionId)
        .execute(),
      db
        .selectFrom('receipts')
        .select(['id', 'uuid', 'receipt_number', 'amount_paise', 'currency', 'issued_at'])
        .where('contribution_id', '=', contributionId)
        .executeTakeFirst(),
      db
        .selectFrom('financial_settlement_evidence')
        .select([
          'id', 'uuid', 'reference_identifier', 'payment_date', 'claimed_amount_paise', 'submitted_by_user_id',
          'submitted_at', 'review_status', 'review_note', 'reviewed_by_user_id', 'reviewed_at',
        ])
        .where('financial_contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
    ]);

    const references = new Map<string, { kind: 'ORDER' | 'PAYMENT' | 'RECEIPT'; value: string; source: ReferenceSource }>();
    const addRef = (kind: 'ORDER' | 'PAYMENT' | 'RECEIPT', value: string | null, source: ReferenceSource) => {
      if (!value) return;
      const key = `${kind}:${value}`;
      // RETAINED outranks CANONICAL outranks DERIVED for the same value.
      const rank: Record<ReferenceSource, number> = { RETAINED: 0, CANONICAL: 1, DERIVED: 2 };
      const existing = references.get(key);
      if (!existing || rank[source] < rank[existing.source]) references.set(key, { kind, value, source });
    };
    for (const row of auditRows) {
      addRef('ORDER', row.provider_order_ref, 'RETAINED');
      addRef('PAYMENT', row.provider_payment_ref, 'RETAINED');
      addRef('RECEIPT', row.provider_receipt_ref, 'RETAINED');
      const meta = parseMetadata(row.metadata_json) as { discardedProviderOrderReference?: string } | null;
      addRef('ORDER', meta?.discardedProviderOrderReference ?? null, 'RETAINED');
    }
    addRef('ORDER', contribution.active_settlement_reference, 'CANONICAL');
    for (const txn of transactions) addRef('PAYMENT', txn.provider_reference, 'CANONICAL');
    for (const row of inboxRows) {
      addRef('ORDER', row.derived_order_ref, 'DERIVED');
      addRef('PAYMENT', row.derived_payment_ref, 'DERIVED');
    }

    const providerLive = live ? await this.fetchLive([...references.values()]) : undefined;

    return {
      contributionId,
      found: true as const,
      provenance: auditRows.length ? ('RETAINED' as const) : ('NOT_RETAINED' as const),
      contribution: {
        id: Number(contribution.id),
        uuid: contribution.uuid,
        payerUserId: Number(contribution.payer_user_id),
        businessModule: contribution.business_module,
        businessReferenceId: Number(contribution.business_reference_id),
        purpose: contribution.purpose,
        amountPaise: Number(contribution.amount_paise),
        currency: contribution.currency,
        state: contribution.state,
        activeSettlementReference: contribution.active_settlement_reference,
        createdAt: contribution.created_at,
        updatedAt: contribution.updated_at,
      },
      auditEvents: auditRows.map((row) => ({
        id: Number(row.id),
        uuid: row.uuid,
        eventType: row.event_type,
        createdAt: row.created_at,
        actorType: row.actor_type,
        actorUserId: row.actor_user_id !== null ? Number(row.actor_user_id) : null,
        requestId: row.request_id,
        sessionId: row.session_id,
        clientIp: row.client_ip,
        userAgent: row.user_agent,
        httpRoute: row.http_route,
        transactionId: row.transaction_id !== null ? Number(row.transaction_id) : null,
        refundId: row.refund_id !== null ? Number(row.refund_id) : null,
        settlementEvidenceId: row.settlement_evidence_id !== null ? Number(row.settlement_evidence_id) : null,
        webhookInboxId: row.webhook_inbox_id !== null ? Number(row.webhook_inbox_id) : null,
        providerOrderRef: row.provider_order_ref,
        providerPaymentRef: row.provider_payment_ref,
        providerReceiptRef: row.provider_receipt_ref,
        previousState: row.previous_state,
        resultingState: row.resulting_state,
        metadata: parseMetadata(row.metadata_json),
      })),
      outboxEvents: outboxRows,
      transactions,
      webhookInbox: inboxRows.map((row) => ({
        id: Number(row.id),
        provider: row.provider,
        providerEventId: row.provider_event_id,
        eventType: row.event_type,
        status: row.status,
        processingError: row.processing_error,
        receivedAt: row.received_at,
        processedAt: row.processed_at,
        derivedOrderRef: row.derived_order_ref,
        derivedPaymentRef: row.derived_payment_ref,
        derivedSource: 'DERIVED' as const,
      })),
      refunds,
      receipt: receipt ?? null,
      settlementEvidence: evidence,
      providerReferences: [...references.values()],
      ...(providerLive !== undefined ? { providerLive } : {}),
    };
  }

  // OBS-08: on-demand, read-only provider lookups. Nothing here is written to
  // the database; results are returned in this one response only.
  private async fetchLive(refs: Array<{ kind: 'ORDER' | 'PAYMENT' | 'RECEIPT'; value: string }>) {
    if (!this.provider.fetchOrder && !this.provider.fetchPayment) {
      return { available: false as const };
    }
    const results: Array<{
      kind: 'ORDER' | 'PAYMENT' | 'RECEIPT';
      value: string;
      snapshot?: ProviderOrderSnapshot | ProviderPaymentSnapshot;
      error?: string;
    }> = [];
    for (const ref of refs) {
      try {
        if (ref.kind === 'ORDER' && this.provider.fetchOrder) {
          results.push({ kind: ref.kind, value: ref.value, snapshot: await this.provider.fetchOrder(ref.value) });
        } else if (ref.kind === 'PAYMENT' && this.provider.fetchPayment) {
          results.push({ kind: ref.kind, value: ref.value, snapshot: await this.provider.fetchPayment(ref.value) });
        }
      } catch (err) {
        results.push({ kind: ref.kind, value: ref.value, error: err instanceof Error ? err.message : 'lookup failed' });
      }
    }
    return { available: true as const, provider: this.provider.providerName, results };
  }
}
