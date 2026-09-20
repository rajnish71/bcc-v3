// backend/src/modules/gallery/gallery.service.spec.ts
//
// Unit tests for the 20 MB photo upload admission limit (BCC V3 approved
// architecture decision — presign + confirm gating only, no changes to
// existing Canonical Photo Master Assets).
//
// GalleryService is NOT instantiated here: it imports db.ts (Kysely ESM),
// which breaks under this project's CommonJS Jest config -- the same
// constraint documented in every other *.spec.ts that touches a service
// importing db (see hub-membership-payment.spec.ts, financial.controller.spec.ts).
// Tests instead combine real static inspection of the actual gallery.service.ts
// source with pure functions that mirror its presign/confirm size-gating
// decision logic exactly.

import { readFileSync } from 'fs';
import { join } from 'path';
import { MAX_PHOTO_BYTES } from '../shared/storage/imagekit.util';

const SERVICE_SRC = readFileSync(join(__dirname, 'gallery.service.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Central limit
// ---------------------------------------------------------------------------

describe('MAX_PHOTO_BYTES (20 MB decimal admission limit)', () => {
  it('is exactly 20,000,000 bytes (decimal, not MiB)', () => {
    expect(MAX_PHOTO_BYTES).toBe(20_000_000);
  });

  it('is below the observed ImageKit free-plan input ceiling (25 MiB / 26,214,400 bytes)', () => {
    expect(MAX_PHOTO_BYTES).toBeLessThan(26_214_400);
  });

  it('gallery.service.ts imports MAX_PHOTO_BYTES from imagekit.util.ts rather than redefining it', () => {
    expect(SERVICE_SRC).toMatch(/import\s*{[^}]*MAX_PHOTO_BYTES[^}]*}\s*from\s*'\.\.\/shared\/storage\/imagekit\.util'/);
    // No second, locally-declared constant of the same name in the service.
    expect(SERVICE_SRC).not.toMatch(/const\s+MAX_PHOTO_BYTES\s*=/);
  });
});

// ---------------------------------------------------------------------------
// presignUpload(): declared file_size_bytes gate
// ---------------------------------------------------------------------------
//
// Mirrors gallery.service.ts presignUpload()'s
// `if (dto.file_size_bytes > MAX_PHOTO_BYTES)` check.
function presignAccepts(fileSizeBytes: number): boolean {
  return fileSizeBytes > 0 && fileSizeBytes <= MAX_PHOTO_BYTES;
}

describe('presignUpload() size gate (mirrored decision logic)', () => {
  it('Test 1: accepts exactly 20,000,000 bytes', () => {
    expect(presignAccepts(20_000_000)).toBe(true);
  });

  it('Test 2: rejects 20,000,001 bytes', () => {
    expect(presignAccepts(20_000_001)).toBe(false);
  });

  it('Test 3: rejects a clearly oversized declared size (30 MB)', () => {
    expect(presignAccepts(30_000_000)).toBe(false);
  });

  it('presignUpload validates dto.file_size_bytes against MAX_PHOTO_BYTES before creating the PROCESSING row', () => {
    const fnBody = SERVICE_SRC.slice(
      SERVICE_SRC.indexOf('async presignUpload'),
      SERVICE_SRC.indexOf('async confirmUpload'),
    );
    expect(fnBody).toContain('dto.file_size_bytes > MAX_PHOTO_BYTES');
    expect(fnBody.indexOf('dto.file_size_bytes > MAX_PHOTO_BYTES'))
      .toBeLessThan(fnBody.indexOf(".insertInto('photos')"));
  });
});

// ---------------------------------------------------------------------------
// confirmUpload(): actual R2 object size gate
// ---------------------------------------------------------------------------
//
// Mirrors gallery.service.ts confirmUpload()'s step 2b:
// `if (head.sizeBytes != null && head.sizeBytes > MAX_PHOTO_BYTES)`.
// The browser-declared size from /presign is intentionally irrelevant here —
// only the real R2 HEAD ContentLength is authoritative at confirm time.
function confirmAdmitsActualSize(actualSizeBytes: number | null): boolean {
  if (actualSizeBytes == null) return true; // HEAD reported no size — not this gate's concern
  return actualSizeBytes <= MAX_PHOTO_BYTES;
}

describe('confirmUpload() actual-size gate (mirrored decision logic)', () => {
  it('Test 1: actual size 20,000,000 bytes is accepted', () => {
    expect(confirmAdmitsActualSize(20_000_000)).toBe(true);
  });

  it('Test 2: actual size 20,000,001 bytes is rejected', () => {
    expect(confirmAdmitsActualSize(20_000_001)).toBe(false);
  });

  it('Test 3: a clearly oversized actual size (25 MiB / 26,214,400 bytes) is rejected', () => {
    expect(confirmAdmitsActualSize(26_214_400)).toBe(false);
  });

  it('Test 4: rejects an oversized actual R2 size even when the declared browser size was within limit', () => {
    const declaredSizeBytesAtPresign = 19_000_000; // accepted at /presign
    const actualR2ObjectSizeBytes = 21_000_000; // but the real uploaded object is bigger
    expect(presignAccepts(declaredSizeBytesAtPresign)).toBe(true);
    expect(confirmAdmitsActualSize(actualR2ObjectSizeBytes)).toBe(false);
  });

  it('Test 5: actual R2 size within limit continues normal confirmation', () => {
    expect(confirmAdmitsActualSize(19_999_999)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// confirmUpload(): source wiring — ordering, status, and non-destructive
// behavior on the oversize path (real source inspection)
// ---------------------------------------------------------------------------

describe('confirmUpload() oversize-path wiring (real source inspection)', () => {
  const CONFIRM_UPLOAD_SRC = SERVICE_SRC.slice(
    SERVICE_SRC.indexOf('async confirmUpload'),
    SERVICE_SRC.indexOf('async getAllPhotoIds'),
  );

  it('checks the actual R2 HEAD size, not the DTO-declared size', () => {
    expect(CONFIRM_UPLOAD_SRC).toContain('head.sizeBytes > MAX_PHOTO_BYTES');
  });

  it('the size check runs after headObject() and before the ACTIVE status transition', () => {
    const headIdx = CONFIRM_UPLOAD_SRC.indexOf('this.r2.headObject(');
    const sizeCheckIdx = CONFIRM_UPLOAD_SRC.indexOf('head.sizeBytes > MAX_PHOTO_BYTES');
    const activateIdx = CONFIRM_UPLOAD_SRC.indexOf("status:             'ACTIVE'");

    expect(headIdx).toBeGreaterThan(-1);
    expect(sizeCheckIdx).toBeGreaterThan(-1);
    expect(activateIdx).toBeGreaterThan(-1);
    expect(headIdx).toBeLessThan(sizeCheckIdx);
    expect(sizeCheckIdx).toBeLessThan(activateIdx);
  });

  it('raises BadRequestException (HTTP 400) on the oversize path', () => {
    const sizeCheckBlock = CONFIRM_UPLOAD_SRC.slice(
      CONFIRM_UPLOAD_SRC.indexOf('head.sizeBytes > MAX_PHOTO_BYTES') - 40,
      CONFIRM_UPLOAD_SRC.indexOf('head.sizeBytes > MAX_PHOTO_BYTES') + 400,
    );
    expect(sizeCheckBlock).toContain('BadRequestException');
  });

  it('the oversize error message reports the actual size and the 20 MB limit', () => {
    expect(CONFIRM_UPLOAD_SRC).toMatch(/exceeds the 20\s?MB limit/i);
  });

  it('does not synchronously delete the R2 object on the oversize path (R2Service exposes no delete method)', () => {
    const r2ServiceSrc = readFileSync(
      join(__dirname, '../shared/storage/r2.service.ts'),
      'utf8',
    );
    expect(r2ServiceSrc).not.toMatch(/async\s+delete\w*\(/i);
    expect(CONFIRM_UPLOAD_SRC).not.toMatch(/\.delete(Object)?\(/i);
  });

  it('does not introduce a new photo lifecycle status for the oversize case', () => {
    // Only the two pre-existing statuses this function already deals in.
    const statusLiterals = CONFIRM_UPLOAD_SRC.match(/status:\s*'([A-Z_]+)'/g) ?? [];
    const distinct = new Set(statusLiterals);
    expect(distinct).toEqual(new Set(["status:             'ACTIVE'"]));
    // i.e. no new status is ever *written* by this function -- the oversize
    // path throws before reaching the ACTIVE write, leaving the row's
    // existing PROCESSING status untouched.
  });

  it('preserves existing duplicate-detection and ownership checks after the size gate', () => {
    const sizeCheckIdx = CONFIRM_UPLOAD_SRC.indexOf('head.sizeBytes > MAX_PHOTO_BYTES');
    const dupCheckIdx = CONFIRM_UPLOAD_SRC.indexOf("where('sha256_hash'");
    const ownerCheckIdx = CONFIRM_UPLOAD_SRC.indexOf("where('owner_user_id', '=', userId)");
    expect(dupCheckIdx).toBeGreaterThan(sizeCheckIdx);
    // Ownership is enforced earlier, at record load — unaffected by the new gate.
    expect(ownerCheckIdx).toBeGreaterThan(-1);
    expect(ownerCheckIdx).toBeLessThan(sizeCheckIdx);
  });
});
