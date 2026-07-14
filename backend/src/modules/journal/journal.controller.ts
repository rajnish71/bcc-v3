// backend/src/modules/journal/journal.controller.ts
//
// REST surface for the Journal module.
//
// PUBLIC (no auth):
//   GET  /api/v1/journal              list PUBLISHED posts
//   GET  /api/v1/journal/:slug        get PUBLISHED post by slug
//
// ADMIN (AccessTokenGuard + RbacGuard):
//   GET    /api/v1/journal/admin/all       list posts at any status  [journal.update_any]
//   POST   /api/v1/journal                 create DRAFT post          [journal.create]
//   PATCH  /api/v1/journal/:id             update any post            [journal.update_any]
//   POST   /api/v1/journal/:id/publish     publish a DRAFT post       [journal.publish]
//   POST   /api/v1/journal/:id/archive     archive a PUBLISHED post   [journal.archive]
//   DELETE /api/v1/journal/:id             delete a post              [journal.delete_any]
//
// ROUTING NOTE:
//   GET /admin/all is declared BEFORE GET /:slug to prevent the router
//   treating the literal string "admin" as a slug param.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JournalService } from './journal.service';
import { CreateJournalPostDto } from './dto/create-journal-post.dto';
import { UpdateJournalPostDto } from './dto/update-journal-post.dto';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';

@Controller('api/v1/journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  // =========================================================================
  // PUBLIC
  // =========================================================================

  /** List PUBLISHED posts. Optionally filter by category. */
  @Get()
  async listPosts(
    @Query('category') category?: string,
    @Query('limit')    limit?: string,
    @Query('offset')   offset?: string,
  ) {
    return this.journal.listPosts({
      category,
      limit:  limit  ? parseInt(limit,  10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /** List PUBLISHED posts by a given author — for the photographer profile
   *  (item 53). Declared before /:slug so "author" is not treated as a slug. */
  @Get('author/:userId')
  async listByAuthor(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: string,
  ) {
    return this.journal.listByAuthor(userId, limit ? parseInt(limit, 10) : 12);
  }

  // =========================================================================
  // ADMIN — declared BEFORE /:slug to prevent routing collision
  // =========================================================================

  /** List all posts regardless of status (DRAFT, PUBLISHED, ARCHIVED). */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('journal.update_any')
  @Get('admin/all')
  async adminListPosts(
    @Query('status')   status?: string,
    @Query('category') category?: string,
    @Query('limit')    limit?: string,
    @Query('offset')   offset?: string,
  ) {
    return this.journal.adminListPosts({
      status,
      category,
      limit:  limit  ? parseInt(limit,  10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /** Create a new journal post (starts as DRAFT). */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('journal.create')
  @Post()
  async createPost(@Body() dto: CreateJournalPostDto, @Req() req: any) {
    return this.journal.createPost(dto, req.user.sub);
  }

  /** Update any post — title, body, hero image, category, tags, SEO fields. */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('journal.update_any')
  @Patch(':id')
  async updatePost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJournalPostDto,
    @Req() req: any,
  ) {
    return this.journal.updatePost(id, dto, req.user.sub);
  }

  /** Publish a DRAFT post (DRAFT → PUBLISHED). */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('journal.publish')
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  async publishPost(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.journal.publishPost(id, req.user.sub);
  }

  /** Archive a PUBLISHED post (PUBLISHED → ARCHIVED). */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('journal.archive')
  @HttpCode(HttpStatus.OK)
  @Post(':id/archive')
  async archivePost(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.journal.archivePost(id, req.user.sub);
  }

  /** Permanently delete a post. */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('journal.delete_any')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async deletePost(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.journal.deletePost(id, req.user.sub);
  }

  // =========================================================================
  // PUBLIC — :slug MUST come after all literal path segments above
  // =========================================================================

  /** Get a single PUBLISHED post by slug. */
  @Get(':slug')
  async getPostBySlug(@Param('slug') slug: string) {
    return this.journal.getPostBySlug(slug);
  }
}
