// Static assertions over migrations 0115-0117 (no DB in this test config).
// Guards the schema contract the service relies on: uniqueness, the
// pre_removal_state CHECK, the nullable audit target, the exact
// institution seed, an empty distinction seed, and exact RBAC grants.

import { readFileSync } from 'fs';
import { join } from 'path';

const MIG = join(__dirname, '../../../../../database/migrations');
const read = (f: string) => readFileSync(join(MIG, f), 'utf8').replace(/--.*$/gm, '');

describe('0115 identity_audit_log nullable target', () => {
  const sql = read('0115_identity_audit_log_nullable_target.sql');
  it('makes target_user_id nullable without dropping its FK', () => {
    expect(sql).toMatch(/ALTER TABLE identity_audit_log\s+MODIFY target_user_id BIGINT NULL/);
    expect(sql).not.toMatch(/DROP\s+(FOREIGN KEY|INDEX)/i);
  });
});

describe('0116 photographic distinctions schema', () => {
  const sql = read('0116_create_photographic_distinctions.sql');

  it('institution code is unique', () => {
    expect(sql).toMatch(/UNIQUE KEY uq_photo_inst_code \(code\)/);
  });

  it('distinction code is unique per institution', () => {
    expect(sql).toMatch(/UNIQUE KEY uq_photo_dist_institution_code \(institution_id, code\)/);
  });

  it('one declaration row per (user, distinction), states exactly DECLARED/WITHDRAWN/REMOVED', () => {
    expect(sql).toMatch(/UNIQUE KEY uq_user_photo_dist \(user_id, distinction_id\)/);
    expect(sql).toMatch(/state\s+ENUM\('DECLARED','WITHDRAWN','REMOVED'\) NOT NULL/);
    expect(sql).toMatch(/CHECK \(\(state = 'REMOVED'\) = \(pre_removal_state IS NOT NULL\)\)/);
  });

  it('declaration history cannot vanish by cascade', () => {
    expect(sql).toMatch(/fk_user_photo_dist_user FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE RESTRICT/);
    expect(sql).toMatch(/fk_user_photo_dist_distinction FOREIGN KEY \(distinction_id\) REFERENCES photographic_distinctions\(id\) ON DELETE RESTRICT/);
  });

  it('seeds exactly FIP, FIAP, PSA, RPS, GPU and no OTHER institution', () => {
    const seed = sql.match(/INSERT IGNORE INTO photographic_institutions[\s\S]*?;/)![0];
    const codes = [...seed.matchAll(/\('([A-Z]+)',/g)].map((m) => m[1]);
    expect(codes).toEqual(['FIP', 'FIAP', 'PSA', 'RPS', 'GPU']);
    expect(sql).not.toMatch(/'OTHER'/);
  });

  describe('distinction catalogue seed', () => {
    const seed = sql.match(/INSERT IGNORE INTO photographic_distinctions[\s\S]*?;/)![0];
    const rows = [...seed.matchAll(/SELECT\s+'([A-Z]+)'(?:\s+AS institution_code)?,\s*'([^']+)'(?:\s+AS code)?,\s*(\d+)/g)]
      .map((m) => ({ institution: m[1], code: m[2], sort: Number(m[3]) }));

    it('seeds exactly the four confirmed distinctions under the correct institutions', () => {
      expect(rows.map((r) => `${r.institution}/${r.code}`).sort()).toEqual(['FIAP/AFIAP', 'FIP/AFIP', 'FIP/EFIP', 'PSA/PPSA']);
    });

    it('all four are active, badge eligible and named by their confirmed code', () => {
      expect(seed).toMatch(/\(institution_id, code, name, badge_eligible, is_active, sort_order\)\s+SELECT i\.id, s\.code, s\.code, 1, 1, s\.sort_order/);
    });

    it('resolves institutions by code, never by id', () => {
      expect(seed).toMatch(/JOIN photographic_institutions i ON i\.code = s\.institution_code/);
    });

    it('sort_order is deterministic and unique within each institution', () => {
      const keys = rows.map((r) => `${r.institution}:${r.sort}`);
      expect(new Set(keys).size).toBe(rows.length);
    });

    it('GPU-CR3 and GPU VIP-3 are absent; no GPU distinction is seeded', () => {
      expect(sql).not.toMatch(/GPU-CR3|GPU VIP-3/);
      expect(rows.some((r) => r.institution === 'GPU')).toBe(false);
    });

    it('none of the six legacy OTHER values are seeded', () => {
      for (const v of ['FRPA', 'GNG', 'PESGSPC', 'VNPC', 'WPAI']) expect(sql).not.toMatch(new RegExp(v));
    });

    it('seeds no member declarations', () => {
      expect(sql).not.toMatch(/INSERT[\s\S]*INTO user_photographic_distinctions/i);
    });
  });

  it('is idempotent: CREATE TABLE IF NOT EXISTS and INSERT IGNORE for every seed', () => {
    expect(sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g)).toBeNull();
    const inserts = sql.match(/INSERT\s+(IGNORE\s+)?INTO\s+(\w+)/g)!;
    for (const ins of inserts.filter((i) => !/schema_migrations/.test(i))) expect(ins).toMatch(/INSERT IGNORE INTO/);
  });

  it('has no badge table / stored badge and no recognition or membership coupling', () => {
    expect(sql).not.toMatch(/badge_award|distinguished/i);
    expect(sql).not.toMatch(/member_recognitions|membership_classes|REFERENCES memberships/);
  });
});

describe('0118 GPU catalogue entries (frozen HA decision)', () => {
  const sql = read('0118_seed_gpu_photographic_distinctions.sql');
  const seed = sql.match(/INSERT IGNORE INTO photographic_distinctions[\s\S]*?;/)![0];

  it('seeds exactly GPU/CROWN3 "GPU Crown 3" and GPU/VIP3 "GPU VIP 3"', () => {
    const rows = [...seed.matchAll(/SELECT\s+'([A-Z]+)'(?:\s+AS institution_code)?,\s*'([^']+)'(?:\s+AS code)?,\s*'([^']+)'(?:\s+AS name)?,\s*(\d+)/g)]
      .map((m) => ({ institution: m[1], code: m[2], name: m[3], sort: Number(m[4]) }));
    expect(rows).toEqual([
      { institution: 'GPU', code: 'CROWN3', name: 'GPU Crown 3', sort: 10 },
      { institution: 'GPU', code: 'VIP3', name: 'GPU VIP 3', sort: 20 },
    ]);
  });

  it('both are active and badge eligible, resolved by institution code', () => {
    expect(seed).toMatch(/SELECT i\.id, s\.code, s\.name, 1, 1, s\.sort_order/);
    expect(seed).toMatch(/JOIN photographic_institutions i ON i\.code = s\.institution_code/);
  });

  it('adds no legacy alias codes, declarations or legacy-table writes', () => {
    expect(sql).not.toMatch(/GPU-CR3|GPU VIP-3/);
    expect(sql).not.toMatch(/user_photographic_distinctions|user_photo_titles/);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+photographic_institutions/i);
  });

  it('is idempotent and records itself once', () => {
    expect(sql).toMatch(/INSERT IGNORE INTO photographic_distinctions/);
    expect(sql.match(/INSERT INTO schema_migrations/g)).toHaveLength(1);
  });
});

describe('0117 RBAC grants', () => {
  const sql = read('0117_add_identity_distinction_permissions.sql');
  const grant = (key: string) => {
    const re = new RegExp(`WHERE r\\.name (?:IN \\(([^)]*)\\)|= '([^']+)')\\s+AND p\\.permission_key = '${key.replace(/\./g, '\\.')}'`);
    const m = sql.match(re)!;
    return (m[1] ?? `'${m[2]}'`).split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  };

  it('creates exactly the three permission keys', () => {
    const keys = [...sql.matchAll(/\('(identity\.distinction[a-z.]*)'/g)].map((m) => m[1]);
    expect(keys).toEqual(['identity.distinction.view', 'identity.distinction.remove', 'identity.distinction.catalogue.manage']);
  });

  it('grants exactly the approved roles', () => {
    expect(grant('identity.distinction.view')).toEqual(['Coordinator', 'Platform Admin', 'Super Admin']);
    expect(grant('identity.distinction.remove')).toEqual(['Platform Admin', 'Super Admin']);
    expect(grant('identity.distinction.catalogue.manage')).toEqual(['Super Admin']);
  });

  it('creates no role', () => {
    expect(sql).not.toMatch(/INSERT[\s\S]*INTO roles/i);
  });
});
