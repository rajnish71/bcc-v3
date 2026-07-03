// backend/src/modules/identity/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccessTokenGuard } from './access-token.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard],
  // Re-exporting JwtModule (not just AccessTokenGuard) matters here -- any
  // module that imports AuthModule to use AccessTokenGuard in its own
  // @UseGuards() also needs JwtService resolvable in ITS OWN injector
  // context, since Nest instantiates a class passed to @UseGuards() using
  // the consuming module's container. Exporting only the guard class left
  // RbacModule and RegistrationModule unable to resolve JwtService --
  // caught via a crash-looping PM2 process, fixed same session.
  exports: [AuthService, AccessTokenGuard, JwtModule],
})
export class AuthModule {}
