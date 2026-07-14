// backend/src/modules/gallery/gallery.controller.ts
//
// REST surface for Module 05 Photography Gallery & Digital Archive.
//
// PUBLIC endpoints (no auth guard):
//   GET  /api/v1/gallery/feed                  public photo feed
//   GET  /api/v1/gallery/photographer/:userId  photographer's gallery
//   GET  /api/v1/gallery/tags                  tag taxonomy
//   GET  /api/v1/gallery/photos/:uuid          single photo (visibility gated in service)
//
// AUTHENTICATED (AccessTokenGuard only -- member check inside service):
//   POST   /api/v1/gallery/photos/presign          request R2 presign URL
//   POST   /api/v1/gallery/photos/:uuid/confirm    confirm upload + store EXIF
//   GET    /api/v1/gallery/photos                  list own photos
//   PATCH  /api/v1/gallery/photos/:uuid            update metadata
//   DELETE /api/v1/gallery/photos/:uuid            soft delete
//   POST   /api/v1/gallery/photos/:uuid/tags/:tagId   assign tag
//   DELETE /api/v1/gallery/photos/:uuid/tags/:tagId   remove tag
//   GET    /api/v1/gallery/photos/:uuid/tags          list photo's tags
//
//   POST   /api/v1/gallery/albums                    create album
//   GET    /api/v1/gallery/albums                    list own albums
//   GET    /api/v1/gallery/albums/:uuid              album detail + photos
//   PATCH  /api/v1/gallery/albums/:uuid              update album
//   DELETE /api/v1/gallery/albums/:uuid              delete album
//   POST   /api/v1/gallery/albums/:uuid/photos       add photo to album
//   DELETE /api/v1/gallery/albums/:uuid/photos/:photoUuid remove from album

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { AccessTokenGuard } from '../identity/auth/access-token.guard';
import { RbacGuard } from '../identity/rbac/rbac.guard';
import { RequirePermissions } from '../identity/rbac/permissions.decorator';
import type { PresignPhotoDto } from './dto/presign-photo.dto';
import type { ConfirmPhotoDto } from './dto/confirm-photo.dto';
import type { UpdatePhotoDto } from './dto/update-photo.dto';
import type { CreateAlbumDto, UpdateAlbumDto, AddPhotoToAlbumDto } from './dto/album.dto';

@Controller('api/v1/gallery')
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  // =========================================================================
  // PUBLIC -- no auth required
  // =========================================================================

  /** Public photo feed (PUBLIC visibility only). */
  @Get('feed')
  async publicFeed(
    @Query('genre')  genre?: string,
    @Query('tag')    tag?: string,
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
    @Query('shuffle') shuffle?: string,
  ) {
    return this.gallery.getPublicFeed({
      genre,
      tag,
      limit:   limit   ? parseInt(limit, 10)  : 20,
      offset:  offset  ? parseInt(offset, 10) : 0,
      shuffle: shuffle !== 'false',
    });
  }

  /** Photographer's gallery (visibility enforced by service). */
  @Get('photographer/:userId')
  async photographerGallery(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
    @Query('genre')  genre?: string,
    @Query('tag')    tag?: string,
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
  ) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getPhotographerGallery(requestingUserId, userId, {
      genre,
      tag,
      limit:  limit  ? parseInt(limit, 10)  : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /** Current homepage spotlight photo (admin-curated). Returns 404 if none set. */
  @Get('spotlight')
  async getSpotlight() {
    const spotlight = await this.gallery.getSpotlight();
    if (!spotlight) throw new NotFoundException('No spotlight configured.');
    return spotlight;
  }

  /** Set the homepage spotlight — admin only. */
  @UseGuards(AccessTokenGuard, RbacGuard)
  @RequirePermissions('gallery.spotlight.set')
  @HttpCode(HttpStatus.OK)
  @Put('spotlight')
  async setSpotlight(
    @Body() body: { photo_uuid: string; title_override?: string | null; credit_override?: string | null },
    @Req() req: any,
  ) {
    await this.gallery.setSpotlight(req.user.sub, body.photo_uuid, body.title_override, body.credit_override);
    return { ok: true };
  }

  /** Tag taxonomy list. */
  @Get('tags')
  async getTags(@Query('category') category?: string) {
    return this.gallery.getTags(category);
  }

  /** Distinct GENRE tags present on PUBLIC photos — Showcase filter chips (item 76). */
  @Get('genres')
  async getPublicGenres() {
    return this.gallery.getPublicGenres();
  }

  /** Distinct GENRE tags present on a photographer's visible photos (item 76). */
  @Get('photographer/:userId/genres')
  async getPhotographerGenres(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
  ) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getPhotographerGenres(requestingUserId, userId);
  }

  /** All public photo IDs — used by getStaticPaths() at build time. */
  @Get('photos/all-ids')
  async getAllPhotoIds() {
    return this.gallery.getAllPhotoIds();
  }

  /** Single photo by numeric DB ID (short URL support). */
  @Get('photos/by-id/:id')
  async getPhotoById(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getPhotoByNumericId(requestingUserId, id);
  }

  /** Single photo by UUID (visibility enforced in service). */
  @Get('photos/:uuid')
  async getPhoto(@Param('uuid') uuid: string, @Req() req: any) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getPhoto(requestingUserId, uuid);
  }

  /** Reaction counts + requesting user's own reactions for a photo. */
  @Get('photos/:uuid/reactions')
  async getReactions(@Param('uuid') uuid: string, @Req() req: any) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getReactions(uuid, requestingUserId);
  }

  /** Toggle a reaction (LIKE, FAVOURITE, BOOKMARK) — authenticated. */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @Post('photos/:uuid/reactions')
  async toggleReaction(
    @Param('uuid') uuid: string,
    @Body() body: { type: 'LIKE' | 'FAVOURITE' | 'BOOKMARK' },
    @Req() req: any,
  ) {
    return this.gallery.toggleReaction(req.user.sub, uuid, body.type);
  }

  /** Public comment list for a photo. */
  @Get('photos/:uuid/comments')
  async listComments(
    @Param('uuid') uuid: string,
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gallery.listComments(uuid, {
      limit:  limit  ? parseInt(limit, 10)  : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /** Post a comment — authenticated. */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post('photos/:uuid/comments')
  async addComment(
    @Param('uuid') uuid: string,
    @Body() body: { body: string },
    @Req() req: any,
  ) {
    return this.gallery.addComment(req.user.sub, uuid, body.body);
  }

  /** Photos by same photographer (excluding this photo). */
  @Get('photos/:uuid/related/photographer')
  async relatedByPhotographer(
    @Param('uuid') uuid: string,
    @Query('limit') limit?: string,
  ) {
    return this.gallery.getRelatedByPhotographer(uuid, limit ? parseInt(limit, 10) : 6);
  }

  /** Containers (albums/events) this photo appears in. */
  @Get('photos/:uuid/containers')
  async getContainers(@Param('uuid') uuid: string) {
    return this.gallery.getPhotoContainers(uuid);
  }

  /** Record a canonical page view — called once per page load. No auth required. */
  @HttpCode(HttpStatus.OK)
  @Post('photos/:uuid/view')
  async recordView(@Param('uuid') uuid: string) {
    return this.gallery.recordView(uuid);
  }

  // =========================================================================
  // AUTHENTICATED -- photos
  // =========================================================================

  /**
   * Step 1: Request presigned R2 PUT URL.
   * Returns photo_uuid, r2_key, presign_url, expires_seconds.
   * Client should PUT the file binary directly to presign_url.
   */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post('photos/presign')
  async presign(@Body() dto: PresignPhotoDto, @Req() req: any) {
    return this.gallery.presignUpload(req.user.sub, dto);
  }

  /**
   * Step 3: Confirm upload complete.
   * Backend HEADs R2, stores EXIF and metadata, activates photo.
   */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @Post('photos/:uuid/confirm')
  async confirm(
    @Param('uuid') uuid: string,
    @Body() dto: ConfirmPhotoDto,
    @Req() req: any,
  ) {
    return this.gallery.confirmUpload(req.user.sub, uuid, dto);
  }

  /** List the authenticated user's own photos. */
  @UseGuards(AccessTokenGuard)
  @Get('photos')
  async listOwnPhotos(
    @Req() req: any,
    @Query('genre')  genre?: string,
    @Query('tag')    tag?: string,
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gallery.listPhotos(req.user.sub, {
      owner_user_id: req.user.sub,
      genre,
      tag,
      limit:  limit  ? parseInt(limit, 10)  : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /** Update photo metadata (title, caption, genre, visibility). */
  @UseGuards(AccessTokenGuard)
  @Patch('photos/:uuid')
  async updatePhoto(
    @Param('uuid') uuid: string,
    @Body() dto: UpdatePhotoDto,
    @Req() req: any,
  ) {
    return this.gallery.updatePhoto(req.user.sub, uuid, dto);
  }

  /** Soft-delete a photo. */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('photos/:uuid')
  async deletePhoto(@Param('uuid') uuid: string, @Req() req: any) {
    await this.gallery.deletePhoto(req.user.sub, uuid);
  }

  // =========================================================================
  // AUTHENTICATED -- photo tags
  // =========================================================================

  @UseGuards(AccessTokenGuard)
  @Get('photos/:uuid/tags')
  async getPhotoTags(@Param('uuid') uuid: string, @Req() req: any) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getPhotoTags(requestingUserId, uuid);
  }

  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('photos/:uuid/tags/:tagId')
  async assignTag(
    @Param('uuid') uuid: string,
    @Param('tagId', ParseIntPipe) tagId: number,
    @Req() req: any,
  ) {
    await this.gallery.assignTag(req.user.sub, uuid, tagId);
  }

  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('photos/:uuid/tags/:tagId')
  async removeTag(
    @Param('uuid') uuid: string,
    @Param('tagId', ParseIntPipe) tagId: number,
    @Req() req: any,
  ) {
    await this.gallery.removeTag(req.user.sub, uuid, tagId);
  }

  // =========================================================================
  // AUTHENTICATED -- albums
  // =========================================================================

  /** Create a new member-created album. */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post('albums')
  async createAlbum(@Body() dto: CreateAlbumDto, @Req() req: any) {
    return this.gallery.createAlbum(req.user.sub, dto);
  }

  /** List a user's albums (own albums, or another user's public/members-only). */
  @Get('albums/user/:userId')
  async listAlbums(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
  ) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.listAlbums(requestingUserId, userId);
  }

  /** List authenticated user's own albums. */
  @UseGuards(AccessTokenGuard)
  @Get('albums')
  async listOwnAlbums(@Req() req: any) {
    return this.gallery.listAlbums(req.user.sub, req.user.sub);
  }

  /** Album detail with paginated photos. */
  @Get('albums/:uuid')
  async getAlbum(
    @Param('uuid') uuid: string,
    @Req() req: any,
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
  ) {
    const requestingUserId: number | null = req.user?.sub ?? null;
    return this.gallery.getAlbum(requestingUserId, uuid, {
      limit:  limit  ? parseInt(limit, 10)  : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /** Update album metadata. */
  @UseGuards(AccessTokenGuard)
  @Patch('albums/:uuid')
  async updateAlbum(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateAlbumDto,
    @Req() req: any,
  ) {
    return this.gallery.updateAlbum(req.user.sub, uuid, dto);
  }

  /** Delete album (photos are NOT deleted; only the album wrapper is removed). */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('albums/:uuid')
  async deleteAlbum(@Param('uuid') uuid: string, @Req() req: any) {
    await this.gallery.deleteAlbum(req.user.sub, uuid);
  }

  /** Add a photo to an album. */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('albums/:uuid/photos')
  async addPhoto(
    @Param('uuid') albumUuid: string,
    @Body() dto: AddPhotoToAlbumDto,
    @Req() req: any,
  ) {
    await this.gallery.addPhotoToAlbum(req.user.sub, albumUuid, dto);
  }

  /** Remove a photo from an album (photo is not deleted). */
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('albums/:uuid/photos/:photoUuid')
  async removePhoto(
    @Param('uuid') albumUuid: string,
    @Param('photoUuid') photoUuid: string,
    @Req() req: any,
  ) {
    await this.gallery.removePhotoFromAlbum(req.user.sub, albumUuid, photoUuid);
  }
}
