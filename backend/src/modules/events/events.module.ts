// backend/src/modules/events/events.module.ts
//
// Module 04 -- Events & Activity Management.
//
// Imports:
//   AuthModule      -- provides AccessTokenGuard
//   RbacModule      -- provides RbacGuard + RbacService
//   CommunicationModule -- provides CommunicationService for notification dispatch
//   FinancialModule -- PAY-001: FinancialContributionService + FinancialEventBus,
//                      reused unchanged (EVENT-ARCH-001 §7)
//
// Does NOT import MembershipModule: eligibility checks are performed via
// direct Kysely queries inside EventsService, avoiding cross-module coupling.

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { CommunicationModule } from '../shared/communication/communication.module';
import { FinancialModule } from '../financial/financial.module';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventsFinancialListener } from './financial/events-financial.listener';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule, FinancialModule],
  controllers: [EventsController],
  providers: [EventsService, EventsFinancialListener],
  exports: [EventsService],
})
export class EventsModule {}
