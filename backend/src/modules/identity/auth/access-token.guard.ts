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
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenPayload } from './token.util';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: process.env.JWT_ACCESS_SECRET },
      );

      if (payload.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active');
      }

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
