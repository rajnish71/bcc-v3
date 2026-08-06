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
import { VotingRegisterService } from './voting-register/voting-register.service';
import { VotingRegisterController } from './voting-register/voting-register.controller';
import { MembershipCardService } from './card/membership-card.service';
import { MembershipCardController } from './card/membership-card.controller';
import { MembershipVerifyController } from './card/membership-verify.controller';
import { MembershipController } from './membership.controller';
import { HubMembershipService } from './hub/hub-membership.service';
import { HubMembershipController } from './hub/hub-membership.controller';
import { MembershipAdminService } from './admin/membership-admin.service';
import { MembershipAdminController } from './admin/membership-admin.controller';

@Module({
  imports: [AuthModule, RbacModule, CommunicationModule, StorageModule],
  controllers: [
    EntitlementController,
    RecognitionController,
    GroupController,
    ApplicationWorkflowController,
    VotingRegisterController,
    MembershipCardController,
    MembershipVerifyController,
    MembershipController,
    HubMembershipController,
    MembershipAdminController,
  ],
  providers: [
    MembershipNumberingService,
    MembershipLifecycleService,
    EntitlementService,
    RecognitionService,
    GroupService,
    ApplicationWorkflowService,
    VotingRegisterService,
    MembershipCardService,
    HubMembershipService,
    MembershipAdminService,
  ],
  exports: [
    MembershipLifecycleService,
    MembershipNumberingService,
    EntitlementService,
    RecognitionService,
    GroupService,
    ApplicationWorkflowService,
    VotingRegisterService,
    MembershipCardService,
    MembershipAdminService,
  ],
})
export class MembershipModule {}
