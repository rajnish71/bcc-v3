// backend/src/modules/gallery/gallery.module.ts
//
// Imports:
//   AuthModule     -- provides AccessTokenGuard (required for @UseGuards)
//   StorageModule  -- provides R2Service (presign + HEAD object)
//
// Does NOT import RbacModule: gallery endpoints use owner-check logic
// inside GalleryService, not permission-based RBAC.
// Does NOT import CommunicationModule: no notification triggers in Phase 2a
// (photo upload notifications deferred to Phase 3 with activity feed).

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { StorageModule } from '../shared/storage/storage.module';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [GalleryController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
