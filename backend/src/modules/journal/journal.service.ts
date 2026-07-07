// backend/src/modules/journal/journal.service.ts
//
// Module: Journal
//
// LIFECYCLE:
//   DRAFT      — visible only to authenticated users with journal.update_any
//   PUBLISHED  — visible to the public (no auth required)
//   ARCHIVED   — hidden from public listing; accessible via slug for those
//                with the direct URL + journal.update_any permission
//
// AUTHORING:
//   Content Editor, Coordinator, Platform Admin, Super Admin can create,
//   update, publish, and archive posts (seeded in seed_0010_journal_permissions).
//   Delete is restricted to Platform Admin and Super Admin.
//
// SLUG GENERATION:
//   If no slug is provided in the DTO, one is auto-generated from the title
//   plus the first 8 characters of the post UUID.
//
// BODY:
//   Stored as HTML (rich text editor output). The service accepts any
//   HTML string without sanitisation — validation of allowed tags is a
//   future concern for the admin frontend.
//
// RESPONSE SHAPE:
//   Public list:    { data: JournalListItem[];  total: number }
//   Public detail:  { data: JournalDetailItem }
//   Admin list:     { data: JournalAdminItem[]; total: number }
//   Mutations:      { data: JournalDetailItem }
//
// FRONTEND CONTRACT (matched to journal/index.astro + journal/[slug].astro):
//   heroImage   ← hero_image_url
//   pubDate     ← published_at ?? created_at  (ISO 8601)
//   readingTime ← '{N} min'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { toMysqlDatetime } from '../identity/shared/token-hash.util';
import type { CreateJournalPostDto } from './dto/create-journal-post.dto';
import type { UpdateJournalPostDto } from './dto/update-journal-post.dto';
import type { JournalStatus } from '../../database/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string, suffix: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) +
    '-' +
    suffix.slice(0, 8)
  );
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return toDate(v).toISOString();
}

// ---------------------------------------------------------------------------
// Response shape helpers
// ---------------------------------------------------------------------------

function formatList(row: Record<string, unknown>) {
  return {
    id:           row.id,
    uuid:         row.uuid,
    slug:         row.slug,
    title:        row.title,
    description:  row.description ?? null,
    excerpt:      row.excerpt ?? row.description ?? null,
    category:     row.category ?? 'Guide',
    heroImage:    row.hero_image_url ?? null,
    pubDate:      isoOrNull(row.published_at) ?? isoOrNull(row.created_at),
    readingTime:  `${row.reading_time_minutes ?? 5} min`,
    author: {
      name:    row.author_display_name ?? 'Bhopal Camera Club',
      user_id: row.author_user_id ?? null,
    },
    status:       row.status,
    created_at:   isoOrNull(row.created_at),
    updated_at:   isoOrNull(row.updated_at),
  };
}

function formatDetail(row: Record<string, unknown>) {
  return {
    ...formatList(row),
    body:            row.body,
    tags:            row.tags ? JSON.parse(row.tags as string) : [],
    hero_r2_key:     row.hero_r2_key ?? null,
    seo_title:       row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class JournalService {

  // =========================================================================
  // PUBLIC READ — PUBLISHED only
  // =========================================================================

  async listPosts(opts: {
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ReturnType<typeof formatList>[]; total: number }> {
    const limit  = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    let q = db
      .selectFrom('journal_posts')
      .where('status', '=', 'PUBLISHED')
      .selectAll();

    let countQ = db
      .selectFrom('journal_posts')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('status', '=', 'PUBLISHED');

    if (opts.category) {
      q      = q.where('category', '=', opts.category);
      countQ = countQ.where('category', '=', opts.category);
    }

    const [rows, countRow] = await Promise.all([
      q.orderBy('published_at', 'desc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirst(),
    ]);

    return {
      data:  rows.map(r => formatList(r as Record<string, unknown>)),
      total: Number(countRow?.count ?? 0),
    };
  }

  async getPostBySlug(slug: string): Promise<{ data: ReturnType<typeof formatDetail> }> {
    const row = await db
      .selectFrom('journal_posts')
      .where('slug', '=', slug)
      .where('status', '=', 'PUBLISHED')
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundException(`Journal post '${slug}' not found.`);

    return { data: formatDetail(row as Record<string, unknown>) };
  }

  // =========================================================================
  // ADMIN READ — any status
  // =========================================================================

  async adminListPosts(opts: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ReturnType<typeof formatDetail>[]; total: number }> {
    const limit  = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    let q = db
      .selectFrom('journal_posts')
      .selectAll();

    let countQ = db
      .selectFrom('journal_posts')
      .select((eb) => eb.fn.countAll<number>().as('count'));

    if (opts.status) {
      q      = q.where('status', '=', opts.status as JournalStatus);
      countQ = countQ.where('status', '=', opts.status as JournalStatus);
    }
    if (opts.category) {
      q      = q.where('category', '=', opts.category);
      countQ = countQ.where('category', '=', opts.category);
    }

    const [rows, countRow] = await Promise.all([
      q.orderBy('updated_at', 'desc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirst(),
    ]);

    return {
      data:  rows.map(r => formatDetail(r as Record<string, unknown>)),
      total: Number(countRow?.count ?? 0),
    };
  }

  // =========================================================================
  // MUTATIONS
  // =========================================================================

  async createPost(
    dto: CreateJournalPostDto,
    authorId: number,
  ): Promise<{ data: ReturnType<typeof formatDetail> }> {
    const uuid = randomUUID();
    const slug = dto.slug ?? slugify(dto.title, uuid);
    const now  = toMysqlDatetime(new Date()) as string;

    // Resolve author display name
    let authorDisplayName = dto.author_display_name ?? null;
    if (!authorDisplayName) {
      const user = await db
        .selectFrom('users')
        .select(['full_name'])
        .where('id', '=', authorId)
        .executeTakeFirst();
      authorDisplayName = user?.full_name ?? 'Bhopal Camera Club';
    }

    try {
      await db
        .insertInto('journal_posts')
        .values({
          uuid,
          slug,
          title:                dto.title,
          description:          dto.description ?? null,
          body:                 dto.body,
          excerpt:              dto.excerpt ?? null,
          category:             dto.category ?? 'Guide',
          tags:                 dto.tags ? JSON.stringify(dto.tags) : null,
          hero_image_url:       dto.hero_image_url ?? null,
          reading_time_minutes: dto.reading_time_minutes ?? 5,
          author_user_id:       authorId,
          author_display_name:  authorDisplayName,
          seo_title:            dto.seo_title ?? null,
          seo_description:      dto.seo_description ?? null,
          // status defaults to DRAFT via DB DEFAULT
          created_at: now,
          updated_at: now,
        } as any)
        .execute();
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' && err?.message?.includes('slug')) {
        throw new ConflictException(`A post with slug '${slug}' already exists.`);
      }
      throw err;
    }

    const row = await this.loadByUuid(uuid);
    return { data: formatDetail(row) };
  }

  async updatePost(
    id: number,
    dto: UpdateJournalPostDto,
    actorId: number,
  ): Promise<{ data: ReturnType<typeof formatDetail> }> {
    await this.loadById(id); // 404 guard

    const patch: Record<string, unknown> = {
      updated_at: toMysqlDatetime(new Date()),
    };

    if (dto.title               !== undefined) patch.title               = dto.title;
    if (dto.body                !== undefined) patch.body                = dto.body;
    if (dto.description         !== undefined) patch.description         = dto.description;
    if (dto.excerpt             !== undefined) patch.excerpt             = dto.excerpt;
    if (dto.category            !== undefined) patch.category            = dto.category;
    if (dto.hero_image_url      !== undefined) patch.hero_image_url      = dto.hero_image_url;
    if (dto.reading_time_minutes !== undefined) patch.reading_time_minutes = dto.reading_time_minutes;
    if (dto.author_display_name !== undefined) patch.author_display_name = dto.author_display_name;
    if (dto.seo_title           !== undefined) patch.seo_title           = dto.seo_title;
    if (dto.seo_description     !== undefined) patch.seo_description     = dto.seo_description;
    if (dto.tags                !== undefined) patch.tags = JSON.stringify(dto.tags);

    if (Object.keys(patch).length === 1) {
      // Nothing meaningful to update — just return current state
      return { data: formatDetail(await this.loadById(id)) };
    }

    await db
      .updateTable('journal_posts')
      .set(patch as any)
      .where('id', '=', id)
      .execute();

    return { data: formatDetail(await this.loadById(id)) };
  }

  async publishPost(
    id: number,
    actorId: number,
  ): Promise<{ data: ReturnType<typeof formatDetail> }> {
    const row = await this.loadById(id);

    if (row.status === 'PUBLISHED') {
      return { data: formatDetail(row) }; // idempotent
    }

    const now = toMysqlDatetime(new Date()) as string;
    await db
      .updateTable('journal_posts')
      .set({
        status:       'PUBLISHED' as JournalStatus,
        published_at: now,
        updated_at:   now,
      } as any)
      .where('id', '=', id)
      .execute();

    return { data: formatDetail(await this.loadById(id)) };
  }

  async archivePost(
    id: number,
    actorId: number,
  ): Promise<{ data: ReturnType<typeof formatDetail> }> {
    const row = await this.loadById(id);

    if (row.status === 'ARCHIVED') {
      return { data: formatDetail(row) }; // idempotent
    }
    if (row.status === 'DRAFT') {
      throw new BadRequestException('A DRAFT post cannot be archived directly. Publish it first.');
    }

    const now = toMysqlDatetime(new Date()) as string;
    await db
      .updateTable('journal_posts')
      .set({ status: 'ARCHIVED' as JournalStatus, updated_at: now } as any)
      .where('id', '=', id)
      .execute();

    return { data: formatDetail(await this.loadById(id)) };
  }

  async deletePost(id: number, actorId: number): Promise<void> {
    await this.loadById(id); // 404 guard
    await db.deleteFrom('journal_posts').where('id', '=', id).execute();
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async loadById(id: number): Promise<Record<string, unknown>> {
    const row = await db
      .selectFrom('journal_posts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException(`Journal post ${id} not found.`);
    return row as Record<string, unknown>;
  }

  private async loadByUuid(uuid: string): Promise<Record<string, unknown>> {
    const row = await db
      .selectFrom('journal_posts')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirstOrThrow();
    return row as Record<string, unknown>;
  }
}
