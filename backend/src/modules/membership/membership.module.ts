// backend/src/modules/membership/membership.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { CommunicationModule } from '../shared/communication/communication.module';
import { StorageModule } from '../shared/storage/storage.module';
import { MembershipNumberingService } from './numbering/membership-numbering.service';
import { MembershipLifecycleService } from './lifecycle/membership-lifecycle.service';
import { EntitlementService } from './entitlements/entitlement.service';
import { EntitlementController } from './entitlements/entitlement.controller';
import { RecognitionService } from './recognition/recognition.service';
import { RecognitionController } from './recognition/recognition.controller';
import { GroupService } from './groups/group.service';
import { GroupController } from './groups/group.controller';
import { ApplicationWorkflowService } from './application/application-workflow.service';
import { ApplicationWorkflowController } from './application/application-workflow.controller';
import { MembershipController } from './membership.controller';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule, StorageModule],
  controllers: [
    EntitlementController,
    RecognitionController,
    GroupController,
    ApplicationWorkflowController,
    MembershipController,
  ],
  providers: [
    MembershipNumberingService,
    MembershipLifecycleService,
    EntitlementService,
    RecognitionService,
    GroupService,
    ApplicationWorkflowService,
  ],
  exports: [
    MembershipLifecycleService,
    MembershipNumberingService,
    EntitlementService,
    RecognitionService,
    GroupService,
    ApplicationWorkflowService,
  ],
})
export class MembershipModule {}
