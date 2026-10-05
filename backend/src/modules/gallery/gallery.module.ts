// backend/src/modules/gallery/gallery.module.ts
//
// Imports:
//   AuthModule     -- provides AccessTokenGuard (required for @UseGuards)
//   StorageModule  -- provides R2Service (presign + HEAD + delete object)
//   RbacModule     -- provides RbacGuard + RbacService for admin endpoints
//                     (spotlight, photo hard delete)

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { MembershipModule } from '../membership/membership.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { StorageModule } from '../shared/storage/storage.module';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { PortfolioExposureService } from './portfolio-exposure.service';
import { PhotoHardDeleteService } from './photo-hard-delete.service';

@Module({
  imports: [AuthModule, RbacModule, StorageModule, MembershipModule],
  controllers: [GalleryController],
  providers: [GalleryService, PortfolioExposureService, PhotoHardDeleteService],
  exports: [GalleryService, PortfolioExposureService],
})
export class GalleryModule {}
