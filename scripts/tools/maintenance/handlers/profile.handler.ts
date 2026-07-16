import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';
import { MaintenanceHandler, DependencyReport, DeletionStep } from './base';

export class ProfileHandler implements MaintenanceHandler {
  getHandledFKs(): string[] {
    return [
      'user_avatars.user_id',
      'user_cover_photos.user_id',
      'user_social_handles.user_id',
      'user_gear.user_id',
      'user_photo_titles.user_id',
      'user_awards.user_id',
      'user_roles.user_id',
      'user_roles.granted_by',
      'identity_audit_log.target_user_id',
      'identity_audit_log.actor_id',
      'group_delegates.user_id',
      'group_entities.primary_contact_user_id',
      'users.created_by',
      'journal_posts.author_user_id'
    ];
  }

  getDeletionSteps(): DeletionStep[] {
    return [
      {
        table: 'users',
        action: 'nullify',
        description: 'Nullify created_by self-references of target user',
        phase: 1
      },
      {
        table: 'user_roles',
        action: 'reassign',
        description: 'Reassign role granting actor',
        phase: 4
      },
      {
        table: 'identity_audit_log',
        action: 'nullify',
        description: 'Nullify actor_id references to target user in audit log',
        phase: 4
      },
      {
        table: 'group_entities',
        action: 'nullify',
        description: 'Nullify primary contact referencing target user in group records',
        phase: 4
      },
      {
        table: 'journal_posts',
        action: 'nullify',
        description: 'Nullify author reference on journal posts written by target user',
        phase: 4
      },
      {
        table: 'group_delegates',
        action: 'delete',
        description: 'Delete group delegate associations of target user',
        phase: 5
      },
      {
        table: 'user_avatars',
        action: 'delete',
        description: 'Delete avatar image references of target user',
        phase: 5
      },
      {
        table: 'user_cover_photos',
        action: 'delete',
        description: 'Delete profile cover photo records of target user',
        phase: 5
      },
      {
        table: 'user_social_handles',
        action: 'delete',
        description: 'Delete social media handles of target user',
        phase: 5
      },
      {
        table: 'user_gear',
        action: 'delete',
        description: 'Delete gear specifications of target user',
        phase: 5
      },
      {
        table: 'user_photo_titles',
        action: 'delete',
        description: 'Delete photography titles and body codes of target user',
        phase: 5
      },
      {
        table: 'user_awards',
        action: 'delete',
        description: 'Delete awards lists of target user',
        phase: 5
      },
      {
        table: 'user_roles',
        action: 'delete',
        description: 'Delete operational or system role assignments of target user',
        phase: 5
      },
      {
        table: 'identity_audit_log',
        action: 'delete',
        description: 'Delete audit logs documenting target user modifications',
        phase: 5
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

    await countRows('user_avatars', 'user_id', 'user_id');
    await countRows('user_cover_photos', 'user_id', 'user_id');
    await countRows('user_social_handles', 'user_id', 'user_id');
    await countRows('user_gear', 'user_id', 'user_id');
    await countRows('user_photo_titles', 'user_id', 'user_id');
    await countRows('user_awards', 'user_id', 'user_id');
    await countRows('user_roles', 'user_id', 'user_id');
    await countRows('user_roles', 'granted_by', 'granted_by');
    await countRows('identity_audit_log', 'target_user_id', 'target_user_id');
    await countRows('identity_audit_log', 'actor_id', 'actor_id');
    await countRows('group_delegates', 'user_id', 'user_id');
    await countRows('group_entities', 'primary_contact_user_id', 'primary_contact_user_id');
    await countRows('users', 'created_by', 'created_by');
    await countRows('journal_posts', 'author_user_id', 'author_user_id');

    return report;
  }

  async delete(db: Kysely<DB>, userIds: number[]): Promise<void> {
    // Break users.created_by self-references
    await db
      .updateTable('users')
      .set({ created_by: null })
      .where('created_by', 'in', userIds)
      .execute();

    // Reassign user_roles.granted_by
    const reassignTarget = await db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('ur.user_id')
      .where('r.name', '=', 'SUPER_ADMIN')
      .where('ur.user_id', 'not in', userIds)
      .orderBy('ur.user_id', 'asc')
      .executeTakeFirst();
    
    // Fallback if no super admin
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
        .updateTable('user_roles')
        .set({ granted_by: targetAdminId })
        .where('granted_by', 'in', userIds)
        .execute();
    }

    // Nullify profile-related references
    await db.updateTable('identity_audit_log').set({ actor_id: null }).where('actor_id', 'in', userIds).execute();
    await db.updateTable('group_entities').set({ primary_contact_user_id: null }).where('primary_contact_user_id', 'in', userIds).execute();
    await db.updateTable('journal_posts').set({ author_user_id: null }).where('author_user_id', 'in', userIds).execute();

    // Delete direct user profile records
    await db.deleteFrom('group_delegates').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_avatars').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_cover_photos').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_social_handles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_gear').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_photo_titles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_awards').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('identity_audit_log').where('target_user_id', 'in', userIds).execute();
  }
}
