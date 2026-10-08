// backend/src/modules/identity/auth/access-token.guard.ts
//
// Verifies the access JWT by signature only -- deliberately no DB lookup
// here. This is the whole point of the JWT half of the auth strategy: most
// authenticated requests cost zero database round-trips. Revocation is
// handled at the refresh-token layer (AuthService.refresh/logout), not here
// -- a revoked user stays "valid" for at most the access token's 15-minute
// lifetime, which is the accepted tradeoff of this strategy.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ALLOW_FORCED_PASSWORD_RESET } from './allow-forced-password-reset.decorator';
import { AccessTokenPayload } from './token.util';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    // Optional so the guard can still be constructed without DI; without a
    // Reflector no route is exempt, i.e. a forced-reset session fails closed.
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: process.env.JWT_ACCESS_SECRET },
      );

      if (payload.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active');
      }

    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // force_password_reset: the session is valid but restricted to the routes
    // that complete the mandatory password change (signature-only, no DB hit).
    if (payload.fpr === true) {
      const allowed = this.reflector?.getAllAndOverride<boolean>(
        ALLOW_FORCED_PASSWORD_RESET,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'You must change your password before continuing.',
        });
      }
    }

    request.user = payload;
    return true;
  }
}
