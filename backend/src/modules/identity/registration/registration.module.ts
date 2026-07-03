// backend/src/modules/identity/registration/registration.module.ts
import { Module } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { OAuthService } from './oauth.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CommunicationModule } from '../../shared/communication/communication.module';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule],
  controllers: [RegistrationController],
  providers: [RegistrationService, OAuthService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
