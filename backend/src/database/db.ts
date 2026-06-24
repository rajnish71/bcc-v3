import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';

export interface DB {
  // table interfaces are added here as real migrations land (Step 8)
}

const dialect = new MysqlDialect({
  pool: createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: 5,
  }),
});

export const db = new Kysely<DB>({ dialect });
