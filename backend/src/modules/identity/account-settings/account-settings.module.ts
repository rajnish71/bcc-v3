import { Module } from '@nestjs/common';
import { AccountSettingsController } from './account-settings.controller';
import { AccountSettingsService } from './account-settings.service';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../../shared/communication/communication.module';

@Module({
  imports: [AuthModule, CommunicationModule],
  controllers: [AccountSettingsController],
  providers: [AccountSettingsService],
})
export class AccountSettingsModule {}
