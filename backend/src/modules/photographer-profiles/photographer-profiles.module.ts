// backend/src/modules/photographer-profiles/photographer-profiles.module.ts
//
// Module 06 -- Photographer Profiles & Portfolios
// Provides the public photographer directory and profile endpoints.

import { Module } from '@nestjs/common';
import { GalleryModule } from '../gallery/gallery.module';
import { PhotographerProfilesController } from './photographer-profiles.controller';
import { PhotographerProfilesService }    from './photographer-profiles.service';

@Module({
  imports:     [GalleryModule],
  controllers: [PhotographerProfilesController],
  providers:   [PhotographerProfilesService],
  exports:     [PhotographerProfilesService],
})
export class PhotographerProfilesModule {}
