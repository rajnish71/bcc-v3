// Atomic recognition grant + MEM-006 supersession, and the owner batch manifest.
//
// RecognitionService imports db.ts (Kysely ESM -- incompatible with this
// project's CommonJS Jest config), so, like the other membership specs, this
// inspects the real source rather than instantiating the service.

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'recognition.service.ts'), 'utf8');
const BATCH_SRC = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'apply-recognition-batch.ts'), 'utf8');

const start = SRC.indexOf('async grantInTransaction(');
const end = SRC.indexOf('async notifyGrant(');
const GRANT = SRC.slice(start, end);

describe('RecognitionService.grantInTransaction', () => {
  it('runs every read/write/audit against the caller trx, never the module-level db', () => {
    expect(GRANT).not.toMatch(/\bawait db\b/);
    expect(GRANT).not.toMatch(/\bdb\s*\.\s*(selectFrom|insertInto|updateTable)/);
    const audits = GRANT.match(/logMembershipAudit\(/g) ?? [];
    expect(audits.length).toBe(2); // SUPERSEDED + ASSIGNED
    expect(GRANT.match(/,\s*trx,\s*\)/g)?.length).toBe(2); // both pass trx as executor
  });

  it('locks the membership row so concurrent grants serialise', () => {
    expect(GRANT).toMatch(/\.forUpdate\(\)/);
  });

  it('supersedes only an AUTO row, and only by a governance code', () => {
    expect(GRANT).toMatch(/active\.track === 'AUTO' && HONORARY_CODES\.includes\(recognitionCode\)/);
    expect(GRANT).toMatch(/throw new ConflictException/);
  });

  it('is idempotent for the code already held', () => {
    expect(GRANT).toMatch(/if \(active\.recognition_code === recognitionCode\) return \{ outcome: 'NOOP'/);
  });

  it('flips the old row to HISTORICAL (never deletes) before inserting the new ACTIVE row', () => {
    expect(GRANT).not.toMatch(/deleteFrom/);
    expect(GRANT.indexOf("status: 'HISTORICAL'")).toBeGreaterThan(-1);
    expect(GRANT.indexOf("status: 'HISTORICAL'")).toBeLessThan(GRANT.indexOf("status: 'ACTIVE'"));
  });

  it('does not send email inside the transaction', () => {
    expect(GRANT).not.toMatch(/dispatch\(/);
  });
});

describe('governance track validation', () => {
  it('both assign() and grantInTransaction() enforce MANUAL for governance codes', () => {
    expect(SRC.match(/this\.assertTrackMatchesCode\(/g)?.length).toBe(2);
    expect(SRC).toMatch(/HONORARY_CODES\.includes\(code\) \|\| code === 'HONORARY_SENIOR_MEMBER'/);
  });
});

describe('owner batch manifest', () => {
  const entries = [...BATCH_SRC.matchAll(/membershipId: (\d+), userId: (\d+), username: '([^']+)', code: '([A-Z_]+)'/g)].map((m) => ({
    id: Number(m[1]),
    userId: Number(m[2]),
    username: m[3],
    code: m[4],
  }));

  it('has the 15 authorised grants, each membership once (one active recognition each)', () => {
    expect(entries).toHaveLength(15);
    expect(new Set(entries.map((e) => e.id)).size).toBe(15);
  });

  it('gives Prakash and Syed Honorary Member only (Option A)', () => {
    for (const u of ['prakashhatvalne', 'syedtahapasha']) {
      const mine = entries.filter((e) => e.username === u);
      expect(mine).toEqual([expect.objectContaining({ code: 'HONORARY_MEMBER' })]);
    }
  });

  it('includes no founding member (memberships 4-10 in the historical manifest / user 1)', () => {
    expect(entries.map((e) => e.username)).not.toContain('rajnishkhare');
  });

  it('is a dry run unless --apply is passed, and applies inside a single transaction', () => {
    expect(BATCH_SRC).toMatch(/process\.argv\.includes\('--apply'\)/);
    expect(BATCH_SRC.match(/db\.transaction\(\)\.execute/g)?.length).toBe(1);
    expect(BATCH_SRC.indexOf('notifyGrant')).toBeGreaterThan(BATCH_SRC.indexOf('db.transaction()'));
  });

  it('pins membership id, user id and username for every grant, verified production mapping', () => {
    const expected: Record<number, [number, string]> = {
      11: [16, 'kshitijpatle'], 12: [17, 'meetaathavale'], 13: [18, 'ankittiwari'], 14: [19, 'rahilkhan'],
      15: [20, 'anilbhati'], 16: [21, 'prakashhatvalne'], 17: [22, 'robindutta'], 18: [23, 'uttamgurjar'],
      20: [25, 'syedtahapasha'], 22: [27, 'sanjaykumarshukla'], 23: [28, 'akshitajain'],
      77: [69, 'khalidkhan832'], 80: [70, 'ppparate'], 81: [74, 'ashokbathri'], 92: [85, 'dinesh'],
    };
    expect(Object.fromEntries(entries.map((e) => [e.id, [e.userId, e.username]]))).toEqual(expected);
  });

  it('preflight rejects on user id, username, lifecycle state and owner type mismatch', () => {
    expect(BATCH_SRC).toMatch(/Number\(row\.user_id\) !== b\.userId/);
    expect(BATCH_SRC).toMatch(/row\.username !== b\.username/);
    expect(BATCH_SRC).toMatch(/row\.lifecycle_state !== 'ACTIVE'/);
    expect(BATCH_SRC).toMatch(/row\.owner_type !== 'INDIVIDUAL'/);
  });

  it('prints database host and name, and never credentials', () => {
    expect(BATCH_SRC).toMatch(/DB_HOST/);
    expect(BATCH_SRC).toMatch(/SELECT DATABASE\(\)/);
    expect(BATCH_SRC).not.toMatch(/DB_PASSWORD|DB_USER|connectionString/);
  });
});
