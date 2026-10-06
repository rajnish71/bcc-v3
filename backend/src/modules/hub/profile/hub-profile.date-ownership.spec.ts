// backend/src/modules/hub/profile/hub-profile.date-ownership.spec.ts
//
// Membership Date / Tenure Architecture -- Batch 1 (HA B1–B3, 2026-10-06).
//
// HubProfileService.updateProfile() is an identity/profile operation only.
// Saving yearJoinedBcc (or smuggling membership fields into the payload)
// must never write the memberships table -- join_year, join_month,
// membership_number, number_serial and tenure data stay owned by the
// membership lifecycle / MembershipNumberingService.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));

import { db } from '../../../database/db';
import type { FakeDb } from '../../../test-support/fake-db';
import type { R2Service } from '../../shared/storage/r2.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { HubProfileService } from './hub-profile.service';

const fake = db as unknown as FakeDb;

describe('HubProfileService.updateProfile() -- membership date isolation', () => {
  const service = new HubProfileService({} as R2Service);

  beforeEach(() => fake.reset());

  it('saving yearJoinedBcc writes only users.year_joined_bcc, never memberships', async () => {
    await service.updateProfile(42, { yearJoinedBcc: 2015 } as UpdateProfileDto);

    expect(fake.writes('memberships')).toHaveLength(0);
    const userWrites = fake.writes('users', 'update');
    expect(userWrites).toHaveLength(1);
    expect(userWrites[0].set).toEqual({ year_joined_bcc: 2015 });
  });

  it('clearing yearJoinedBcc (null) does not touch memberships either', async () => {
    await service.updateProfile(42, { yearJoinedBcc: null } as unknown as UpdateProfileDto);
    expect(fake.writes('memberships')).toHaveLength(0);
  });

  it('a full profile save with yearJoinedBcc makes no memberships write of any kind', async () => {
    await service.updateProfile(42, {
      yearJoinedBcc: 2011, city: 'Bhopal', bio: '<p>hi</p>', tagline: 'Light chaser',
    } as UpdateProfileDto);
    expect(fake.committed.filter((op) => op.table === 'memberships')).toHaveLength(0);
  });

  it('membership number / date fields in the payload cannot reach any table', async () => {
    await service.updateProfile(42, {
      yearJoinedBcc: 2012,
      membership_number: 'BCC20120100099',
      membershipNumber: 'BCC20120100099',
      join_year: 2012, join_month: 1, joinYear: 2012, joinMonth: 1,
      number_serial: 99, number_assigned_at: '2012-01-01 00:00:00',
    } as unknown as UpdateProfileDto);

    expect(fake.writes('memberships')).toHaveLength(0);
    const set = fake.writes('users', 'update')[0].set!;
    for (const key of ['membership_number', 'join_year', 'join_month', 'number_serial', 'number_assigned_at']) {
      expect(set).not.toHaveProperty(key);
    }
  });

  it('future yearJoinedBcc is still rejected and nothing is written', async () => {
    await expect(
      service.updateProfile(42, { yearJoinedBcc: new Date().getFullYear() + 1 } as UpdateProfileDto),
    ).rejects.toThrow('Year joined BCC cannot be in the future');
    expect(fake.committed).toHaveLength(0);
  });
});
