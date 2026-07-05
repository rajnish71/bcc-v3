// backend/src/modules/notifications/notification.module.ts
// Module 17 -- notification bell + preferences NestJS module.
// Registered in AppModule. Imports AuthModule for AccessTokenGuard.

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
