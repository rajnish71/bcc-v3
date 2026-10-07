// backend/src/modules/identity/distinctions/photographic-distinctions.module.ts
//
// Photographic Distinctions -- identity domain. Holder editor, admin
// Remove/Restore, catalogue management and read-time badge derivation.

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PhotographicDistinctionsController } from './photographic-distinctions.controller';
import { PhotographicDistinctionsService } from './photographic-distinctions.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [PhotographicDistinctionsController],
  providers: [PhotographicDistinctionsService],
  exports: [PhotographicDistinctionsService],
})
export class PhotographicDistinctionsModule {}
