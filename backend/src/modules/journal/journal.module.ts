// backend/src/modules/journal/journal.module.ts
//
// Journal module — editorial content management.
//
// Imports:
//   AuthModule  — provides AccessTokenGuard (JWT verification)
//   RbacModule  — provides RbacGuard + RbacService (permission enforcement)
//
// Permissions seeded in seed_0010_journal_permissions.sql:
//   journal.create      → Content Editor, Coordinator, Platform Admin, Super Admin
//   journal.update_any  → same
//   journal.publish     → same
//   journal.archive     → same
//   journal.delete_any  → Platform Admin, Super Admin only

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
