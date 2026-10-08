// scripts/tools/tenure/verify-wp3-0126.mjs
//
// TENURE-ARCH-001 v1.1 WP2-A1 -- real-MySQL verification of migration 0126
// (chk_rsp_verification amendment) on top of 0119.
//
// DISPOSABLE DATABASES ONLY (same guard as verify-wp2-schema.mjs): the
// database must end with "_wp3_verify" and the port must not be 3306/3307.
// It never reads backend/.env.
//
//   WP3_VERIFY_PORT=3399 WP3_VERIFY_DB=bcc_v3_wp3_verify \
//   MYSQL_BIN="C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" \
//   node scripts/tools/tenure/verify-wp3-0126.mjs

import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(join(ROOT, 'backend/package.json'));
const mysql = require('mysql2/promise');

const HOST = process.env.WP3_VERIFY_HOST ?? '127.0.0.1';
const PORT = Number(process.env.WP3_VERIFY_PORT);
const USER = process.env.WP3_VERIFY_USER ?? 'root';
const DB = process.env.WP3_VERIFY_DB ?? '';
const MYSQL_BIN = process.env.MYSQL_BIN ?? 'mysql';

if (!/^[a-z0-9_]+_wp3_verify$/.test(DB) || !Number.isInteger(PORT) || PORT === 3306 || PORT === 3307) {
  console.error('Refusing to run: WP3_VERIFY_DB must end with _wp3_verify and WP3_VERIFY_PORT must be a disposable port (not 3306/3307).');
  process.exit(2);
}

const cli = (sql, db) => {
  const args = ['--no-defaults', `-h${HOST}`, `-P${PORT}`, `-u${USER}`, ...(db ? [db] : [])];
  const r = spawnSync(MYSQL_BIN, args, { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`mysql CLI failed: ${r.stderr}`);
};
const migration = (f) => readFileSync(join(ROOT, 'database/migrations', f), 'utf8');

let failures = 0;
const results = [];
function record(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) failures += 1;
}

cli(`DROP DATABASE IF EXISTS \`${DB}\`; CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
cli(`
CREATE TABLE schema_migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE users (id BIGINT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NULL) ENGINE=InnoDB;
CREATE TABLE memberships (id BIGINT AUTO_INCREMENT PRIMARY KEY, owner_type ENUM('INDIVIDUAL','GROUP') NOT NULL, user_id BIGINT NULL, lifecycle_state VARCHAR(20) NOT NULL,
  CONSTRAINT fk_stub_membership_user FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB;
INSERT INTO users (id, username) VALUES (1, NULL), (2, NULL), (3, 'u3');
INSERT INTO memberships (id, owner_type, user_id, lifecycle_state) VALUES (11, 'INDIVIDUAL', 2, 'ACTIVE'), (12, 'INDIVIDUAL', 3, 'ACTIVE');
`, DB);
cli(migration('0119_create_recognized_service_periods.sql'), DB);

const conn = await mysql.createConnection({ host: HOST, port: PORT, user: USER, database: DB });
const [[{ v }]] = await conn.query('SELECT VERSION() AS v');
console.log(`MySQL version: ${v}`);

let seq = 0;
const BASE = {
  user_id: 2, membership_id: 11, start_date: '2026-01-01', start_precision: 'EXACT', end_date: '2026-12-31', end_precision: 'EXACT',
  evidence_kind: 'PERIOD', continuity_established: 1, established_by_type: 'SYSTEM',
};
async function tryInsert(over) {
  const row = { ...BASE, ...over };
  const cols = Object.keys(row);
  await conn.query('START TRANSACTION');
  try {
    await conn.query(`INSERT INTO recognized_service_periods (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]));
    return { ok: true };
  } catch (e) {
    return { ok: false, err: `${e.code}: ${e.sqlMessage}` };
  } finally {
    await conn.query('ROLLBACK');
  }
}
const nativeRow = (o = {}) => ({ basis: 'NATIVE_LIFECYCLE', native_source_type: 'MEMBERSHIP_ACTIVATION', native_source_id: ++seq, ...o });
const humanRow = (o = {}) => ({ basis: 'HISTORICAL_RECONCILIATION', ...o });
const V = { verification_status: 'VERIFIED', verified_at: '2026-10-08 00:00:00' };

async function matrix(label, expectations) {
  for (const [name, row, shouldPass] of expectations) {
    const r = await tryInsert(row);
    record(`${label}: ${name}`, r.ok === shouldPass, r.ok ? 'accepted' : `rejected (${r.err?.slice(0, 90)})`);
  }
}

const NATIVE_VERIFIED = nativeRow({ ...V });

// 1. Baseline (0119 only): the OLD check must reject the native-system shape,
//    proving the amendment is what makes it legal.
await matrix('BEFORE 0126', [['NATIVE verified, NULL verifier (old check rejects)', NATIVE_VERIFIED, false]]);

cli(migration('0126_amend_service_period_verification_check.sql'), DB);
const [[reg]] = await conn.query("SELECT COUNT(*) c FROM schema_migrations WHERE filename='0126_amend_service_period_verification_check.sql'");
record('0126 registered in schema_migrations', reg.c === 1);

await matrix('AFTER 0126 (must pass)', [
  ['1 UNVERIFIED', humanRow({ verification_status: 'UNVERIFIED' }), true],
  ['2 REJECTED (verifier, verified_at, reason)', humanRow({ verification_status: 'REJECTED', verified_by_user_id: 1, verified_at: '2026-10-08 00:00:00', verification_reason: 'no evidence' }), true],
  ['3 HUMAN_HISTORICAL VERIFIED (verifier, verified_at, evidence_reference)', humanRow({ ...V, verified_by_user_id: 1, evidence_reference: 'minutes 2014-03' }), true],
  ['3b GOVERNANCE_ATTESTATION VERIFIED', { basis: 'GOVERNANCE_ATTESTATION', ...V, verified_by_user_id: 1, evidence_reference: 'resolution 12' }, true],
  ['4 NATIVE_SYSTEM VERIFIED (NULL verifier, verified_at, source type+id)', nativeRow({ ...V }), true],
  ['4b NATIVE_SYSTEM VERIFIED for a user with NULL username (no guard)', nativeRow({ ...V }), true],
]);
await matrix('AFTER 0126 (must fail)', [
  ['5 human VERIFIED without evidence_reference', humanRow({ ...V, verified_by_user_id: 1 }), false],
  ['5b human VERIFIED with blank evidence_reference', humanRow({ ...V, verified_by_user_id: 1, evidence_reference: '   ' }), false],
  ['5c human VERIFIED without verifier', humanRow({ ...V, evidence_reference: 'x' }), false],
  ['6 VERIFIED NULL verifier and no native source (human basis)', humanRow({ ...V }), false],
  ['6b native VERIFIED with NULL verifier but no native source (0119 native-source CHECK)', { basis: 'NATIVE_LIFECYCLE', ...V }, false],
  ['7 native VERIFIED carrying a human verifier (no masquerade)', nativeRow({ ...V, verified_by_user_id: 1 }), false],
  ['8 native source on a human basis (0119 native-source CHECK)', humanRow({ ...V, verified_by_user_id: 1, evidence_reference: 'x', native_source_type: 'T', native_source_id: 1 }), false],
  ['9 UNVERIFIED carrying a verifier', humanRow({ verification_status: 'UNVERIFIED', verified_by_user_id: 1 }), false],
  ['10 REJECTED without reason', humanRow({ verification_status: 'REJECTED', verified_by_user_id: 1, verified_at: '2026-10-08 00:00:00' }), false],
  ['11 REJECTED without verifier', humanRow({ verification_status: 'REJECTED', verified_at: '2026-10-08 00:00:00', verification_reason: 'r' }), false],
  ['12 VERIFIED without verified_at (native)', nativeRow({ verification_status: 'VERIFIED' }), false],
]);

// Supersession (never-started term correction): an inverted interval and the
// correction_state move must be legal; the verification write-once and
// immutability triggers must still hold on a committed native row.
await conn.query('START TRANSACTION');
{
  const ins = async (over) => {
    const row = { ...BASE, ...over };
    const cols = Object.keys(row);
    const [r] = await conn.query(`INSERT INTO recognized_service_periods (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]));
    return r.insertId;
  };
  const future = await ins(nativeRow({ ...V, start_date: '2027-01-01', end_date: '2027-12-31' }));
  let ok = true, why = '';
  try {
    await ins(nativeRow({ ...V, start_date: '2027-01-01', end_date: '2026-06-30', native_source_type: 'MEMBERSHIP_TERMINATION', native_source_id: 11, supersedes_period_id: future }));
    await conn.query("UPDATE recognized_service_periods SET correction_state='CORRECTED' WHERE id=?", [future]);
  } catch (e) { ok = false; why = e.sqlMessage; }
  record('never-started term: superseding row with end < start accepted; original CURRENT -> CORRECTED', ok, why);

  const expectBlocked = async (name, sql, args) => {
    try { await conn.query(sql, args); record(name, false, 'update was allowed'); } catch (e) { record(name, true, e.sqlMessage?.slice(0, 80)); }
  };
  const id = await ins(nativeRow({ ...V }));
  await expectBlocked('native verification fields are write-once', "UPDATE recognized_service_periods SET verified_by_user_id=1 WHERE id=?", [id]);
  await expectBlocked('boundaries immutable', "UPDATE recognized_service_periods SET end_date='2030-01-01' WHERE id=?", [id]);
  await expectBlocked('rows cannot be deleted', "DELETE FROM recognized_service_periods WHERE id=?", [id]);
  await expectBlocked('CORRECTED cannot change state again', "UPDATE recognized_service_periods SET correction_state='CURRENT' WHERE id=?", [future]);
}
await conn.query('ROLLBACK');

// Idempotent native capture lock still effective.
await conn.query('START TRANSACTION');
{
  const base = { ...BASE, ...nativeRow({ ...V, native_source_id: 777 }) };
  const cols = Object.keys(base);
  const ins = () => conn.query(`INSERT INTO recognized_service_periods (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => base[c]));
  await ins();
  try { await ins(); record('native capture lock: duplicate original row rejected', false, 'accepted'); } catch (e) { record('native capture lock: duplicate original row rejected', e.code === 'ER_DUP_ENTRY', e.code); }
}
await conn.query('ROLLBACK');

const [[leftover]] = await conn.query('SELECT COUNT(*) c FROM recognized_service_periods');
record('no matrix row was left committed', leftover.c === 0);
await conn.end();

console.log(results.join('\n'));
console.log(failures === 0 ? `\nALL ${results.length} CHECKS PASSED on MySQL ${v}` : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
