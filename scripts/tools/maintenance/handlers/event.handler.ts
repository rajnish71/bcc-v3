import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';
import { MaintenanceHandler, DependencyReport, DeletionStep } from './base';

export class EventHandler implements MaintenanceHandler {
  getHandledFKs(): string[] {
    return [
      'events.created_by',
      'event_invite_list.user_id',
      'event_invite_list.invited_by',
      'event_registrations.user_id',
      'event_registrations.checked_in_by',
      'event_volunteers.user_id'
    ];
  }

  getDeletionSteps(): DeletionStep[] {
    return [
      {
        table: 'event_invite_list',
        action: 'delete',
        description: 'Delete invitations associated with target user\'s created events',
        phase: 2
      },
      {
        table: 'event_registrations',
        action: 'delete',
        description: 'Delete guest or member registrations associated with target user\'s created events',
        phase: 2
      },
      {
        table: 'event_volunteers',
        action: 'delete',
        description: 'Delete volunteer participation logs associated with target user\'s created events',
        phase: 2
      },
      {
        table: 'event_volunteer_slots',
        action: 'delete',
        description: 'Delete helper slots associated with target user\'s created events',
        phase: 2
      },
      {
        table: 'events',
        action: 'delete',
        description: 'Delete photowalks/workshops created by target user',
        phase: 3
      },
      {
        table: 'event_registrations',
        action: 'nullify',
        description: 'Nullify checked_in_by references to target user',
        phase: 4
      },
      {
        table: 'event_invite_list',
        action: 'delete',
        description: 'Delete event invitation entries sent to or by target user',
        phase: 5
      },
      {
        table: 'event_registrations',
        action: 'delete',
        description: 'Delete event registrations signed up by target user',
        phase: 5
      },
      {
        table: 'event_volunteers',
        action: 'delete',
        description: 'Delete volunteer registrations of target user',
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
    await countRows('events', 'created_by', 'created_by');
    await countRows('event_invite_list', 'user_id', 'user_id');
    await countRows('event_invite_list', 'invited_by', 'invited_by');
    await countRows('event_registrations', 'user_id', 'user_id');
    await countRows('event_registrations', 'checked_in_by', 'checked_in_by');
    await countRows('event_volunteers', 'user_id', 'user_id');

    // Retrieve event IDs created by target users
    const createdEvents = await db
      .selectFrom('events')
      .select('id')
      .where('created_by', 'in', userIds)
      .execute();
    const eventIds = createdEvents.map(e => e.id);

    // Sub-table references for created events
    if (eventIds.length > 0) {
      const countByEvents = async (table: keyof DB, column: string) => {
        const res = await db
          .selectFrom(table as any)
          .select(db.fn.count(column as any).as('count'))
          .where(column as any, 'in', eventIds)
          .executeTakeFirst();
        const count = Number(res?.count ?? 0);
        if (count > 0) {
          if (!report[table as string]) report[table as string] = {};
          report[table as string][column] = (report[table as string][column] ?? 0) + count;
        }
      };

      await countByEvents('event_invite_list', 'event_id');
      await countByEvents('event_registrations', 'event_id');
      await countByEvents('event_volunteers', 'event_id');
      await countByEvents('event_volunteer_slots', 'event_id');
    }

    return report;
  }

  async delete(db: Kysely<DB>, userIds: number[]): Promise<void> {
    const createdEvents = await db
      .selectFrom('events')
      .select('id')
      .where('created_by', 'in', userIds)
      .execute();
    const eventIds = createdEvents.map(e => e.id);

    // Delete event grandchildren
    if (eventIds.length > 0) {
      await db.deleteFrom('event_invite_list').where('event_id', 'in', eventIds).execute();
      await db.deleteFrom('event_registrations').where('event_id', 'in', eventIds).execute();
      await db.deleteFrom('event_volunteers').where('event_id', 'in', eventIds).execute();
      await db.deleteFrom('event_volunteer_slots').where('event_id', 'in', eventIds).execute();
    }

    // Delete target user participation from OTHER events
    await db.deleteFrom('event_invite_list').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('event_invite_list').where('invited_by', 'in', userIds).execute();
    await db.deleteFrom('event_registrations').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('event_volunteers').where('user_id', 'in', userIds).execute();

    // Delete events themselves
    await db.deleteFrom('events').where('created_by', 'in', userIds).execute();

    // Nullify checked_in_by in event registrations
    await db.updateTable('event_registrations').set({ checked_in_by: null }).where('checked_in_by', 'in', userIds).execute();
  }
}
