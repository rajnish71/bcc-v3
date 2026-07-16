import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';
import { MaintenanceHandler, DependencyReport, DeletionStep } from './base';

export class NotificationHandler implements MaintenanceHandler {
  getHandledFKs(): string[] {
    return [
      'notification_preferences.user_id',
      'notification_log.user_id',
      'in_app_notifications.user_id'
    ];
  }

  getDeletionSteps(): DeletionStep[] {
    return [
      {
        table: 'in_app_notifications',
        action: 'delete',
        description: 'Delete in-app notifications sent to target user',
        phase: 3
      },
      {
        table: 'notification_log',
        action: 'delete',
        description: 'Delete notification log entries of target user',
        phase: 3
      },
      {
        table: 'notification_preferences',
        action: 'delete',
        description: 'Delete notification preferences config of target user',
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

    await countRows('notification_preferences', 'user_id', 'user_id');
    await countRows('notification_log', 'user_id', 'user_id');
    await countRows('in_app_notifications', 'user_id', 'user_id');

    return report;
  }

  async delete(db: Kysely<DB>, userIds: number[]): Promise<void> {
    await db.deleteFrom('in_app_notifications').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('notification_log').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('notification_preferences').where('user_id', 'in', userIds).execute();
  }
}
