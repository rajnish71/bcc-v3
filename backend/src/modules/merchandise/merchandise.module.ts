// backend/src/modules/merchandise/merchandise.module.ts
//
// Merchandise V1 -- a distinct Business Module (Track 7 exception).
// Imports FinancialModule to consume FinancialContributionService +
// FinancialEventBus; PAY-001 is reused unchanged (financial.module.ts is
// not modified by this module).

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { FinancialModule } from '../financial/financial.module';
import { MerchandiseCatalogService } from './merchandise-catalog.service';
import { MerchandiseCouponService } from './merchandise-coupon.service';
import { MerchandiseOrderService } from './merchandise-order.service';
import { MerchandiseFinancialListener } from './financial/merchandise-financial.listener';
import { MerchandiseController } from './merchandise.controller';
import { MerchandiseAdminController } from './merchandise-admin.controller';

@Module({
  imports: [AuthModule, RbacModule, FinancialModule],
  controllers: [MerchandiseController, MerchandiseAdminController],
  providers: [
    MerchandiseCatalogService,
    MerchandiseCouponService,
    MerchandiseOrderService,
    MerchandiseFinancialListener,
  ],
  exports: [MerchandiseCatalogService, MerchandiseOrderService],
})
export class MerchandiseModule {}
