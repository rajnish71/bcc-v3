import { MaintenanceHandler } from './base';
import { AuthHandler } from './auth.handler';
import { MembershipHandler } from './membership.handler';
import { NotificationHandler } from './notification.handler';
import { ProfileHandler } from './profile.handler';
import { PhotoHandler } from './photo.handler';
import { EventHandler } from './event.handler';

export { MaintenanceHandler, DependencyReport } from './base';

export const handlers: MaintenanceHandler[] = [
  new AuthHandler(),
  new MembershipHandler(),
  new NotificationHandler(),
  new ProfileHandler(),
  new PhotoHandler(),
  new EventHandler()
];
