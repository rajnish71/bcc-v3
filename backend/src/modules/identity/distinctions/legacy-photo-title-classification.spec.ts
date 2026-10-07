// Legacy user_photo_titles classification -- snapshot integrity,
// determinism, and non-destructive preservation of every row.

import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  classifyLegacyPhotoTitle,
  classifyLegacyPhotoTitles,
  summarizeClassification,
  type LegacyPhotoTitleRow,
} from './legacy-photo-title-classification';

const REPO = join(__dirname, '../../../../..');
const SNAP_DIR = join(REPO, 'database/legacy-snapshots/user_photo_titles/2026-10-07');
const SNAP_FILE = join(SNAP_DIR, 'user_photo_titles.snapshot.json');

const row = (over: Partial<LegacyPhotoTitleRow>): LegacyPhotoTitleRow => ({
  id: 1, user_id: 1, body_code: 'FIP', title_code: 'AFIP', body_name: null, sort_order: 10, ...over,
});

describe('legacy snapshot', () => {
  it('exists and matches its recorded sha256', () => {
    const raw = readFileSync(SNAP_FILE);
    const recorded = readFileSync(`${SNAP_FILE}.sha256`, 'utf8').trim().split(/\s+/)[0];
    expect(createHash('sha256').update(raw).digest('hex')).toBe(recorded);
  });

  it('row_count equals the number of captured rows (12)', () => {
    const snap = JSON.parse(readFileSync(SNAP_FILE, 'utf8'));
    expect(snap.rows).toHaveLength(snap.row_count);
    expect(snap.row_count).toBe(12);
  });
});

describe('classification', () => {
  const snap = JSON.parse(readFileSync(SNAP_FILE, 'utf8'));
  const classified = classifyLegacyPhotoTitles(snap.rows);

  it('keeps every row with all legacy fields preserved', () => {
    expect(classified).toHaveLength(snap.rows.length);
    for (const original of snap.rows) {
      const c = classified.find((r) => r.id === original.id)!;
      expect(c).toMatchObject(original);
      expect(c.reason.length).toBeGreaterThan(0);
    }
  });

  it('produces the expected summary: 4 mappable, 2 GPU pending, 6 OTHER not mappable', () => {
    expect(summarizeClassification(classified)).toEqual({ MAPPABLE: 4, REQUIRES_CLASSIFICATION: 2, NOT_MAPPABLE: 6 });
  });

  it('maps exactly the HA-identified pairs', () => {
    const mapped = classified
      .filter((r) => r.classification === 'MAPPABLE')
      .map((r) => `${r.proposed_institution_code}/${r.proposed_distinction_code}`)
      .sort();
    expect(mapped).toEqual(['FIAP/AFIAP', 'FIP/AFIP', 'FIP/EFIP', 'PSA/PPSA']);
  });

  it('GPU values are preserved for HA classification with no inferred distinction', () => {
    const gpu = classified.filter((r) => r.body_code === 'GPU');
    expect(gpu.map((r) => r.title_code).sort()).toEqual(['GPU VIP-3', 'GPU-CR3']);
    for (const r of gpu) {
      expect(r.classification).toBe('REQUIRES_CLASSIFICATION');
      expect(r.proposed_distinction_code).toBeNull();
    }
  });

  it('OTHER rows are never mapped (no generic OTHER institution)', () => {
    for (const r of classified.filter((x) => x.body_code === 'OTHER')) {
      expect(r.classification).toBe('NOT_MAPPABLE');
      expect(r.proposed_institution_code).toBeNull();
    }
  });

  it('is deterministic regardless of input order', () => {
    const reversed = classifyLegacyPhotoTitles([...snap.rows].reverse());
    expect(reversed).toEqual(classified);
    expect(classified.map((r) => r.id)).toEqual([...classified.map((r) => r.id)].sort((a, b) => a - b));
  });

  it('ambiguous values are preserved for review, never guessed', () => {
    expect(classifyLegacyPhotoTitle(row({ title_code: 'afip' }))).toMatchObject({ classification: 'REQUIRES_CLASSIFICATION', proposed_distinction_code: null });
    expect(classifyLegacyPhotoTitle(row({ title_code: 'AFIP, EFIP' }))).toMatchObject({ classification: 'REQUIRES_CLASSIFICATION', proposed_distinction_code: null });
    expect(classifyLegacyPhotoTitle(row({ body_code: 'FIAP', title_code: 'EFIAP' }))).toMatchObject({ classification: 'REQUIRES_CLASSIFICATION', proposed_distinction_code: null });
  });

  it('the generated report covers every row', () => {
    const report = JSON.parse(readFileSync(join(SNAP_DIR, 'classification.report.json'), 'utf8'));
    expect(report.row_count).toBe(12);
    expect(report.rows.map((r: { id: number }) => r.id)).toEqual(classified.map((r) => r.id));
    expect(report.snapshot_sha256).toBe(readFileSync(`${SNAP_FILE}.sha256`, 'utf8').trim().split(/\s+/)[0]);
  });
});

describe('no destructive legacy path', () => {
  it('no Photographic Distinctions migration deletes, updates, truncates, drops or alters user_photo_titles', () => {
    const dir = join(REPO, 'database/migrations');
    const files = readdirSync(dir).filter((f) => /^011[5-7]_/.test(f));
    expect(files.length).toBe(3);
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '');
      expect(sql).not.toMatch(/(DELETE\s+FROM|UPDATE|TRUNCATE(\s+TABLE)?|DROP\s+TABLE|ALTER\s+TABLE)\s+user_photo_titles/i);
    }
  });
});
