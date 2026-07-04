// backend/src/modules/membership/voting-register/voting-register.service.ts
//
// MEM-006 §02.11 Voting Rights Management.
//
// CONSTITUTIONAL RULES (hard, not configurable):
//   - Voting-eligible classes: Full Member, Life Member, Patron Member,
//     Founding Member ONLY (membership_classes.voting_eligible = 1).
//   - ACTIVE lifecycle_state only. SUSPENDED/EXPIRED members are NOT eligible.
//   - Recognition does NOT confer voting rights.
//   - RBAC roles do NOT confer voting rights.
//   - Group memberships are NOT eligible (owner_type = GROUP).
//
// QUORUM: ceil(eligible_count / 3) -- standard 1/3 quorum for Indian club
// AGMs. This formula is a reasonable default; governance may formalise a
// different fraction by constitutional authority. The value stored in each
// snapshot is immutable from that point forward regardless of future changes.
//
// SNAPSHOTS are append-only. generateSnapshot() inserts a new row every time.
// Historical snapshots are never overwritten or deleted.

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../../database/db';

// NOTE: an earlier version of this file tried to type this row via
// Kysely's `Selectable<VotingRegisterSnapshotsTable>`, on the assumption
// that it collapses `Generated<ColumnType<Date, string | undefined, never>>`
// down to plain `Date`. In this project's Kysely version that collapsing
// did not happen -- `generated_at` still typechecked as the raw ColumnType.
// Rather than keep fighting that (this was already wrong once), toDate()
// below accepts `unknown` and normalises at runtime instead. mysql2 returns
// real Date objects for TIMESTAMP columns by default, so the `instanceof
// Date` branch is the common case; the string branch covers a driver
// configured to return raw SQL strings instead.
function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

// Same reasoning as toDate() above, for the one other Date-typed column
// this file touches (activated_at) -- applied proactively rather than
// waiting for the same quirk to surface as a separate build error here too.
function toIsoStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export interface VotingRegisterEntry {
  membership_id: number;
  membership_number: string;
  user_id: number;
  full_name: string;
  class_code: string;
  class_name: string;
  activated_at: string | null;
}

export interface VotingSnapshot {
  id: number;
  uuid: string;
  label: string;
  generated_by_user_id: number | null;
  eligible_count: number;
  quorum_threshold: number;
  generated_at: Date;
  entries?: VotingRegisterEntry[];
}

@Injectable()
export class VotingRegisterService {

  // ── Generate ──────────────────────────────────────────────────────────────

  async generateSnapshot(label: string, actorUserId: number): Promise<VotingSnapshot> {
    // Fetch all ACTIVE INDIVIDUAL memberships whose class is voting_eligible.
    const eligible = await db
      .selectFrom('memberships as m')
      .innerJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select([
        'm.id as membership_id',
        'm.membership_number',
        'm.user_id',
        'm.activated_at',
        'u.full_name',
        'mc.code as class_code',
        'mc.name as class_name',
      ])
      .where('m.lifecycle_state', '=', 'ACTIVE')
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .where('mc.voting_eligible', '=', true)
      .orderBy('m.membership_number', 'asc')
      .execute();

    const entries: VotingRegisterEntry[] = eligible.map((row) => ({
      membership_id: row.membership_id,
      membership_number: row.membership_number ?? '',
      user_id: row.user_id ?? 0,
      full_name: row.full_name,
      class_code: row.class_code,
      class_name: row.class_name,
      activated_at: toIsoStringOrNull(row.activated_at),
    }));

    const eligibleCount = entries.length;
    // Standard 1/3 quorum -- stored immutably at generation time.
    const quorumThreshold = Math.ceil(eligibleCount / 3);

    const uuid = randomUUID();

    await db
      .insertInto('voting_register_snapshots')
      .values({
        uuid,
        label,
        generated_by_user_id: actorUserId,
        eligible_count: eligibleCount,
        quorum_threshold: quorumThreshold,
        snapshot_json: JSON.stringify(entries),
      })
      .execute();

    const row = await db
      .selectFrom('voting_register_snapshots')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirstOrThrow();

    return this.toSnapshot(row, entries);
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async listSnapshots(): Promise<VotingSnapshot[]> {
    const rows = await db
      .selectFrom('voting_register_snapshots')
      .select(['id', 'uuid', 'label', 'generated_by_user_id', 'eligible_count', 'quorum_threshold', 'generated_at'])
      .orderBy('generated_at', 'desc')
      .execute();

    return rows.map((r) => this.toSnapshot(r));
  }

  // ── Get one ───────────────────────────────────────────────────────────────

  async getSnapshot(uuid: string): Promise<VotingSnapshot> {
    const row = await db
      .selectFrom('voting_register_snapshots')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirst();

    if (!row) throw new NotFoundException(`Voting register snapshot ${uuid} not found`);

    const entries: VotingRegisterEntry[] = JSON.parse(row.snapshot_json as string) as VotingRegisterEntry[];
    return this.toSnapshot(row, entries);
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private toSnapshot(
    row: {
      id: number;
      uuid: string;
      label: string;
      generated_by_user_id: number | null;
      eligible_count: number;
      quorum_threshold: number;
      generated_at: unknown;
      snapshot_json?: string;
    },
    entries?: VotingRegisterEntry[],
  ): VotingSnapshot {
    return {
      id: row.id,
      uuid: row.uuid,
      label: row.label,
      generated_by_user_id: row.generated_by_user_id,
      eligible_count: row.eligible_count,
      quorum_threshold: row.quorum_threshold,
      generated_at: toDate(row.generated_at),
      ...(entries !== undefined ? { entries } : {}),
    };
  }
}
