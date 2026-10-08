// backend/src/modules/membership/tenure-ledger/historical-reconciliation.ts
//
// TENURE-ARCH-001 v1.1 WP4 -- Historical Tenure Evidence & Ledger
// Reconciliation framework.
//
//   historical evidence -> verified recognized service periods
//                       -> reconciled tenure ledger -> deterministic validation
//
// It is NOT: historical evidence -> Senior award. Nothing here awards,
// evaluates or exposes Senior status, touches senior_status_overlays,
// member_recognitions or WP0 containment, or runs on any schedule.
//
// Governing rules (TENURE-ARCH-001 v1.1 §5.2, §5.5, §10, R6; Human
// Authority WP4 decision):
//   * LEADS vs EVIDENCE. join_year, join_month, membership-number YYYY/MM,
//     users.year_joined_bcc, migration-originated dates (activated_at,
//     0035/0078/0080 values) and recognition rows are INVESTIGATIVE LEADS.
//     A lead is a different type from an evidence record, carries no
//     verification fields and can never be inserted. A candidate never
//     silently becomes verified.
//   * Only a supplied EvidenceRecord with a non-lead source, a non-blank
//     evidence reference, a resolvable identity, a named human verifier and a
//     verification time is ACCEPTED, and only in one of two shapes:
//       - COUNTING: PERIOD evidence with established continuity;
//       - NON-COUNTING HA YEAR BOUNDARY: basis GOVERNANCE_ATTESTATION,
//         evidence_kind BOUNDARY, YEAR/BOUNDARY start, no end, continuity
//         NOT established (a Human Authority certified joining year). It
//         records the certified start boundary, stays YEAR precision (the
//         stored YYYY-01-01 is the 0119 encoding, not a claimed joining
//         day) and, because continuity is false, contributes zero service
//         in the WP1 engine until continuity is separately attested by a
//         superseding row.
//     Everything else is UNRESOLVED with explicit reason codes. No period is
//     ever invented to make the engine produce a result.
//   * Group membership never transfers tenure (R2); membership links must
//     be the same user's own INDIVIDUAL membership.
//   * Genuine gaps are preserved (reported, never filled). Overlaps are
//     reported and coalesced by the WP1 engine, never double counted.
//     Contradictory evidence is held, never silently merged.
//   * Reconciliation is pure and deterministic; the report carries a
//     content hash. Insertion is idempotent, append-only and re-validates
//     every item at write time.
//
// Existing WP2 schema only: recognized_service_periods (0119, 0126). No
// migration, no parallel table.

import { createHash } from 'crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db';
import { logMembershipAudit } from '../shared/membership-audit.util';
import { compareCivilDates, type CivilDate } from '../tenure/civil-date';
import { resolveBoundary } from '../tenure/service-period-resolution';
import { calculateRecognizedService } from '../tenure/tenure-calculator';
import type {
  PeriodEvidenceKind,
  RecognizedServicePeriodInput,
  RecognizedServiceResult,
  ServiceBoundaryInput,
} from '../tenure/tenure.types';
import { TENURE_AUDIT_EVENTS } from './tenure-ledger.vocabulary';

// ── Leads (never evidence) ────────────────────────────────────────────────

export const LEAD_SOURCES = [
  'MEMBERSHIPS_JOIN_YEAR',
  'MEMBERSHIPS_JOIN_MONTH',
  'MEMBERSHIP_NUMBER_YYYYMM',
  'USERS_YEAR_JOINED_BCC',
  'MIGRATED_ACTIVATED_AT',
  'LEGACY_001_REGISTER',
  'RECOGNITION_ROW',
  'SELF_DECLARED',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface HistoricalLead {
  userId: number;
  membershipId: number | null;
  source: LeadSource;
  value: string; // as found, e.g. '2019' or '2019-11' -- never parsed into a period
  note?: string;
}

// ── Supplied evidence ─────────────────────────────────────────────────────

// Evidence source kinds that MAY back a period. Deliberately disjoint from
// LEAD_SOURCES: a lead source presented as evidence is rejected.
export const EVIDENCE_SOURCES = [
  'HISTORICAL_ROSTER',
  'MEMBERSHIP_PAYMENT_RECORD',
  'DATED_MEMBERSHIP_DOCUMENT',
  'OTHER_VERIFIED_BCC_RECORD',
  'GOVERNANCE_ATTESTATION',
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export type IdentityStatus = 'MAPPED' | 'AMBIGUOUS' | 'UNMAPPED';

export interface HistoricalEvidenceRecord {
  evidenceId: string; // stable id of this record in the supplied evidence set
  source: string; // validated against EVIDENCE_SOURCES; anything else is not evidence
  basis: 'HISTORICAL_RECONCILIATION' | 'GOVERNANCE_ATTESTATION';
  userId: number;
  membershipId: number | null;
  identityStatus: IdentityStatus; // outcome of the identity-mapping step for historical identifiers
  evidenceReference: string; // pointer to the document/roster/payment record
  evidenceNote?: string | null;
  start: ServiceBoundaryInput;
  end: ServiceBoundaryInput | null; // null = open-ended
  evidenceKind: PeriodEvidenceKind;
  continuityEstablished: boolean;
  verifierUserId: number | null; // the named human verifier (required)
  verifiedAt: string | null; // 'YYYY-MM-DD HH:MM:SS'
}

// ── Reason codes ──────────────────────────────────────────────────────────

export type UnresolvedReason =
  | 'LEAD_ONLY_NO_EVIDENCE'
  | 'SOURCE_NOT_EVIDENCE'
  | 'BASIS_NOT_HISTORICAL'
  | 'IDENTITY_UNMAPPED'
  | 'IDENTITY_AMBIGUOUS'
  | 'MISSING_EVIDENCE_REFERENCE'
  | 'MISSING_VERIFIER'
  | 'MISSING_VERIFIED_AT'
  | 'POINT_EVIDENCE'
  | 'EVIDENCE_KIND_NOT_PERIOD'
  | 'CONTINUITY_NOT_ESTABLISHED'
  | 'INVALID_BOUNDARY'
  | 'INVERTED_INTERVAL'
  | 'MEMBERSHIP_LINK_INVALID'
  | 'CONTRADICTORY_EVIDENCE';

export type FindingType =
  | 'DUPLICATE_EVIDENCE'
  | 'ALREADY_IN_LEDGER'
  | 'OVERLAP'
  | 'GAP'
  | 'CONTRADICTION'
  | 'MEMBERSHIP_WITHOUT_LEDGER_PERIOD'
  | 'LEDGER_ROW_UNSUPPORTED';

export interface Finding {
  type: FindingType;
  userId: number;
  detail: string;
  refs: string[]; // sorted evidence ids / ledger ids ('L12') involved
}

export interface UnresolvedEntry {
  userId: number;
  membershipId: number | null;
  evidenceId: string | null; // null = lead-only candidate (no evidence supplied)
  reasons: UnresolvedReason[]; // sorted
  leads: Array<{ source: LeadSource; value: string }>; // sorted
  availableEvidence: string[]; // evidence ids examined for this entry
}

// ── Ledger / membership context (read from the existing tables) ───────────

export interface LedgerPeriodContext {
  id: number;
  userId: number;
  membershipId: number | null;
  start: ServiceBoundaryInput;
  end: ServiceBoundaryInput | null;
  evidenceKind: PeriodEvidenceKind;
  continuityEstablished: boolean;
  basis: 'NATIVE_LIFECYCLE' | 'HISTORICAL_RECONCILIATION' | 'GOVERNANCE_ATTESTATION';
  evidenceReference: string | null;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  verifiedByUserId: number | null;
  correctionState: 'CURRENT' | 'CORRECTED' | 'SUPERSEDED';
}

export interface MembershipContext {
  id: number;
  userId: number | null;
  ownerType: 'INDIVIDUAL' | 'GROUP';
  parentMembershipId: number | null;
  membershipNumber: string | null;
  lifecycleState: string;
}

export interface PlannedPeriod {
  evidenceId: string;
  record: HistoricalEvidenceRecord;
  idempotencyKey: string;
  // true = PERIOD evidence with continuity (counts in WP1); false = a
  // non-counting HA year-boundary record.
  counting: boolean;
}

export interface ReconciliationInput {
  memberships: ReadonlyArray<MembershipContext>;
  leads: ReadonlyArray<HistoricalLead>;
  evidence: ReadonlyArray<HistoricalEvidenceRecord>;
  ledger: ReadonlyArray<LedgerPeriodContext>;
  evaluationDate: CivilDate; // T for the validation calculation
}

export type ReconciliationStatus = 'READY_AWAITING_VERIFIED_HISTORICAL_EVIDENCE' | 'EVIDENCE_EVALUATED';

export interface ReconciliationReport {
  status: ReconciliationStatus;
  summary: {
    memberships_reviewed: number;
    leads_retained: number;
    evidence_records_supplied: number;
    verified_periods: number;
    recognized_service_periods_to_insert: number;
    non_counting_boundary_records: number;
    unresolved_candidates: number;
    contradictory_cases: number;
    findings: number;
  };
  planned: PlannedPeriod[];
  unresolved: UnresolvedEntry[];
  findings: Finding[];
  validation: Array<{ userId: number; service: RecognizedServiceResult }>;
  reportHash: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isBlank = (v: string | null | undefined) => v == null || v.trim() === '';

// Stored column value for a stated boundary (0119 encoding): MONTH -> 1st of
// month, YEAR -> 1 January. Resolution happens in the engine, not here.
export function storedBoundaryDate(b: ServiceBoundaryInput): string {
  if (b.precision === 'EXACT') return b.value;
  if (b.precision === 'MONTH') return `${b.value}-01`;
  return `${b.value}-01-01`;
}

const boundaryKey = (b: ServiceBoundaryInput | null): string =>
  b === null ? 'OPEN' : `${b.precision}:${b.value}:${b.precision === 'EXACT' ? '-' : b.attestation}`;

export function idempotencyKeyFor(r: HistoricalEvidenceRecord): string {
  return [r.userId, r.basis, r.evidenceReference.trim(), boundaryKey(r.start), boundaryKey(r.end)].join('|');
}

function toEngineInput(id: string, r: { start: ServiceBoundaryInput; end: ServiceBoundaryInput | null; evidenceKind: PeriodEvidenceKind; continuityEstablished: boolean }): RecognizedServicePeriodInput {
  return {
    periodId: id,
    start: r.start,
    end: r.end,
    evidenceKind: r.evidenceKind,
    continuityEstablished: r.continuityEstablished,
    verificationStatus: 'VERIFIED',
    lifecycleState: 'CURRENT',
  };
}

function resolveInterval(r: { start: ServiceBoundaryInput; end: ServiceBoundaryInput | null }): { start: CivilDate; end: CivilDate | null } | 'INVALID' | 'INVERTED' {
  try {
    const start = resolveBoundary(r.start, 'START');
    const end = r.end === null ? null : resolveBoundary(r.end, 'END');
    if (end !== null && compareCivilDates(end, start) < 0) return 'INVERTED';
    return { start, end };
  } catch {
    return 'INVALID';
  }
}

// ── Evidence classification (pure) ────────────────────────────────────────

// The single non-PERIOD shape the framework accepts: a Human Authority
// certified joining year. Deliberately narrow -- any deviation (other basis,
// MONTH/EXACT start, PERIOD attestation, an end, continuity true, other
// evidence kind) is NOT this shape and is judged by the unchanged rules.
export function isHaYearBoundaryRecord(r: HistoricalEvidenceRecord): boolean {
  return (
    r.basis === 'GOVERNANCE_ATTESTATION' &&
    r.evidenceKind === 'BOUNDARY' &&
    r.continuityEstablished === false &&
    r.start.precision === 'YEAR' &&
    r.start.attestation === 'BOUNDARY' &&
    r.end === null
  );
}

export function classifyEvidence(
  r: HistoricalEvidenceRecord,
  membershipsById: ReadonlyMap<number, MembershipContext>,
): { accepted: true } | { accepted: false; reasons: UnresolvedReason[] } {
  const reasons = new Set<UnresolvedReason>();

  if (!(EVIDENCE_SOURCES as readonly string[]).includes(r.source)) reasons.add('SOURCE_NOT_EVIDENCE');
  if (r.basis !== 'HISTORICAL_RECONCILIATION' && r.basis !== 'GOVERNANCE_ATTESTATION') reasons.add('BASIS_NOT_HISTORICAL');
  if (r.identityStatus === 'UNMAPPED') reasons.add('IDENTITY_UNMAPPED');
  else if (r.identityStatus === 'AMBIGUOUS') reasons.add('IDENTITY_AMBIGUOUS');
  if (isBlank(r.evidenceReference)) reasons.add('MISSING_EVIDENCE_REFERENCE');
  if (r.verifierUserId == null) reasons.add('MISSING_VERIFIER');
  if (isBlank(r.verifiedAt)) reasons.add('MISSING_VERIFIED_AT');

  if (!isHaYearBoundaryRecord(r)) {
    if (r.evidenceKind === 'POINT') reasons.add('POINT_EVIDENCE');
    else if (r.evidenceKind !== 'PERIOD') reasons.add('EVIDENCE_KIND_NOT_PERIOD'); // BOUNDARY evidence alone never establishes continuity (§5.5)
    if (r.continuityEstablished !== true) reasons.add('CONTINUITY_NOT_ESTABLISHED');
  }

  const interval = resolveInterval(r);
  if (interval === 'INVALID') reasons.add('INVALID_BOUNDARY');
  else if (interval === 'INVERTED') reasons.add('INVERTED_INTERVAL');

  if (r.membershipId !== null) {
    const m = membershipsById.get(r.membershipId);
    if (!m || m.ownerType !== 'INDIVIDUAL' || m.userId !== r.userId || m.parentMembershipId !== null) {
      reasons.add('MEMBERSHIP_LINK_INVALID');
    }
  }

  return reasons.size === 0 ? { accepted: true } : { accepted: false, reasons: [...reasons].sort(cmp) as UnresolvedReason[] };
}

// ── Reconciliation (pure, deterministic) ──────────────────────────────────

const ledgerCounted = (l: LedgerPeriodContext) =>
  l.correctionState === 'CURRENT' && l.verificationStatus === 'VERIFIED' && l.evidenceKind !== 'POINT' && l.continuityEstablished;

function ledgerRowSupported(l: LedgerPeriodContext): boolean {
  if (l.basis === 'NATIVE_LIFECYCLE') return true; // native provenance is checked by the WP3 writer/CHECK
  return !isBlank(l.evidenceReference) && l.verifiedByUserId != null;
}

export function reconcileHistoricalEvidence(input: ReconciliationInput): ReconciliationReport {
  const membershipsById = new Map(input.memberships.map((m) => [m.id, m] as const));
  const leadsByUser = new Map<number, HistoricalLead[]>();
  for (const l of [...input.leads].sort((a, b) => a.userId - b.userId || cmp(a.source, b.source) || cmp(a.value, b.value))) {
    const arr = leadsByUser.get(l.userId) ?? [];
    arr.push(l);
    leadsByUser.set(l.userId, arr);
  }
  const leadView = (userId: number) =>
    (leadsByUser.get(userId) ?? []).map((l) => ({ source: l.source, value: l.value }));

  const evidence = [...input.evidence].sort((a, b) => cmp(a.evidenceId, b.evidenceId));
  const findings: Finding[] = [];
  const unresolved: UnresolvedEntry[] = [];
  const planned: PlannedPeriod[] = [];

  // 1. Classify each supplied record.
  type Classified = { rec: HistoricalEvidenceRecord; reasons: UnresolvedReason[] };
  const classified: Classified[] = evidence.map((rec) => {
    const c = classifyEvidence(rec, membershipsById);
    return { rec, reasons: c.accepted ? [] : c.reasons };
  });

  // 2. Duplicate evidence (same idempotency key): keep the smallest id.
  const seenKey = new Map<string, string>();
  const dropped = new Set<string>();
  for (const c of classified) {
    if (c.reasons.length) continue;
    const k = idempotencyKeyFor(c.rec);
    const first = seenKey.get(k);
    if (first === undefined) seenKey.set(k, c.rec.evidenceId);
    else {
      dropped.add(c.rec.evidenceId);
      findings.push({ type: 'DUPLICATE_EVIDENCE', userId: c.rec.userId, detail: `Evidence ${c.rec.evidenceId} duplicates ${first}; not planned.`, refs: [first, c.rec.evidenceId].sort(cmp) });
    }
  }

  // 3. Contradictions: same user + same evidence reference stating different
  //    intervals. All members of the group are held; nothing is merged.
  const byRef = new Map<string, Classified[]>();
  for (const c of classified) {
    if (c.reasons.length || dropped.has(c.rec.evidenceId)) continue;
    const k = `${c.rec.userId}|${c.rec.evidenceReference.trim()}`;
    byRef.set(k, [...(byRef.get(k) ?? []), c]);
  }
  for (const group of byRef.values()) {
    const shapes = new Set(group.map((g) => `${boundaryKey(g.rec.start)}>${boundaryKey(g.rec.end)}`));
    if (shapes.size > 1) {
      const ids = group.map((g) => g.rec.evidenceId).sort(cmp);
      findings.push({ type: 'CONTRADICTION', userId: group[0].rec.userId, detail: `Evidence reference '${group[0].rec.evidenceReference.trim()}' states differing intervals; all held unresolved.`, refs: ids });
      for (const g of group) g.reasons = ['CONTRADICTORY_EVIDENCE'];
    }
  }

  // 4. Already in the ledger (idempotency) / planned.
  const ledgerKeys = new Set(
    input.ledger
      .filter((l) => l.correctionState === 'CURRENT' && l.basis !== 'NATIVE_LIFECYCLE' && !isBlank(l.evidenceReference))
      .map((l) => [l.userId, l.basis, l.evidenceReference!.trim(), boundaryKey(l.start), boundaryKey(l.end)].join('|')),
  );
  for (const c of classified) {
    if (dropped.has(c.rec.evidenceId)) continue;
    if (c.reasons.length) {
      unresolved.push({
        userId: c.rec.userId,
        membershipId: c.rec.membershipId,
        evidenceId: c.rec.evidenceId,
        reasons: c.reasons,
        leads: leadView(c.rec.userId),
        availableEvidence: [c.rec.evidenceId],
      });
      continue;
    }
    const key = idempotencyKeyFor(c.rec);
    if (ledgerKeys.has(key)) {
      findings.push({ type: 'ALREADY_IN_LEDGER', userId: c.rec.userId, detail: `Evidence ${c.rec.evidenceId} already established in the ledger; not planned.`, refs: [c.rec.evidenceId] });
      continue;
    }
    planned.push({ evidenceId: c.rec.evidenceId, record: c.rec, idempotencyKey: key, counting: !isHaYearBoundaryRecord(c.rec) });
  }

  // 5. Lead-only candidates: every individual membership/user holding leads
  //    (or an individual membership) with no verified period remains unresolved.
  const verifiedUsers = new Set<number>([
    ...planned.map((p) => p.record.userId),
    ...input.ledger
      .filter((l) => l.correctionState === 'CURRENT' && l.verificationStatus === 'VERIFIED' && l.evidenceKind !== 'POINT' && l.basis !== 'NATIVE_LIFECYCLE')
      .map((l) => l.userId),
  ]);
  const evidenceByUser = new Map<number, string[]>();
  for (const e of evidence) evidenceByUser.set(e.userId, [...(evidenceByUser.get(e.userId) ?? []), e.evidenceId]);
  const candidateUsers = new Set<number>([...leadsByUser.keys()]);
  for (const m of input.memberships) if (m.ownerType === 'INDIVIDUAL' && m.userId != null && m.membershipNumber) candidateUsers.add(m.userId);
  for (const userId of [...candidateUsers].sort((a, b) => a - b)) {
    if (verifiedUsers.has(userId)) continue;
    if (unresolved.some((u) => u.userId === userId && u.evidenceId !== null)) continue; // already explained by its evidence entry
    const own = input.memberships.filter((m) => m.ownerType === 'INDIVIDUAL' && m.userId === userId).sort((a, b) => a.id - b.id);
    unresolved.push({
      userId,
      membershipId: own.length ? own[0].id : null,
      evidenceId: null,
      reasons: ['LEAD_ONLY_NO_EVIDENCE'],
      leads: leadView(userId),
      availableEvidence: (evidenceByUser.get(userId) ?? []).slice().sort(cmp),
    });
    findings.push({ type: 'MEMBERSHIP_WITHOUT_LEDGER_PERIOD', userId, detail: 'Individual membership has no verified historical ledger period; only leads are available.', refs: [] });
  }

  // 6. Unsupported historical ledger rows.
  for (const l of [...input.ledger].sort((a, b) => a.id - b.id)) {
    if (l.correctionState === 'CURRENT' && !ledgerRowSupported(l)) {
      findings.push({ type: 'LEDGER_ROW_UNSUPPORTED', userId: l.userId, detail: `Ledger row ${l.id} (${l.basis}) lacks evidence reference or verifier.`, refs: [`L${l.id}`] });
    }
  }

  // 7. Overlaps and gaps per user across counted ledger rows + planned items.
  type Iv = { ref: string; start: CivilDate; end: CivilDate | null };
  const ivByUser = new Map<number, Iv[]>();
  const push = (userId: number, ref: string, r: { start: ServiceBoundaryInput; end: ServiceBoundaryInput | null }) => {
    const iv = resolveInterval(r);
    if (typeof iv === 'string') return;
    ivByUser.set(userId, [...(ivByUser.get(userId) ?? []), { ref, ...iv }]);
  };
  for (const l of input.ledger) if (ledgerCounted(l)) push(l.userId, `L${l.id}`, l);
  for (const p of planned) if (p.counting) push(p.record.userId, p.evidenceId, p.record);
  const OPEN = '9999-12-31';
  for (const userId of [...ivByUser.keys()].sort((a, b) => a - b)) {
    const ivs = ivByUser.get(userId)!.sort((a, b) => compareCivilDates(a.start, b.start) || cmp(a.ref, b.ref));
    let reach = ivs[0];
    for (let i = 1; i < ivs.length; i++) {
      const cur = ivs[i];
      const reachEnd = reach.end ?? OPEN;
      if (compareCivilDates(cur.start, reachEnd) <= 0) {
        findings.push({ type: 'OVERLAP', userId, detail: `Intervals ${reach.ref} and ${cur.ref} overlap; the engine coalesces them (never double counted).`, refs: [reach.ref, cur.ref].sort(cmp) });
      } else {
        findings.push({ type: 'GAP', userId, detail: `Genuine gap after ${reachEnd} until ${cur.start}; preserved, not filled.`, refs: [reach.ref, cur.ref].sort(cmp) });
      }
      if (compareCivilDates(cur.end ?? OPEN, reachEnd) > 0) reach = cur;
    }
  }

  // 8. Deterministic ordering.
  planned.sort((a, b) => a.record.userId - b.record.userId || cmp(a.evidenceId, b.evidenceId));
  unresolved.sort((a, b) => a.userId - b.userId || cmp(a.evidenceId ?? '', b.evidenceId ?? ''));
  findings.sort((a, b) => a.userId - b.userId || cmp(a.type, b.type) || cmp(a.refs.join(','), b.refs.join(',')) || cmp(a.detail, b.detail));

  // 9. WP1 validation (read-only artefact; never Senior).
  const validation: ReconciliationReport['validation'] = [];
  const validationUsers = new Set<number>([...planned.map((p) => p.record.userId), ...input.ledger.filter(ledgerCounted).map((l) => l.userId)]);
  for (const userId of [...validationUsers].sort((a, b) => a - b)) {
    const periods: RecognizedServicePeriodInput[] = [
      ...input.ledger.filter((l) => l.userId === userId && ledgerCounted(l)).map((l) => toEngineInput(`L${l.id}`, l)),
      ...planned.filter((p) => p.record.userId === userId).map((p) => toEngineInput(p.evidenceId, p.record)),
    ];
    validation.push({ userId, service: calculateRecognizedService(periods, input.evaluationDate) });
  }

  const contradictory = findings.filter((f) => f.type === 'CONTRADICTION').length;
  const body = {
    summary: {
      memberships_reviewed: input.memberships.length,
      leads_retained: input.leads.length,
      evidence_records_supplied: input.evidence.length,
      verified_periods: planned.length,
      recognized_service_periods_to_insert: planned.length,
      non_counting_boundary_records: planned.filter((p) => !p.counting).length,
      unresolved_candidates: unresolved.length,
      contradictory_cases: contradictory,
      findings: findings.length,
    },
    planned,
    unresolved,
    findings,
    validation,
  };
  const reportHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return {
    status: input.evidence.length === 0 ? 'READY_AWAITING_VERIFIED_HISTORICAL_EVIDENCE' : 'EVIDENCE_EVALUATED',
    ...body,
    reportHash,
  };
}

// Leads from existing columns. Every value is a lead; none is a period.
export function buildLeadsFromMemberships(
  rows: ReadonlyArray<{
    id: number;
    userId: number | null;
    ownerType: string;
    joinYear: number | null;
    joinMonth: number | null;
    membershipNumber: string | null;
    userYearJoinedBcc?: number | null;
  }>,
): HistoricalLead[] {
  const leads: HistoricalLead[] = [];
  for (const r of rows) {
    if (r.ownerType !== 'INDIVIDUAL' || r.userId == null) continue;
    if (r.joinYear != null) leads.push({ userId: r.userId, membershipId: r.id, source: 'MEMBERSHIPS_JOIN_YEAR', value: String(r.joinYear) });
    if (r.joinMonth != null) leads.push({ userId: r.userId, membershipId: r.id, source: 'MEMBERSHIPS_JOIN_MONTH', value: String(r.joinMonth) });
    const m = r.membershipNumber ? /^BCC(\d{4})(\d{2})\d{5}$/.exec(r.membershipNumber) : null;
    if (m) leads.push({ userId: r.userId, membershipId: r.id, source: 'MEMBERSHIP_NUMBER_YYYYMM', value: `${m[1]}-${m[2]}` });
    if (r.userYearJoinedBcc != null) leads.push({ userId: r.userId, membershipId: r.id, source: 'USERS_YEAR_JOINED_BCC', value: String(r.userYearJoinedBcc) });
  }
  return leads;
}

// ── Idempotent insertion (append-only; not wired to any runtime path) ─────

export type InsertOutcome =
  | { inserted: true; periodId: number; evidenceId: string }
  | { inserted: false; evidenceId: string; reason: 'ALREADY_PRESENT' };

export class HistoricalInsertRejected extends Error {
  constructor(readonly evidenceId: string, readonly reasons: UnresolvedReason[] | string[]) {
    super(`Historical evidence ${evidenceId} rejected: ${reasons.join(', ')}`);
    this.name = 'HistoricalInsertRejected';
  }
}

// Writes ONE accepted historical period. Re-validates at write time (a plan
// is never trusted), serializes per user, verifies the verifier exists, and
// is a no-op when the same period is already established. Callers supply
// the transaction. This function is the only WP4 writer and is invoked only
// by an explicitly authorized evidence-population step.
export async function insertHistoricalPeriod(
  trx: Kysely<DB>,
  record: HistoricalEvidenceRecord,
  actorUserId: number,
): Promise<InsertOutcome> {
  const membershipsById = new Map<number, MembershipContext>();
  if (record.membershipId !== null) {
    const m = await trx
      .selectFrom('memberships')
      .select(['id', 'user_id', 'owner_type', 'parent_membership_id', 'membership_number', 'lifecycle_state'])
      .where('id', '=', record.membershipId)
      .executeTakeFirst();
    if (m) {
      membershipsById.set(Number(m.id), {
        id: Number(m.id),
        userId: m.user_id == null ? null : Number(m.user_id),
        ownerType: m.owner_type,
        parentMembershipId: m.parent_membership_id == null ? null : Number(m.parent_membership_id),
        membershipNumber: m.membership_number,
        lifecycleState: m.lifecycle_state,
      });
    }
  }
  const verdict = classifyEvidence(record, membershipsById);
  if (!verdict.accepted) throw new HistoricalInsertRejected(record.evidenceId, verdict.reasons);

  const verifier = await trx.selectFrom('users').select(['id']).where('id', '=', record.verifierUserId as number).executeTakeFirst();
  if (!verifier) throw new HistoricalInsertRejected(record.evidenceId, ['VERIFIER_NOT_FOUND']);

  // Serialize concurrent runs for the same individual.
  await trx.selectFrom('users').select(['id']).where('id', '=', record.userId).forUpdate().executeTakeFirst();

  const existing = await trx
    .selectFrom('recognized_service_periods')
    .select(['id'])
    .where('user_id', '=', record.userId)
    .where('basis', '=', record.basis)
    .where('evidence_reference', '=', record.evidenceReference.trim())
    .where('start_date', '=', new Date(`${storedBoundaryDate(record.start)}T00:00:00Z`))
    .where('start_precision', '=', record.start.precision)
    .where('evidence_kind', '=', record.evidenceKind)
    .where('correction_state', '=', 'CURRENT')
    .execute();
  const endDate = record.end === null ? null : storedBoundaryDate(record.end);
  // Same key => already present (end compared in code to keep NULL semantics exact).
  const dup = existing.length > 0 && (await sameEnd(trx, existing.map((e) => Number(e.id)), endDate, record.end?.precision ?? null));
  if (dup) return { inserted: false, evidenceId: record.evidenceId, reason: 'ALREADY_PRESENT' };

  const inserted = await trx
    .insertInto('recognized_service_periods')
    .values({
      user_id: record.userId,
      membership_id: record.membershipId,
      start_date: storedBoundaryDate(record.start),
      start_precision: record.start.precision,
      start_attestation: record.start.precision === 'EXACT' ? null : record.start.attestation,
      end_date: endDate,
      end_precision: record.end === null ? null : record.end.precision,
      end_attestation: record.end === null || record.end.precision === 'EXACT' ? null : record.end.attestation,
      evidence_kind: record.evidenceKind,
      continuity_established: record.continuityEstablished ? 1 : 0,
      basis: record.basis,
      native_source_type: null,
      native_source_id: null,
      evidence_reference: record.evidenceReference.trim(),
      evidence_note: record.evidenceNote ?? null,
      verification_status: 'VERIFIED',
      verified_by_user_id: record.verifierUserId,
      verified_at: record.verifiedAt,
      verification_reason: null,
      supersedes_period_id: null,
      established_by_type: 'ADMIN',
      established_by_user_id: actorUserId,
    })
    .executeTakeFirstOrThrow();
  const periodId = Number(inserted.insertId);

  await logMembershipAudit(
    {
      membershipId: record.membershipId,
      subjectUserId: record.userId,
      eventType: TENURE_AUDIT_EVENTS.SERVICE_PERIOD_ESTABLISHED,
      actorType: 'ADMIN',
      actorUserId,
      newValue: {
        periodId,
        basis: record.basis,
        start: record.start,
        end: record.end,
        evidenceKind: record.evidenceKind,
        continuityEstablished: record.continuityEstablished,
        evidenceReference: record.evidenceReference.trim(),
        verifierUserId: record.verifierUserId,
        evidenceId: record.evidenceId,
      },
      notes: 'WP4 historical reconciliation',
    },
    trx,
  );
  return { inserted: true, periodId, evidenceId: record.evidenceId };
}

async function sameEnd(trx: Kysely<DB>, ids: number[], endDate: string | null, endPrecision: string | null): Promise<boolean> {
  const rows = await trx
    .selectFrom('recognized_service_periods')
    .select(['id', 'end_date', 'end_precision'])
    .where('id', 'in', ids)
    .execute();
  const ymd = (d: unknown) => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  return rows.some((r) => ymd(r.end_date) === endDate && (r.end_precision ?? null) === endPrecision);
}

// Applies a report's plan. A zero-item plan performs no database call.
export async function applyHistoricalPlan(
  trx: Kysely<DB>,
  report: Pick<ReconciliationReport, 'planned'>,
  actorUserId: number,
): Promise<InsertOutcome[]> {
  const outcomes: InsertOutcome[] = [];
  for (const item of report.planned) outcomes.push(await insertHistoricalPeriod(trx, item.record, actorUserId));
  return outcomes;
}
