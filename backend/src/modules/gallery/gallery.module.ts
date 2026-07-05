// backend/src/modules/gallery/gallery.module.ts
import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { StorageModule } from '../shared/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [GalleryController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
