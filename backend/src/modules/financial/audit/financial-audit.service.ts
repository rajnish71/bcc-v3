// backend/src/modules/financial/audit/financial-audit.service.ts
//
// Payment & Authentication Observability Remediation -- OBS-02/OBS-11.
//
// FinancialAuditService.record() is the ONLY code path that writes to
// financial_audit_log. It is deliberately synchronous and un-wrapped in its
// own try/catch: callers MUST pass the same executor (a Kysely transaction)
// as the business write this event accompanies. If the insert throws, it
// propagates out of the caller's transaction callback, which rolls the
// whole transaction back -- the business action fails closed rather than
// silently proceeding without provenance (OBS-11). This table is never an
// asynchronous outbox; financial_event_outbox (0090) already owns that
// role for a different purpose and the two are never combined.
//
// Whitelist (Section 6/13): metadata is reconstructed field-by-field from
// FinancialAuditMetadata, never spread from an arbitrary object, so a
// caller cannot smuggle an unexpected key (a header, a token, a full
// payload) into this column even by accident.

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db';
import type { FinancialAuditEventInput } from './financial-audit.types';

// OBS-05: User-Agent is capped at 500 characters. Never store arbitrary
// headers beyond this single, explicitly-named one.
const MAX_USER_AGENT_LENGTH = 500;

@Injectable()
export class FinancialAuditService {
  async record(executor: Kysely<DB>, input: FinancialAuditEventInput): Promise<void> {
    const provenance = input.provenance ?? {};

    const metadataJson = input.metadata
      ? JSON.stringify({
          providerOrderOutcome: input.metadata.providerOrderOutcome,
          discardedProviderOrderReference: input.metadata.discardedProviderOrderReference,
          isRetry: input.metadata.isRetry,
        })
      : null;

    await executor
      .insertInto('financial_audit_log')
      .values({
        uuid: randomUUID(),
        event_type: input.eventType,
        contribution_id: input.contributionId ?? null,
        transaction_id: input.transactionId ?? null,
        refund_id: input.refundId ?? null,
        settlement_evidence_id: input.settlementEvidenceId ?? null,
        webhook_inbox_id: input.webhookInboxId ?? null,
        actor_type: input.actorType,
        actor_user_id: provenance.actorUserId ?? null,
        request_id: provenance.requestId ?? null,
        session_id: provenance.sessionId ?? null,
        client_ip: provenance.ipAddress ?? null,
        user_agent: provenance.userAgent ? provenance.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
        http_route: provenance.route ?? null,
        provider_order_ref: input.providerOrderRef ?? null,
        provider_payment_ref: input.providerPaymentRef ?? null,
        provider_receipt_ref: input.providerReceiptRef ?? null,
        previous_state: input.previousState ?? null,
        resulting_state: input.resultingState ?? null,
        metadata_json: metadataJson,
      })
      .execute();
  }
}
