// scripts/distinctions/classify_legacy_photo_titles.mjs
//
// Photographic Distinctions legacy migration -- step CLASSIFY (read-only).
//
// Reads an immutable user_photo_titles snapshot, verifies its recorded
// sha256, classifies EVERY row with the backend's pure classifier, and
// writes a machine-readable (.json) and human-readable (.md) report next to
// the snapshot. Touches no database. Performs NO carry-forward.
//
// Usage (Node >= 22.18, native TypeScript type stripping):
//   node scripts/distinctions/classify_legacy_photo_titles.mjs \
//     database/legacy-snapshots/user_photo_titles/2026-10-07

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyLegacyPhotoTitles,
  summarizeClassification,
} from '../../backend/src/modules/identity/distinctions/legacy-photo-title-classification.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node classify_legacy_photo_titles.mjs <snapshot-dir>');
  process.exit(2);
}

const snapshotFile = join(dir, 'user_photo_titles.snapshot.json');
const raw = readFileSync(snapshotFile);
const expected = readFileSync(`${snapshotFile}.sha256`, 'utf8').trim().split(/\s+/)[0];
const actual = createHash('sha256').update(raw).digest('hex');
if (actual !== expected) {
  console.error(`snapshot checksum mismatch: expected ${expected}, got ${actual}`);
  process.exit(1);
}

const snapshot = JSON.parse(raw.toString('utf8'));
if (snapshot.rows.length !== snapshot.row_count) {
  console.error(`row_count ${snapshot.row_count} != rows.length ${snapshot.rows.length}`);
  process.exit(1);
}

const rows = classifyLegacyPhotoTitles(snapshot.rows).map((r) => ({
  ...r,
  username: snapshot.users?.[String(r.user_id)] ?? null,
}));
const summary = summarizeClassification(rows);
if (rows.length !== snapshot.row_count) {
  console.error('classification dropped rows -- refusing to write report');
  process.exit(1);
}

const report = {
  report: 'user_photo_titles legacy classification',
  stage: 'CLASSIFY (no carry-forward performed; HA approval required)',
  snapshot_file: 'user_photo_titles.snapshot.json',
  snapshot_sha256: actual,
  snapshot_captured_at: snapshot.source.captured_at_server_time,
  row_count: rows.length,
  summary,
  rows,
};
writeFileSync(join(dir, 'classification.report.json'), JSON.stringify(report, null, 2) + '\n');

const esc = (v) => (v === null || v === undefined ? '—' : String(v).replace(/\|/g, '\|'));
const md = [
  '# user_photo_titles — Legacy Classification Report',
  '',
  `Stage: **CLASSIFY** — no carry-forward performed. Human Authority approval required before MAP / CARRY FORWARD.`,
  '',
  `- Snapshot: \`user_photo_titles.snapshot.json\` (sha256 \`${actual}\`)`,
  `- Captured (prod server time): ${snapshot.source.captured_at_server_time}`,
  `- Rows: ${rows.length} — MAPPABLE ${summary.MAPPABLE} · REQUIRES_CLASSIFICATION ${summary.REQUIRES_CLASSIFICATION} · NOT_MAPPABLE ${summary.NOT_MAPPABLE}`,
  '',
  '| Legacy id | User id | Username | body_code | body_name | title_code | sort | Classification | Proposed mapping | Reason |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) =>
    `| ${r.id} | ${r.user_id} | ${esc(r.username)} | ${esc(r.body_code)} | ${esc(r.body_name)} | ${esc(r.title_code)} | ${r.sort_order} | ${r.classification} | ${
      r.proposed_distinction_code ? `${r.proposed_institution_code} / ${r.proposed_distinction_code}` : r.proposed_institution_code ? `${r.proposed_institution_code} / (HA decision)` : '—'
    } | ${esc(r.reason)} |`,
  ),
  '',
].join('\n');
writeFileSync(join(dir, 'classification.report.md'), md);

console.log(JSON.stringify({ row_count: rows.length, summary, snapshot_sha256: actual }));
