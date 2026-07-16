import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';

export interface DependencyReport {
  [tableName: string]: {
    [columnName: string]: number;
  };
}

export interface DeletionStep {
  table: string;
  action: 'delete' | 'nullify' | 'reassign';
  description: string;
  phase: number; // Phase 1 (break cycles), 2 (grandchildren), 3 (intermediate parents), 4 (nullify), 5 (direct tables), 6 (users)
}

export interface MaintenanceHandler {
  // Returns counts of records referencing the target users
  inspect(db: Kysely<DB>, userIds: number[]): Promise<DependencyReport>;

  // Executes deletion/nullification (used inside a transaction)
  delete(db: Kysely<DB>, userIds: number[]): Promise<void>;

  // Returns list of FKs handled by this handler in the format "table_name.column_name"
  getHandledFKs(): string[];

  // Returns deletion steps executed by this handler
  getDeletionSteps(): DeletionStep[];
}
