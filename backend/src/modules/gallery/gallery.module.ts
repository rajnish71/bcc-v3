// backend/src/modules/gallery/gallery.module.ts
//
// Imports:
//   AuthModule     -- provides AccessTokenGuard (required for @UseGuards)
//   StorageModule  -- provides R2Service (presign + HEAD object)
//   RbacModule     -- provides RbacGuard + RbacService for spotlight admin endpoint

import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { RbacModule } from '../identity/rbac/rbac.module';
import { StorageModule } from '../shared/storage/storage.module';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';

@Module({
  imports: [AuthModule, RbacModule, StorageModule],
  controllers: [GalleryController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
