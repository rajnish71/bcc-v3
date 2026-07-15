#!/usr/bin/env node
/**
 * Cleanup stuck PROCESSING photos for user 31 (sauvikacharyya).
 *
 * Audit (2026-07-15) found 21 PROCESSING records (IDs 516-536) that are
 * abandoned duplicate uploads — each matches an already-ACTIVE record by
 * file size. The originals are intact in R2 and fully served via ImageKit.
 * These 21 entries waste ~270 MB of R2 storage and are invisible to users.
 *
 * What this script does (in order):
 *   1. SELECT the 21 PROCESSING records and confirm they still exist.
 *   2. DELETE each R2 object (the orphaned original upload).
 *   3. Soft-delete each DB row: status = 'DELETED', deleted_at = NOW().
 *
 * Usage (run on prod server):
 *   NODE_PATH=/var/www/bcc-v3/backend/node_modules \
 *   DB_PASSWORD=$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2) \
 *   node scripts/cleanup_processing_photos.js
 *
 * Set DRY_RUN=1 to preview without writing anything.
 */

'use strict';

const mysql2 = require('mysql2/promise');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === '1';

// ── IDs confirmed by 2026-07-15 audit ──────────────────────────────────────
const TARGET_IDS = [516, 517, 518, 519, 520, 521, 522, 523, 524, 525,
                    526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536];
const OWNER_USER_ID = 31; // sauvikacharyya — safety guard

// ── Load .env values for R2 ─────────────────────────────────────────────────
function loadEnv() {
  const envPath = '/var/www/bcc-v3/backend/.env';
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });
}
loadEnv();

// ── R2 client ───────────────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});
const R2_BUCKET = process.env.R2_BUCKET_NAME;

// ── DB connection ────────────────────────────────────────────────────────────
async function getDb() {
  return mysql2.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USERNAME || 'bcc_v3_app',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'bcc_v3',
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== cleanup_processing_photos.js  [${DRY_RUN ? 'DRY RUN' : 'LIVE'}] ===\n`);

  const db = await getDb();

  // 1. Fetch the target rows
  const [rows] = await db.execute(
    `SELECT id, uuid, r2_key, original_filename, file_size_bytes, status, owner_user_id
     FROM photos
     WHERE id IN (${TARGET_IDS.join(',')})
     ORDER BY id`,
  );

  if (rows.length === 0) {
    console.log('No matching rows found — already cleaned up or IDs wrong. Exiting.');
    await db.end();
    return;
  }

  console.log(`Found ${rows.length} rows:\n`);
  rows.forEach(r => {
    console.log(`  id=${r.id}  status=${r.status}  owner=${r.owner_user_id}  size=${r.file_size_bytes}  r2_key=${r.r2_key}`);
  });
  console.log('');

  // 2. Safety checks
  const unexpected = rows.filter(r => r.status !== 'PROCESSING' || r.owner_user_id !== OWNER_USER_ID);
  if (unexpected.length > 0) {
    console.error('ABORT: unexpected rows (wrong status or owner):');
    unexpected.forEach(r => console.error(`  id=${r.id} status=${r.status} owner=${r.owner_user_id}`));
    await db.end();
    process.exit(1);
  }

  let r2Deleted = 0, r2Skipped = 0, dbUpdated = 0;

  for (const row of rows) {
    // 3. Delete R2 object
    if (!row.r2_key) {
      console.warn(`  [SKIP R2] id=${row.id} has no r2_key`);
      r2Skipped++;
    } else {
      console.log(`  [R2 DELETE] id=${row.id}  key=${row.r2_key}`);
      if (!DRY_RUN) {
        try {
          await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key }));
          r2Deleted++;
        } catch (err) {
          console.error(`    ERROR deleting R2 object: ${err.message}`);
          // R2 DeleteObject is idempotent (returns 204 even for missing keys),
          // so a real error here is unusual — log and continue.
          r2Skipped++;
        }
      } else {
        r2Deleted++;
      }
    }

    // 4. Soft-delete DB row
    console.log(`  [DB  SOFT-DELETE] id=${row.id} -> status=DELETED`);
    if (!DRY_RUN) {
      const [result] = await db.execute(
        `UPDATE photos SET status = 'DELETED', deleted_at = NOW() WHERE id = ? AND status = 'PROCESSING'`,
        [row.id],
      );
      if (result.affectedRows === 1) {
        dbUpdated++;
      } else {
        console.warn(`    WARNING: id=${row.id} was not updated (race condition?)`);
      }
    } else {
      dbUpdated++;
    }
  }

  await db.end();

  console.log('\n── Summary ──────────────────────────────────────────');
  console.log(`  Rows inspected:   ${rows.length}`);
  console.log(`  R2 objects deleted: ${r2Deleted}`);
  console.log(`  R2 skipped/error:   ${r2Skipped}`);
  console.log(`  DB rows soft-deleted: ${dbUpdated}`);
  if (DRY_RUN) console.log('\n  (DRY RUN — nothing was written)');
  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
