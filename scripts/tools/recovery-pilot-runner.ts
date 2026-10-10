// scripts/tools/recovery-pilot-runner.ts
//
// ============================================================================
// PRODUCTION PHOTO RECOVERY PILOT — 3-PHOTO VERIFIED RUNNER
// ============================================================================
//
// Target Constellation:
//   1. Photo 1966 — Owner 64 — UUID 43687aec-fad3-4532-9513-1b66a950dfcb (Rishabh Dev Vyas)
//   2. Photo 1952 — Owner 68 — UUID 35f4d86f-8171-44ac-b95c-7d52ce497014 (Dr. Nihit Agrawal)
//   3. Photo 1821 — Owner 91 — UUID 90515904-dd2d-448e-a6e4-c509b421b5fd (Om Raghuwanshi)
//
// Safety Invariants:
//   - Zero mutations in --dry-run mode (default).
//   - Requires explicit --execute flag for mutations.
//   - Invokes GalleryService.confirmUpload() through NestJS application context.
//   - Enforces visibility: 'PRIVATE' (Private Drafts).
//   - Revalidates all preconditions from DB & R2 immediately before each write.
//   - Halts immediately on the first failure; accurately reports partial status.
//   - No R2 mutations (zero PUT/DELETE), zero row insertions (no INSERT).
// ============================================================================

import type { ConfirmPhotoDto } from '../../backend/src/modules/gallery/dto/confirm-photo.dto';
import type { GalleryService } from '../../backend/src/modules/gallery/gallery.service';
import type { R2Service } from '../../backend/src/modules/shared/storage/r2.service';

export interface PilotTarget {
  readonly photoId: number;
  readonly expectedUuid: string;
  readonly expectedOwnerId: number;
  readonly expectedR2Key: string;
  readonly expectedFilename: string;
  readonly expectedSize: number;
  readonly expectedEtag: string;
  readonly title: string;
  readonly probedWidth: number;
  readonly probedHeight: number;
  readonly cameraMake?: string;
  readonly cameraModel?: string;
  readonly lensModel?: string;
  readonly focalLength?: number;
  readonly aperture?: number;
  readonly shutterSpeed?: string;
  readonly iso?: number;
  readonly rawTakenAt?: string; // e.g. "2025:04:18 08:15:16"
}

export const PILOT_TARGETS: readonly PilotTarget[] = Object.freeze([
  {
    photoId: 1966,
    expectedUuid: '43687aec-fad3-4532-9513-1b66a950dfcb',
    expectedOwnerId: 64,
    expectedR2Key: 'photos/64/2026/10/43687aec-fad3-4532-9513-1b66a950dfcb.jpg',
    expectedFilename: 'DSC_3290.jpg',
    expectedSize: 3766567,
    expectedEtag: '129ebef34f8669837c798915718b3f47',
    title: 'DSC 3290',
    probedWidth: 2900,
    probedHeight: 2072,
    cameraMake: 'NIKON CORPORATION',
    cameraModel: 'NIKON D850',
    lensModel: '200.0-500.0 mm f/5.6',
    focalLength: 390.0,
    aperture: 5.6,
    shutterSpeed: '1/500',
    iso: 640,
    rawTakenAt: '2025:04:18 08:15:16',
  },
  {
    photoId: 1952,
    expectedUuid: '35f4d86f-8171-44ac-b95c-7d52ce497014',
    expectedOwnerId: 68,
    expectedR2Key: 'photos/68/2026/10/35f4d86f-8171-44ac-b95c-7d52ce497014.jpg',
    expectedFilename: 'DSC_4799.JPG',
    expectedSize: 2014292,
    expectedEtag: '5c75267688cccb10667ccdbe97fe0480',
    title: 'DSC 4799',
    probedWidth: 3240,
    probedHeight: 2160,
    cameraMake: 'NIKON CORPORATION',
    cameraModel: 'NIKON Z6_3',
    lensModel: 'NIKKOR Z 180-600mm f/5.6-6.3 VR',
    focalLength: 600.0,
    aperture: 6.3,
    shutterSpeed: '1/3200',
    iso: 1100,
    rawTakenAt: '2026:05:09 16:36:52',
  },
  {
    photoId: 1821,
    expectedUuid: '90515904-dd2d-448e-a6e4-c509b421b5fd',
    expectedOwnerId: 91,
    expectedR2Key: 'photos/91/2026/10/90515904-dd2d-448e-a6e4-c509b421b5fd.jpg',
    expectedFilename: 'IMG_0310.jpeg',
    expectedSize: 2921206,
    expectedEtag: '2460ab2e5b82746c50b835b0f1199f1d',
    title: 'IMG 0310',
    probedWidth: 4000,
    probedHeight: 6000,
    cameraMake: 'Canon',
    cameraModel: 'Canon EOS R8',
    lensModel: 'RF24-105mm F4 L IS USM',
    focalLength: 85.0,
    aperture: 5.6,
    shutterSpeed: '1/400',
    iso: 160,
    rawTakenAt: '2026:05:31 08:46:14',
  },
]);

/**
 * Normalizes raw EXIF dates ("YYYY:MM:DD HH:MM:SS") to ISO format ("YYYY-MM-DD HH:MM:SS").
 * JavaScript's Date parser treats colons in the date part as invalid (NaN).
 */
export function normalizeExifDate(rawDate?: string): string | undefined {
  if (!rawDate) return undefined;
  return rawDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
}

/**
 * Builds the valid ConfirmPhotoDto adhering to application invariants.
 */
export function buildConfirmDto(target: PilotTarget): ConfirmPhotoDto {
  return {
    title: target.title,
    visibility: 'PRIVATE', // Invariant: Saved as Private Draft
    show_in_portfolio: true,
    exif: {
      width_px: target.probedWidth,
      height_px: target.probedHeight,
      camera_make: target.cameraMake,
      camera_model: target.cameraModel,
      lens_model: target.lensModel,
      focal_length: target.focalLength,
      aperture: target.aperture,
      shutter_speed: target.shutterSpeed,
      iso: target.iso,
      taken_at: normalizeExifDate(target.rawTakenAt),
    },
  };
}

export type TargetValidationResult =
  | { status: 'READY_FOR_RECOVERY'; photo: Record<string, unknown> }
  | { status: 'ALREADY_RECOVERED'; photo: Record<string, unknown> }
  | { status: 'MISMATCH'; reason: string };

/**
 * Validates all preconditions against a database record and R2 HEAD metadata.
 */
export function validatePreconditions(
  target: PilotTarget,
  photo: Record<string, unknown> | undefined,
  head: { exists: boolean; sizeBytes: number | null },
  activeDuplicateExists: boolean,
): TargetValidationResult {
  if (!photo) {
    return { status: 'MISMATCH', reason: `Photo #${target.photoId} not found in database.` };
  }

  if (photo.uuid !== target.expectedUuid) {
    return { status: 'MISMATCH', reason: `UUID mismatch: DB=${photo.uuid}, expected=${target.expectedUuid}` };
  }

  if (Number(photo.owner_user_id) !== target.expectedOwnerId) {
    return { status: 'MISMATCH', reason: `Owner mismatch: DB=${photo.owner_user_id}, expected=${target.expectedOwnerId}` };
  }

  if (photo.r2_key !== target.expectedR2Key) {
    return { status: 'MISMATCH', reason: `R2 key mismatch: DB=${photo.r2_key}, expected=${target.expectedR2Key}` };
  }

  if (photo.deleted_at !== null) {
    return { status: 'MISMATCH', reason: `Photo #${target.photoId} is marked DELETED (${photo.deleted_at}).` };
  }

  if (Number(photo.file_size_bytes) !== target.expectedSize) {
    return { status: 'MISMATCH', reason: `DB size mismatch: DB=${photo.file_size_bytes}, expected=${target.expectedSize}` };
  }

  if (!head.exists) {
    return { status: 'MISMATCH', reason: `R2 object missing: ${target.expectedR2Key}` };
  }

  if (head.sizeBytes !== target.expectedSize) {
    return { status: 'MISMATCH', reason: `R2 size mismatch: R2=${head.sizeBytes}, expected=${target.expectedSize}` };
  }

  // Check if already safely recovered as a PRIVATE draft
  if (photo.status === 'ACTIVE') {
    if (photo.visibility !== 'PRIVATE') {
      return {
        status: 'MISMATCH',
        reason: `Photo #${target.photoId} is ACTIVE with non-private visibility '${photo.visibility}'. Only PRIVATE drafts may be skipped as already recovered.`,
      };
    }
    if (photo.confirmed_at === null) {
      return {
        status: 'MISMATCH',
        reason: `Photo #${target.photoId} is ACTIVE but confirmed_at is NULL.`,
      };
    }
    if (
      Number(photo.width_px) !== target.probedWidth ||
      Number(photo.height_px) !== target.probedHeight
    ) {
      return {
        status: 'MISMATCH',
        reason: `Photo #${target.photoId} is ACTIVE but dimensions mismatch (DB=${photo.width_px}x${photo.height_px}, expected=${target.probedWidth}x${target.probedHeight}).`,
      };
    }
    return { status: 'ALREADY_RECOVERED', photo };
  }

  // Preconditions for unrecovered candidate
  if (photo.status === 'PROCESSING') {
    if (photo.confirmed_at !== null) {
      return {
        status: 'MISMATCH',
        reason: `Photo #${target.photoId} is in PROCESSING but confirmed_at is already set (${photo.confirmed_at}).`,
      };
    }
    if (activeDuplicateExists) {
      return {
        status: 'MISMATCH',
        reason: `Active duplicate photo found for owner #${target.expectedOwnerId} with identical size.`,
      };
    }
    return { status: 'READY_FOR_RECOVERY', photo };
  }

  return {
    status: 'MISMATCH',
    reason: `Photo #${target.photoId} has unexpected status '${photo.status}' (expected PROCESSING or ACTIVE private draft).`,
  };
}

export interface ExecutionResult {
  photoId: number;
  status: 'SUCCESS' | 'DRY_RUN_PASSED' | 'ALREADY_RECOVERED' | 'FAILED';
  details?: string;
}

export async function processTargets(
  targets: readonly PilotTarget[],
  isDryRun: boolean,
  deps: {
    galleryService: Pick<GalleryService, 'confirmUpload'>;
    r2Service: Pick<R2Service, 'headObject'>;
    dbQueryPhoto: (id: number) => Promise<Record<string, unknown> | undefined>;
    dbCheckActiveDup: (ownerId: number, sizeBytes: number) => Promise<boolean>;
  },
): Promise<{ success: boolean; results: ExecutionResult[]; error?: string }> {
  const results: ExecutionResult[] = [];

  // =========================================================================
  // PHASE 1: INITIAL PREFLIGHT ACROSS ALL TARGETS
  // Validate all approved candidates before any mutation can occur.
  // If ANY candidate fails preflight, abort immediately with 0 mutations.
  // =========================================================================
  const preflightStatuses: Array<{
    target: PilotTarget;
    validation: TargetValidationResult;
  }> = [];

  for (const target of targets) {
    const photo = await deps.dbQueryPhoto(target.photoId);
    const head = await deps.r2Service.headObject(target.expectedR2Key);
    const activeDup = await deps.dbCheckActiveDup(target.expectedOwnerId, target.expectedSize);
    const validation = validatePreconditions(target, photo, head, activeDup);

    if (validation.status === 'MISMATCH') {
      const err = `INITIAL PREFLIGHT FAILURE on Photo #${target.photoId}: ${validation.reason}`;
      results.push({ photoId: target.photoId, status: 'FAILED', details: err });
      return { success: false, results, error: err };
    }

    preflightStatuses.push({ target, validation });
  }

  // In dry-run mode: emit preflight verification results and exit without writing
  if (isDryRun) {
    for (const { target, validation } of preflightStatuses) {
      if (validation.status === 'ALREADY_RECOVERED') {
        results.push({
          photoId: target.photoId,
          status: 'ALREADY_RECOVERED',
          details: 'Photo already recovered as PRIVATE draft in prior run (safe no-op)',
        });
      } else {
        results.push({
          photoId: target.photoId,
          status: 'DRY_RUN_PASSED',
          details: 'All preflight preconditions verified. Ready to recover as PRIVATE draft.',
        });
      }
    }
    return { success: true, results };
  }

  // =========================================================================
  // PHASE 2: SEQUENTIAL LIVE RECOVERY
  // Revalidate each candidate immediately before its own recovery.
  // =========================================================================
  for (const target of targets) {
    // 1. Re-query and revalidate immediately before write
    const photo = await deps.dbQueryPhoto(target.photoId);
    const head = await deps.r2Service.headObject(target.expectedR2Key);
    const activeDup = await deps.dbCheckActiveDup(target.expectedOwnerId, target.expectedSize);
    const reval = validatePreconditions(target, photo, head, activeDup);

    if (reval.status === 'MISMATCH') {
      const err = `IMMEDIATE PRE-WRITE REVALIDATION FAILURE on Photo #${target.photoId}: ${reval.reason}`;
      results.push({ photoId: target.photoId, status: 'FAILED', details: err });
      return { success: false, results, error: err };
    }

    if (reval.status === 'ALREADY_RECOVERED') {
      results.push({
        photoId: target.photoId,
        status: 'ALREADY_RECOVERED',
        details: 'Photo already recovered as PRIVATE draft in prior run (safe no-op)',
      });
      continue;
    }

    // 2. Build DTO with enforced PRIVATE visibility
    const dto = buildConfirmDto(target);

    // 3. Invoke application service
    try {
      const confirmed = await deps.galleryService.confirmUpload(
        target.expectedOwnerId,
        target.expectedUuid,
        dto,
      );
      results.push({
        photoId: target.photoId,
        status: 'SUCCESS',
        details: `Confirmed as PRIVATE draft (ID=${confirmed.id}, status=${confirmed.status})`,
      });
    } catch (err: any) {
      const errMsg = `confirmUpload() failed on Photo #${target.photoId}: ${err.message}`;
      results.push({ photoId: target.photoId, status: 'FAILED', details: errMsg });
      return { success: false, results, error: errMsg };
    }
  }

  return { success: true, results };
}

export async function main(): Promise<void> {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute || process.argv.includes('--dry-run');

  console.log('================================================================');
  console.log(`BCC V3 — Production Photo Recovery Pilot Runner`);
  console.log(`Mode   : ${isDryRun ? 'DRY-RUN (Strictly Read-Only, zero writes)' : 'LIVE EXECUTION'}`);
  console.log(`Targets: ${PILOT_TARGETS.length} approved photographs`);
  console.log(`Time   : ${new Date().toISOString()}`);
  console.log('================================================================\n');

  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../backend/src/app.module');
  const { GalleryService } = require('../../backend/src/modules/gallery/gallery.service');
  const { R2Service } = require('../../backend/src/modules/shared/storage/r2.service');
  const { db } = require('../../backend/src/database/db');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const galleryService = app.get(GalleryService);
  const r2Service = app.get(R2Service);

  const deps = {
    galleryService,
    r2Service,
    dbQueryPhoto: async (id: number) => {
      const row = await db.selectFrom('photos').where('id', '=', id).selectAll().executeTakeFirst();
      return row as Record<string, unknown> | undefined;
    },
    dbCheckActiveDup: async (ownerId: number, sizeBytes: number) => {
      const dup = await db
        .selectFrom('photos')
        .where('owner_user_id', '=', ownerId)
        .where('status', '=', 'ACTIVE')
        .where('file_size_bytes', '=', sizeBytes)
        .select('id')
        .executeTakeFirst();
      return !!dup;
    },
  };

  try {
    const outcome = await processTargets(PILOT_TARGETS, isDryRun, deps);

    console.log('\n================================================================');
    console.log(`PILOT SUMMARY: ${outcome.success ? 'ALL TARGETS PROCESSED' : 'HALTED ON ERROR'}`);
    console.log('================================================================');
    for (const r of outcome.results) {
      console.log(`  Photo #${r.photoId}: ${r.status} — ${r.details || ''}`);
    }
    console.log('================================================================\n');

    if (!outcome.success) {
      console.error(`Abort Reason: ${outcome.error}`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(process.exitCode ?? 0);
    })
    .catch((e) => {
      console.error('Fatal crash:', e);
      process.exit(1);
    });
}
