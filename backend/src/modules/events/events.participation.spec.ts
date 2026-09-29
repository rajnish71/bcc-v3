// Stage 1 review: participation is by Registered User; membership is consulted
// only where eligibility requires it; paid (FLAT) Activities never confirm.

jest.mock('kysely', () => ({ sql: () => ({}) }));
// Chainable query stub: every builder call returns itself; terminal calls
// resolve to `undefined` (no membership / no invite / no row).
const insertInto = jest.fn();
jest.mock('../../database/db', () => {
  const chain: any = new Proxy(function () {}, {
    get: (_t, prop) =>
      prop === 'executeTakeFirst' || prop === 'execute'
        ? async () => undefined
        : () => chain,
  });
  return { db: { selectFrom: () => chain, insertInto: (...a: unknown[]) => insertInto(...a) } };
});
jest.mock('../shared/storage/imagekit.util', () => ({ ikUrl: () => null }));
jest.mock('../shared/communication/communication.service', () => ({
  CommunicationService: class {},
}));

import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';

const svc = () => new EventsService({ dispatch: jest.fn() } as any);
const withEvent = (s: EventsService, ev: Record<string, unknown>) =>
  jest.spyOn(s as any, 'loadEvent').mockResolvedValue({ state: 'PUBLISHED', fee_type: 'FREE', eligibility_mode: 'OPEN', is_historical: 0, ...ev });

describe('registration endpoint identity', () => {
  it('requires an authenticated user (no anonymous registration)', () => {
    const guards = Reflect.getMetadata('__guards__', EventsController.prototype.register) ?? [];
    expect(guards).toContain(AccessTokenGuard);
  });

  it('takes the actor id only -- no guest_* input exists', () => {
    expect(EventsService.prototype.registerForEvent.length).toBe(2);
  });
});

describe('membership is consulted only where eligibility requires it', () => {
  it('OPEN never queries membership (db stub would throw / return none)', async () => {
    await expect((svc() as any).assertEligibility({ id: 1, eligibility_mode: 'OPEN', allowed_class_ids: null }, 7)).resolves.toBeUndefined();
  });

  it('MEMBERS_ONLY rejects a Registered User with no active membership', async () => {
    await expect((svc() as any).assertEligibility({ id: 1, eligibility_mode: 'MEMBERS_ONLY', allowed_class_ids: null }, 7)).rejects.toThrow(ForbiddenException);
  });

  it('INVITE_ONLY rejects a user not on the invite list', async () => {
    await expect((svc() as any).assertEligibility({ id: 1, eligibility_mode: 'INVITE_ONLY', allowed_class_ids: null }, 7)).rejects.toThrow(ForbiddenException);
  });
});

describe('registration guards', () => {
  beforeEach(() => insertInto.mockClear());

  it('refuses FLAT Activities and writes nothing', async () => {
    const s = svc();
    withEvent(s, { fee_type: 'FLAT' });
    await expect(s.registerForEvent(1, 7)).rejects.toThrow(ConflictException);
    expect(insertInto).not.toHaveBeenCalled();
  });

  it('refuses historical Activities and writes nothing', async () => {
    const s = svc();
    withEvent(s, { is_historical: 1, state: 'COMPLETED' });
    await expect(s.registerForEvent(1, 7)).rejects.toThrow(BadRequestException);
    expect(insertInto).not.toHaveBeenCalled();
  });

  it('never promotes a waitlisted row on a paid Activity', async () => {
    const s = svc();
    withEvent(s, { fee_type: 'FLAT', capacity: 5 });
    const count = jest.spyOn(s as any, 'countActiveRegistrations');
    await (s as any).promoteWaitlist(1);
    expect(count).not.toHaveBeenCalled(); // guard returns before any promotion work
  });
});
