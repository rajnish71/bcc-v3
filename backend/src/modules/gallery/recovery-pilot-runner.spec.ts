// backend/src/modules/gallery/recovery-pilot-runner.spec.ts

import {
  PILOT_TARGETS,
  normalizeExifDate,
  buildConfirmDto,
  validatePreconditions,
  processTargets,
  PilotTarget,
} from '../../../../scripts/tools/recovery-pilot-runner';

describe('Production Photo Recovery Pilot Runner Specification', () => {
  describe('Approved Target Constellation', () => {
    it('contains exactly and only the three approved recovery candidates', () => {
      expect(PILOT_TARGETS).toHaveLength(3);

      const targetIds = PILOT_TARGETS.map((t) => t.photoId);
      expect(targetIds).toEqual([1966, 1952, 1821]);

      const targetUuids = PILOT_TARGETS.map((t) => t.expectedUuid);
      expect(targetUuids).toEqual([
        '43687aec-fad3-4532-9513-1b66a950dfcb',
        '35f4d86f-8171-44ac-b95c-7d52ce497014',
        '90515904-dd2d-448e-a6e4-c509b421b5fd',
      ]);

      const targetOwners = PILOT_TARGETS.map((t) => t.expectedOwnerId);
      expect(targetOwners).toEqual([64, 68, 91]);
    });

    it('PILOT_TARGETS is frozen to prevent runtime tampering', () => {
      expect(Object.isFrozen(PILOT_TARGETS)).toBe(true);
    });
  });

  describe('EXIF Date Normalization', () => {
    it('normalizes colon-delimited EXIF date strings to ISO-parseable dates', () => {
      const raw = '2025:04:18 08:15:16';
      const normalized = normalizeExifDate(raw);
      expect(normalized).toBe('2025-04-18 08:15:16');

      // Verify that Node.js Date successfully parses the normalized date without NaN
      const parsed = new Date(normalized!);
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(3); // April (0-indexed)
      expect(parsed.getDate()).toBe(18);
    });

    it('returns undefined if no raw date is provided', () => {
      expect(normalizeExifDate(undefined)).toBeUndefined();
      expect(normalizeExifDate('')).toBeUndefined();
    });
  });

  describe('DTO Construction & Privacy Invariants', () => {
    it('always enforces visibility: PRIVATE (Private Draft)', () => {
      const target = PILOT_TARGETS[0];
      const dto = buildConfirmDto(target);

      expect(dto.visibility).toBe('PRIVATE');
      expect(dto.show_in_portfolio).toBe(true);
      expect(dto.title).toBe('DSC 3290');
      expect(dto.exif?.width_px).toBe(2900);
      expect(dto.exif?.height_px).toBe(2072);
      expect(dto.exif?.camera_make).toBe('NIKON CORPORATION');
      expect(dto.exif?.camera_model).toBe('NIKON D850');
      expect(dto.exif?.lens_model).toBe('200.0-500.0 mm f/5.6');
      expect(dto.exif?.focal_length).toBe(390.0);
      expect(dto.exif?.aperture).toBe(5.6);
      expect(dto.exif?.shutter_speed).toBe('1/500');
      expect(dto.exif?.iso).toBe(640);
      expect(dto.exif?.taken_at).toBe('2025-04-18 08:15:16');
    });
  });

  describe('Precondition Validation Logic', () => {
    const target: PilotTarget = PILOT_TARGETS[0];

    const validPhoto = {
      id: 1966,
      uuid: '43687aec-fad3-4532-9513-1b66a950dfcb',
      owner_user_id: 64,
      r2_key: 'photos/64/2026/10/43687aec-fad3-4532-9513-1b66a950dfcb.jpg',
      file_size_bytes: 3766567,
      status: 'PROCESSING',
      visibility: 'MEMBERS_ONLY',
      confirmed_at: null,
      deleted_at: null,
      width_px: null,
      height_px: null,
    };

    const validHead = {
      exists: true,
      sizeBytes: 3766567,
    };

    it('passes when record and R2 object match all preconditions', () => {
      const result = validatePreconditions(target, validPhoto, validHead, false);
      expect(result.status).toBe('READY_FOR_RECOVERY');
    });

    it('aborts if photo record is not found in database', () => {
      const result = validatePreconditions(target, undefined, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('not found in database');
    });

    it('aborts on UUID mismatch', () => {
      const photo = { ...validPhoto, uuid: 'wrong-uuid-1234' };
      const result = validatePreconditions(target, photo, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('UUID mismatch');
    });

    it('aborts on owner mismatch', () => {
      const photo = { ...validPhoto, owner_user_id: 999 };
      const result = validatePreconditions(target, photo, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('Owner mismatch');
    });

    it('aborts on R2 key mismatch', () => {
      const photo = { ...validPhoto, r2_key: 'photos/64/unexpected.jpg' };
      const result = validatePreconditions(target, photo, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('R2 key mismatch');
    });

    it('aborts if photo is marked DELETED', () => {
      const photo = { ...validPhoto, status: 'DELETED', deleted_at: new Date() };
      const result = validatePreconditions(target, photo, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('marked DELETED');
    });

    it('aborts on database file size mismatch', () => {
      const photo = { ...validPhoto, file_size_bytes: 99999 };
      const result = validatePreconditions(target, photo, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('DB size mismatch');
    });

    it('aborts if object is missing in R2', () => {
      const head = { exists: false, sizeBytes: null };
      const result = validatePreconditions(target, validPhoto, head, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('R2 object missing');
    });

    it('aborts on R2 object size mismatch', () => {
      const head = { exists: true, sizeBytes: 12345 };
      const result = validatePreconditions(target, validPhoto, head, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('R2 size mismatch');
    });

    it('aborts if an active duplicate exists for the same owner', () => {
      const result = validatePreconditions(target, validPhoto, validHead, true);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('Active duplicate photo found');
    });

    it('recognizes an already safely recovered private draft (safe retry no-op)', () => {
      const recoveredPhoto = {
        ...validPhoto,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        width_px: 2900,
        height_px: 2072,
        confirmed_at: new Date(),
      };
      const result = validatePreconditions(target, recoveredPhoto, validHead, false);
      expect(result.status).toBe('ALREADY_RECOVERED');
    });

    it('aborts if photo is ACTIVE with non-private visibility (e.g. PUBLIC)', () => {
      const publicActive = {
        ...validPhoto,
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        width_px: 2900,
        height_px: 2072,
        confirmed_at: new Date(),
      };
      const result = validatePreconditions(target, publicActive, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('non-private visibility \'PUBLIC\'');
    });

    it('aborts if photo is ACTIVE with MEMBERS_ONLY visibility', () => {
      const membersOnlyActive = {
        ...validPhoto,
        status: 'ACTIVE',
        visibility: 'MEMBERS_ONLY',
        width_px: 2900,
        height_px: 2072,
        confirmed_at: new Date(),
      };
      const result = validatePreconditions(target, membersOnlyActive, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('non-private visibility \'MEMBERS_ONLY\'');
    });

    it('aborts if photo is ACTIVE but confirmed_at is NULL', () => {
      const activeNullConfirmed = {
        ...validPhoto,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        width_px: 2900,
        height_px: 2072,
        confirmed_at: null,
      };
      const result = validatePreconditions(target, activeNullConfirmed, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('confirmed_at is NULL');
    });

    it('aborts if photo is ACTIVE but dimensions mismatch probed dimensions', () => {
      const activeWrongDims = {
        ...validPhoto,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        width_px: 1000,
        height_px: 1000,
        confirmed_at: new Date(),
      };
      const result = validatePreconditions(target, activeWrongDims, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('dimensions mismatch');
    });

    it('aborts if photo is ACTIVE but R2 object is missing', () => {
      const recoveredPhoto = {
        ...validPhoto,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        width_px: 2900,
        height_px: 2072,
        confirmed_at: new Date(),
      };
      const missingHead = { exists: false, sizeBytes: null };
      const result = validatePreconditions(target, recoveredPhoto, missingHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('R2 object missing');
    });

    it('aborts if photo is in PROCESSING but confirmed_at is already populated', () => {
      const processingConfirmed = {
        ...validPhoto,
        status: 'PROCESSING',
        confirmed_at: new Date(),
      };
      const result = validatePreconditions(target, processingConfirmed, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('confirmed_at is already set');
    });

    it('aborts if photo has an unexpected status (e.g. ARCHIVED)', () => {
      const archivedPhoto = {
        ...validPhoto,
        status: 'ARCHIVED',
      };
      const result = validatePreconditions(target, archivedPhoto, validHead, false);
      expect(result.status).toBe('MISMATCH');
      expect((result as any).reason).toContain('unexpected status \'ARCHIVED\'');
    });
  });

  describe('Execution Loop & Halting Behavior (processTargets)', () => {
    const makeDbMock = (overrides: Record<number, Partial<any>> = {}) => {
      return async (id: number) => {
        const target = PILOT_TARGETS.find((t) => t.photoId === id);
        if (!target) return undefined;
        return {
          id: target.photoId,
          uuid: target.expectedUuid,
          owner_user_id: target.expectedOwnerId,
          r2_key: target.expectedR2Key,
          file_size_bytes: target.expectedSize,
          status: 'PROCESSING',
          visibility: 'MEMBERS_ONLY',
          confirmed_at: null,
          deleted_at: null,
          width_px: null,
          height_px: null,
          ...(overrides[id] ?? {}),
        };
      };
    };

    const makeR2Mock = () => ({
      headObject: jest.fn(async (key: string) => {
        const target = PILOT_TARGETS.find((t) => t.expectedR2Key === key);
        return target ? { exists: true, sizeBytes: target.expectedSize } : { exists: false, sizeBytes: null };
      }),
    });

    it('DRY-RUN mode makes zero writes and never invokes confirmUpload()', async () => {
      const confirmUpload = jest.fn();
      const r2Service = makeR2Mock();
      const dbQueryPhoto = makeDbMock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, true, {
        galleryService: { confirmUpload },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.results).toHaveLength(3);
      expect(outcome.results.every((r) => r.status === 'DRY_RUN_PASSED')).toBe(true);
      expect(confirmUpload).not.toHaveBeenCalled();
    });

    it('LIVE mode invokes confirmUpload() sequentially for all 3 candidates', async () => {
      const confirmUpload = jest.fn(async (userId, uuid, dto) => ({
        id: uuid === PILOT_TARGETS[0].expectedUuid ? 1966 : 1952,
        status: 'ACTIVE',
        visibility: dto.visibility,
      }));
      const r2Service = makeR2Mock();
      const dbQueryPhoto = makeDbMock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, false, {
        galleryService: { confirmUpload: confirmUpload as any },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.results).toHaveLength(3);
      expect(outcome.results.every((r) => r.status === 'SUCCESS')).toBe(true);
      expect(confirmUpload).toHaveBeenCalledTimes(3);

      // Verify call 1
      expect(confirmUpload).toHaveBeenNthCalledWith(
        1,
        64,
        '43687aec-fad3-4532-9513-1b66a950dfcb',
        expect.objectContaining({ visibility: 'PRIVATE' }),
      );

      // Verify call 2
      expect(confirmUpload).toHaveBeenNthCalledWith(
        2,
        68,
        '35f4d86f-8171-44ac-b95c-7d52ce497014',
        expect.objectContaining({ visibility: 'PRIVATE' }),
      );

      // Verify call 3
      expect(confirmUpload).toHaveBeenNthCalledWith(
        3,
        91,
        '90515904-dd2d-448e-a6e4-c509b421b5fd',
        expect.objectContaining({ visibility: 'PRIVATE' }),
      );
    });

    it('ALL-CANDIDATE PREFLIGHT FAILURE: if Candidate 3 fails preflight, ZERO mutations occur', async () => {
      const confirmUpload = jest.fn();
      // Candidate 3 is missing in R2 during initial preflight
      const r2Service = {
        headObject: jest.fn(async (key: string) => {
          if (key === PILOT_TARGETS[2].expectedR2Key) {
            return { exists: false, sizeBytes: null };
          }
          const target = PILOT_TARGETS.find((t) => t.expectedR2Key === key);
          return target ? { exists: true, sizeBytes: target.expectedSize } : { exists: false, sizeBytes: null };
        }),
      };
      const dbQueryPhoto = makeDbMock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, false, {
        galleryService: { confirmUpload: confirmUpload as any },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('INITIAL PREFLIGHT FAILURE on Photo #1821: R2 object missing');
      // Crucial: NO candidate was mutated! confirmUpload was never called!
      expect(confirmUpload).not.toHaveBeenCalled();
    });

    it('HALTS immediately when confirmUpload() throws: accurately reports partial success', async () => {
      // Candidate 1 succeeds, Candidate 2 throws inside confirmUpload
      const confirmUpload = jest
        .fn()
        .mockImplementationOnce(async () => ({ id: 1966, status: 'ACTIVE' }))
        .mockImplementationOnce(async () => {
          throw new Error('Database deadlock on update');
        });

      const r2Service = makeR2Mock();
      const dbQueryPhoto = makeDbMock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, false, {
        galleryService: { confirmUpload: confirmUpload as any },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.results).toHaveLength(2);
      expect(outcome.results[0]).toEqual(
        expect.objectContaining({ photoId: 1966, status: 'SUCCESS' }),
      );
      expect(outcome.results[1]).toEqual(
        expect.objectContaining({ photoId: 1952, status: 'FAILED' }),
      );
      expect(outcome.error).toContain('confirmUpload() failed on Photo #1952: Database deadlock on update');

      // Crucial: Candidate 3 (photo #1821) was never attempted
      expect(confirmUpload).toHaveBeenCalledTimes(2);
    });

    it('HALTS immediately on immediate pre-write revalidation failure', async () => {
      const confirmUpload = jest.fn(async () => ({ id: 1966, status: 'ACTIVE' }));
      let queryCount = 0;
      // In Phase 1 preflight, Candidate 2 looks valid. In Phase 2 revalidation, Candidate 2 is suddenly deleted!
      const dbQueryPhoto = jest.fn(async (id: number) => {
        queryCount++;
        const target = PILOT_TARGETS.find((t) => t.photoId === id)!;
        const isSecondQueryFor1952 = id === 1952 && queryCount > 3;
        return {
          id: target.photoId,
          uuid: target.expectedUuid,
          owner_user_id: target.expectedOwnerId,
          r2_key: target.expectedR2Key,
          file_size_bytes: target.expectedSize,
          status: 'PROCESSING',
          visibility: 'MEMBERS_ONLY',
          confirmed_at: null,
          deleted_at: isSecondQueryFor1952 ? new Date() : null,
          width_px: null,
          height_px: null,
        };
      });

      const r2Service = makeR2Mock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, false, {
        galleryService: { confirmUpload: confirmUpload as any },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.results[0].status).toBe('SUCCESS');
      expect(outcome.results[1].status).toBe('FAILED');
      expect(outcome.error).toContain('IMMEDIATE PRE-WRITE REVALIDATION FAILURE on Photo #1952');
      // Candidate 3 was never attempted
      expect(confirmUpload).toHaveBeenCalledTimes(1);
    });

    it('supports idempotent re-runs when a candidate was already recovered', async () => {
      const confirmUpload = jest.fn(async (userId, uuid, dto) => ({
        id: 1952,
        status: 'ACTIVE',
        visibility: dto.visibility,
      }));

      // Candidate 1 is already recovered
      const dbQueryPhoto = makeDbMock({
        1966: {
          status: 'ACTIVE',
          visibility: 'PRIVATE',
          width_px: 2900,
          height_px: 2072,
          confirmed_at: new Date('2026-10-10T00:00:00Z'),
        },
      });
      const r2Service = makeR2Mock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, false, {
        galleryService: { confirmUpload: confirmUpload as any },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.results).toHaveLength(3);
      expect(outcome.results[0].status).toBe('ALREADY_RECOVERED');
      expect(outcome.results[1].status).toBe('SUCCESS');
      expect(outcome.results[2].status).toBe('SUCCESS');

      // confirmUpload was called only for Candidate 2 and Candidate 3 (Candidate 1 was skipped safely)
      expect(confirmUpload).toHaveBeenCalledTimes(2);
    });

    it('UNEXPECTED STATE ON RERUN: aborts if an already-recovered candidate was altered to PUBLIC', async () => {
      const confirmUpload = jest.fn();
      // Candidate 1 is ACTIVE but was changed to PUBLIC
      const dbQueryPhoto = makeDbMock({
        1966: {
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          width_px: 2900,
          height_px: 2072,
          confirmed_at: new Date('2026-10-10T00:00:00Z'),
        },
      });
      const r2Service = makeR2Mock();
      const dbCheckActiveDup = jest.fn(async () => false);

      const outcome = await processTargets(PILOT_TARGETS, false, {
        galleryService: { confirmUpload: confirmUpload as any },
        r2Service,
        dbQueryPhoto,
        dbCheckActiveDup,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('INITIAL PREFLIGHT FAILURE on Photo #1966: Photo #1966 is ACTIVE with non-private visibility \'PUBLIC\'');
      // No mutation of any candidate occurred
      expect(confirmUpload).not.toHaveBeenCalled();
    });
  });
});
