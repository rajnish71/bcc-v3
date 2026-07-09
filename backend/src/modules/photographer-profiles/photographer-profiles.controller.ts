// backend/src/modules/photographer-profiles/photographer-profiles.controller.ts
//
// Module 06 -- Photographer Profiles & Portfolios
//
// PUBLIC endpoints (no auth required):
//   GET /api/v1/photographers              - photographer directory
//   GET /api/v1/photographers/:username    - photographer profile by username
//
// Photo delivery for the profile page uses the existing gallery endpoint:
//   GET /api/v1/gallery/photographer/:userId  (numeric userId from profile response)
//
// These endpoints do not require authentication. MEMBERS_ONLY profile
// visibility is currently treated as non-public (returns 404).

import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PhotographerProfilesService } from './photographer-profiles.service';

type SortParam = 'name' | 'photos' | 'joined';
const VALID_SORTS: SortParam[] = ['name', 'photos', 'joined'];

@Controller('api/v1/photographers')
export class PhotographerProfilesController {
  constructor(private readonly svc: PhotographerProfilesService) {}

  /**
   * GET /api/v1/photographers
   * Photographer directory. Returns active members with PUBLIC profile visibility.
   *
   * Query params:
   *   limit  (default 40, max 100)
   *   offset (default 0)
   *   sort   'name' | 'photos' | 'joined'  (default 'name')
   *   genre  optional genre filter (only photographers with photos in that genre)
   */
  @Get()
  async listPhotographers(
    @Query('limit')  limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('sort')   sortRaw?: string,
    @Query('genre')  genre?: string,
    @Query('hasApprovedPhotos') hasApprovedPhotosStr?: string,
  ) {
    const limit  = Math.min(parseInt(limitStr  ?? '40', 10) || 40, 100);
    const offset = Math.max(parseInt(offsetStr ?? '0',  10) || 0,  0);
    const sort: SortParam = VALID_SORTS.includes(sortRaw as SortParam)
      ? (sortRaw as SortParam)
      : 'name';
    const hasApprovedPhotos = hasApprovedPhotosStr === 'true';

    return this.svc.listPhotographers({ limit, offset, sort, genre, hasApprovedPhotos });
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
