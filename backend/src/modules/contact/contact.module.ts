// backend/src/modules/contact/contact.module.ts
//
// Wires ContactController + ContactService.
// Imports CommunicationModule to get EmailService via DI.
// Registered in AppModule.

import { Module } from '@nestjs/common';
import { CommunicationModule } from '../shared/communication/communication.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [CommunicationModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
