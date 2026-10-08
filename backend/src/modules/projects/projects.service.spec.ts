// getContributors(): contributors carry canonical post-nominals sourced solely
// from getPublicDistinctions() (display_code ?? code already applied there).

let mockRows: Array<Record<string, unknown>> = [];
jest.mock('kysely', () => ({
  sql: () => ({ execute: async () => ({ rows: mockRows }) }),
}));
jest.mock('../../database/db', () => ({ db: {} }));
jest.mock('../shared/storage/imagekit.util', () => ({
  ikUrl: (k: string) => `ik/${k}`,
  AVATAR_DELIVERY_TR: 'tr',
}));
const mockGetPublic = jest.fn();
jest.mock('../identity/distinctions/photographic-distinction-public', () => ({
  getPublicDistinctions: (...a: unknown[]) => mockGetPublic(...a),
}));

import { ProjectsService } from './projects.service';

const d = (code: string) => ({ institutionCode: 'X', institutionName: 'X', code, name: code });
const r = (id: number) => ({ user_id: String(id), username: `u${id}`, full_name: `U${id}`, avatar_r2_key: null, photo_count: '3' });

describe('ProjectsService.getContributors() post-nominals', () => {
  it('maps multiple, single and no distinctions; passes all ids to the canonical reader', async () => {
    mockRows = [r(1), r(2), r(3)];
    mockGetPublic.mockResolvedValue(new Map([
      [1, [d('AFIAP'), d('CROWN3')]],
      [2, [d('PPSA')]],
      [3, []],
    ]));
    const { contributors } = await new ProjectsService().getContributors('birds');
    expect(mockGetPublic).toHaveBeenCalledWith([1, 2, 3]);
    expect(contributors.map(c => c.postNominals)).toEqual([['AFIAP', 'CROWN3'], ['PPSA'], []]);
    expect(contributors[0]).toMatchObject({ userId: 1, username: 'u1', name: 'U1', photoCount: 3, avatarUrl: null });
  });

  it('returns canonical codes verbatim with no duplicates introduced; missing user -> []', async () => {
    mockRows = [r(1), r(9)];
    mockGetPublic.mockResolvedValue(new Map([[1, [d('GPU Grand Master'), d('Aphrodite')]]]));
    const { contributors } = await new ProjectsService().getContributors('birds');
    expect(contributors[0].postNominals).toEqual(['GPU Grand Master', 'Aphrodite']);
    expect(new Set(contributors[0].postNominals).size).toBe(2);
    expect(contributors[1].postNominals).toEqual([]);
  });
});
