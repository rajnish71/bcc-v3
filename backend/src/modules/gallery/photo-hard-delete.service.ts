// backend/src/modules/gallery/photo-hard-delete.service.ts
//
// Administrative Hard Delete of a Canonical Photo (PHOTO-ARCH-002
// Principle 13; PHOTO-ARCH-001 Container rules). Gated at the route by the
// RBAC permission 'gallery.photo.hard_delete', which migration 0109 grants
// to the Super Admin role only.
//
// WHAT IS REMOVED (owned by the Canonical Photo):
//   photos                  the Canonical Photo row + Canonical Storage Identifier
//   photo_tag_assignments   photo metadata (also FK CASCADE)
//   photo_comments          interactions belong to the Canonical Photo
//   photo_reactions         interactions belong to the Canonical Photo
//   Master Asset            the R2 object at photos.r2_key
//
// WHAT HAS ONLY ITS REFERENCE REMOVED (Containers / editorial references --
// the referencing entity itself survives):
//   photo_album_items       album membership row removed, album kept
//   photo_albums            cover_photo_id cleared, album kept
//   hero_assignments        editorial slot reference removed (also FK CASCADE)
//   gallery_spotlight       spotlight reference removed (also FK CASCADE)
//
// NEVER TOUCHED: the owner's users/membership rows, events (source_event_id
// lives on the photo itself), journal posts, avatars, cover photos.
//
// CROSS-SYSTEM ORDERING (MySQL + R2 cannot share one transaction):
//   1. All DB removals + the audit row commit atomically in one transaction.
//   2. Only after commit is the Master Asset deleted from R2.
//   DB-first means a failure can never leave the database claiming a Master
//   Asset that no longer exists. If step 2 fails, the object is unreferenced;
//   the failure is audited with its r2_key so it can be purged later
//   (scripts/cleanup_processing_photos_r2.js accepts a plain key list), and
//   the response reports master_asset_deleted: false.
//
// SHARED-OBJECT GUARD: if any other record points at the same R2 key the
// delete is refused (409) -- removing the object would break that record.
//
// DELIVERY LAYER: ImageKit has no server-side API integration in this
// stack (imagekit.util.ts builds URLs only), so CDN-cached derivatives are
// not actively purged; with the origin object gone they cannot be
// regenerated and expire with the CDN cache.
//
// AUDIT: identity_audit_log via logIdentityAudit() -- the existing
// actor/target audit used for privileged admin actions. target_user_id is
// the photo owner. No gallery-specific audit table exists.

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db } from '../../database/db';
import { R2Service } from '../shared/storage/r2.service';
import { logIdentityAudit } from '../identity/shared/identity-audit.util';

export interface PhotoHardDeleteResult {
  deleted: true;
  photo_id: number;
  master_asset_deleted: boolean;
}

function affected(result: unknown, key: 'numDeletedRows' | 'numUpdatedRows'): number {
  const n = (result as Record<string, unknown> | undefined)?.[key];
  return n == null ? 0 : Number(n);
}

@Injectable()
export class PhotoHardDeleteService {
  private readonly logger = new Logger(PhotoHardDeleteService.name);

  constructor(private readonly r2: R2Service) {}

  async hardDelete(actorUserId: number, photoId: number): Promise<PhotoHardDeleteResult> {
    const photo = await db
      .selectFrom('photos')
      .select(['id', 'uuid', 'owner_user_id', 'r2_key', 'title', 'status', 'visibility'])
      .where('id', '=', photoId)
      .executeTakeFirst();
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found.`);

    const r2Key = photo.r2_key as string;
    await this.assertMasterAssetNotShared(photoId, r2Key);

    const removed = await db.transaction().execute(async (trx) => {
      // Lock the row; a concurrent hard delete finds it gone and 404s.
      const locked = await trx
        .selectFrom('photos')
        .select('id')
        .where('id', '=', photoId)
        .forUpdate()
        .executeTakeFirst();
      if (!locked) throw new NotFoundException(`Photo ${photoId} not found.`);

      const albumCovers = await trx
        .updateTable('photo_albums')
        .set({ cover_photo_id: null } as any)
        .where('cover_photo_id', '=', photoId)
        .executeTakeFirst();
      const albumItems = await trx
        .deleteFrom('photo_album_items')
        .where('photo_id', '=', photoId)
        .executeTakeFirst();
      const tags = await trx
        .deleteFrom('photo_tag_assignments')
        .where('photo_id', '=', photoId)
        .executeTakeFirst();
      const comments = await trx
        .deleteFrom('photo_comments')
        .where('photo_id', '=', photoId as any)
        .executeTakeFirst();
      const reactions = await trx
        .deleteFrom('photo_reactions')
        .where('photo_id', '=', photoId as any)
        .executeTakeFirst();
      const heroes = await trx
        .deleteFrom('hero_assignments')
        .where('photo_uuid', '=', photo.uuid as string)
        .executeTakeFirst();
      const spotlight = await trx
        .deleteFrom('gallery_spotlight')
        .where('photo_uuid', '=', photo.uuid as string)
        .executeTakeFirst();

      await trx.deleteFrom('photos').where('id', '=', photoId).executeTakeFirst();

      const counts = {
        album_covers_cleared:  affected(albumCovers, 'numUpdatedRows'),
        album_items_removed:   affected(albumItems, 'numDeletedRows'),
        tag_assignments:       affected(tags, 'numDeletedRows'),
        comments:              affected(comments, 'numDeletedRows'),
        reactions:             affected(reactions, 'numDeletedRows'),
        hero_assignments:      affected(heroes, 'numDeletedRows'),
        spotlight:             affected(spotlight, 'numDeletedRows'),
      };

      await logIdentityAudit(
        {
          actorId: actorUserId,
          targetUserId: Number(photo.owner_user_id),
          actionType: 'GALLERY_PHOTO_HARD_DELETED',
          oldValue: {
            photo_id: photoId,
            uuid: photo.uuid,
            r2_key: r2Key,
            title: photo.title ?? null,
            status: photo.status,
            visibility: photo.visibility,
          },
          newValue: { removed: counts },
          reason: 'Super Admin hard delete (PHOTO-ARCH-002 Principle 13)',
        },
        trx,
      );
      return counts;
    });

    let masterAssetDeleted = false;
    try {
      await this.r2.deleteObject(r2Key);
      masterAssetDeleted = true;
    } catch (err) {
      this.logger.error(`Master Asset delete failed for photo ${photoId} (${r2Key}): ${(err as Error)?.message}`);
    }

    try {
      await logIdentityAudit({
        actorId: actorUserId,
        targetUserId: Number(photo.owner_user_id),
        actionType: masterAssetDeleted
          ? 'GALLERY_PHOTO_MASTER_ASSET_DELETED'
          : 'GALLERY_PHOTO_MASTER_ASSET_DELETE_FAILED',
        oldValue: { photo_id: photoId, uuid: photo.uuid, r2_key: r2Key },
        newValue: { master_asset_deleted: masterAssetDeleted, db_records_removed: removed },
        reason: masterAssetDeleted ? null : 'R2 delete failed after DB commit; object unreferenced, purge by r2_key',
      });
    } catch (err) {
      this.logger.error(`Storage-outcome audit write failed for photo ${photoId}: ${(err as Error)?.message}`);
    }

    return { deleted: true, photo_id: photoId, master_asset_deleted: masterAssetDeleted };
  }

  private async assertMasterAssetNotShared(photoId: number, r2Key: string): Promise<void> {
    const [otherPhoto, event, journal, cover, avatar] = await Promise.all([
      db.selectFrom('photos').select('id').where('r2_key', '=', r2Key).where('id', '!=', photoId).executeTakeFirst(),
      db.selectFrom('events').select('id').where('banner_r2_key', '=', r2Key).executeTakeFirst(),
      db.selectFrom('journal_posts').select('id').where('hero_r2_key', '=', r2Key).executeTakeFirst(),
      db.selectFrom('user_cover_photos').select('id').where('r2_key', '=', r2Key).executeTakeFirst(),
      db.selectFrom('user_avatars').select('id').where('r2_key', '=', r2Key).executeTakeFirst(),
    ]);
    const sharedWith = [
      otherPhoto && 'another photo',
      event && 'an event banner',
      journal && 'a journal post',
      cover && 'a profile cover',
      avatar && 'a profile avatar',
    ].filter(Boolean);
    if (sharedWith.length) {
      throw new ConflictException(
        `This photo's file is also used by ${sharedWith.join(', ')}. Remove that usage before deleting the photo.`,
      );
    }
  }
}
