import { Module } from '@nestjs/common';
import { AuthModule } from '../../identity/auth/auth.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { PhotographerProfilesModule } from '../../photographer-profiles/photographer-profiles.module';
import { HubProfileController } from './hub-profile.controller';
import { HubProfileService } from './hub-profile.service';

@Module({
  imports: [AuthModule, StorageModule, PhotographerProfilesModule],
  controllers: [HubProfileController],
  providers: [HubProfileService],
})
export class HubProfileModule {}
