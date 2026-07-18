// backend/src/modules/gallery/gallery.service.ts
//
// Module 05 -- Photography Gallery & Digital Archive (spec sections 05.1-05.4)
//
// UPLOAD FLOW (presign -> client PUT -> confirm):
//   presignUpload()   Create PROCESSING photo row, return R2 presign URL.
//   confirmUpload()   HEAD-verify R2, store EXIF, activate photo.
//
// VISIBILITY MODEL (MEM-006 aligned, spec 05.3):
//   PUBLIC        Any visitor (unauthenticated ok).
//   MEMBERS_ONLY  Requires ACTIVE membership (any class).
//   PRIVATE       Owner only.
//   UNLISTED      Accessible by UUID link; excluded from feed/listings.
//
// UPLOAD ENTITLEMENT (spec 05.3):
//   Registered Users who are NOT active members cannot upload.
//   Any ACTIVE membership class qualifies.
//
// EXIF (Phase 2a):
//   Client-provided in the /confirm payload. Server stores as-is.
//   Server-side extraction via R2 range read deferred to Phase 4.
//
// DUPLICATE DETECTION (Phase 2a):
//   Exact duplicate only: SHA-256 hash match. Perceptual hash Phase 4.
//
// KYSELY TYPE NOTE:
//   Nullable columns in PhotosTable use the Nullable<T> helper from db.ts,
//   meaning they're ColumnType<T|null, T|null|undefined, T|null>.
//   The "| undefined" insert type means they're optional on INSERT --
//   MySQL defaults them to NULL. Never pass `toMysqlDatetime()` for fields
//   typed as ColumnType<Date|null, string|null, string|null>; pass the
//   string directly.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import { R2Service } from '../shared/storage/r2.service';
import {
  photoR2Key,
  extFromMime,
  mimeToFormat,
  photoVariants,
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
} from '../shared/storage/imagekit.util';
import type { PresignPhotoDto } from './dto/presign-photo.dto';
import type { ConfirmPhotoDto } from './dto/confirm-photo.dto';
import type { UpdatePhotoDto } from './dto/update-photo.dto';
import type { CreateAlbumDto, UpdateAlbumDto, AddPhotoToAlbumDto } from './dto/album.dto';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toDate(v).toISOString();
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

function formatPhoto(row: Record<string, unknown>) {
  const variants = photoVariants(row.r2_key as string);
  return {
    id:                Number(row.id),
    uuid:              row.uuid,
    title:             row.title ?? null,
    caption:           row.caption ?? null,
    description:       row.description ?? null,
    exhibition_label:  row.exhibition_label ?? null,
    visibility:        row.visibility,
    status:            row.status,
    file_format:       row.file_format,
    original_filename: row.original_filename,
    file_size_bytes:   row.file_size_bytes ?? null,
    width_px:          row.width_px ?? null,
    height_px:         row.height_px ?? null,
    exif: {
      camera_make:   row.exif_camera_make ?? null,
      camera_model:  row.exif_camera_model ?? null,
      lens_model:    row.exif_lens_model ?? null,
      focal_length:  row.exif_focal_length ?? null,
      aperture:      row.exif_aperture ?? null,
      shutter_speed: row.exif_shutter_speed ?? null,
      iso:           row.exif_iso ?? null,
      taken_at:      isoOrNull(row.exif_taken_at),
      gps_lat:       row.gps_stripped ? null : (row.exif_gps_lat ?? null),
      gps_lng:       row.gps_stripped ? null : (row.exif_gps_lng ?? null),
    },
    gps_stripped:    !!row.gps_stripped,
    owner_user_id:   row.owner_user_id,
    source_event_id: row.source_event_id ?? null,
    urls:            variants,
    view_count:      Number(row.view_count ?? 0),
    confirmed_at:    isoOrNull(row.confirmed_at),
    created_at:      isoOrNull(row.created_at),
    updated_at:      isoOrNull(row.updated_at),
    // Photographer credit — populated when the query includes a JOIN to users
    // (getPublicFeed). Undefined on all other callers.
    photographer:    row.photographer_name != null
      ? { name: row.photographer_name as string, username: (row.photographer_username as string | null) ?? null }
      : undefined,
  };
}

function formatAlbum(row: Record<string, unknown>) {
  return {
    uuid:             row.uuid,
    title:            row.title,
    eyebrow:          row.eyebrow ?? null,
    subtitle:         row.subtitle ?? null,
    description:      row.description ?? null,
    genres:           (row.genres as string[] | undefined) ?? [],
    visibility:       row.visibility,
    album_type:       row.album_type,
    kind:             row.kind ?? 'COLLECTION',
    source_ref_id:    row.source_ref_id ?? null,
    sort_order:       row.sort_order,
    owner_user_id:    row.owner_user_id,
    cover_photo_uuid: row.cover_photo_uuid ?? null,
    cover_image_url:  row.cover_image_url ?? null,
    photo_count:      row.photo_count ?? 0,
    created_at:       isoOrNull(row.created_at),
    updated_at:       isoOrNull(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class GalleryService {
  constructor(private readonly r2: R2Service) {}

  // =========================================================================
  // Upload: presign
  // =========================================================================

  async presignUpload(
    userId: number,
    dto: PresignPhotoDto,
  ): Promise<{
    photo_uuid: string;
    r2_key: string;
    presign_url: string;
    expires_seconds: number;
  }> {
    // 1. Entitlement: must have ACTIVE membership
    await this.requireActiveMembership(userId);

    // 2. Validate file type
    if (!ALLOWED_MIME_TYPES.has(dto.mime_type.toLowerCase())) {
      throw new BadRequestException(
        `Unsupported file type: ${dto.mime_type}. ` +
        'Allowed: JPEG, PNG, TIFF, HEIC, WebP, NEF, CR2, CR3, ARW, ORF, DNG.',
      );
    }
    if (!dto.file_size_bytes || dto.file_size_bytes <= 0) {
      throw new BadRequestException('file_size_bytes must be a positive integer.');
    }
    if (dto.file_size_bytes > MAX_PHOTO_BYTES) {
      throw new BadRequestException(
        `File exceeds the 150 MB limit (declared ${Math.round(dto.file_size_bytes / 1024 / 1024)} MB).`,
      );
    }

    // 3. Build R2 key
    const uuid  = randomUUID();
    const ext   = extFromMime(dto.mime_type);
    const r2Key = photoR2Key(userId, uuid, ext);

    // 4. Validate source_event_id if provided
    if (dto.source_event_id != null) {
      const event = await db
        .selectFrom('events')
        .where('id', '=', dto.source_event_id)
        .where('state', '=', 'PUBLISHED')
        .select('id')
        .executeTakeFirst();
      if (!event) {
        throw new NotFoundException(`Event ${dto.source_event_id} not found or not published.`);
      }
    }

    // 5. Create PROCESSING photo record.
    //    Nullable fields typed as Nullable<T> are omitted (MySQL defaults NULL).
    const now: any = toMysqlDatetime(new Date());
    await db
      .insertInto('photos')
      .values({
        uuid,
        owner_user_id:    userId,
        r2_key:           r2Key,
        original_filename: dto.filename,
        mime_type:        dto.mime_type,
        file_format:      mimeToFormat(dto.mime_type),
        file_size_bytes:  dto.file_size_bytes,
        status:           'PROCESSING',
        source_event_id:  dto.source_event_id ?? null,
        created_at:       now,
        updated_at:       now,
      })
      .execute();

    // 6. Generate presigned URL (15-min TTL, enforced by R2Service)
    const presignUrl = await this.r2.presignUpload(r2Key, dto.mime_type, dto.file_size_bytes);

    return {
      photo_uuid:      uuid,
      r2_key:          r2Key,
      presign_url:     presignUrl,
      expires_seconds: 900,
    };
  }

  // =========================================================================
  // Upload: confirm
  // =========================================================================

  async confirmUpload(
    userId: number,
    photoUuid: string,
    dto: ConfirmPhotoDto,
  ): Promise<ReturnType<typeof formatPhoto>> {
    // 1. Load the PROCESSING record (owner check via owner_user_id filter)
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('owner_user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!photo) {
      throw new NotFoundException(`Photo ${photoUuid} not found.`);
    }
    if (photo.status !== 'PROCESSING') {
      throw new ConflictException(
        `Photo ${photoUuid} is not in PROCESSING state (current: ${photo.status}).`,
      );
    }

    // 2. HEAD R2 to verify object exists
    const head = await this.r2.headObject(photo.r2_key as string);
    if (!head.exists) {
      throw new BadRequestException(
        'Object not found in R2 storage. ' +
        'Complete the PUT to the presigned URL before calling /confirm.',
      );
    }

    // 3. Validate SHA-256 format if provided
    if (dto.sha256_hash && !/^[a-f0-9]{64}$/i.test(dto.sha256_hash)) {
      throw new BadRequestException('sha256_hash must be a 64-character lowercase hex string.');
    }

    // 4. Check for exact duplicate (same owner + same hash)
    if (dto.sha256_hash) {
      const dup = await db
        .selectFrom('photos')
        .where('owner_user_id', '=', userId)
        .where('sha256_hash', '=', dto.sha256_hash)
        .where('status', '=', 'ACTIVE')
        .select('uuid')
        .executeTakeFirst();
      if (dup) {
        throw new ConflictException(
          `An identical photo already exists in your library (uuid: ${dup.uuid}).`,
        );
      }
    }

    // 5. Parse EXIF from payload
    const exif = dto.exif ?? {};
    // EXIF taken_at: client sends "YYYY-MM-DD HH:MM:SS" (EXIF format after
    // the frontend normalises the colon date-separators). Guard against any
    // invalid date strings that would make toMysqlDatetime produce "NaN-…".
    const takenAtDate = exif.taken_at ? new Date(exif.taken_at) : null;
    const takenAt = takenAtDate && !isNaN(takenAtDate.getTime())
      ? toMysqlDatetime(takenAtDate)
      : null;

    // 6. Activate photo
    const now: any = toMysqlDatetime(new Date());
    await db
      .updateTable('photos')
      .set({
        status:             'ACTIVE',
        confirmed_at:       now,
        title:              dto.title ?? null,
        caption:            dto.caption ?? null,
        description:        dto.description ?? null,
        exhibition_label:   dto.exhibition_label ?? null,
        visibility:         dto.visibility ?? 'MEMBERS_ONLY',
        sha256_hash:        dto.sha256_hash ?? null,
        // gps_stripped: Generated<boolean> -- update type expects boolean
        gps_stripped:       !!dto.gps_stripped,
        // Use R2 HEAD size as the authoritative value
        file_size_bytes:    head.sizeBytes ?? (photo.file_size_bytes as number | null),
        // EXIF fields
        width_px:           exif.width_px ?? null,
        height_px:          exif.height_px ?? null,
        exif_camera_make:   exif.camera_make ?? null,
        exif_camera_model:  exif.camera_model ?? null,
        exif_lens_model:    exif.lens_model ?? null,
        exif_focal_length:  exif.focal_length ?? null,
        exif_aperture:      exif.aperture ?? null,
        exif_shutter_speed: exif.shutter_speed ?? null,
        exif_iso:           exif.iso ?? null,
        exif_taken_at:      takenAt,
        exif_gps_lat:       exif.gps_lat ?? null,
        exif_gps_lng:       exif.gps_lng ?? null,
        updated_at:         now,
      })
      .where('uuid', '=', photoUuid)
      .execute();

    // 7. Return activated photo
    const updated = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .selectAll()
      .executeTakeFirstOrThrow();

    return formatPhoto(updated as Record<string, unknown>);
  }

  // =========================================================================
  // Read: all photo IDs (for static site generation)
  // =========================================================================

  async getAllPhotoIds(): Promise<{ id: number }[]> {
    const rows = await db
      .selectFrom('photos')
      .where('status', '=', 'ACTIVE')
      .where('visibility', '=', 'PUBLIC')
      .select('id')
      .execute();
    return rows.map(r => ({ id: Number(r.id) }));
  }

  // =========================================================================
  // Read: single photo by numeric ID
  // =========================================================================

  async getPhotoByNumericId(
    requestingUserId: number | null,
    numericId: number,
  ): Promise<ReturnType<typeof formatPhoto>> {
    const photo = await db
      .selectFrom('photos')
      .leftJoin('users', 'users.id', 'photos.owner_user_id')
      .where('photos.id', '=', numericId)
      .where('photos.status', '!=', 'DELETED')
      .selectAll('photos')
      .select([
        'users.full_name as photographer_name',
        'users.username as photographer_username',
      ] as any)
      .executeTakeFirst();

    if (!photo) throw new NotFoundException(`Photo ${numericId} not found.`);

    await this.assertVisibility(
      requestingUserId,
      photo.owner_user_id as number,
      photo.visibility as string,
    );

    return formatPhoto(photo as Record<string, unknown>);
  }

  // =========================================================================
  // Read: single photo
  // =========================================================================

  async getPhoto(
    requestingUserId: number | null,
    photoUuid: string,
  ): Promise<ReturnType<typeof formatPhoto>> {
    const photo = await db
      .selectFrom('photos')
      .leftJoin('users', 'users.id', 'photos.owner_user_id')
      .where('photos.uuid', '=', photoUuid)
      .where('photos.status', '!=', 'DELETED')
      .selectAll('photos')
      .select([
        'users.full_name as photographer_name',
        'users.username as photographer_username',
      ] as any)
      .executeTakeFirst();

    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);

    await this.assertVisibility(
      requestingUserId,
      photo.owner_user_id as number,
      photo.visibility as string,
    );

    return formatPhoto(photo as Record<string, unknown>);
  }

  // =========================================================================
  // Read: list photos
  // =========================================================================

  async listPhotos(
    requestingUserId: number | null,
    opts: {
      owner_user_id?: number;
      genre?: string;
      tag?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ photos: ReturnType<typeof formatPhoto>[]; total: number }> {
    const limit  = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    const isMember = requestingUserId != null
      ? await this.isActiveMember(requestingUserId)
      : false;

    let query = db
      .selectFrom('photos')
      .where('status', '=', 'ACTIVE')
      .selectAll();

    // Ownership + visibility
    if (opts.owner_user_id != null && requestingUserId === opts.owner_user_id) {
      // Owner sees all their own active photos
      query = query.where('owner_user_id', '=', opts.owner_user_id);
    } else if (opts.owner_user_id != null) {
      // Someone else's photos
      query = query.where('owner_user_id', '=', opts.owner_user_id);
      if (isMember) {
        query = query.where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const);
      } else {
        query = query.where('visibility', '=', 'PUBLIC');
      }
    } else {
      // General feed: exclude PRIVATE and UNLISTED
      if (isMember) {
        query = query.where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const);
      } else {
        query = query.where('visibility', '=', 'PUBLIC');
      }
    }

    if (opts.genre) {
      const genre = opts.genre;
      query = query.where('id', 'in', eb =>
        eb.selectFrom('photo_tag_assignments as pta')
          .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
          .where('pt.tag_key', '=', genre)
          .where('pt.category', '=', 'GENRE')
          .select('pta.photo_id'),
      );
    }

    // Category filter (item 71): match photos assigned the given tag_key.
    if (opts.tag) {
      const tag = opts.tag;
      query = query.where('id', 'in', eb =>
        eb.selectFrom('photo_tag_assignments as pta')
          .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
          .where('pt.tag_key', '=', tag)
          .select('pta.photo_id'),
      );
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Fast path: if we got fewer rows than the limit on the first page,
    // we know the total without a second query.
    const total = rows.length < limit && offset === 0
      ? rows.length
      : await query.execute().then(all => all.length);

    return {
      photos: rows.map(r => formatPhoto(r as Record<string, unknown>)),
      total,
    };
  }

  // =========================================================================
  // Update photo metadata
  // =========================================================================

  async updatePhoto(
    userId: number,
    photoUuid: string,
    dto: UpdatePhotoDto,
  ): Promise<ReturnType<typeof formatPhoto>> {
    const photo = await this.requirePhotoOwner(userId, photoUuid);
    if (photo.status !== 'ACTIVE') {
      throw new ConflictException(`Cannot update a photo in ${photo.status} state.`);
    }

    const updates: Record<string, unknown> = {
      updated_at: toMysqlDatetime(new Date()),
    };
    if (dto.title            !== undefined) updates.title            = dto.title;
    if (dto.caption          !== undefined) updates.caption          = dto.caption;
    if (dto.description      !== undefined) updates.description      = dto.description;
    if (dto.exhibition_label !== undefined) updates.exhibition_label = dto.exhibition_label;
    if (dto.visibility       !== undefined) updates.visibility       = dto.visibility;
    // gps_stripped is Generated<boolean>: update type is boolean.
    if (dto.gps_stripped     !== undefined) updates.gps_stripped     = !!dto.gps_stripped;

    await db
      .updateTable('photos')
      .set(updates)
      .where('uuid', '=', photoUuid)
      .execute();

    const updated = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .selectAll()
      .executeTakeFirstOrThrow();

    return formatPhoto(updated as Record<string, unknown>);
  }

  // =========================================================================
  // Soft delete
  // =========================================================================

  async deletePhoto(userId: number, photoUuid: string): Promise<void> {
    const photo = await this.requirePhotoOwner(userId, photoUuid);
    if (photo.status === 'DELETED') {
      throw new ConflictException('Photo is already deleted.');
    }
    const now: any = toMysqlDatetime(new Date());
    await db
      .updateTable('photos')
      .set({ status: 'DELETED', deleted_at: now, updated_at: now })
      .where('uuid', '=', photoUuid)
      .execute();
  }

  // =========================================================================
  // Tags
  // =========================================================================

  async getTags(category?: string): Promise<unknown[]> {
    let q = db
      .selectFrom('photo_tags')
      .where('is_active', '=', true)
      .selectAll();
    if (category) {
      q = q.where('category', '=', category as never);
    }
    return q.orderBy('category', 'asc').orderBy('display_name', 'asc').execute();
  }

  async assignTag(userId: number, photoUuid: string, tagId: number): Promise<void> {
    const photo = await this.requirePhotoOwner(userId, photoUuid);
    const tag = await db
      .selectFrom('photo_tags')
      .where('id', '=', tagId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found.`);

    await db
      .insertInto('photo_tag_assignments')
      .values({
        photo_id:    photo.id as number,
        tag_id:      tagId,
        assigned_by: userId,
        assigned_at: toMysqlDatetime(new Date()),
      })
      .ignore()
      .execute();
  }

  async removeTag(userId: number, photoUuid: string, tagId: number): Promise<void> {
    const photo = await this.requirePhotoOwner(userId, photoUuid);
    await db
      .deleteFrom('photo_tag_assignments')
      .where('photo_id', '=', photo.id as number)
      .where('tag_id', '=', tagId)
      .execute();
  }

  async getPhotoTags(requestingUserId: number | null, photoUuid: string): Promise<unknown[]> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select(['id', 'owner_user_id', 'visibility'])
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);
    await this.assertVisibility(
      requestingUserId,
      photo.owner_user_id as number,
      photo.visibility as string,
    );

    return db
      .selectFrom('photo_tag_assignments as pta')
      .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
      .where('pta.photo_id', '=', photo.id as number)
      .select(['pt.id', 'pt.tag_key', 'pt.display_name', 'pt.category'])
      .execute();
  }

  // =========================================================================
  // Albums
  // =========================================================================

  async createAlbum(
    userId: number,
    dto: CreateAlbumDto,
  ): Promise<ReturnType<typeof formatAlbum>> {
    await this.requireActiveMembership(userId);
    const uuid = randomUUID();
    const now: any = toMysqlDatetime(new Date());
    await db
      .insertInto('photo_albums')
      .values({
        uuid,
        owner_user_id: userId,
        title:         dto.title,
        eyebrow:       dto.eyebrow ?? null,
        subtitle:      dto.subtitle ?? null,
        description:   dto.description ?? null,
        visibility:    dto.visibility ?? 'MEMBERS_ONLY',
        album_type:    'MEMBER_CREATED',
        kind:          dto.kind ?? 'COLLECTION',
        sort_order:    0,
        created_at:    now,
        updated_at:    now,
      })
      .execute();

    const album = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', uuid)
      .selectAll()
      .executeTakeFirstOrThrow();

    // Write genre tag assignments to junction table.
    if (dto.genres && dto.genres.length > 0) {
      const genreTags = await db
        .selectFrom('photo_tags')
        .where('tag_key', 'in', dto.genres)
        .where('category', '=', 'GENRE')
        .where('is_active', '=', true)
        .select('id')
        .execute();
      if (genreTags.length > 0) {
        await db
          .insertInto('photo_album_genres')
          .values(genreTags.map(t => ({ album_id: album.id as number, tag_id: t.id })))
          .ignore()
          .execute();
      }
    }

    return formatAlbum({
      ...(album as Record<string, unknown>),
      genres:           dto.genres ?? [],
      photo_count:      0,
      cover_photo_uuid: null,
    });
  }

  async listAlbums(
    requestingUserId: number | null,
    ownerUserId: number,
  ): Promise<ReturnType<typeof formatAlbum>[]> {
    const isMember = requestingUserId != null
      ? await this.isActiveMember(requestingUserId)
      : false;

    let q = db
      .selectFrom('photo_albums')
      .where('owner_user_id', '=', ownerUserId);

    if (requestingUserId !== ownerUserId) {
      if (isMember) {
        q = q.where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const);
      } else {
        q = q.where('visibility', '=', 'PUBLIC');
      }
    }

    const albums = await q
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .selectAll()
      .execute();

    return Promise.all(
      albums.map(async album => {
        const count = await db
          .selectFrom('photo_album_items')
          .where('album_id', '=', album.id as number)
          .select(eb => eb.fn.count<number>('id').as('cnt'))
          .executeTakeFirst();
        let coverUuid: string | null = null;
        let coverImageUrl: string | null = null;
        // Fall back to the most recent photo in the album when no explicit
        // cover is set, so Stories/Collections always show a thumbnail.
        const coverPhoto = await db
          .selectFrom('photos')
          .$if(!!album.cover_photo_id, qb => qb.where('id', '=', album.cover_photo_id as number))
          .$if(!album.cover_photo_id, qb => qb
            .innerJoin('photo_album_items', 'photo_album_items.photo_id', 'photos.id')
            .where('photo_album_items.album_id', '=', album.id as number)
            .where('photos.status', '=', 'ACTIVE')
            .orderBy('photo_album_items.sort_order', 'asc')
          )
          .select(['photos.uuid', 'photos.r2_key'])
          .executeTakeFirst();
        if (coverPhoto) {
          coverUuid = coverPhoto.uuid;
          coverImageUrl = photoVariants(coverPhoto.r2_key).medium ?? null;
        }
        const genreRows = await db
          .selectFrom('photo_album_genres as pag')
          .innerJoin('photo_tags as pt', 'pt.id', 'pag.tag_id')
          .where('pag.album_id', '=', album.id as number)
          .select('pt.tag_key')
          .execute();
        return formatAlbum({
          ...(album as Record<string, unknown>),
          genres:           genreRows.map(r => r.tag_key),
          photo_count:      Number(count?.cnt ?? 0),
          cover_photo_uuid: coverUuid,
          cover_image_url:  coverImageUrl,
        });
      }),
    );
  }

  async getAlbum(
    requestingUserId: number | null,
    albumUuid: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{
    album: ReturnType<typeof formatAlbum>;
    photos: ReturnType<typeof formatPhoto>[];
  }> {
    const album = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', albumUuid)
      .selectAll()
      .executeTakeFirst();
    if (!album) throw new NotFoundException(`Album ${albumUuid} not found.`);

    // Visibility check
    const isMember = requestingUserId != null
      ? await this.isActiveMember(requestingUserId)
      : false;
    if (requestingUserId !== album.owner_user_id) {
      if (album.visibility === 'PRIVATE') {
        throw new ForbiddenException('This album is private.');
      }
      if (album.visibility === 'MEMBERS_ONLY' && !isMember) {
        throw new ForbiddenException('Members-only album. An active membership is required.');
      }
    }

    const limit  = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;

    const items = await db
      .selectFrom('photo_album_items as pai')
      .innerJoin('photos as p', 'p.id', 'pai.photo_id')
      .where('pai.album_id', '=', album.id as number)
      .where('p.status', '=', 'ACTIVE')
      .orderBy('pai.sort_order', 'asc')
      .orderBy('pai.added_at', 'asc')
      .limit(limit)
      .offset(offset)
      .selectAll('p')
      .execute();

    const totalCount = await db
      .selectFrom('photo_album_items')
      .where('album_id', '=', album.id as number)
      .select(eb => eb.fn.count<number>('id').as('cnt'))
      .executeTakeFirst();

    let coverUuid: string | null = null;
    if (album.cover_photo_id) {
      const cover = await db
        .selectFrom('photos')
        .where('id', '=', album.cover_photo_id as number)
        .select('uuid')
        .executeTakeFirst();
      coverUuid = cover?.uuid ?? null;
    }

    const albumGenres = await db
      .selectFrom('photo_album_genres as pag')
      .innerJoin('photo_tags as pt', 'pt.id', 'pag.tag_id')
      .where('pag.album_id', '=', album.id as number)
      .select('pt.tag_key')
      .execute();

    return {
      album: formatAlbum({
        ...(album as Record<string, unknown>),
        genres:           albumGenres.map(r => r.tag_key),
        photo_count:      Number(totalCount?.cnt ?? 0),
        cover_photo_uuid: coverUuid,
      }),
      photos: items.map(r => formatPhoto(r as Record<string, unknown>)),
    };
  }

  async updateAlbum(
    userId: number,
    albumUuid: string,
    dto: UpdateAlbumDto,
  ): Promise<ReturnType<typeof formatAlbum>> {
    const album = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', albumUuid)
      .where('owner_user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
    if (!album) throw new NotFoundException(`Album ${albumUuid} not found.`);

    const updates: Record<string, unknown> = {
      updated_at: toMysqlDatetime(new Date()),
    };
    if (dto.title        !== undefined) updates.title       = dto.title;
    if (dto.eyebrow      !== undefined) updates.eyebrow     = dto.eyebrow;
    if (dto.subtitle     !== undefined) updates.subtitle    = dto.subtitle;
    if (dto.description  !== undefined) updates.description = dto.description;
    if (dto.visibility   !== undefined) updates.visibility  = dto.visibility;
    if (dto.kind         !== undefined) updates.kind        = dto.kind;

    // Resolve cover photo UUID -> numeric id
    if (dto.cover_photo_uuid !== undefined) {
      if (!dto.cover_photo_uuid) {
        updates.cover_photo_id = null;
      } else {
        const cover = await db
          .selectFrom('photos as p')
          .innerJoin('photo_album_items as pai', 'pai.photo_id', 'p.id')
          .where('p.uuid', '=', dto.cover_photo_uuid)
          .where('pai.album_id', '=', album.id as number)
          .where('p.status', '=', 'ACTIVE')
          .select('p.id')
          .executeTakeFirst();
        if (!cover) {
          throw new BadRequestException(
            'cover_photo_uuid must reference a photo already in this album.',
          );
        }
        updates.cover_photo_id = cover.id;
      }
    }

    await db
      .updateTable('photo_albums')
      .set(updates)
      .where('uuid', '=', albumUuid)
      .execute();

    const updated = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', albumUuid)
      .selectAll()
      .executeTakeFirstOrThrow();

    // Update genre junction table (full replacement when dto.genres is present).
    if (dto.genres !== undefined) {
      await db
        .deleteFrom('photo_album_genres')
        .where('album_id', '=', album.id as number)
        .execute();
      if (dto.genres.length > 0) {
        const genreTags = await db
          .selectFrom('photo_tags')
          .where('tag_key', 'in', dto.genres)
          .where('category', '=', 'GENRE')
          .where('is_active', '=', true)
          .select('id')
          .execute();
        if (genreTags.length > 0) {
          await db
            .insertInto('photo_album_genres')
            .values(genreTags.map(t => ({ album_id: album.id as number, tag_id: t.id })))
            .ignore()
            .execute();
        }
      }
    }

    const count = await db
      .selectFrom('photo_album_items')
      .where('album_id', '=', album.id as number)
      .select(eb => eb.fn.count<number>('id').as('cnt'))
      .executeTakeFirst();

    const updatedGenres = await db
      .selectFrom('photo_album_genres as pag')
      .innerJoin('photo_tags as pt', 'pt.id', 'pag.tag_id')
      .where('pag.album_id', '=', album.id as number)
      .select('pt.tag_key')
      .execute();

    return formatAlbum({
      ...(updated as Record<string, unknown>),
      genres:           updatedGenres.map(r => r.tag_key),
      photo_count:      Number(count?.cnt ?? 0),
      cover_photo_uuid: dto.cover_photo_uuid ?? null,
    });
  }

  async deleteAlbum(userId: number, albumUuid: string): Promise<void> {
    const album = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', albumUuid)
      .where('owner_user_id', '=', userId)
      .select('id')
      .executeTakeFirst();
    if (!album) throw new NotFoundException(`Album ${albumUuid} not found.`);
    // photo_album_items cascade-deleted by FK ON DELETE CASCADE
    await db
      .deleteFrom('photo_albums')
      .where('id', '=', album.id as number)
      .execute();
  }

  async addPhotoToAlbum(
    userId: number,
    albumUuid: string,
    dto: AddPhotoToAlbumDto,
  ): Promise<void> {
    const album = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', albumUuid)
      .where('owner_user_id', '=', userId)
      .select('id')
      .executeTakeFirst();
    if (!album) throw new NotFoundException(`Album ${albumUuid} not found.`);

    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', dto.photo_uuid)
      .where('owner_user_id', '=', userId)
      .where('status', '=', 'ACTIVE')
      .select('id')
      .executeTakeFirst();
    if (!photo) {
      throw new NotFoundException(`Photo ${dto.photo_uuid} not found in your library.`);
    }

    const maxOrder = await db
      .selectFrom('photo_album_items')
      .where('album_id', '=', album.id as number)
      .select(eb => eb.fn.max<number>('sort_order').as('mx'))
      .executeTakeFirst();

    const nextOrder = Number(maxOrder?.mx ?? -1) + 1;

    await db
      .insertInto('photo_album_items')
      .values({
        album_id:   album.id as number,
        photo_id:   photo.id as number,
        sort_order: nextOrder,
      })
      .ignore()
      .execute();
  }

  async removePhotoFromAlbum(
    userId: number,
    albumUuid: string,
    photoUuid: string,
  ): Promise<void> {
    const album = await db
      .selectFrom('photo_albums')
      .where('uuid', '=', albumUuid)
      .where('owner_user_id', '=', userId)
      .select('id')
      .executeTakeFirst();
    if (!album) throw new NotFoundException(`Album ${albumUuid} not found.`);

    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .select('id')
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);

    await db
      .deleteFrom('photo_album_items')
      .where('album_id', '=', album.id as number)
      .where('photo_id', '=', photo.id as number)
      .execute();
  }

  // =========================================================================
  // Public feeds
  // =========================================================================

  async getPublicFeed(opts: {
    genre?: string;
    tag?: string;
    limit?: number;
    offset?: number;
    shuffle?: boolean;
    onePerPhotographer?: boolean;
  }): Promise<{ photos: ReturnType<typeof formatPhoto>[]; total: number }> {
    // Dedicated JOIN query so every feed item carries photographer credit.
    // Keeps listPhotos() untouched — other callers are unaffected.
    //
    // The limit ceiling (200) applies only to the paginated all-photos path,
    // where it becomes a SQL LIMIT. For the one-per-photographer path all
    // rows are already loaded into memory so no ceiling is enforced — the
    // caller can request all contributors by passing a high limit.
    const paginatedLimit = Math.min(opts.limit ?? 20, 200);
    const offset = opts.offset ?? 0;

    let q = db
      .selectFrom('photos')
      .leftJoin('users', 'users.id', 'photos.owner_user_id')
      .selectAll('photos')
      .select([
        'users.full_name as photographer_name',
        'users.username as photographer_username',
      ] as any)
      .where('photos.status', '=', 'ACTIVE')
      .where('photos.visibility', '=', 'PUBLIC');

    if (opts.genre) {
      const genre = opts.genre;
      q = q.where('photos.id', 'in', eb =>
        eb.selectFrom('photo_tag_assignments as pta')
          .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
          .where('pt.tag_key', '=', genre)
          .where('pt.category', '=', 'GENRE')
          .select('pta.photo_id'),
      );
    }

    // Category filter (item 71): only photos assigned the given tag_key.
    if (opts.tag) {
      const tag = opts.tag;
      q = q.where('photos.id', 'in', eb =>
        eb.selectFrom('photo_tag_assignments as pta')
          .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
          .where('pt.tag_key', '=', tag)
          .select('pta.photo_id'),
      );
    }

    // Full-archive mode: paginate all matching photos without per-photographer dedup
    if (opts.onePerPhotographer === false) {
      const pagedRows = await q
        .orderBy('photos.created_at', 'desc')
        .orderBy('photos.id', 'desc')
        .limit(paginatedLimit)
        .offset(offset)
        .execute();

      // Count total without pagination (separate query to avoid subquery complexity)
      let countQ = db
        .selectFrom('photos')
        .where('photos.status', '=', 'ACTIVE')
        .where('photos.visibility', '=', 'PUBLIC');
      if (opts.genre) {
        const genre = opts.genre;
        countQ = countQ.where('photos.id', 'in', eb =>
          eb.selectFrom('photo_tag_assignments as pta')
            .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
            .where('pt.tag_key', '=', genre)
            .where('pt.category', '=', 'GENRE')
            .select('pta.photo_id'),
        );
      }
      if (opts.tag) {
        const tag = opts.tag;
        countQ = countQ.where('photos.id', 'in', eb =>
          eb.selectFrom('photo_tag_assignments as pta')
            .innerJoin('photo_tags as pt', 'pt.id', 'pta.tag_id')
            .where('pt.tag_key', '=', tag)
            .select('pta.photo_id'),
        );
      }
      const countRow = await countQ
        .select(eb => eb.fn.count<number>('photos.id').as('cnt'))
        .executeTakeFirst();

      return {
        photos: pagedRows.map(r => formatPhoto(r as Record<string, unknown>)),
        total:  Number(countRow?.cnt ?? 0),
      };
    }

    // Retrieve approved public photographs
    const allRows = await q.execute();

    // Group photographs by photographer (owner_user_id)
    const groups = new Map<number, typeof allRows>();
    for (const row of allRows) {
      const userId = Number(row.owner_user_id);
      if (!groups.has(userId)) {
        groups.set(userId, []);
      }
      groups.get(userId)!.push(row);
    }

    const userIds = Array.from(groups.keys());

    // Shuffle helper (Fisher-Yates)
    const shuffle = <T>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
      return arr;
    };

    if (opts.shuffle === false) {
      // Deterministic sort: sort photographers by the ID of their most recent photo in descending order
      const maxPhotoIdMap = new Map<number, number>();
      for (const [userId, photos] of groups.entries()) {
        const maxId = Math.max(...photos.map(p => Number(p.id)));
        maxPhotoIdMap.set(userId, maxId);
      }
      userIds.sort((a, b) => maxPhotoIdMap.get(b)! - maxPhotoIdMap.get(a)!);
    } else {
      // Randomly shuffle photographers
      shuffle(userIds);
    }

    // -----------------------------------------------------------------------------
    // onePerPhotographer mode intentionally returns EVERY contributor.
    //
    // The SQL query has already materialized all matching rows, so applying an
    // additional in-memory limit provides no database protection and would
    // incorrectly omit contributors from Project Highlights.
    //
    // Pagination and response ceilings apply ONLY to the standard gallery
    // (onePerPhotographer=false) path.
    // -----------------------------------------------------------------------------
    const selectedUserIds = userIds;

    // For each selected photographer, select ONE representative photograph
    const selectedRows: typeof allRows = [];
    for (const userId of selectedUserIds) {
      const userPhotos = groups.get(userId)!;
      if (opts.shuffle === false) {
        // Pick the latest photo (highest ID) deterministically
        userPhotos.sort((a, b) => Number(b.id) - Number(a.id));
        selectedRows.push(userPhotos[0]);
      } else {
        // Randomly select ONE photograph
        const randomPhoto = userPhotos[Math.floor(Math.random() * userPhotos.length)];
        selectedRows.push(randomPhoto);
      }
    }

    if (opts.shuffle !== false) {
      // Return those photographs in random photographer order
      shuffle(selectedRows);
    }

    const pagedSelectedRows = selectedRows.slice(offset, offset + paginatedLimit);

    return {
      photos: pagedSelectedRows.map(r => formatPhoto(r as Record<string, unknown>)),
      total:  userIds.length,
    };
  }

  async getPhotographerGallery(
    requestingUserId: number | null,
    photographerUserId: number,
    opts: { genre?: string; tag?: string; limit?: number; offset?: number } = {},
  ): Promise<{ photos: ReturnType<typeof formatPhoto>[]; total: number }> {
    return this.listPhotos(requestingUserId, {
      owner_user_id: photographerUserId,
      genre:         opts.genre,
      tag:           opts.tag,
      limit:         opts.limit,
      offset:        opts.offset,
    });
  }

  // =========================================================================
  // Spotlight — admin-curated homepage hero (item 58)
  // =========================================================================

  async getSpotlight(): Promise<(ReturnType<typeof formatPhoto> & {
    title_override: string | null;
    credit_override: string | null;
  }) | null> {
    const row = await db
      .selectFrom('gallery_spotlight as gs')
      .innerJoin('photos as p', 'p.uuid', 'gs.photo_uuid')
      .leftJoin('users as u', 'u.id', 'p.owner_user_id')
      .where('p.status', '=', 'ACTIVE')
      .where('p.visibility', '=', 'PUBLIC')
      .selectAll('p')
      .select([
        'gs.title_override',
        'gs.credit_override',
        'u.full_name as photographer_name',
        'u.username as photographer_username',
      ] as any)
      .executeTakeFirst();

    if (!row) return null;

    const photo = formatPhoto(row as Record<string, unknown>);
    return {
      ...photo,
      title_override:  (row as any).title_override  ?? null,
      credit_override: (row as any).credit_override ?? null,
    };
  }

  async setSpotlight(
    adminUserId: number,
    photoUuid: string,
    titleOverride?: string | null,
    creditOverride?: string | null,
  ): Promise<void> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '=', 'ACTIVE')
      .where('visibility', '=', 'PUBLIC')
      .select('uuid')
      .executeTakeFirst();

    if (!photo) {
      throw new NotFoundException(`Photo ${photoUuid} not found or is not a public active photo.`);
    }

    const now: any = toMysqlDatetime(new Date());
    await sql`
      INSERT INTO gallery_spotlight (id, photo_uuid, title_override, credit_override, set_by_user_id, set_at)
      VALUES (1, ${photoUuid}, ${titleOverride ?? null}, ${creditOverride ?? null}, ${adminUserId}, ${now})
      ON DUPLICATE KEY UPDATE
        photo_uuid      = VALUES(photo_uuid),
        title_override  = VALUES(title_override),
        credit_override = VALUES(credit_override),
        set_by_user_id  = VALUES(set_by_user_id),
        set_at          = VALUES(set_at)
    `.execute(db);
  }

  // =========================================================================
  // Distinct genres actually present (item 76) — for filter chips
  // =========================================================================

  /** GENRE tags assigned to at least one PUBLIC active photo (Showcase chips). */
  async getPublicGenres(): Promise<{ tag_key: string; display_name: string }[]> {
    return db
      .selectFrom('photo_tags as pt')
      .innerJoin('photo_tag_assignments as pta', 'pta.tag_id', 'pt.id')
      .innerJoin('photos as p', 'p.id', 'pta.photo_id')
      .where('pt.category', '=', 'GENRE')
      .where('pt.is_active', '=', true)
      .where('p.status', '=', 'ACTIVE')
      .where('p.visibility', '=', 'PUBLIC')
      .select(['pt.tag_key', 'pt.display_name'])
      .distinct()
      .orderBy('pt.display_name', 'asc')
      .execute();
  }

  /** GENRE tags present on a photographer's visible photos (profile chips). */
  async getPhotographerGenres(
    requestingUserId: number | null,
    photographerUserId: number,
  ): Promise<{ tag_key: string; display_name: string }[]> {
    const isMember = requestingUserId != null
      ? await this.isActiveMember(requestingUserId)
      : false;

    let q = db
      .selectFrom('photo_tags as pt')
      .innerJoin('photo_tag_assignments as pta', 'pta.tag_id', 'pt.id')
      .innerJoin('photos as p', 'p.id', 'pta.photo_id')
      .where('pt.category', '=', 'GENRE')
      .where('pt.is_active', '=', true)
      .where('p.status', '=', 'ACTIVE')
      .where('p.owner_user_id', '=', photographerUserId);

    // Visibility gating mirrors listPhotos: owner sees all; others see PUBLIC
    // (+ MEMBERS_ONLY when an active member).
    if (requestingUserId !== photographerUserId) {
      q = isMember
        ? q.where('p.visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'] as const)
        : q.where('p.visibility', '=', 'PUBLIC');
    }

    return q
      .select(['pt.tag_key', 'pt.display_name'])
      .distinct()
      .orderBy('pt.display_name', 'asc')
      .execute();
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async requireActiveMembership(userId: number): Promise<void> {
    if (!(await this.isActiveMember(userId))) {
      throw new ForbiddenException(
        'Photo uploads require an active BCC membership. ' +
        'Please apply for membership at /join.',
      );
    }
  }

  private async isActiveMember(userId: number): Promise<boolean> {
    const row = await db
      .selectFrom('memberships')
      .where('user_id', '=', userId)
      .where('lifecycle_state', '=', 'ACTIVE')
      .select('id')
      .executeTakeFirst();
    return row != null;
  }

  private async assertVisibility(
    requestingUserId: number | null,
    ownerUserId: number,
    visibility: string,
  ): Promise<void> {
    // Owner always has access
    if (requestingUserId === ownerUserId) return;

    if (visibility === 'PRIVATE') {
      throw new ForbiddenException('This photo is private.');
    }
    if (visibility === 'MEMBERS_ONLY') {
      if (requestingUserId == null) {
        throw new ForbiddenException('Members-only photo. Please sign in as a member.');
      }
      if (!(await this.isActiveMember(requestingUserId))) {
        throw new ForbiddenException('Members-only photo. An active membership is required.');
      }
    }
    // PUBLIC: open to all.
    // UNLISTED: accessible via direct UUID link, not in listings.
    //   Both PUBLIC and UNLISTED pass this check when accessed directly.
  }

  private async requirePhotoOwner(userId: number, photoUuid: string) {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('owner_user_id', '=', userId)
      .where('status', '!=', 'DELETED')
      .selectAll()
      .executeTakeFirst();
    if (!photo) {
      throw new NotFoundException(`Photo ${photoUuid} not found in your library.`);
    }
    return photo;
  }

  // =========================================================================
  // Reactions — PHOTO-ARCH-001 Principle 9 (owned by Canonical Photo)
  // =========================================================================

  async getReactions(
    photoUuid: string,
    requestingUserId: number | null,
  ): Promise<{
    likes: number;
    favourites: number;
    bookmarks: number;
    userReactions: { liked: boolean; favourited: boolean; bookmarked: boolean };
  }> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select(['id', 'visibility', 'owner_user_id'])
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);

    await this.assertVisibility(requestingUserId, photo.owner_user_id as number, photo.visibility as string);

    const rows = await db
      .selectFrom('photo_reactions')
      .where('photo_id', '=', photo.id as number)
      .select(['reaction_type', 'user_id'])
      .execute();

    const counts = { likes: 0, favourites: 0, bookmarks: 0 };
    const userReactions = { liked: false, favourited: false, bookmarked: false };

    for (const r of rows) {
      if (r.reaction_type === 'LIKE')      { counts.likes++;      if (r.user_id === requestingUserId) userReactions.liked      = true; }
      if (r.reaction_type === 'FAVOURITE') { counts.favourites++; if (r.user_id === requestingUserId) userReactions.favourited = true; }
      if (r.reaction_type === 'BOOKMARK')  { counts.bookmarks++;  if (r.user_id === requestingUserId) userReactions.bookmarked = true; }
    }

    return { ...counts, userReactions };
  }

  async toggleReaction(
    userId: number,
    photoUuid: string,
    reactionType: 'LIKE' | 'FAVOURITE' | 'BOOKMARK',
  ): Promise<{ active: boolean; count: number }> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select(['id', 'visibility', 'owner_user_id'])
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);
    await this.assertVisibility(userId, photo.owner_user_id as number, photo.visibility as string);

    const photoId = photo.id as number;

    const existing = await db
      .selectFrom('photo_reactions')
      .where('photo_id', '=', photoId)
      .where('user_id', '=', userId)
      .where('reaction_type', '=', reactionType)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      await db.deleteFrom('photo_reactions').where('id', '=', existing.id as number).execute();
    } else {
      await db.insertInto('photo_reactions').values({ photo_id: photoId, user_id: userId, reaction_type: reactionType }).execute();
    }

    const count = await db
      .selectFrom('photo_reactions')
      .where('photo_id', '=', photoId)
      .where('reaction_type', '=', reactionType)
      .select(db.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();

    return { active: !existing, count: Number(count.n) };
  }

  // =========================================================================
  // Comments — PHOTO-ARCH-001 Principle 9 (owned by Canonical Photo)
  // =========================================================================

  async listComments(
    photoUuid: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ comments: unknown[]; total: number }> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select('id')
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);

    const limit  = Math.min(opts.limit  ?? 20, 50);
    const offset = opts.offset ?? 0;

    const [rows, totalRow] = await Promise.all([
      db
        .selectFrom('photo_comments')
        .leftJoin('users', 'users.id', 'photo_comments.user_id')
        .where('photo_comments.photo_id', '=', photo.id as number)
        .where('photo_comments.is_deleted', '=', false as any)
        .select([
          'photo_comments.id',
          'photo_comments.body',
          'photo_comments.created_at',
          'users.full_name as author_name',
          'users.username as author_username',
        ] as any)
        .orderBy('photo_comments.created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .selectFrom('photo_comments')
        .where('photo_id', '=', photo.id as number)
        .where('is_deleted', '=', false as any)
        .select(db.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    ]);

    const comments = rows.map((r: any) => ({
      id:             r.id,
      body:           r.body,
      created_at:     isoOrNull(r.created_at),
      author_name:    r.author_name ?? 'BCC Member',
      author_username: r.author_username ?? null,
    }));

    return { comments, total: Number(totalRow.n) };
  }

  async addComment(
    userId: number,
    photoUuid: string,
    body: string,
  ): Promise<{ id: number }> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select(['id', 'visibility', 'owner_user_id'])
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);
    await this.assertVisibility(userId, photo.owner_user_id as number, photo.visibility as string);

    if (!body || body.trim().length === 0) {
      throw new BadRequestException('Comment body cannot be empty.');
    }
    if (body.trim().length > 2000) {
      throw new BadRequestException('Comment exceeds 2000 characters.');
    }

    const result = await db
      .insertInto('photo_comments')
      .values({ photo_id: photo.id as number, user_id: userId, body: body.trim() })
      .executeTakeFirstOrThrow();

    return { id: Number(result.insertId) };
  }

  // =========================================================================
  // Related photos — references only (PHOTO-ARCH-001 Related Content Contract)
  // =========================================================================

  async getRelatedByPhotographer(
    photoUuid: string,
    limit = 6,
  ): Promise<ReturnType<typeof formatPhoto>[]> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select(['owner_user_id', 'id'])
      .executeTakeFirst();
    if (!photo) return [];

    const rows = await db
      .selectFrom('photos')
      .leftJoin('users', 'users.id', 'photos.owner_user_id')
      .where('photos.owner_user_id', '=', photo.owner_user_id as number)
      .where('photos.status', '=', 'ACTIVE')
      .where('photos.visibility', '=', 'PUBLIC')
      .where('photos.id', '!=', photo.id as number)
      .selectAll('photos')
      .select(['users.full_name as photographer_name', 'users.username as photographer_username'] as any)
      .orderBy('photos.created_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map(r => formatPhoto(r as Record<string, unknown>));
  }

  // =========================================================================
  // View tracking — increments view_count on each canonical page load
  // =========================================================================

  async recordView(photoUuid: string): Promise<{ view_count: number }> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select('id')
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoUuid} not found.`);

    // Atomic increment — avoids read-modify-write race
    await sql`UPDATE photos SET view_count = view_count + 1 WHERE id = ${photo.id}`.execute(db);

    const updated = await db
      .selectFrom('photos')
      .where('id', '=', photo.id as number)
      .select('view_count')
      .executeTakeFirstOrThrow();

    return { view_count: Number(updated.view_count) };
  }

  async getPhotoContainers(
    photoUuid: string,
  ): Promise<{ type: string; title: string; uuid: string; url: string }[]> {
    const photo = await db
      .selectFrom('photos')
      .where('uuid', '=', photoUuid)
      .where('status', '!=', 'DELETED')
      .select('id')
      .executeTakeFirst();
    if (!photo) return [];

    const rows = await db
      .selectFrom('photo_album_items')
      .innerJoin('photo_albums', 'photo_albums.id', 'photo_album_items.album_id')
      .where('photo_album_items.photo_id', '=', photo.id as number)
      .where('photo_albums.visibility', '!=', 'PRIVATE')
      .select([
        'photo_albums.uuid',
        'photo_albums.title',
        'photo_albums.album_type',
      ] as any)
      .execute();

    return (rows as any[]).map(r => {
      const type = r.album_type === 'AUTO_EVENT' ? 'ACTIVITY'
                 : r.album_type === 'AUTO_CONTEST' ? 'CONTEST'
                 : 'COLLECTION';
      return {
        type,
        title: r.title,
        uuid:  r.uuid,
        url:   `/gallery/albums/${r.uuid}`,
      };
    });
  }
}
