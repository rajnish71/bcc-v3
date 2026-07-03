// backend/src/modules/identity/rbac/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Marks a route as requiring one or more RBAC permission_keys. RbacGuard
 * reads this metadata; a user needs ALL listed keys (AND, not OR) -- if a
 * route ever needs OR semantics, that's a deliberate future addition, not
 * this decorator's default.
 *
 * Must be paired with AccessTokenGuard running first, e.g.:
 *   @UseGuards(AccessTokenGuard, RbacGuard)
 *   @RequirePermissions('identity.user.create')
 */
export const RequirePermissions = (...permissionKeys: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissionKeys);
