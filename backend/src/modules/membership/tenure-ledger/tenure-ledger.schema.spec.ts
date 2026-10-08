// WP2 -- static checks on migrations 0119-0124 and the WP2 TypeScript
// surface. Behaviour (constraints, triggers, existing-row preservation) is
// verified against real MySQL by scripts/tools/tenure/verify-wp2-schema.mjs.

import * as fs from 'fs';
import * as path from 'path';
import {
  SENIOR_OVERLAY_PROVENANCES,
  SENIOR_OVERLAY_STATUSES,
  SENIOR_TRANSITION_ACTOR_TYPES,
  SENIOR_TRANSITION_TYPES,
  SERVICE_PERIOD_ATTESTATIONS,
  SERVICE_PERIOD_BASES,
  SERVICE_PERIOD_CORRECTION_STATES,
  SERVICE_PERIOD_ESTABLISHED_BY,
  SERVICE_PERIOD_EVIDENCE_KINDS,
  SERVICE_PERIOD_PRECISIONS,
  SERVICE_PERIOD_VERIFICATION_STATUSES,
} from './tenure-ledger.vocabulary';

const REPO = path.resolve(__dirname, '../../../../..');
const MIGRATIONS_DIR = path.join(REPO, 'database/migrations');
const SRC = path.resolve(__dirname, '../../..');

const WP2 = [
  '0119_create_recognized_service_periods.sql',
  '0120_create_senior_status_overlays.sql',
  '0121_create_senior_status_transitions.sql',
  '0122_membership_audit_log_subject_user.sql',
  '0123_guard_legacy_senior_recognitions.sql',
  '0124_rescope_recognition_active_lock.sql',
];
const read = (f: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').replace(/\r\n/g, '\n');
const code = (sql: string) => sql.replace(/^\s*--.*$/gm, '');

function enumValues(sql: string, column: string): string[] {
  const m = new RegExp(`\\n\\s*${column}\\s+ENUM\\(([^)]*)\\)`).exec(sql);
  if (!m) throw new Error(`ENUM for ${column} not found`);
  return m[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('WP2 migrations 0119-0124', () => {
  it('exist with unique, never-reused numbers', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f));
    for (const f of WP2) expect(files).toContain(f);
    for (const n of ['0119', '0120', '0121', '0122', '0123', '0124']) {
      expect(files.filter((f) => f.startsWith(`${n}_`))).toHaveLength(1);
    }
  });

  it.each(WP2)('%s follows MIGRATION_CONVENTION and registers itself last', (file) => {
    const sql = code(read(file));
    expect(sql.indexOf('SET NAMES utf8mb4;')).toBeLessThan(sql.indexOf('START TRANSACTION;'));
    const reg = sql.indexOf(`INSERT INTO schema_migrations (filename, applied_at)\nVALUES ('${file}', NOW());`);
    expect(reg).toBeGreaterThan(-1);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql.slice(reg)).not.toMatch(/CREATE|ALTER|DROP/);
  });

  it.each(WP2)('%s is schema-only (no data inserted, updated or deleted)', (file) => {
    const sql = code(read(file));
    const inserts = [...sql.matchAll(/INSERT\s+(?:IGNORE\s+)?INTO\s+(\w+)/gi)].map((m) => m[1]);
    expect(inserts).toEqual(['schema_migrations']);
    expect(sql).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b|\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b/i);
  });

  it('applies the legacy guard before the active_lock rescope, which is last', () => {
    expect(read('0123_guard_legacy_senior_recognitions.sql')).toMatch(/CREATE TRIGGER trg_recognition_senior_legacy_insert/);
    const rescope = code(read('0124_rescope_recognition_active_lock.sql'));
    expect(rescope).toMatch(
      /MODIFY COLUMN active_lock BIGINT\s+GENERATED ALWAYS AS \(IF\(status = 'ACTIVE' AND recognition_code <> 'SENIOR_MEMBER', membership_id, NULL\)\) STORED/,
    );
    // The enum, the unique index and recorded columns are untouched.
    expect(rescope).not.toMatch(/recognition_code\s+ENUM|uq_one_active_recognition|DROP/i);
  });

  it('0122 adds a nullable, indexed, SET NULL subject_user_id and no audit-log triggers', () => {
    const sql = code(read('0122_membership_audit_log_subject_user.sql'));
    expect(sql).toMatch(/ADD COLUMN subject_user_id BIGINT NULL/);
    expect(sql).toMatch(/ADD INDEX idx_audit_subject_user \(subject_user_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(subject_user_id\) REFERENCES users\(id\) ON DELETE SET NULL/);
    expect(sql).not.toMatch(/TRIGGER/);
  });

  it('every SIGNAL message fits MySQL\'s 128-character MESSAGE_TEXT limit', () => {
    for (const file of WP2) {
      for (const m of read(file).matchAll(/MESSAGE_TEXT = '((?:[^']|'')*)'/g)) {
        expect(m[1].replace(/''/g, "'").length).toBeLessThanOrEqual(128);
      }
    }
  });

  it('every new foreign key is RESTRICT, except the audit subject (SET NULL, table convention)', () => {
    for (const file of WP2.slice(0, 3)) {
      for (const fk of read(file).matchAll(/FOREIGN KEY \([^)]*\)\s+REFERENCES [^\n]*?ON DELETE (\w+)/g)) {
        expect(fk[1]).toBe('RESTRICT');
      }
    }
  });
});

describe('WP2 vocabulary matches the migration ENUMs', () => {
  const ledger = read('0119_create_recognized_service_periods.sql');
  const overlay = read('0120_create_senior_status_overlays.sql');
  const transitions = read('0121_create_senior_status_transitions.sql');

  it.each([
    [ledger, 'start_precision', SERVICE_PERIOD_PRECISIONS],
    [ledger, 'end_precision', SERVICE_PERIOD_PRECISIONS],
    [ledger, 'start_attestation', SERVICE_PERIOD_ATTESTATIONS],
    [ledger, 'end_attestation', SERVICE_PERIOD_ATTESTATIONS],
    [ledger, 'evidence_kind', SERVICE_PERIOD_EVIDENCE_KINDS],
    [ledger, 'basis', SERVICE_PERIOD_BASES],
    [ledger, 'verification_status', SERVICE_PERIOD_VERIFICATION_STATUSES],
    [ledger, 'correction_state', SERVICE_PERIOD_CORRECTION_STATES],
    [ledger, 'established_by_type', SERVICE_PERIOD_ESTABLISHED_BY],
    [overlay, 'status', SENIOR_OVERLAY_STATUSES],
    [overlay, 'provenance', SENIOR_OVERLAY_PROVENANCES],
    [transitions, 'transition_type', SENIOR_TRANSITION_TYPES],
    [transitions, 'actor_type', SENIOR_TRANSITION_ACTOR_TYPES],
    [transitions, 'from_status', SENIOR_OVERLAY_STATUSES],
    [transitions, 'to_status', SENIOR_OVERLAY_STATUSES],
  ] as const)('%#: %s', (sql, column, vocabulary) => {
    expect(enumValues(sql, column)).toEqual([...vocabulary]);
  });
});

// WP3 (native lifecycle capture) is the first and only runtime writer of the
// ledger; Senior overlay/transition tables stay unwired (WP5+). WP4 adds the
// one historical-evidence writer (explicitly authorized); nothing calls it at
// runtime yet.
const WP3_LEDGER_WRITER = 'modules/membership/tenure-ledger/native-term-capture.ts';
const WP4_LEDGER_WRITER = 'modules/membership/tenure-ledger/historical-reconciliation.ts';
const LEDGER_WRITERS = [WP4_LEDGER_WRITER, WP3_LEDGER_WRITER];

describe('only the WP3 native capture and the WP4 historical reconciliation write the ledger', () => {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });
  // Code only: comments may name what they describe.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = walk(SRC).map((f) => [path.relative(SRC, f).replace(/\\/g, '/'), stripComments(fs.readFileSync(f, 'utf8'))] as const);

  it('only the WP3 and WP4 writers write the ledger; nothing writes the Senior tables (WP5 reader is read-only)', () => {
    const touching = (tables: string, ops: string) =>
      sources
        .filter(([, s]) => new RegExp(String.raw`(${ops})\(\s*'(${tables})`).test(s))
        .map(([f]) => f);
    const WRITE = 'insertInto|updateTable|deleteFrom';
    // WP5: the single read-only SeniorStatusReader may SELECT the ledger and Senior tables.
    const WP5_READER = 'modules/membership/recognition/senior-status.reader.ts';
    // ledger: writes only by the WP3/WP4 writers; reads additionally by the WP5 reader
    expect(touching('recognized_service_periods', WRITE).sort()).toEqual([...LEDGER_WRITERS].sort());
    expect(touching('recognized_service_periods', `selectFrom|${WRITE}`).sort()).toEqual([...LEDGER_WRITERS, WP5_READER].sort());
    // Senior overlay/transition tables: nothing writes them; only the WP5 reader reads them
    expect(touching('senior_status_overlays|senior_status_transitions', WRITE)).toEqual([]);
    expect(touching('senior_status_overlays|senior_status_transitions', 'selectFrom')).toEqual([WP5_READER]);
  });

  it('only the audit helper writes membership_audit_log.subject_user_id', () => {
    const writers = sources.filter(([f, s]) => f !== 'database/db.ts' && /subject_user_id/.test(s)).map(([f]) => f);
    expect(writers).toEqual(['modules/membership/shared/membership-audit.util.ts']);
  });

  it('the vocabulary module is imported only by the WP3 and WP4 ledger writers', () => {
    expect(sources.filter(([, s]) => /tenure-ledger\.vocabulary/.test(s)).map(([f]) => f).sort()).toEqual([...LEDGER_WRITERS].sort());
  });
});
