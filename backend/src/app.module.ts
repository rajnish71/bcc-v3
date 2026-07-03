// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './modules/identity/auth/auth.module';
import { RbacModule } from './modules/identity/rbac/rbac.module';
import { RegistrationModule } from './modules/identity/registration/registration.module';
import { MembershipModule } from './modules/membership/membership.module';

@Module({
  imports: [AuthModule, RbacModule, RegistrationModule, MembershipModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
