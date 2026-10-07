// backend/src/modules/identity/distinctions/photographic-distinctions.module.ts
//
// Photographic Distinctions -- identity domain (Implementation Phase 1).
// Service + read-time badge derivation only; no controller is exposed until
// Phase 2 (holder editor, identity-domain admin surfaces, public rendering).

import { Module } from '@nestjs/common';
import { PhotographicDistinctionsService } from './photographic-distinctions.service';

@Module({
  providers: [PhotographicDistinctionsService],
  exports: [PhotographicDistinctionsService],
})
export class PhotographicDistinctionsModule {}
