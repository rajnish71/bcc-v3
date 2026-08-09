// backend/src/modules/financial/financial.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { StorageModule } from '../shared/storage/storage.module';
import { FinancialEventBus } from './financial-event-bus.service';
import { FinancialContributionService } from './financial-contribution.service';
import { SettlementEvidenceService } from './settlement-evidence.service';
import { FinancialController } from './financial.controller';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { SETTLEMENT_PROVIDER } from './settlement-provider.interface';
import { RazorpaySettlementProvider } from './razorpay-settlement.provider';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@Module({
  imports: [AuthModule, RbacModule, StorageModule],
  controllers: [FinancialController, RazorpayWebhookController],
  providers: [
    FinancialEventBus,
    FinancialContributionService,
    SettlementEvidenceService,
    RazorpaySettlementProvider,
    RazorpayWebhookService,
    // Financial Engine depends on SETTLEMENT_PROVIDER (the generic
    // interface), not on RazorpaySettlementProvider directly -- PAY-001
    // Step 18 §PROVIDER BOUNDARY. Swapping/adding a provider means
    // changing this binding only.
    { provide: SETTLEMENT_PROVIDER, useExisting: RazorpaySettlementProvider },
  ],
  exports: [FinancialContributionService, FinancialEventBus, SettlementEvidenceService],
})
export class FinancialModule {}
