import { Controller, Get } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from './database/db';

@Controller('health')
export class AppController {
  @Get()
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
}
