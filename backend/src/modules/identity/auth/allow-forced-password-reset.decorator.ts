// backend/src/modules/identity/auth/allow-forced-password-reset.decorator.ts
//
// Marks a route as reachable by a session whose account is in the
// force_password_reset mandatory-action state (access token claim `fpr`).
// Only the routes needed to finish the mandatory password change carry it;
// every other AccessTokenGuard route refuses such a session.

import { SetMetadata } from '@nestjs/common';

export const ALLOW_FORCED_PASSWORD_RESET = 'allowForcedPasswordReset';
export const AllowForcedPasswordReset = () => SetMetadata(ALLOW_FORCED_PASSWORD_RESET, true);
