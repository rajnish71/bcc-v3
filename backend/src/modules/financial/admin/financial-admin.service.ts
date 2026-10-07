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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  toClassificationDetail,
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
import { buildSearchTerms, escapeLike, rejectTemporaryIdentifier } from './financial-admin-search';
import {
  CLASSIFICATION_EVENT_TYPE,
  classifiedSql,
  notClassifiedSql,
  readAnnotationMetadata,
} from './financial-admin-classification';
import {
  computeMoneyMetrics,
  computeOperationalMetrics,
  type ContributionMetricRow,
} from './financial-admin-metrics';
import {
  RECEIPT_NEEDS_REVIEW_SQL,
  asList,
  issuedRange,
  resolveReceiptSort,
} from './financial-admin-receipts';

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
          classifiedSql('fc.id').as('classified'),
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
  // Record counts (unchanged), B2 money metrics per currency excluding
  // contributions classified TEST_MODE_NON_GENUINE_SETTLEMENT (reported
  // separately as testMode), and B3 operational metrics that ignore
  // classification. Money and operational metrics are computed from ONE row
  // per contribution (financial-admin-metrics.ts) -- no double counting.

  async overview() {
    const [byState, byModule, refundRows, receiptRow, exceptionCounts, metricRows] = await Promise.all([
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
        .selectFrom('financial_refunds')
        .select((eb) => ['status as key', eb.fn.countAll<number>().as('count')])
        .groupBy('status')
        .execute(),
      db.selectFrom('receipts').select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirst(),
      this.exceptionCounts(),
      this.contributionMetricRows(),
    ]);

    return {
      contributionsByState: zeroFilled(CONTRIBUTION_STATE_KEYS, byState),
      contributionsByBusinessModule: byModule.map((r) => ({ businessModule: String(r.key), count: Number(r.count) })),
      refundsByStatus: zeroFilled(REFUND_STATUSES, refundRows),
      receiptsIssued: Number(receiptRow?.count ?? 0),
      exceptions: exceptionCounts,
      money: computeMoneyMetrics(metricRows),
      operational: computeOperationalMetrics(metricRows),
    };
  }

  // One row per contribution: the refund and receipt joins are 1:1 (unique
  // contribution_id), transactions are counted in a scalar subquery and the
  // classification is an EXISTS flag.
  private async contributionMetricRows(): Promise<ContributionMetricRow[]> {
    const rows = await db
      .selectFrom('financial_contributions as fc')
      .leftJoin('financial_refunds as fr', 'fr.contribution_id', 'fc.id')
      .leftJoin('receipts as r', 'r.contribution_id', 'fc.id')
      .select((eb) => [
        'fc.state',
        'fc.currency',
        'fc.amount_paise',
        'fr.status as refund_status',
        'fr.amount_paise as refund_amount_paise',
        'fr.currency as refund_currency',
        'r.amount_paise as receipt_amount_paise',
        eb
          .selectFrom('financial_transactions as mt')
          .select((e) => e.fn.countAll<number>().as('n'))
          .whereRef('mt.contribution_id', '=', 'fc.id')
          .where('mt.outcome', '=', 'SUCCEEDED')
          .as('succeeded_count'),
        classifiedSql('fc.id').as('classified'),
      ])
      .execute();
    return rows as unknown as ContributionMetricRow[];
  }

  // ── Contributions ────────────────────────────────────────────────────────

  async listContributions(filters: { state?: string; businessModule?: string; classification?: string } & PageInput) {
    let base = this.contributionBase();
    if (filters.state) base = base.where('fc.state', '=', filters.state as ContributionState);
    if (filters.businessModule) base = base.where('fc.business_module', '=', filters.businessModule);
    if (filters.classification === 'TEST_MODE') base = base.where(classifiedSql('fc.id'));
    if (filters.classification === 'UNCLASSIFIED') base = base.where(notClassifiedSql('fc.id'));
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

    const [transactions, refund, evidence, audit, receipt, classification] = await Promise.all([
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
      this.classificationDetail(contributionId),
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
      classification,
    };
  }

  // C3: the contribution's recognised annotation, or null. The only writer
  // (FinancialContributionService's annotateSettlementReconciliation) locks
  // the contribution row and refuses to write a second
  // SETTLEMENT_RECONCILIATION_ANNOTATED row, so at most one exists per
  // contribution (verified in production 2026-10-07: one each for 4, 8, 9,
  // 12, 13). Rows are read in id order only so the result is deterministic;
  // this is not a precedence rule between annotations. Unrecognised rows
  // (malformed / other metadata) are skipped. The numeric
  // correctionContributionId is resolved to the target's UUID (null if the
  // target does not exist) and is never returned itself.
  private async classificationDetail(contributionId: number) {
    const rows = await db
      .selectFrom('financial_audit_log as fa')
      .leftJoin('users as au', 'au.id', 'fa.actor_user_id')
      .select(['fa.event_type', 'fa.metadata_json', 'fa.actor_type', 'fa.created_at', 'au.full_name as actor_name'])
      .where('fa.contribution_id', '=', contributionId)
      .where('fa.event_type', '=', CLASSIFICATION_EVENT_TYPE)
      .orderBy('fa.id', 'asc')
      .execute();

    for (const row of rows) {
      const annotation = readAnnotationMetadata(row.event_type, row.metadata_json);
      if (!annotation) continue;
      let correctionContributionReference: string | null = null;
      if (annotation.correctionContributionId !== null) {
        const target = await db
          .selectFrom('financial_contributions')
          .select('uuid')
          .where('id', '=', annotation.correctionContributionId)
          .executeTakeFirst();
        correctionContributionReference = target?.uuid ?? null;
      }
      return toClassificationDetail({
        marker: annotation.marker,
        actorType: row.actor_type,
        actorDisplayName: row.actor_name ?? null,
        annotatedAt: row.created_at,
        reason: annotation.reason,
        correctionContributionReference,
      });
    }
    return null;
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

  // ── Receipts (C2) ────────────────────────────────────────────────────────
  //
  // Status = the contribution's canonical state; the refund is supplemental.
  // Filters AND together; repeated `state` values OR together (REVIEW = any
  // review flag). Sorting is a fixed allow-list with receipt_number ASC as
  // the deterministic tie-breaker. The total uses the identical filters.

  async listReceipts(filters: {
    state?: string | string[];
    businessModule?: string;
    classification?: string;
    issuedFrom?: string;
    issuedTo?: string;
    receiptNumber?: string;
    q?: string;
    sort?: string;
    order?: string;
  } & PageInput) {
    const { page, pageSize, offset } = clampPage(filters.page, filters.pageSize);
    const { fromEpoch, toEpochExclusive } = issuedRange(filters.issuedFrom, filters.issuedTo);
    const { sort, order } = resolveReceiptSort(filters.sort, filters.order);

    let base = db
      .selectFrom('receipts as r')
      .innerJoin('financial_contributions as fc', 'fc.id', 'r.contribution_id')
      .innerJoin('users as u', 'u.id', 'fc.payer_user_id')
      .leftJoin('financial_refunds as fr', 'fr.contribution_id', 'fc.id');

    const statuses = asList(filters.state);
    if (statuses.length > 0) {
      const states = statuses.filter((v) => v !== 'REVIEW') as ContributionState[];
      const review = statuses.includes('REVIEW');
      base = base.where((eb) =>
        eb.or([
          ...(states.length > 0 ? [eb('fc.state', 'in', states)] : []),
          ...(review ? [eb(RECEIPT_NEEDS_REVIEW_SQL, '=', 1)] : []),
        ]),
      );
    }
    if (filters.businessModule) base = base.where('fc.business_module', '=', filters.businessModule);
    if (filters.classification === 'TEST_MODE') base = base.where(classifiedSql('fc.id'));
    if (filters.classification === 'UNCLASSIFIED') base = base.where(notClassifiedSql('fc.id'));
    if (fromEpoch !== null) base = base.where(sql<number>`UNIX_TIMESTAMP(r.issued_at)`, '>=', fromEpoch);
    if (toEpochExclusive !== null) base = base.where(sql<number>`UNIX_TIMESTAMP(r.issued_at)`, '<', toEpochExclusive);
    if (filters.receiptNumber) base = base.where('r.receipt_number', 'like', `${escapeLike(filters.receiptNumber)}%`);
    if (filters.q !== undefined) {
      const q = filters.q.trim();
      if (q.length < 2) throw new BadRequestException('q must be at least 2 characters');
      rejectTemporaryIdentifier(q);
      const like = `%${escapeLike(q)}%`;
      base = base.where((eb) => eb.or([eb('u.full_name', 'like', like), eb('u.username', 'like', like)]));
    }

    let listQuery = base.select((eb) => [
      'r.uuid', 'r.receipt_number', 'r.amount_paise', 'r.currency', 'r.issued_at',
      'fc.uuid as contribution_uuid', 'fc.business_module', 'fc.state as contribution_state',
      'fc.amount_paise as contribution_amount_paise',
      'fr.status as refund_status', 'fr.amount_paise as refund_amount_paise', 'fr.resolved_at as refund_resolved_at',
      'u.full_name as contributor_name', 'u.username as contributor_username',
      eb
        .selectFrom('memberships as m')
        .select('m.membership_number')
        .whereRef('m.user_id', '=', 'fc.payer_user_id')
        .where(sql<boolean>`m.membership_number REGEXP ${PERMANENT_MEMBERSHIP_NUMBER_SQL}`)
        .orderBy('m.id', 'desc')
        .limit(1)
        .as('membership_number'),
      eb
        .selectFrom('financial_transactions as rt')
        .select((e) => e.fn.countAll<number>().as('n'))
        .whereRef('rt.contribution_id', '=', 'fc.id')
        .where('rt.outcome', '=', 'SUCCEEDED')
        .as('succeeded_count'),
      classifiedSql('fc.id').as('classified'),
    ]);

    switch (sort) {
      case 'issued_at':
        listQuery = listQuery.orderBy('r.issued_at', order);
        break;
      case 'receipt_number':
        listQuery = listQuery.orderBy('r.receipt_number', order);
        break;
      case 'amount_paise':
        listQuery = listQuery.orderBy('r.amount_paise', order);
        break;
      case 'contributor':
        // Display name, NULLS LAST in both directions.
        listQuery = listQuery.orderBy(sql`u.full_name IS NULL`, 'asc').orderBy('u.full_name', order);
        break;
    }
    if (sort !== 'receipt_number') listQuery = listQuery.orderBy('r.receipt_number', 'asc');

    const [rows, countRow] = await Promise.all([
      listQuery.limit(pageSize).offset(offset).execute(),
      base.select((eb) => eb.fn.countAll<number>().as('total')).executeTakeFirst(),
    ]);

    return {
      items: (rows as unknown as ReceiptListRow[]).map(toReceiptListItem),
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
      sort,
      order,
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
