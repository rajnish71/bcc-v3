#!/usr/bin/env node
/**
 * Backfill width_px / height_px for photos where both are NULL.
 * Fetches the first 64 KB of each photo from ImageKit (range request)
 * and parses JPEG SOF or PNG IHDR to extract natural dimensions.
 *
 * Usage (from server):
 *   NODE_PATH=/var/www/bcc-v3/backend/node_modules \
 *   DB_PASSWORD=$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2) \
 *   node scripts/backfill_photo_dimensions.js
 *
 * Set DRY_RUN=1 to preview without writing.
 */

'use strict';

const https  = require('https');
const mysql2 = require('mysql2/promise');

const DRY_RUN       = process.env.DRY_RUN === '1';
const IMAGEKIT_BASE = 'https://ik.imagekit.io/duynda7oq';
const DELAY_MS      = 80;   // be polite to ImageKit; ~12 req/s

// ── Dimension parsing ──────────────────────────────────────────────────────

function parseDimensions(buf) {
  // JPEG: FF D8 header
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i + 4 < buf.length) {
      if (buf[i] !== 0xFF) break;
      const marker = (buf[i] << 8) | buf[i + 1];
      i += 2;
      const segLen = (buf[i] << 8) | buf[i + 1];
      // SOF markers carry image dimensions
      const isSOF = (
        (marker >= 0xFFC0 && marker <= 0xFFC3) ||
        (marker >= 0xFFC5 && marker <= 0xFFC7) ||
        (marker >= 0xFFC9 && marker <= 0xFFCB) ||
        (marker >= 0xFFCD && marker <= 0xFFCF)
      );
      if (isSOF && i + 7 < buf.length) {
        const height = (buf[i + 3] << 8) | buf[i + 4];
        const width  = (buf[i + 5] << 8) | buf[i + 6];
        if (width > 0 && height > 0) return { width, height };
      }
      if (segLen > 2) i += segLen; else i += 2;
    }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A header, IHDR at bytes 8-..., dims at 16-23
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    const width  = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    const height = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    if (width > 0 && height > 0) return { width: width >>> 0, height: height >>> 0 };
  }

  return null;
}

// ── HTTP range fetch ───────────────────────────────────────────────────────

function fetchBytes(url, bytes = 65536) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req  = https.request(
      { hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'Range': `bytes=0-${bytes - 1}` } },
      (res) => {
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql2.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'bcc_v3_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'bcc_v3',
  });

  const [rows] = await conn.query(
    `SELECT id, uuid, r2_key FROM photos
     WHERE width_px IS NULL AND height_px IS NULL
     ORDER BY id DESC`
  );

  console.log(`Photos needing backfill: ${rows.length}${DRY_RUN ? '  [DRY RUN]' : ''}`);

  let updated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const url = `${IMAGEKIT_BASE}/${row.r2_key}`;
    try {
      const buf  = await fetchBytes(url);
      const dims = parseDimensions(buf);

      if (!dims) {
        console.log(`  SKIP  id=${row.id}  — could not parse dims from ${row.r2_key}`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  DRY   id=${row.id}  ${dims.width}x${dims.height}  ${row.r2_key}`);
      } else {
        await conn.query(
          'UPDATE photos SET width_px = ?, height_px = ? WHERE id = ?',
          [dims.width, dims.height, row.id]
        );
        console.log(`  OK    id=${row.id}  ${dims.width}x${dims.height}  ${row.r2_key}`);
        updated++;
      }
    } catch (e) {
      console.log(`  FAIL  id=${row.id}  ${e.message}  ${row.r2_key}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone — updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
