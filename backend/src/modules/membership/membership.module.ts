// backend/src/modules/membership/membership.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { CommunicationModule } from '../shared/communication/communication.module';
import { MembershipNumberingService } from './numbering/membership-numbering.service';
import { MembershipLifecycleService } from './lifecycle/membership-lifecycle.service';
import { EntitlementService } from './entitlements/entitlement.service';
import { EntitlementController } from './entitlements/entitlement.controller';
import { RecognitionService } from './recognition/recognition.service';
import { RecognitionController } from './recognition/recognition.controller';
import { MembershipController } from './membership.controller';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule],
  controllers: [EntitlementController, RecognitionController, MembershipController],
  providers: [MembershipNumberingService, MembershipLifecycleService, EntitlementService, RecognitionService],
  exports: [MembershipLifecycleService, MembershipNumberingService, EntitlementService, RecognitionService],
})
export class MembershipModule {}
