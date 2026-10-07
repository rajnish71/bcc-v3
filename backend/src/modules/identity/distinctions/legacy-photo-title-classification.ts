// backend/src/modules/identity/distinctions/legacy-photo-title-classification.ts
//
// Legacy user_photo_titles -> Photographic Distinctions classification.
// Step CLASSIFY of SNAPSHOT -> CLASSIFY -> MAP -> VERIFY -> CARRY FORWARD ->
// RETIRE. Pure and deterministic: same snapshot rows in, same report out.
// It never reads or writes the database and performs NO carry-forward.
//
// Classes:
//   MAPPABLE                exact (body_code, title_code) match on the
//                           Human Authority-listed valid legacy distinctions.
//   REQUIRES_CLASSIFICATION known GPU values awaiting HA classification, and
//                           any row whose value is not an exact listed match
//                           (e.g. free text typed through the legacy editor).
//                           Preserved verbatim; no meaning is inferred.
//   NOT_MAPPABLE            body_code OTHER: no catalogue institution exists
//                           (there is deliberately no generic OTHER
//                           institution). Preserved for review/re-declaration.
//
// No dependencies, so the report generator can run it directly under Node
// (scripts/distinctions/classify_legacy_photo_titles.mjs).

export interface LegacyPhotoTitleRow {
  id: number;
  user_id: number;
  body_code: string;
  title_code: string;
  body_name: string | null;
  sort_order: number;
}

export type LegacyClassification = 'MAPPABLE' | 'REQUIRES_CLASSIFICATION' | 'NOT_MAPPABLE';

export interface ClassifiedLegacyRow extends LegacyPhotoTitleRow {
  classification: LegacyClassification;
  proposed_institution_code: string | null;
  proposed_distinction_code: string | null;
  reason: string;
}

/** HA-identified exact valid legacy distinctions (Phase 1 instruction §4). */
export const MAPPABLE_LEGACY_DISTINCTIONS: ReadonlyArray<{ body: string; title: string }> = [
  { body: 'FIP', title: 'AFIP' },
  { body: 'FIP', title: 'EFIP' },
  { body: 'PSA', title: 'PPSA' },
  { body: 'FIAP', title: 'AFIAP' },
];

/** Known GPU values that need HA classification before carry-forward. */
export const GPU_PENDING_CLASSIFICATION: ReadonlyArray<string> = ['GPU-CR3', 'GPU VIP-3'];

export function classifyLegacyPhotoTitle(row: LegacyPhotoTitleRow): ClassifiedLegacyRow {
  const body = row.body_code;
  const title = row.title_code;
  const out = (
    classification: LegacyClassification,
    reason: string,
    inst: string | null = null,
    dist: string | null = null,
  ): ClassifiedLegacyRow => ({
    ...row,
    classification,
    proposed_institution_code: inst,
    proposed_distinction_code: dist,
    reason,
  });

  if (body === 'OTHER') {
    return out(
      'NOT_MAPPABLE',
      `Body "${row.body_name ?? '(none)'}" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration.`,
    );
  }

  if (MAPPABLE_LEGACY_DISTINCTIONS.some((m) => m.body === body && m.title === title)) {
    return out(
      'MAPPABLE',
      `Exact match on HA-identified valid legacy distinction ${body} / ${title}. Carry-forward requires HA approval of this report and creation of the catalogue entry (name, badge eligibility).`,
      body,
      title,
    );
  }

  if (body === 'GPU' && GPU_PENDING_CLASSIFICATION.includes(title)) {
    return out(
      'REQUIRES_CLASSIFICATION',
      `GPU value "${title}" requires Human Authority classification before carry-forward. No semantic meaning is inferred.`,
      'GPU',
      null,
    );
  }

  return out(
    'REQUIRES_CLASSIFICATION',
    `Value "${title}" under ${body} is not an exact HA-identified legacy distinction. Preserved verbatim for HA review; no mapping is guessed.`,
    ['FIP', 'FIAP', 'PSA', 'RPS', 'GPU'].includes(body) ? body : null,
    null,
  );
}

/** Deterministic order: legacy row id ascending. */
export function classifyLegacyPhotoTitles(rows: LegacyPhotoTitleRow[]): ClassifiedLegacyRow[] {
  return [...rows].sort((a, b) => a.id - b.id).map(classifyLegacyPhotoTitle);
}

export function summarizeClassification(rows: ClassifiedLegacyRow[]): Record<LegacyClassification, number> {
  const s: Record<LegacyClassification, number> = { MAPPABLE: 0, REQUIRES_CLASSIFICATION: 0, NOT_MAPPABLE: 0 };
  for (const r of rows) s[r.classification]++;
  return s;
}
