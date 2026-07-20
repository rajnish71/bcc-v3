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

  /** Public platform statistics — canonical single endpoint for Home and About pages. */
  @Get('stats')
  async stats() {
    const [membersRow, photosRow, activitiesRow, photographersRow, photowalksRow] = await Promise.all([
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
      db.selectFrom('photos')
        .select(sql<number>`COUNT(DISTINCT user_id)`.as('cnt'))
        .where('status', '=', 'ACTIVE')
        .where('visibility', 'in', ['PUBLIC', 'MEMBERS_ONLY'])
        .executeTakeFirst(),
      db.selectFrom('events')
        .select(eb => eb.fn.count<number>('id').as('cnt'))
        .where('state', 'in', ['PUBLISHED', 'COMPLETED'])
        .where(sql<boolean>`LOWER(category) LIKE '%photowalk%'`)
        .executeTakeFirst(),
    ]);
    return {
      members:       Number(membersRow?.cnt       ?? 0),
      photos:        Number(photosRow?.cnt        ?? 0),
      activities:    Number(activitiesRow?.cnt    ?? 0),
      photographers: Number(photographersRow?.cnt ?? 0),
      photowalks:    Number(photowalksRow?.cnt    ?? 0),
    };
  }
}
