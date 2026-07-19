import { Controller, Get } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from './database/db';

@Controller('api/v1')
export class AppController {
  @Get('health')
  async health() {
    let dbStatus = 'unknown';
    try {
      await sql`SELECT 1`.execute(db);
      dbStatus = 'connected';
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }
    return {
      status: 'ok',
      service: 'bcc-v3-backend',
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  }

  /** Public platform statistics — used by the About page hero stats band. */
  @Get('stats')
  async stats() {
    const [membersRow, photosRow, activitiesRow] = await Promise.all([
      db.selectFrom('memberships')
        .select(eb => eb.fn.count<number>('id').as('cnt'))
        .where('lifecycle_state', '=', 'ACTIVE')
        .where('owner_type', '=', 'INDIVIDUAL')
        .executeTakeFirst(),
      db.selectFrom('photos')
        .select(eb => eb.fn.count<number>('id').as('cnt'))
        .where('status', '=', 'ACTIVE')
        .where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'])
        .executeTakeFirst(),
      db.selectFrom('events')
        .select(eb => eb.fn.count<number>('id').as('cnt'))
        .where('state', 'in', ['PUBLISHED', 'COMPLETED'])
        .executeTakeFirst(),
    ]);
    return {
      members:    Number(membersRow?.cnt    ?? 0),
      photos:     Number(photosRow?.cnt     ?? 0),
      activities: Number(activitiesRow?.cnt ?? 0),
    };
  }
}
