/**
 * scripts/migrate_legacy_avatars.js
 *
 * Wires legacy avatar/cover images into V3. The legacy files already live in
 * the SAME R2 bucket under the `uploads/avatars/` and `uploads/covers/`
 * prefixes (ImageKit serves them), so this only creates the V3 DB rows
 * (user_avatars / user_cover_photos) pointing at the existing R2 keys — no
 * file copy.
 *
 * Source: bcc.bcc_photographers.avatar_url / cover_photo_url
 *   - Real uploads look like `/uploads/avatars/<file>` -> R2 key `uploads/avatars/<file>`
 *   - Placeholder URLs (ui-avatars.com, unsplash.com, any http[s]) are SKIPPED.
 *
 * Match key: username, else exact full_name = display_name (system accounts skipped).
 * POLICY: fill-if-empty — never replaces an avatar/cover the member already has.
 * Verifies each R2 object exists (HeadObject) before inserting. Idempotent.
 *
 * Run (on server, from repo root):
 *   set -a; source backend/.env; set +a
 *   DRY_RUN=1 node scripts/migrate_legacy_avatars.js   # preview
 *   node scripts/migrate_legacy_avatars.js             # apply
 */
'use strict';

const mysql = require('mysql2/promise');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const IK_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/duynda7oq';
const SYSTEM_USERNAMES = new Set(['admin', 'guestuser', 'writer']);

function ikUrl(r2Key) { return `${IK_ENDPOINT}/${r2Key}`; }

// A legacy image reference is a real uploaded file only if it points at the
// local /uploads/ path. Anything http(s) is a generated placeholder — skip.
function toR2Key(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (!s || /^https?:\/\//i.test(s)) return null;
  const m = s.match(/\/?uploads\/(avatars|covers)\/(.+)$/i);
  if (!m) return null;
  return `uploads/${m[1].toLowerCase()}/${m[2]}`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bcc_v3',
  });
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const BUCKET = process.env.R2_BUCKET_NAME;

  async function r2Exists(key) {
    try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
    catch { return false; }
  }

  console.log(`\n=== Legacy avatar/cover wiring ${DRY_RUN ? '(DRY RUN — no writes)' : '(APPLYING)'} ===\n`);

  const [legacy] = await conn.query('SELECT username, display_name, avatar_url, cover_photo_url FROM bcc.bcc_photographers');
  const summary = { avatars: 0, covers: 0, skippedPlaceholder: 0, missingInR2: [] };

  for (const p of legacy) {
    if (SYSTEM_USERNAMES.has(String(p.username || '').toLowerCase())) continue;
    const [urows] = await conn.query(
      'SELECT id, username FROM users WHERE username = ? OR full_name = ? ORDER BY (username = ?) DESC LIMIT 1',
      [p.username, p.display_name, p.username],
    );
    if (!urows.length) continue;
    const u = urows[0];
    const notes = [];

    // ---- Avatar ----
    const avKey = toR2Key(p.avatar_url);
    if (p.avatar_url && !avKey) summary.skippedPlaceholder++;
    if (avKey) {
      const [[has]] = [await conn.query("SELECT COUNT(*) AS c FROM user_avatars WHERE user_id = ? AND size_variant = 'ORIGINAL'", [u.id])];
      if (Number(has[0].c) === 0) {
        if (await r2Exists(avKey)) {
          notes.push('avatar');
          summary.avatars++;
          if (!DRY_RUN) {
            await conn.query('INSERT INTO user_avatars (user_id, size_variant, r2_key, imagekit_url) VALUES (?, ?, ?, ?)', [u.id, 'ORIGINAL', avKey, ikUrl(avKey)]);
          }
        } else {
          summary.missingInR2.push(`${u.username}:avatar:${avKey}`);
        }
      }
    }

    // ---- Cover ----
    const cvKey = toR2Key(p.cover_photo_url);
    if (p.cover_photo_url && !cvKey) summary.skippedPlaceholder++;
    if (cvKey) {
      const [[has]] = [await conn.query('SELECT COUNT(*) AS c FROM user_cover_photos WHERE user_id = ? AND is_active = 1', [u.id])];
      if (Number(has[0].c) === 0) {
        if (await r2Exists(cvKey)) {
          notes.push('cover');
          summary.covers++;
          if (!DRY_RUN) {
            await conn.query('INSERT INTO user_cover_photos (user_id, r2_key, imagekit_url, is_active) VALUES (?, ?, ?, 1)', [u.id, cvKey, ikUrl(cvKey)]);
          }
        } else {
          summary.missingInR2.push(`${u.username}:cover:${cvKey}`);
        }
      }
    }

    if (notes.length) console.log(`  ${(u.username || p.username).padEnd(24)} ${notes.join(', ')}`);
  }

  console.log('\n=== Summary ===');
  console.log(`  avatars wired: ${summary.avatars}`);
  console.log(`  covers wired:  ${summary.covers}`);
  console.log(`  placeholder image URLs skipped: ${summary.skippedPlaceholder}`);
  console.log(`  referenced-but-missing-in-R2: ${summary.missingInR2.length ? '\n    - ' + summary.missingInR2.join('\n    - ') : 'none'}`);
  console.log(DRY_RUN ? '\n(DRY RUN — nothing written)\n' : '\nDone.\n');

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
