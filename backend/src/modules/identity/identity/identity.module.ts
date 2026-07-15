import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { RbacModule } from '../rbac/rbac.module';
import { CommunicationModule } from '../../shared/communication/communication.module';

@Module({
  imports: [RbacModule, CommunicationModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
