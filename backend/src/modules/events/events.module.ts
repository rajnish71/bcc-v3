// backend/src/modules/events/events.module.ts
//
// Module 04 -- Events & Activity Management.
//
// Imports:
//   AuthModule      -- provides AccessTokenGuard
//   RbacModule      -- provides RbacGuard + RbacService
//   CommunicationModule -- provides CommunicationService for notification dispatch
//
// Does NOT import MembershipModule: eligibility checks are performed via
// direct Kysely queries inside EventsService, avoiding cross-module coupling.

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { CommunicationModule } from '../shared/communication/communication.module';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
