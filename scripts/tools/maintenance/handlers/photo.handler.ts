import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';
import { MaintenanceHandler, DependencyReport, DeletionStep } from './base';

export class PhotoHandler implements MaintenanceHandler {
  getHandledFKs(): string[] {
    return [
      'photos.owner_user_id',
      'photo_albums.owner_user_id',
      'photo_reactions.user_id',
      'photo_comments.user_id',
      'photo_tag_assignments.assigned_by',
      'gallery_spotlight.set_by_user_id',
      'hero_assignments.assigned_by'
    ];
  }

  getDeletionSteps(): DeletionStep[] {
    return [
      {
        table: 'photo_albums',
        action: 'nullify',
        description: 'Nullify cover_photo_id to break foreign key cycle on photo albums',
        phase: 1
      },
      {
        table: 'photo_tag_assignments',
        action: 'delete',
        description: 'Delete tag assignments linked to target user\'s photos or assigned by user',
        phase: 2
      },
      {
        table: 'photo_reactions',
        action: 'delete',
        description: 'Delete likes/reactions on target user\'s photos or created by user',
        phase: 2
      },
      {
        table: 'photo_comments',
        action: 'delete',
        description: 'Delete comments on target user\'s photos or written by user',
        phase: 2
      },
      {
        table: 'photo_album_items',
        action: 'delete',
        description: 'Delete album-photo mapping entries linked to user\'s photos or albums',
        phase: 2
      },
      {
        table: 'photo_album_genres',
        action: 'delete',
        description: 'Delete genres categorizing target user\'s photo albums',
        phase: 2
      },
      {
        table: 'photo_albums',
        action: 'delete',
        description: 'Delete photo albums owned by target user',
        phase: 3
      },
      {
        table: 'photos',
        action: 'delete',
        description: 'Delete photo records owned by target user',
        phase: 3
      },
      {
        table: 'gallery_spotlight',
        action: 'nullify',
        description: 'Nullify set_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'hero_assignments',
        action: 'nullify',
        description: 'Nullify assigned_by references to target user',
        phase: 4
      }
    ];
  }

  async inspect(db: Kysely<DB>, userIds: number[]): Promise<DependencyReport> {
    if (userIds.length === 0) return {};

    const report: DependencyReport = {};

    const countRows = async (table: keyof DB, column: string, filterCol: string) => {
      const res = await db
        .selectFrom(table as any)
        .select(db.fn.count(filterCol as any).as('count'))
        .where(filterCol as any, 'in', userIds)
        .executeTakeFirst();
      const count = Number(res?.count ?? 0);
      if (count > 0) {
        if (!report[table as string]) report[table as string] = {};
        report[table as string][column] = count;
      }
    };

    // Direct user_id references
    await countRows('photos', 'owner_user_id', 'owner_user_id');
    await countRows('photo_albums', 'owner_user_id', 'owner_user_id');
    await countRows('photo_reactions', 'user_id', 'user_id');
    await countRows('photo_comments', 'user_id', 'user_id');
    await countRows('photo_tag_assignments', 'assigned_by', 'assigned_by');
    await countRows('gallery_spotlight', 'set_by_user_id', 'set_by_user_id');
    await countRows('hero_assignments', 'assigned_by', 'assigned_by');

    // Retrieve user's photo IDs and album IDs
    const userPhotos = await db
      .selectFrom('photos')
      .select('id')
      .where('owner_user_id', 'in', userIds)
      .execute();
    const photoIds = userPhotos.map(p => p.id);

    const userAlbums = await db
      .selectFrom('photo_albums')
      .select('id')
      .where('owner_user_id', 'in', userIds)
      .execute();
    const albumIds = userAlbums.map(a => a.id);

    // Sub-table references
    if (photoIds.length > 0) {
      const countByPhotos = async (table: keyof DB, column: string) => {
        const res = await db
          .selectFrom(table as any)
          .select(db.fn.count(column as any).as('count'))
          .where(column as any, 'in', photoIds)
          .executeTakeFirst();
        const count = Number(res?.count ?? 0);
        if (count > 0) {
          if (!report[table as string]) report[table as string] = {};
          report[table as string][column] = (report[table as string][column] ?? 0) + count;
        }
      };

      await countByPhotos('photo_tag_assignments', 'photo_id');
      await countByPhotos('photo_reactions', 'photo_id');
      await countByPhotos('photo_comments', 'photo_id');
      await countByPhotos('photo_album_items', 'photo_id');
    }

    if (albumIds.length > 0) {
      const countByAlbums = async (table: keyof DB, column: string) => {
        const res = await db
          .selectFrom(table as any)
          .select(db.fn.count('id' as any).as('count'))
          .where(column as any, 'in', albumIds)
          .executeTakeFirst();
        const count = Number(res?.count ?? 0);
        if (count > 0) {
          if (!report[table as string]) report[table as string] = {};
          report[table as string][column] = (report[table as string][column] ?? 0) + count;
        }
      };

      await countByAlbums('photo_album_items', 'album_id');
      await countByAlbums('photo_album_genres', 'album_id');
    }

    return report;
  }

  async delete(db: Kysely<DB>, userIds: number[]): Promise<void> {
    const userPhotos = await db
      .selectFrom('photos')
      .select('id')
      .where('owner_user_id', 'in', userIds)
      .execute();
    const photoIds = userPhotos.map(p => p.id);

    const userAlbums = await db
      .selectFrom('photo_albums')
      .select('id')
      .where('owner_user_id', 'in', userIds)
      .execute();
    const albumIds = userAlbums.map(a => a.id);

    // Nullify cover_photo_id on user's photo albums to break cycle
    await db
      .updateTable('photo_albums')
      .set({ cover_photo_id: null })
      .where('owner_user_id', 'in', userIds)
      .execute();

    // Delete photo grandchildren
    if (photoIds.length > 0) {
      await db.deleteFrom('photo_tag_assignments').where('photo_id', 'in', photoIds).execute();
      await db.deleteFrom('photo_reactions').where('photo_id', 'in', photoIds).execute();
      await db.deleteFrom('photo_comments').where('photo_id', 'in', photoIds).execute();
      await db.deleteFrom('photo_album_items').where('photo_id', 'in', photoIds).execute();
    }

    // Delete direct user comment/reaction/tag assignments on OTHER photos
    await db.deleteFrom('photo_reactions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('photo_comments').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('photo_tag_assignments').where('assigned_by', 'in', userIds).execute();

    // Delete album grandchildren
    if (albumIds.length > 0) {
      await db.deleteFrom('photo_album_items').where('album_id', 'in', albumIds).execute();
      await db.deleteFrom('photo_album_genres').where('album_id', 'in', albumIds).execute();
    }

    // Delete photo albums
    await db.deleteFrom('photo_albums').where('owner_user_id', 'in', userIds).execute();

    // Delete photos themselves
    await db.deleteFrom('photos').where('owner_user_id', 'in', userIds).execute();

    // Nullify set_by_user_id in spotlight
    const reassignTarget = await db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('ur.user_id')
      .where('r.name', '=', 'SUPER_ADMIN')
      .where('ur.user_id', 'not in', userIds)
      .orderBy('ur.user_id', 'asc')
      .executeTakeFirst();
    
    let targetAdminId: number | null = null;
    if (reassignTarget) {
      targetAdminId = reassignTarget.user_id;
    } else {
      const fallback = await db
        .selectFrom('users')
        .select('id')
        .where('id', 'not in', userIds)
        .orderBy('id', 'asc')
        .executeTakeFirst();
      if (fallback) targetAdminId = fallback.id;
    }

    if (targetAdminId !== null) {
      await db
        .updateTable('gallery_spotlight')
        .set({ set_by_user_id: targetAdminId })
        .where('set_by_user_id', 'in', userIds)
        .execute();

      await db
        .updateTable('hero_assignments')
        .set({ assigned_by: targetAdminId })
        .where('assigned_by', 'in', userIds)
        .execute();
    }
  }
}
