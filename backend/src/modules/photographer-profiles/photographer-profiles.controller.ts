// backend/src/modules/photographer-profiles/photographer-profiles.controller.ts
//
// Module 06 -- Photographer Profiles & Portfolios
//
// PUBLIC endpoints (no auth required):
//   GET /api/v1/photographers              - photographer directory
//   GET /api/v1/photographers/stats        - live directory statistics
//   GET /api/v1/photographers/:username    - photographer profile by username
//
// Photo delivery for the profile page uses the existing gallery endpoint:
//   GET /api/v1/gallery/photographer/:userId  (numeric userId from profile response)
//
// These endpoints do not require authentication. MEMBERS_ONLY profile
// visibility is currently treated as non-public (returns 404).

import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PhotographerProfilesService } from './photographer-profiles.service';
import { parseDirectoryFilter, parseDirectorySort, parseSeed } from './directory-listing.policy';

@Controller('api/v1/photographers')
export class PhotographerProfilesController {
  constructor(private readonly svc: PhotographerProfilesService) {}

  /**
   * GET /api/v1/photographers
   * Photographer directory. Returns active members with PUBLIC profile visibility
   * who meet the directory eligibility rule (directory-eligibility.policy.ts).
   *
   * Query params (vocabulary: directory-listing.policy.ts):
   *   limit  (default 40, max 100)
   *   offset (default 0)
   *   filter 'all' | 'active' | 'legacy' | 'honorary' | 'distinctions'  (default 'all')
   *   sort   'random' | 'newest' | 'earliest' | 'photos_desc' | 'photos_asc'
   *          | 'name_asc' | 'name_desc'  (default 'name_asc'; legacy
   *          'name' | 'photos' | 'joined' still accepted)
   *   seed   random-order seed (1..2147483646). Omitted with sort=random:
   *          the server picks one and returns it in meta.seed -- pass it back
   *          on later pages so the order stays stable across pagination.
   *   genre  optional genre filter (only photographers with photos in that genre)
   */
  @Get()
  async listPhotographers(
    @Query('limit')  limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('sort')   sortRaw?: string,
    @Query('filter') filterRaw?: string,
    @Query('seed')   seedRaw?: string,
    @Query('genre')  genre?: string,
    @Query('hasApprovedPhotos') hasApprovedPhotosStr?: string,
  ) {
    const limit  = Math.min(parseInt(limitStr  ?? '40', 10) || 40, 100);
    const offset = Math.max(parseInt(offsetStr ?? '0',  10) || 0,  0);
    const hasApprovedPhotos = hasApprovedPhotosStr === 'true';

    return this.svc.listPhotographers({
      limit,
      offset,
      sort:   parseDirectorySort(sortRaw),
      filter: parseDirectoryFilter(filterRaw),
      seed:   parseSeed(seedRaw),
      genre,
      hasApprovedPhotos,
    });
  }

  /**
   * GET /api/v1/photographers/stats
   * Live directory statistics (Total Members, Active Portfolios, Photos in
   * Showcase). Independent of directory filter/sort. Declared before
   * ':username' so the static segment wins.
   */
  @Get('stats')
  async directoryStats() {
    return this.svc.getDirectoryStats();
  }

  /**
   * GET /api/v1/photographers/profile-paths
   * Usernames of every PUBLIC photographer profile, for the static build of
   * /photographers/:username/. Independent of directory eligibility, which
   * gates the directory LISTING only. Declared before ':username' so the
   * static segment wins.
   */
  @Get('profile-paths')
  async listProfilePaths() {
    return this.svc.listProfilePaths();
  }

  /**
   * GET /api/v1/photographers/:username
   * Photographer profile detail by username slug.
   * Response includes numeric `id` so the client can call:
   *   GET /api/v1/gallery/photographer/:id  for the photo grid.
   */
  @Get(':username')
  async getPhotographer(@Param('username') username: string) {
    if (!username || username.length > 30) throw new NotFoundException('Photographer not found.');
    return this.svc.getPhotographer(username);
  }
}
