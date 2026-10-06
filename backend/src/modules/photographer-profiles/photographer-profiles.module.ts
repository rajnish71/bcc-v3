// backend/src/modules/photographer-profiles/photographer-profiles.module.ts
//
// Module 06 -- Photographer Profiles & Portfolios
// Provides the public photographer directory and profile endpoints, and the
// directory eligibility service (PROFILE-ARCH-001; also consumed by the
// Members Hub).

import { Module } from '@nestjs/common';
import { GalleryModule } from '../gallery/gallery.module';
import { PhotographerProfilesController } from './photographer-profiles.controller';
import { PhotographerProfilesService }    from './photographer-profiles.service';
import { DirectoryEligibilityService }    from './directory-eligibility.service';

@Module({
  imports:     [GalleryModule],
  controllers: [PhotographerProfilesController],
  providers:   [PhotographerProfilesService, DirectoryEligibilityService],
  exports:     [PhotographerProfilesService, DirectoryEligibilityService],
})
export class PhotographerProfilesModule {}
