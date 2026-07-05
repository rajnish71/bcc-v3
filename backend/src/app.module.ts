import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './modules/identity/auth/auth.module';
import { RbacModule } from './modules/identity/rbac/rbac.module';
import { RegistrationModule } from './modules/identity/registration/registration.module';
import { UsersModule } from './modules/identity/users/users.module';
import { MembershipModule } from './modules/membership/membership.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { EventsModule } from './modules/events/events.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { PhotographerProfilesModule } from './modules/photographer-profiles/photographer-profiles.module';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    RegistrationModule,
    UsersModule,
    MembershipModule,
    NotificationModule,
    EventsModule,
    GalleryModule,
    PhotographerProfilesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
