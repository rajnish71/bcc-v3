// backend/src/modules/financial/admin/financial-admin-classification.ts
//
// Track 4 -- recognition of the TEST_MODE_NON_GENUINE_SETTLEMENT reporting
// classification (B1). Classification comes ONLY from stored, attributed,
// append-only financial_audit_log annotations -- never from Razorpay
// payloads or provider account IDs at reporting time.
//
// Recognised annotation forms (verified read-only in production,
// 2026-10-07, audit rows 17, 21, 41, 42, 43 -- the only documented forms):
//
//   event_type    = 'SETTLEMENT_RECONCILIATION_ANNOTATED'
//   metadata_json = JSON object (TEXT column) with top-level string key
//                   settlementClassification = 'TEST_MODE_NON_GENUINE_SETTLEMENT'
//     • Option I form (17, 21): also correctionContributionId (integer)
//     • Historical form (41-43): no correctionContributionId
//
// A contribution is classified when AT LEAST ONE such row exists for it
// (EXISTS semantics: several annotations never multiply anything). Matching
// order: contribution_id, then event_type, then the JSON read -- and the
// JSON read sits inside CASE WHEN JSON_VALID(...) so malformed metadata on
// any row can never raise an error. Only the exact top-level key/value is
// compared; metadata that merely contains the marker string elsewhere does
// not match.

import { sql, type RawBuilder, type SqlBool } from 'kysely';

export const CLASSIFICATION_EVENT_TYPE = 'SETTLEMENT_RECONCILIATION_ANNOTATED';
export const TEST_MODE_MARKER = 'TEST_MODE_NON_GENUINE_SETTLEMENT';
export const CLASSIFICATION_JSON_PATH = '$.settlementClassification';

export type SettlementClassificationValue = typeof TEST_MODE_MARKER | null;

export const CLASSIFICATION_FILTERS = ['TEST_MODE', 'UNCLASSIFIED'] as const;
export type ClassificationFilter = (typeof CLASSIFICATION_FILTERS)[number];

// EXISTS (...) for the contribution id column `contributionIdRef`
// (e.g. 'fc.id'). Evaluates to 1/0 in MySQL.
export function classifiedSql(contributionIdRef: string): RawBuilder<SqlBool> {
  return sql<SqlBool>`EXISTS (SELECT 1 FROM financial_audit_log AS fa WHERE fa.contribution_id = ${sql.ref(contributionIdRef)} AND fa.event_type = ${CLASSIFICATION_EVENT_TYPE} AND (CASE WHEN JSON_VALID(fa.metadata_json) THEN JSON_UNQUOTE(JSON_EXTRACT(fa.metadata_json, ${CLASSIFICATION_JSON_PATH})) END) = ${TEST_MODE_MARKER})`;
}

export function notClassifiedSql(contributionIdRef: string): RawBuilder<SqlBool> {
  return sql<SqlBool>`NOT ${classifiedSql(contributionIdRef)}`;
}

export function toClassification(flag: unknown): SettlementClassificationValue {
  return Number(flag) === 1 || flag === true ? TEST_MODE_MARKER : null;
}

// Application-side reading of ONE annotation row's metadata (detail view).
// Mirrors classifiedSql(): invalid JSON, a non-object, or any other value
// for the top-level key is "not a recognised annotation".
export interface RecognisedAnnotation {
  marker: typeof TEST_MODE_MARKER;
  reason: string | null;
  correctionContributionId: number | null;
}

export function readAnnotationMetadata(eventType: unknown, metadataJson: unknown): RecognisedAnnotation | null {
  if (eventType !== CLASSIFICATION_EVENT_TYPE || metadataJson === null || metadataJson === undefined) return null;
  let meta: unknown = metadataJson;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  if (m.settlementClassification !== TEST_MODE_MARKER) return null;
  return {
    marker: TEST_MODE_MARKER,
    reason: typeof m.reconciliationReason === 'string' ? m.reconciliationReason : null,
    correctionContributionId: Number.isInteger(m.correctionContributionId) ? Number(m.correctionContributionId) : null,
  };
}
