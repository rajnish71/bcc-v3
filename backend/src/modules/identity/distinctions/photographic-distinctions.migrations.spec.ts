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

  it('seeds no distinction entries (pending HA classification approval)', () => {
    expect(sql).not.toMatch(/INSERT[\s\S]*INTO photographic_distinctions/i);
    expect(sql).not.toMatch(/INSERT[\s\S]*INTO user_photographic_distinctions/i);
  });

  it('has no badge table / stored badge and no recognition or membership coupling', () => {
    expect(sql).not.toMatch(/badge_award|distinguished/i);
    expect(sql).not.toMatch(/member_recognitions|membership_classes|REFERENCES memberships/);
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
