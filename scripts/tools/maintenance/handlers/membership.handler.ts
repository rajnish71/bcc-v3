import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';
import { MaintenanceHandler, DependencyReport, DeletionStep } from './base';

export class MembershipHandler implements MaintenanceHandler {
  getHandledFKs(): string[] {
    return [
      'memberships.user_id',
      'membership_consent_log.user_id',
      'member_recognitions.assigned_by_user_id',
      'membership_audit_log.actor_user_id',
      'membership_number_log.assigned_by_user_id',
      'individual_overrides.created_by_user_id',
      'recognition_criteria.updated_by_user_id',
      'membership_application_documents.uploaded_by_user_id',
      'membership_application_documents.reviewed_by_user_id',
      'membership_application_messages.author_user_id',
      'membership_approval_stages.actor_user_id',
      'payments.recorded_by_user_id',
      'voting_register_snapshots.generated_by_user_id'
    ];
  }

  getDeletionSteps(): DeletionStep[] {
    return [
      {
        table: 'payments',
        action: 'delete',
        description: 'Delete payments associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'membership_application_documents',
        action: 'delete',
        description: 'Delete application documents associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'membership_application_messages',
        action: 'delete',
        description: 'Delete clarification messages associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'membership_approval_stages',
        action: 'delete',
        description: 'Delete approval stage decisions associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'membership_audit_log',
        action: 'delete',
        description: 'Delete audit log entries associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'membership_number_log',
        action: 'delete',
        description: 'Delete membership number allocations associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'membership_temp_identifiers',
        action: 'delete',
        description: 'Delete temporary identifiers associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'member_recognitions',
        action: 'delete',
        description: 'Delete recognitions associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'individual_overrides',
        action: 'delete',
        description: 'Delete individual entitlements overrides associated with target user\'s memberships',
        phase: 2
      },
      {
        table: 'memberships',
        action: 'delete',
        description: 'Delete memberships owned by target user',
        phase: 3
      },
      {
        table: 'member_recognitions',
        action: 'nullify',
        description: 'Nullify assigned_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'membership_audit_log',
        action: 'nullify',
        description: 'Nullify actor_user_id references to target user',
        phase: 4
      },
      {
        table: 'membership_number_log',
        action: 'nullify',
        description: 'Nullify assigned_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'individual_overrides',
        action: 'nullify',
        description: 'Nullify created_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'recognition_criteria',
        action: 'nullify',
        description: 'Nullify updated_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'membership_application_documents',
        action: 'nullify',
        description: 'Nullify uploaded_by_user_id & reviewed_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'membership_application_messages',
        action: 'nullify',
        description: 'Nullify author_user_id references to target user',
        phase: 4
      },
      {
        table: 'membership_approval_stages',
        action: 'nullify',
        description: 'Nullify actor_user_id references to target user',
        phase: 4
      },
      {
        table: 'payments',
        action: 'nullify',
        description: 'Nullify recorded_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'voting_register_snapshots',
        action: 'nullify',
        description: 'Nullify generated_by_user_id references to target user',
        phase: 4
      },
      {
        table: 'membership_consent_log',
        action: 'delete',
        description: 'Delete membership consent logs of target user',
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

    // Direct user_id references
    await countRows('memberships', 'user_id', 'user_id');
    await countRows('membership_consent_log', 'user_id', 'user_id');
    await countRows('member_recognitions', 'assigned_by_user_id', 'assigned_by_user_id');
    await countRows('membership_audit_log', 'actor_user_id', 'actor_user_id');
    await countRows('membership_number_log', 'assigned_by_user_id', 'assigned_by_user_id');
    await countRows('individual_overrides', 'created_by_user_id', 'created_by_user_id');
    await countRows('recognition_criteria', 'updated_by_user_id', 'updated_by_user_id');
    await countRows('membership_application_documents', 'uploaded_by_user_id', 'uploaded_by_user_id');
    await countRows('membership_application_documents', 'reviewed_by_user_id', 'reviewed_by_user_id');
    await countRows('membership_application_messages', 'author_user_id', 'author_user_id');
    await countRows('membership_approval_stages', 'actor_user_id', 'actor_user_id');
    await countRows('payments', 'recorded_by_user_id', 'recorded_by_user_id');
    await countRows('voting_register_snapshots', 'generated_by_user_id', 'generated_by_user_id');

    // Intermediate memberships resolution
    const memberships = await db
      .selectFrom('memberships')
      .select('id')
      .where('user_id', 'in', userIds)
      .execute();
    const membershipIds = memberships.map(m => m.id);

    if (membershipIds.length > 0) {
      const countByMembership = async (table: keyof DB, column: string) => {
        const res = await db
          .selectFrom(table as any)
          .select(db.fn.count('id' as any).as('count'))
          .where(column as any, 'in', membershipIds)
          .executeTakeFirst();
        const count = Number(res?.count ?? 0);
        if (count > 0) {
          if (!report[table as string]) report[table as string] = {};
          report[table as string][column] = count;
        }
      };

      await countByMembership('payments', 'membership_id');
      await countByMembership('membership_application_documents', 'membership_id');
      await countByMembership('membership_application_messages', 'membership_id');
      await countByMembership('membership_approval_stages', 'membership_id');
      await countByMembership('membership_audit_log', 'membership_id');
      await countByMembership('membership_number_log', 'membership_id');
      await countByMembership('membership_temp_identifiers', 'membership_id');
      await countByMembership('member_recognitions', 'membership_id');
      await countByMembership('individual_overrides', 'membership_id');
    }

    return report;
  }

  async delete(db: Kysely<DB>, userIds: number[]): Promise<void> {
    const memberships = await db
      .selectFrom('memberships')
      .select('id')
      .where('user_id', 'in', userIds)
      .execute();
    const membershipIds = memberships.map(m => m.id);

    if (membershipIds.length > 0) {
      // Delete membership grandchildren
      await db.deleteFrom('payments').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('membership_application_documents').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('membership_application_messages').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('membership_approval_stages').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('membership_audit_log').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('membership_number_log').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('membership_temp_identifiers').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('member_recognitions').where('membership_id', 'in', membershipIds).execute();
      await db.deleteFrom('individual_overrides').where('membership_id', 'in', membershipIds).execute();
    }

    // Delete memberships themselves
    await db.deleteFrom('memberships').where('user_id', 'in', userIds).execute();

    // Nullify references in other membership records
    await db.updateTable('member_recognitions').set({ assigned_by_user_id: null }).where('assigned_by_user_id', 'in', userIds).execute();
    await db.updateTable('membership_audit_log').set({ actor_user_id: null }).where('actor_user_id', 'in', userIds).execute();
    await db.updateTable('membership_number_log').set({ assigned_by_user_id: null }).where('assigned_by_user_id', 'in', userIds).execute();
    await db.updateTable('individual_overrides').set({ created_by_user_id: null }).where('created_by_user_id', 'in', userIds).execute();
    await db.updateTable('recognition_criteria').set({ updated_by_user_id: null }).where('updated_by_user_id', 'in', userIds).execute();
    await db.updateTable('membership_application_documents').set({ uploaded_by_user_id: null }).where('uploaded_by_user_id', 'in', userIds).execute();
    await db.updateTable('membership_application_documents').set({ reviewed_by_user_id: null }).where('reviewed_by_user_id', 'in', userIds).execute();
    await db.updateTable('membership_application_messages').set({ author_user_id: null }).where('author_user_id', 'in', userIds).execute();
    await db.updateTable('membership_approval_stages').set({ actor_user_id: null }).where('actor_user_id', 'in', userIds).execute();
    await db.updateTable('payments').set({ recorded_by_user_id: null }).where('recorded_by_user_id', 'in', userIds).execute();
    await db.updateTable('voting_register_snapshots').set({ generated_by_user_id: null }).where('generated_by_user_id', 'in', userIds).execute();

    // Delete consent logs
    await db.deleteFrom('membership_consent_log').where('user_id', 'in', userIds).execute();
  }
}
