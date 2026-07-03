// backend/src/modules/identity/rbac/rbac.guard.ts
//
// Enforces MEM-006 P3 at the request layer. Reads only user_roles ->
// role_permissions -> permissions (via RbacService) -- no path back to
// membership tables, by construction (see rbac.service.ts header).
//
// Always runs AFTER AccessTokenGuard on a route (AccessTokenGuard populates
// request.user from the JWT; this guard trusts request.user.sub as the
// authenticated identity and does a fresh DB read for current permissions
// -- deliberately not cached in the JWT, since a 15-minute-stale permission
// set is an acceptable tradeoff for login state but not for "can this
// person create accounts on other people's behalf" checks).

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import type { AccessTokenPayload } from '../auth/token.util';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermissions on this route -- nothing for this guard to do.
    // (A route with no permission requirement shouldn't have RbacGuard
    // attached at all, but fail open-to-authenticated rather than crash if
    // it is.)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AccessTokenPayload | undefined = request.user;

    if (!user) {
      // RbacGuard was used without AccessTokenGuard running first -- this
      // is a wiring bug, not a normal auth failure, but the safe response
      // is still "deny".
      throw new UnauthorizedException('No authenticated user on request');
    }

    const heldKeys = await this.rbacService.getActivePermissionKeys(user.sub);
    const missing = requiredPermissions.filter((key) => !heldKeys.has(key));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permission(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
