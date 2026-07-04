// backend/src/modules/shared/communication/communication.module.ts
//
// Module 17 Communication Engine -- NestJS module wiring.
//
// Exports:
//   CommunicationService -- the single dispatch entry point for all callers.
//     Every other module that generates notifications imports this module
//     and injects CommunicationService. No module dispatches email, in-app,
//     or SMS/WA directly after this module exists.
//
//   EmailService -- still exported for the (transitional) period before all
//     direct emailService.send() callers in registration, lifecycle, and
//     application-workflow are migrated to CommunicationService.dispatch()
//     in Batch 3. Remove EmailService from exports once Batch 3 is complete.

import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { CommunicationService } from './communication.service';

@Module({
  providers: [EmailService, CommunicationService],
  exports:   [EmailService, CommunicationService],
})
export class CommunicationModule {}
