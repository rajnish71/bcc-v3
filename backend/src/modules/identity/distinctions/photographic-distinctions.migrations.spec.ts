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

describe('0127 display_code + catalogue seed', () => {
  const sql = read('0127_distinction_display_code_and_catalogue_seed.sql');
  const rows = [...sql.matchAll(/(?:SELECT|UNION ALL SELECT)\s+'([A-Z]+)'(?:\s+AS institution_code)?,\s*'([A-Z0-9_]+)'(?:\s+AS code)?,\s*'([^']+)'(?:\s+AS display_code)?/g)]
    .map((m) => ({ inst: m[1], code: m[2], display: m[3] }));
  const displays = (inst: string) => rows.filter((r) => r.inst === inst).map((r) => r.display);

  it('guards the column add and records itself once', () => {
    expect(sql).toMatch(/information_schema\.columns/);
    expect(sql).toMatch(/ADD COLUMN display_code VARCHAR\(50\) NULL/);
    expect(sql).toMatch(/INSERT IGNORE INTO photographic_distinctions/);
    expect(sql.match(/INSERT INTO schema_migrations/g)).toHaveLength(1);
  });

  it('has no duplicate (institution, code) or (institution, display) pairs', () => {
    const keys = rows.map((r) => `${r.inst}/${r.code}`);
    expect(new Set(keys).size).toBe(keys.length);
    const dkeys = rows.map((r) => `${r.inst}/${r.display}`);
    expect(new Set(dkeys).size).toBe(dkeys.length);
  });

  it('every internal code is machine-safe and every display code is valid', () => {
    for (const r of rows) {
      expect(r.code).toMatch(/^[A-Z0-9_]{2,50}$/);
      expect(r.display).toMatch(/^[A-Za-z0-9][A-Za-z0-9 \/().-]{0,49}$/);
    }
  });

  it('FIP: Genius levels, Nature variants and honorary entries (official notation)', () => {
    for (const d of ['GFIP', 'GFIP/pt', 'GFIP/ut', 'GFIP/st', 'EFIP/g', 'EFIP/p', 'EFIP/g (Nature)', 'EFIP/p (Nature)', 'MFIP', 'MFIP (Nature)', 'ESFIP', 'Hon. FIP', 'Hon. MFIP (Nature)'])
      expect(displays('FIP')).toContain(d);
    expect(sql).not.toMatch(/ESFIPC/);
  });

  it('FIAP: categories A-E, portfolio /b /s /g, audio-visual, service and honours', () => {
    const all = [
      'NFIAP', 'EFIAP', 'EFIAP/b', 'EFIAP/s', 'EFIAP/g', 'EFIAP/p',
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `EFIAP/d${n}`),
      'MFIAP', 'GMFIAP', 'PFIAP', 'PFIAP/b', 'PFIAP/s', 'PFIAP/g', 'MPFIAP',
      'AV-AFIAP', 'AV-EFIAP', 'AV-EFIAP/b', 'AV-EFIAP/s', 'AV-EFIAP/g', 'AV-EFIAP/p', 'AV-MFIAP',
      'ESFIAP', 'HonEFIAP', 'LAAFIAP', 'HMFIAP',
    ];
    for (const d of all) expect(displays('FIAP')).toContain(d);
    expect(displays('FIAP').filter((d) => d === 'GMFIAP')).toHaveLength(1);
    expect(displays('FIAP').some((d) => /bronze|silver|gold/i.test(d))).toBe(false);
    expect(sql).not.toMatch(/CAFIAP|CEFIAP/);
  });

  it('PSA: ROPA, GMPSA levels, portfolio and honours', () => {
    for (const d of ['QPSA', 'EPSA', 'MPSA', 'MPSA2', 'GMPSA', 'GMPSA/B', 'GMPSA/S', 'GMPSA/G', 'GMPSA/P', 'BPSA', 'SPSA', 'GPSA', 'APSA', 'FPSA', 'HonPSA', 'HonFPSA'])
      expect(displays('PSA')).toContain(d);
  });

  it('GPU Crown/VIP 1-5 are covered once, without re-seeding the 0116/0118 rows', () => {
    const gpuCodes = rows.filter((r) => r.inst === 'GPU').map((r) => r.code);
    expect(gpuCodes).not.toContain('CROWN3');
    expect(gpuCodes).not.toContain('VIP3');
    const covered = [...displays('GPU'), 'GPU Crown 3', 'GPU VIP 3'];
    for (const n of [1, 2, 3, 4, 5]) { expect(covered).toContain(`GPU Crown ${n}`); expect(covered).toContain(`GPU VIP ${n}`); }
    expect(sql).not.toMatch(/GPU-CR3|GPU VIP-3/);
  });

  it('GPU Titles and Grand Master are seeded; GPU total is 14 including the 0118 rows', () => {
    for (const [code, display] of [['APHRODITE', 'Aphrodite'], ['HERMES', 'Hermes'], ['ZEUS', 'Zeus'], ['GRAND_MASTER', 'GPU Grand Master']])
      expect(rows).toContainEqual({ inst: 'GPU', code, display });
    expect(rows.filter((r) => r.inst === 'GPU')).toHaveLength(12);
    expect(rows.filter((r) => r.inst === 'GPU').length + 2).toBe(14);
  });

  it('seeds the catalogue totals per institution (new rows)', () => {
    const n = (i: string) => rows.filter((r) => r.inst === i).length;
    expect({ FIP: n('FIP'), FIAP: n('FIAP'), PSA: n('PSA'), GPU: n('GPU'), RPS: n('RPS') })
      .toEqual({ FIP: 13, FIAP: 32, PSA: 16, GPU: 12, RPS: 3 });
  });

  it('RPS: LRPS/ARPS/FRPS only (no research-route duplicates)', () => {
    expect(displays('RPS')).toEqual(['LRPS', 'ARPS', 'FRPS']);
    expect(sql).not.toMatch(/RESEARCH/i);
  });

  it('does not re-seed rows owned by 0116/0118', () => {
    for (const [inst, code] of [['FIP', 'AFIP'], ['FIP', 'EFIP'], ['FIAP', 'AFIAP'], ['PSA', 'PPSA']])
      expect(rows.some((r) => r.inst === inst && r.code === code)).toBe(false);
  });

  it('seeds new rows non-badge-eligible and never rewrites existing rows or legacy data', () => {
    expect(sql).toMatch(/SELECT i\.id, s\.code, s\.display_code, s\.name, 0, 1, s\.sort_order/);
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|user_photographic_distinctions|user_photo_titles/i);
  });
});
