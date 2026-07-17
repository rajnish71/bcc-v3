// backend/src/modules/projects/projects.service.ts
//
// Project statistics and contributor lists for BCC Special Project pages.
//
// All queries are driven by a single canonical projectTag. The caller passes
// projectTag from the frontend project registry so this service has no knowledge
// of project slugs. Slug-to-tag mapping lives in the frontend data registry.

import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../database/db';

interface ContributorRow {
  user_id: string;
  username: string | null;
  full_name: string;
  avatar_url: string | null;
  photo_count: string;
}

@Injectable()
export class ProjectsService {
  // =========================================================================
  // Project statistics: photo count, contributor count, last updated
  // =========================================================================

  async getStats(projectTag: string): Promise<{
    photoCount: number;
    contributorCount: number;
    lastUpdated: string | null;
  }> {
    if (!projectTag) {
      return { photoCount: 0, contributorCount: 0, lastUpdated: null };
    }

    const result = await sql<{
      photo_count: string;
      contributor_count: string;
      last_updated: string | null;
    }>`
      SELECT
        COUNT(DISTINCT p.id)            AS photo_count,
        COUNT(DISTINCT p.owner_user_id) AS contributor_count,
        MAX(p.created_at)               AS last_updated
      FROM photos p
      JOIN photo_tag_assignments pta ON pta.photo_id = p.id
      JOIN photo_tags pt              ON pt.id        = pta.tag_id
      WHERE pt.tag_key  = ${projectTag}
        AND p.status     = 'ACTIVE'
        AND p.visibility = 'PUBLIC'
    `.execute(db);

    const row = result.rows[0];
    if (!row) return { photoCount: 0, contributorCount: 0, lastUpdated: null };

    let formattedDate: string | null = null;
    if (row.last_updated) {
      const d = new Date(row.last_updated);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      formattedDate = `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }

    return {
      photoCount:       Number(row.photo_count),
      contributorCount: Number(row.contributor_count),
      lastUpdated:      formattedDate,
    };
  }

  // =========================================================================
  // Contributor list: all distinct photographers with a photo in the project
  // =========================================================================

  async getContributors(projectTag: string): Promise<{
    contributors: Array<{
      userId: number;
      username: string | null;
      name: string;
      avatarUrl: string | null;
      photoCount: number;
    }>;
  }> {
    if (!projectTag) return { contributors: [] };

    const result = await sql<ContributorRow>`
      SELECT
        u.id                   AS user_id,
        u.username,
        u.full_name,
        av.imagekit_url        AS avatar_url,
        COUNT(DISTINCT p.id)   AS photo_count
      FROM users u
      JOIN photos p              ON p.owner_user_id = u.id
      JOIN photo_tag_assignments pta ON pta.photo_id = p.id
      JOIN photo_tags pt         ON pt.id = pta.tag_id
      LEFT JOIN user_avatars av  ON av.user_id = u.id
                                AND av.size_variant = 'ORIGINAL'
      WHERE pt.tag_key  = ${projectTag}
        AND p.status     = 'ACTIVE'
        AND p.visibility = 'PUBLIC'
      GROUP BY u.id, u.username, u.full_name, av.imagekit_url
      ORDER BY RAND()
    `.execute(db);

    return {
      contributors: result.rows.map(r => ({
        userId:     Number(r.user_id),
        username:   r.username ?? null,
        name:       r.full_name,
        avatarUrl:  r.avatar_url ?? null,
        photoCount: Number(r.photo_count),
      })),
    };
  }
}
