/**
 * scripts/import_legacy_photo_categories.js
 *
 * Stage 7 · Batch B1 · item 71 — re-attach legacy per-photo categories.
 *
 * Owner decision (2026-07-14): categories are multi-select GENRE tags
 * (photo_tags + photo_tag_assignments), NOT a widened photos.genre ENUM.
 * Migration 0062 seeds the 20-category taxonomy. This script maps legacy
 * category assignments onto the corresponding V3 photos and inserts the
 * tag assignments.
 *
 * ── THE MAPPING PROBLEM (flagged blocker) ─────────────────────────────────
 * Legacy assignments key on bcc.bcc_photographer_photos.id (a uuid). V3 photos
 * have their own ids. A legacy-photo -> V3-photo identity mapping must exist
 * for this to work. There is no legacy_photo_id column on V3 photos, so this
 * script attempts, in priority order:
 *   1. r2_key basename  — legacy image_url basename == V3 photos.r2_key basename
 *   2. original_filename — legacy basename == V3 photos.original_filename
 *   3. title + owner     — normalized legacy title == V3 title, same owner
 * and REPORTS the match rate per strategy. If the rate is ~0%, no reliable key
 * exists — STOP and revisit (e.g. import legacy photos into V3 first, carrying
 * a legacy_photo_id). Never guesses across owners.
 *
 * Owner scoping uses bcc_photographers.username = users.username (same key as
 * migrate_legacy_profile_data.js). Idempotent: INSERT IGNORE on the
 * (photo_id, tag_id) PK, so re-running only fills gaps.
 *
 * Run (on the server, from repo root) — ALWAYS DRY_RUN first and read the report:
 *   set -a; source backend/.env; set +a
 *   DRY_RUN=1 node scripts/import_legacy_photo_categories.js   # preview + match report
 *   node scripts/import_legacy_photo_categories.js             # apply
 */
'use strict';

const mysql = require('mysql2/promise');

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// Legacy category name / slug -> V3 GENRE tag_key (photo_tags).
// Covers the 12 legacy names + the new-8 in case legacy carries any of them.
const CATEGORY_TAG_MAP = {
  'architecture': 'architecture',
  'astro': 'astro', 'astrophotography': 'astro',
  'black & white': 'black-and-white', 'black and white': 'black-and-white', 'b&w': 'black-and-white',
  'event': 'event', 'events': 'event',
  'landscape': 'landscape', 'landscapes': 'landscape',
  'macro': 'macro',
  'monuments': 'monuments', 'monument': 'monuments',
  'portfolio': 'portfolio',
  'portrait': 'portrait', 'portraits': 'portrait',
  'street': 'street',
  'travel': 'travel',
  'wildlife': 'wildlife',
  'food': 'food',
  'nature': 'nature',
  'product': 'product',
  'fashion': 'fashion',
  'fine art': 'fine-art', 'fineart': 'fine-art',
  'sports': 'sports', 'sport': 'sports',
  'aerial': 'aerial',
  'documentary': 'documentary',
};

const norm = s => String(s ?? '').trim().toLowerCase();
const basename = url => {
  if (!url) return '';
  const clean = String(url).split('?')[0].replace(/\/+$/, '');
  const b = clean.substring(clean.lastIndexOf('/') + 1);
  return b.toLowerCase();
};
const r2Basename = key => basename(key);

async function tableExists(conn, schema, table) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [schema, table],
  );
  return Number(rows[0].c) > 0;
}
async function columns(conn, schema, table) {
  const [rows] = await conn.query(
    'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
    [schema, table],
  );
  return new Set(rows.map(r => String(r.c)));
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bcc_v3',
    multipleStatements: false,
  });

  console.log(`\n=== Legacy photo-category import ${DRY_RUN ? '(DRY RUN — no writes)' : '(APPLYING)'} ===\n`);

  // Guard: legacy tables must be reachable from this connection.
  for (const t of ['bcc_categories', 'bcc_photo_categories', 'bcc_photographer_photos', 'bcc_photographers']) {
    if (!(await tableExists(conn, 'bcc', t))) {
      console.error(`✗ Legacy table bcc.${t} not found/readable. Aborting.`);
      await conn.end();
      process.exit(2);
    }
  }

  // ── Resolve V3 GENRE tag ids by tag_key ──────────────────────────────────
  const [tagRows] = await conn.query(
    "SELECT id, tag_key FROM photo_tags WHERE category = 'GENRE'",
  );
  const tagIdByKey = new Map(tagRows.map(r => [r.tag_key, Number(r.id)]));

  // ── Legacy categories: id -> tag_key ─────────────────────────────────────
  const [legacyCats] = await conn.query('SELECT * FROM bcc.bcc_categories');
  const tagKeyByCatId = new Map();
  const unmappedCats = [];
  for (const c of legacyCats) {
    const key = CATEGORY_TAG_MAP[norm(c.name)] || CATEGORY_TAG_MAP[norm(c.slug)] || null;
    if (key && tagIdByKey.has(key)) tagKeyByCatId.set(String(c.id), key);
    else unmappedCats.push(c.name || c.slug);
  }
  if (unmappedCats.length) {
    console.log(`  ⚠ legacy categories with no V3 tag mapping: ${unmappedCats.join(', ')}`);
  }

  // ── Legacy photographer id -> V3 user id (via username match) ─────────────
  const photogCols = await columns(conn, 'bcc', 'bcc_photographers');
  const [legacyPhotogs] = await conn.query('SELECT * FROM bcc.bcc_photographers');
  const v3UserByPhotogId = new Map();
  for (const p of legacyPhotogs) {
    if (!p.username) continue;
    const [urows] = await conn.query('SELECT id FROM users WHERE username = ? LIMIT 1', [p.username]);
    if (urows.length) v3UserByPhotogId.set(String(p.id), Number(urows[0].id));
  }

  // ── Index V3 photos for the three match strategies ───────────────────────
  const [v3photos] = await conn.query(
    'SELECT id, owner_user_id, r2_key, original_filename, title FROM photos WHERE status != "DELETED"',
  );
  const byR2Base = new Map();      // r2 basename -> [photoId]
  const byOrigName = new Map();    // original_filename(lower) -> [photoId]
  const byOwnerTitle = new Map();  // owner|title(norm) -> [photoId]
  const push = (map, k, v) => { if (!k) return; (map.get(k) || map.set(k, []).get(k)).push(v); };
  for (const ph of v3photos) {
    push(byR2Base, r2Basename(ph.r2_key), Number(ph.id));
    push(byOrigName, norm(ph.original_filename), Number(ph.id));
    if (ph.title) push(byOwnerTitle, `${ph.owner_user_id}|${norm(ph.title)}`, Number(ph.id));
  }
  const uniq = arr => (arr && arr.length === 1 ? arr[0] : null); // only accept unambiguous matches

  // ── Legacy photos: build id -> {ownerUserId, matched V3 photoId, strategy} ─
  const photoCols = await columns(conn, 'bcc', 'bcc_photographer_photos');
  const photogFk = ['photographer_id', 'photographer', 'user_id', 'owner_id'].find(c => photoCols.has(c)) || null;
  const [legacyPhotos] = await conn.query('SELECT * FROM bcc.bcc_photographer_photos');

  const stats = { total: legacyPhotos.length, r2: 0, orig: 0, title: 0, none: 0 };
  const v3PhotoByLegacyId = new Map();
  for (const lp of legacyPhotos) {
    const ownerId = photogFk ? v3UserByPhotogId.get(String(lp[photogFk])) : undefined;
    const b = basename(lp.image_url);
    let match = uniq(byR2Base.get(b)); let strat = 'r2';
    if (!match) { match = uniq(byOrigName.get(b)); strat = 'orig'; }
    if (!match && ownerId && lp.title) { match = uniq(byOwnerTitle.get(`${ownerId}|${norm(lp.title)}`)); strat = 'title'; }
    if (match) {
      v3PhotoByLegacyId.set(String(lp.id), { photoId: match, ownerId: ownerId ?? null });
      stats[strat]++;
    } else {
      stats.none++;
    }
  }

  console.log('  Legacy→V3 photo match report:');
  console.log(`    total legacy photos:      ${stats.total}`);
  console.log(`    matched by r2 basename:   ${stats.r2}`);
  console.log(`    matched by filename:      ${stats.orig}`);
  console.log(`    matched by title+owner:   ${stats.title}`);
  console.log(`    UNMATCHED:                ${stats.none}`);
  const matchedTotal = stats.r2 + stats.orig + stats.title;
  if (matchedTotal === 0) {
    console.error('\n✗ No reliable legacy→V3 photo mapping found (0 matches).');
    console.error('  STOP: legacy photos do not appear to be present in V3 photos under any key.');
    console.error('  Re-attaching categories is not possible until legacy photos are imported');
    console.error('  into V3 (carrying a legacy_photo_id or a shared r2_key). Nothing written.\n');
    await conn.end();
    process.exit(3);
  }

  // ── Attach categories: legacy assignment -> photo_tag_assignments ────────
  const [assignments] = await conn.query('SELECT photo_id, category_id FROM bcc.bcc_photo_categories');
  const summary = { considered: assignments.length, inserted: 0, skippedNoPhoto: 0, skippedNoTag: 0 };
  const rows = [];
  for (const a of assignments) {
    const v3 = v3PhotoByLegacyId.get(String(a.photo_id));
    if (!v3) { summary.skippedNoPhoto++; continue; }
    const tagKey = tagKeyByCatId.get(String(a.category_id));
    if (!tagKey) { summary.skippedNoTag++; continue; }
    const tagId = tagIdByKey.get(tagKey);
    // assigned_by = the photo's owner (they're re-attaching their own categories);
    // fall back to owner_user_id from the photos table if not resolved above.
    const assignedBy = v3.ownerId
      ?? Number((v3photos.find(p => Number(p.id) === v3.photoId) || {}).owner_user_id);
    if (!assignedBy) { summary.skippedNoPhoto++; continue; }
    rows.push([v3.photoId, tagId, assignedBy]);
  }

  if (rows.length && !DRY_RUN) {
    // INSERT IGNORE keeps it idempotent against the (photo_id, tag_id) PK.
    await conn.query(
      'INSERT IGNORE INTO photo_tag_assignments (photo_id, tag_id, assigned_by) VALUES ?',
      [rows],
    );
  }
  summary.inserted = rows.length;

  console.log('\n=== Summary ===');
  console.log(`  legacy assignments:       ${summary.considered}`);
  console.log(`  tag rows ${DRY_RUN ? 'to insert' : 'inserted'}:  ${summary.inserted}`);
  console.log(`  skipped (no photo match): ${summary.skippedNoPhoto}`);
  console.log(`  skipped (no tag mapping): ${summary.skippedNoTag}`);
  console.log(DRY_RUN ? '\n(DRY RUN — nothing written)\n' : '\nDone.\n');

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
