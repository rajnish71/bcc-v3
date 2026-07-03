// backend/src/modules/membership/membership.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { CommunicationModule } from '../shared/communication/communication.module';
import { MembershipNumberingService } from './numbering/membership-numbering.service';
import { MembershipLifecycleService } from './lifecycle/membership-lifecycle.service';
import { MembershipController } from './membership.controller';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule],
  controllers: [MembershipController],
  providers: [MembershipNumberingService, MembershipLifecycleService],
  exports: [MembershipLifecycleService, MembershipNumberingService],
})
export class MembershipModule {}
