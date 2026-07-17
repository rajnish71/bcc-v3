// backend/src/modules/projects/projects.controller.ts
//
// Public endpoints for Special Project data — stats and contributors.
// No auth required: all data is derived from PUBLIC visibility photos only.

import { Controller, Get, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('api/v1/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** Aggregate statistics for a project (photo count, contributor count, last updated). */
  @Get('stats')
  async getStats(@Query('tag') projectTag?: string) {
    return this.projects.getStats(projectTag ?? '');
  }

  /** All contributors with at least one public photo matching the project tag. */
  @Get('contributors')
  async getContributors(@Query('tag') projectTag?: string) {
    return this.projects.getContributors(projectTag ?? '');
  }
}
