// scripts/tools/backfill-photo-dimensions.ts
//
// ============================================================
// ONE-TIME MAINTENANCE UTILITY
// Photo dimension backfill — width_px / height_px
// ============================================================
//
// PURPOSE
//   Finds every photo where width_px IS NULL OR height_px IS NULL,
//   fetches the first 64 KB from the Delivery Layer (ImageKit), parses
//   JPEG SOF or PNG IHDR to extract natural dimensions, and writes
//   ONLY width_px and height_px back to the photos table via Kysely.
//
//   All other photo columns are untouched.
//   Photos that already have both dimensions are skipped at the query
//   level — running this script multiple times is safe.
//
// ARCHITECTURE
//   Object Store (R2)     — Master Asset, authoritative (PHOTO-ARCH-002)
//   Delivery Layer (IK)   — used here for range reads (viewing path)
//   Canonical Storage ID  — r2_key, accessed via db.selectFrom('photos')
//   No Kysely service wrapping needed: db is imported directly, matching
//   the established pattern in scripts/tools/repair-approved-memberships.ts
//
// PRE-CONDITIONS
//   • Backend .env readable at /var/www/bcc-v3/backend/.env
//   • IMAGEKIT_URL_ENDPOINT set (or defaults to ik.imagekit.io/duynda7oq)
//
// USAGE (run from the backend directory):
//
//   Dry run — inspect what would be updated:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/backfill-photo-dimensions.ts --dry-run
//
//   Live run — updates all photos missing dimensions:
//     cd /var/www/bcc-v3/backend
//     DOTENV_CONFIG_PATH=.env \
//       npx ts-node -r dotenv/config -r tsconfig-paths/register \
//       ../scripts/tools/backfill-photo-dimensions.ts
//
//   Re-run safety: the query filters on IS NULL, so already-filled photos
//   are never touched, regardless of how many times the script is run.
//
// OUTPUT
//   • Console: per-photo result line, then a 4-line summary
//   • Photos scanned / Updated / Skipped / Errors
//
// ARCHIVAL
//   Once all 787 photos have dimensions this script can be moved to
//   scripts/tools/archive/ as historical evidence of the backfill.

import * as https from 'https';
import { db } from '../../backend/src/database/db';
import { ikUrl } from '../../backend/src/modules/shared/storage/imagekit.util';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dimensions {
  width: number;
  height: number;
}

// ── Dimension parsing ─────────────────────────────────────────────────────────
// Parses JPEG SOF marker or PNG IHDR chunk from a partial buffer.
// Identical logic to scripts/backfill_photo_dimensions.js (mature, tested).

function parseDimensions(buf: Buffer): Dimensions | null {
  // JPEG: FF D8 magic
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 4 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = (buf[i] << 8) | buf[i + 1];
      i += 2;
      const segLen = (buf[i] << 8) | buf[i + 1];
      const isSOF =
        (marker >= 0xffc0 && marker <= 0xffc3) ||
        (marker >= 0xffc5 && marker <= 0xffc7) ||
        (marker >= 0xffc9 && marker <= 0xffcb) ||
        (marker >= 0xffcd && marker <= 0xffcf);
      if (isSOF && i + 7 < buf.length) {
        const height = (buf[i + 3] << 8) | buf[i + 4];
        const width  = (buf[i + 5] << 8) | buf[i + 6];
        if (width > 0 && height > 0) return { width, height };
      }
      if (segLen > 2) i += segLen; else i += 2;
    }
  }

  // PNG: 89 50 4E 47 magic, IHDR dims at bytes 16-23
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    const width  = ((buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) >>> 0;
    const height = ((buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]) >>> 0;
    if (width > 0 && height > 0) return { width, height };
  }

  return null;
}

// ── HTTP range fetch ──────────────────────────────────────────────────────────
// Fetches the first `byteCount` bytes from a URL via HTTPS range request.
// Falls back to a full GET if the server does not honour Range.

function fetchBytes(url: string, byteCount = 65536): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      headers:  { Range: `bytes=0-${byteCount - 1}` },
      timeout:  15000,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${parsed.hostname}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const DELAY_MS = 80; // polite to ImageKit — ~12 req/s

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BCC Platform — Photo Dimension Backfill');
  console.log(`Mode  : ${isDryRun ? 'DRY RUN  (no DB writes)' : 'LIVE'}`);
  console.log(`Start : ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // ── Candidate query ────────────────────────────────────────────────────────
  // Kysely SELECT — only photos missing at least one dimension.
  // Skips DELETED photos; includes PROCESSING in case they were confirmed
  // without dimension data.

  const candidates = await db
    .selectFrom('photos')
    .select(['id', 'uuid', 'r2_key'])
    .where((eb) =>
      eb.or([
        eb('width_px',  'is', null),
        eb('height_px', 'is', null),
      ]),
    )
    .where('status', '!=', 'DELETED')
    .orderBy('id', 'asc')
    .execute();

  console.log(`\nPhotos missing dimensions: ${candidates.length}${isDryRun ? '  [DRY RUN]' : ''}\n`);

  if (candidates.length === 0) {
    console.log('Nothing to backfill. All photos already have dimensions.\n');
    await (db as unknown as { destroy(): Promise<void> }).destroy();
    return;
  }

  // ── Process candidates ─────────────────────────────────────────────────────

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  for (const photo of candidates) {
    // Build Delivery Layer URL via shared utility — no hardcoded hostname.
    const url = ikUrl(photo.r2_key);

    try {
      const buf  = await fetchBytes(url);
      const dims = parseDimensions(buf);

      if (!dims) {
        console.log(`  SKIP  id=${photo.id}  uuid=${photo.uuid}  — could not parse dimensions`);
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }

      if (isDryRun) {
        console.log(`  DRY   id=${photo.id}  ${dims.width}×${dims.height}  ${photo.r2_key}`);
      } else {
        // Kysely UPDATE — only width_px and height_px, nothing else.
        await db
          .updateTable('photos')
          .set({ width_px: dims.width, height_px: dims.height })
          .where('id', '=', photo.id)
          .execute();

        console.log(`  OK    id=${photo.id}  ${dims.width}×${dims.height}  ${photo.r2_key}`);
        updated++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL  id=${photo.id}  uuid=${photo.uuid}  — ${msg}`);
      errors++;
    }

    await sleep(DELAY_MS);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('SUMMARY');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Photos scanned : ${candidates.length}`);

  if (isDryRun) {
    const wouldUpdate = candidates.length - skipped - errors;
    console.log(`Would update   : ${wouldUpdate}`);
    console.log(`Would skip     : ${skipped}  (unrecognised format)`);
    console.log(`Errors         : ${errors}`);
    console.log('Mode           : DRY RUN — no changes were written');
  } else {
    console.log(`Updated        : ${updated}`);
    console.log(`Skipped        : ${skipped}  (unrecognised format)`);
    console.log(`Errors         : ${errors}`);
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  await (db as unknown as { destroy(): Promise<void> }).destroy();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
