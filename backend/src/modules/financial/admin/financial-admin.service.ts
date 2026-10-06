// backend/src/modules/financial/admin/financial-admin.service.ts
//
// Track 4 -- Admin Financial Visibility. READ ONLY.
//
// Every method here is a SELECT over the canonical PAY-001 tables
// (financial_contributions, financial_transactions, receipts,
// financial_refunds, financial_settlement_evidence, financial_audit_log).
// This service never inserts, updates or deletes, never calls a Settlement
// Provider, and never routes through FinancialContributionService /
// SettlementEvidenceService mutation paths. Refunds are displayed exactly
// as the production model stores them (one financial_refunds row per
// contribution); no refund transaction is synthesized.
//
// Generic over business_module: no Business-Module-specific join decides
// what is listed. Contributor identity comes from the payer user; the
// Membership Number comes from the canonical memberships.user_id join and
// only when it is a permanent MEM-007 number (BCCTemp never qualifies, and
// membership_temp_identifiers is never read).

import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../../database/db';
import type { ContributionState } from '../financial.types';
import {
  CONTRIBUTION_STATE_KEYS,
  EXCEPTION_CATEGORIES,
  PERMANENT_MEMBERSHIP_NUMBER_SQL,
  REFUND_STATUSES,
  clampPage,
  toAuditEvent,
  toContributionListItem,
  toEvidence,
  toIso,
  toReceiptListItem,
  toRefund,
  toRefundListItem,
  toTransaction,
  zeroFilled,
  type ContributionListRow,
  type ExceptionCategory,
  type RefundListRow,
  type RefundStatus,
  type ReceiptListRow,
} from './financial-admin.mappers';
import { buildSearchTerms } from './financial-admin-search';

export interface PageInput {
  page?: string;
  pageSize?: string;
}

const CONTRIBUTION_STATE_EXCEPTIONS: Partial<Record<ExceptionCategory, ContributionState>> = {
  SETTLEMENT_IN_PROGRESS: 'SETTLEMENT_IN_PROGRESS',
  FAILED: 'FAILED',
  ABANDONED: 'ABANDONED',
};
const REFUND_STATUS_EXCEPTIONS: Partial<Record<ExceptionCategory, RefundStatus>> = {
  REFUND_PROCESSING: 'PROCESSING',
  REFUND_FAILED: 'FAILED',
};

@Injectable()
export class FinancialAdminService {
  // ── Base query: contribution + payer + receipt + refund ─────────────────

  private contributionBase() {
    return db
      .selectFrom('financial_contributions as fc')
      .innerJoin('users as u', 'u.id', 'fc.payer_user_id')
      .leftJoin('receipts as r', 'r.contribution_id', 'fc.id')
      .leftJoin('financial_refunds as fr', 'fr.contribution_id', 'fc.id');
  }

  private async pageContributions(
    base: ReturnType<FinancialAdminService['contributionBase']>,
    pageInput: PageInput,
  ) {
    const { page, pageSize, offset } = clampPage(pageInput.page, pageInput.pageSize);

    const [rows, countRow] = await Promise.all([
      base
        .select((eb) => [
          'fc.uuid',
          'fc.business_module',
          'fc.purpose',
          'fc.state',
          'fc.amount_paise',
          'fc.currency',
          'fc.expires_at',
          'fc.created_at',
          'fc.updated_at',
          'u.full_name as contributor_name',
          'u.username as contributor_username',
          'r.receipt_number',
          'r.issued_at as receipt_issued_at',
          'fr.status as refund_status',
          eb
            .selectFrom('memberships as m')
            .select('m.membership_number')
            .whereRef('m.user_id', '=', 'fc.payer_user_id')
            .where(sql<boolean>`m.membership_number REGEXP ${PERMANENT_MEMBERSHIP_NUMBER_SQL}`)
            .orderBy('m.id', 'desc')
            .limit(1)
            .as('membership_number'),
          eb
            .selectFrom('financial_transactions as ft')
            .select('ft.provider')
            .whereRef('ft.contribution_id', '=', 'fc.id')
            .orderBy('ft.id', 'desc')
            .limit(1)
            .as('latest_provider'),
          eb
            .selectFrom('financial_transactions as ft2')
            .select('ft2.outcome')
            .whereRef('ft2.contribution_id', '=', 'fc.id')
            .orderBy('ft2.id', 'desc')
            .limit(1)
            .as('latest_outcome'),
          eb
            .selectFrom('financial_settlement_evidence as se')
            .select('se.review_status')
            .whereRef('se.financial_contribution_id', '=', 'fc.id')
            .orderBy('se.id', 'desc')
            .limit(1)
            .as('evidence_status'),
        ])
        .orderBy('fc.created_at', 'desc')
        .orderBy('fc.id', 'desc')
        .limit(pageSize)
        .offset(offset)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('total')).executeTakeFirst(),
    ]);

    return {
      items: (rows as unknown as ContributionListRow[]).map(toContributionListItem),
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
    };
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  //
  // Canonical counts/sums only -- no accounting concepts (revenue, net,
  // profit). completedAmountByCurrency is literally the sum of amount_paise
  // over contributions currently in state COMPLETED.

  async overview() {
    const [byState, byModule, completedSums, refundRows, receiptRow, exceptionCounts] = await Promise.all([
      db
        .selectFrom('financial_contributions')
        .select((eb) => ['state as key', eb.fn.countAll<number>().as('count')])
        .groupBy('state')
        .execute(),
      db
        .selectFrom('financial_contributions')
        .select((eb) => ['business_module as key', eb.fn.countAll<number>().as('count')])
        .groupBy('business_module')
        .orderBy('business_module', 'asc')
        .execute(),
      db
        .selectFrom('financial_contributions')
        .select((eb) => ['currency', eb.fn.sum<number>('amount_paise').as('amount'), eb.fn.countAll<number>().as('count')])
        .where('state', '=', 'COMPLETED')
        .groupBy('currency')
        .execute(),
      db
        .selectFrom('financial_refunds')
        .select((eb) => ['status as key', 'currency', eb.fn.countAll<number>().as('count'), eb.fn.sum<number>('amount_paise').as('amount')])
        .groupBy(['status', 'currency'])
        .execute(),
      db.selectFrom('receipts').select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirst(),
      this.exceptionCounts(),
    ]);

    const refundsByStatus = zeroFilled(REFUND_STATUSES, aggregate(refundRows));
    return {
      contributionsByState: zeroFilled(CONTRIBUTION_STATE_KEYS, byState),
      contributionsByBusinessModule: byModule.map((r) => ({ businessModule: String(r.key), count: Number(r.count) })),
      completedContributions: completedSums.map((r) => ({
        currency: r.currency,
        count: Number(r.count),
        amountPaise: Number(r.amount ?? 0),
      })),
      refundsByStatus,
      refundAmounts: refundRows.map((r) => ({
        status: String(r.key),
        currency: r.currency,
        count: Number(r.count),
        amountPaise: Number(r.amount ?? 0),
      })),
      receiptsIssued: Number(receiptRow?.count ?? 0),
      exceptions: exceptionCounts,
    };
  }

  // ── Contributions ────────────────────────────────────────────────────────

  async listContributions(filters: { state?: string; businessModule?: string } & PageInput) {
    let base = this.contributionBase();
    if (filters.state) base = base.where('fc.state', '=', filters.state as ContributionState);
    if (filters.businessModule) base = base.where('fc.business_module', '=', filters.businessModule);
    return this.pageContributions(base, filters);
  }

  async getContribution(reference: string) {
    const page = await this.pageContributions(
      this.contributionBase().where('fc.uuid', '=', reference),
      { page: '1', pageSize: '1' },
    );
    const summary = page.items[0];
    if (!summary) throw new NotFoundException('Contribution not found');

    // Internal id resolved by UUID for child lookups only; never returned.
    const idRow = await db
      .selectFrom('financial_contributions')
      .select('id')
      .where('uuid', '=', reference)
      .executeTakeFirstOrThrow();
    const contributionId = Number(idRow.id);

    const [transactions, refund, evidence, audit, receipt] = await Promise.all([
      db
        .selectFrom('financial_transactions')
        .select(['uuid', 'provider', 'provider_reference', 'amount_paise', 'currency', 'outcome', 'failure_reason', 'created_at'])
        .where('contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
      db
        .selectFrom('financial_refunds')
        .select([
          'uuid', 'amount_paise', 'currency', 'provider', 'provider_reference', 'status', 'reason',
          'failure_reason', 'requested_by_type', 'requested_at', 'resolved_at',
        ])
        .where('contribution_id', '=', contributionId)
        .executeTakeFirst(),
      db
        .selectFrom('financial_settlement_evidence')
        .select(['uuid', 'claimed_amount_paise', 'payment_date', 'submitted_at', 'review_status', 'reviewed_at'])
        .where('financial_contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
      db
        .selectFrom('financial_audit_log')
        .select(['event_type', 'previous_state', 'resulting_state', 'actor_type', 'created_at'])
        .where('contribution_id', '=', contributionId)
        .orderBy('id', 'asc')
        .execute(),
      db
        .selectFrom('receipts')
        .select(['uuid', 'receipt_number', 'amount_paise', 'currency', 'issued_at'])
        .where('contribution_id', '=', contributionId)
        .executeTakeFirst(),
    ]);

    return {
      ...summary,
      receipt: receipt
        ? {
            reference: receipt.uuid,
            receiptNumber: receipt.receipt_number,
            amountPaise: Number(receipt.amount_paise),
            currency: receipt.currency,
            issuedAt: toIso(receipt.issued_at),
          }
        : null,
      transactions: transactions.map(toTransaction),
      refund: refund ? toRefund(refund) : null,
      settlementEvidence: evidence.map(toEvidence),
      auditTrail: audit.map(toAuditEvent),
    };
  }

  // ── Refunds (financial_refunds, as stored) ──────────────────────────────

  async listRefunds(filters: { status?: string } & PageInput) {
    const { page, pageSize, offset } = clampPage(filters.page, filters.pageSize);
    let base = db
      .selectFrom('financial_refunds as fr')
      .innerJoin('financial_contributions as fc', 'fc.id', 'fr.contribution_id')
      .innerJoin('users as u', 'u.id', 'fc.payer_user_id');
    if (filters.status) base = base.where('fr.status', '=', filters.status as RefundStatus);

    const [rows, countRow] = await Promise.all([
      base
        .select([
          'fr.uuid', 'fr.amount_paise', 'fr.currency', 'fr.provider', 'fr.provider_reference', 'fr.status',
          'fr.reason', 'fr.failure_reason', 'fr.requested_by_type', 'fr.requested_at', 'fr.resolved_at',
          'fc.uuid as contribution_uuid', 'fc.business_module', 'fc.state as contribution_state',
          'u.full_name as contributor_name', 'u.username as contributor_username',
        ])
        .orderBy('fr.requested_at', 'desc')
        .orderBy('fr.id', 'desc')
        .limit(pageSize)
        .offset(offset)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('total')).executeTakeFirst(),
    ]);

    return {
      items: (rows as unknown as RefundListRow[]).map(toRefundListItem),
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
    };
  }

  // ── Receipts ─────────────────────────────────────────────────────────────

  async listReceipts(pageInput: PageInput) {
    const { page, pageSize, offset } = clampPage(pageInput.page, pageInput.pageSize);
    const base = db
      .selectFrom('receipts as r')
      .innerJoin('financial_contributions as fc', 'fc.id', 'r.contribution_id')
      .innerJoin('users as u', 'u.id', 'fc.payer_user_id');

    const [rows, countRow] = await Promise.all([
      base
        .select((eb) => [
          'r.uuid', 'r.receipt_number', 'r.amount_paise', 'r.currency', 'r.issued_at',
          'fc.uuid as contribution_uuid', 'fc.business_module',
          'u.full_name as contributor_name', 'u.username as contributor_username',
          eb
            .selectFrom('memberships as m')
            .select('m.membership_number')
            .whereRef('m.user_id', '=', 'fc.payer_user_id')
            .where(sql<boolean>`m.membership_number REGEXP ${PERMANENT_MEMBERSHIP_NUMBER_SQL}`)
            .orderBy('m.id', 'desc')
            .limit(1)
            .as('membership_number'),
        ])
        .orderBy('r.issued_at', 'desc')
        .orderBy('r.id', 'desc')
        .limit(pageSize)
        .offset(offset)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('total')).executeTakeFirst(),
    ]);

    return {
      items: (rows as unknown as ReceiptListRow[]).map(toReceiptListItem),
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
    };
  }

  // ── Exceptions (canonical state predicates only) ────────────────────────

  private applyException(base: ReturnType<FinancialAdminService['contributionBase']>, category: ExceptionCategory) {
    if (category === 'AWAITING_SETTLEMENT_OVERDUE') {
      return base
        .where('fc.state', '=', 'AWAITING_SETTLEMENT')
        .where('fc.expires_at', 'is not', null)
        .where('fc.expires_at', '<', new Date());
    }
    const state = CONTRIBUTION_STATE_EXCEPTIONS[category];
    if (state) return base.where('fc.state', '=', state);
    const refundStatus = REFUND_STATUS_EXCEPTIONS[category];
    if (refundStatus) return base.where('fr.status', '=', refundStatus);
    // EVIDENCE_PENDING_REVIEW
    return base.where('fc.id', 'in', (eb) =>
      eb
        .selectFrom('financial_settlement_evidence as pe')
        .select('pe.financial_contribution_id')
        .where('pe.review_status', '=', 'PENDING_REVIEW'),
    );
  }

  async exceptionCounts(): Promise<Record<ExceptionCategory, number>> {
    const counts = await Promise.all(
      EXCEPTION_CATEGORIES.map(async (category) => {
        const row = await this.applyException(this.contributionBase(), category)
          .select((eb) => eb.fn.count<number>('fc.id').distinct().as('total'))
          .executeTakeFirst();
        return [category, Number(row?.total ?? 0)] as const;
      }),
    );
    return Object.fromEntries(counts) as Record<ExceptionCategory, number>;
  }

  async listExceptions(filters: { category?: string } & PageInput) {
    const category = (filters.category ?? 'AWAITING_SETTLEMENT_OVERDUE') as ExceptionCategory;
    const [counts, page] = await Promise.all([
      this.exceptionCounts(),
      this.pageContributions(this.applyException(this.contributionBase(), category), filters),
    ]);
    return { category, counts, ...page };
  }

  // ── Search (fixed fields, parameterized predicates) ─────────────────────

  async search(filters: { q: string } & PageInput) {
    const terms = buildSearchTerms(filters.q);
    const base = this.contributionBase().where((eb) =>
      eb.or(
        terms.map((term) => {
          switch (term.field) {
            case 'CONTRIBUTION_REFERENCE':
              return eb('fc.uuid', 'like', term.value);
            case 'RECEIPT_NUMBER':
              return eb('r.receipt_number', 'like', term.value);
            case 'PROVIDER_REFERENCE':
              return eb.or([
                eb('fc.active_settlement_reference', '=', term.value),
                eb('fr.provider_reference', '=', term.value),
                eb('fc.id', 'in', eb
                  .selectFrom('financial_transactions as st')
                  .select('st.contribution_id')
                  .where('st.provider_reference', '=', term.value)),
              ]);
            case 'CONTRIBUTOR_NAME':
              return eb('u.full_name', 'like', term.value);
            case 'CONTRIBUTOR_USERNAME':
              return eb('u.username', 'like', term.value);
            case 'MEMBERSHIP_NUMBER':
              return eb('fc.payer_user_id', 'in', eb
                .selectFrom('memberships as sm')
                .select('sm.user_id')
                .where('sm.membership_number', '=', term.value)
                .where('sm.user_id', 'is not', null));
          }
        }),
      ),
    );
    return this.pageContributions(base, filters);
  }
}

// Collapses (status, currency) refund rows into per-status counts.
function aggregate(rows: Array<{ key: unknown; count: unknown }>) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(String(r.key), (totals.get(String(r.key)) ?? 0) + Number(r.count));
  return [...totals].map(([key, count]) => ({ key, count }));
}
