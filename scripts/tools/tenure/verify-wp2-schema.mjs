// scripts/tools/tenure/verify-wp2-schema.mjs
//
// TENURE-ARCH-001 v1.1 WP2 -- real-MySQL verification of migrations
// 0119-0124 (service ledger, Senior overlay, transition history, audit
// subject user, legacy Senior guard, active_lock rescope).
//
// DISPOSABLE DATABASES ONLY. The script DROPs and recreates the target
// database, so it refuses to run unless:
//   * WP2_VERIFY_DB ends with "_wp2_verify", and
//   * WP2_VERIFY_PORT is set and is not 3306 / 3307.
// It never reads backend/.env and never connects to a configured app DB.
//
// It builds the pre-WP2 baseline from production's SHOW CREATE TABLE for
// member_recognitions and membership_audit_log (2026-10-07) plus minimal
// users / memberships stubs, seeds a SYNTHETIC copy of the production
// recognition shape (Honorary 1-7 + 16, legacy MANUAL Senior 8-15, Honorary
// 3 and 7 carrying Senior wording in their reason, audit up to id 416),
// applies the six migrations with the mysql CLI (they use DELIMITER), then
// asserts constraints, triggers and existing-row preservation. Test writes
// run inside transactions that are rolled back.
//
// Usage (disposable server, e.g. a scratch mysqld on port 3399):
//   WP2_VERIFY_PORT=3399 WP2_VERIFY_DB=bcc_v3_wp2_verify \
//   MYSQL_BIN="C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" \
//   node scripts/tools/tenure/verify-wp2-schema.mjs
// Optional: WP2_VERIFY_HOST (127.0.0.1), WP2_VERIFY_USER (root),
// WP2_VERIFY_MUTATION=<name> applies a deliberate defect after migrating;
// the run must then FAIL (used to prove the assertions bite).

import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(join(ROOT, 'backend/package.json'));
const mysql = require('mysql2/promise');

const HOST = process.env.WP2_VERIFY_HOST ?? '127.0.0.1';
const PORT = Number(process.env.WP2_VERIFY_PORT);
const USER = process.env.WP2_VERIFY_USER ?? 'root';
const DB = process.env.WP2_VERIFY_DB ?? '';
const MYSQL_BIN = process.env.MYSQL_BIN ?? 'mysql';
const MUTATION = process.env.WP2_VERIFY_MUTATION ?? '';

if (!/^[a-z0-9_]+_wp2_verify$/.test(DB) || !Number.isInteger(PORT) || PORT === 3306 || PORT === 3307) {
  console.error('Refusing to run: WP2_VERIFY_DB must end with _wp2_verify and WP2_VERIFY_PORT must be a disposable port (not 3306/3307).');
  process.exit(2);
}

const MIGRATIONS = [
  '0119_create_recognized_service_periods.sql',
  '0120_create_senior_status_overlays.sql',
  '0121_create_senior_status_transitions.sql',
  '0122_membership_audit_log_subject_user.sql',
  '0123_guard_legacy_senior_recognitions.sql',
  '0124_rescope_recognition_active_lock.sql',
];

const MUTATIONS = {
  no_senior_insert_guard: 'DROP TRIGGER trg_recognition_senior_legacy_insert',
  old_active_lock: "ALTER TABLE member_recognitions MODIFY COLUMN active_lock BIGINT GENERATED ALWAYS AS (IF(status = 'ACTIVE', membership_id, NULL)) STORED",
  transitions_updatable: 'DROP TRIGGER trg_sst_before_update',
  transitions_deletable: 'DROP TRIGGER trg_sst_before_delete',
  ledger_mutable: 'DROP TRIGGER trg_rsp_before_update',
  ledger_deletable: 'DROP TRIGGER trg_rsp_before_delete',
  overlay_any_legacy_row: 'DROP TRIGGER trg_sso_before_insert',
};

// ── Pre-WP2 baseline (production DDL 2026-10-07 for the two real tables) ──
const BASELINE_DDL = `
CREATE TABLE schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE memberships (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_type ENUM('INDIVIDUAL','GROUP') NOT NULL,
  user_id BIGINT NULL,
  lifecycle_state ENUM('PENDING','APPROVED','ACTIVE','SUSPENDED','EXPIRED','TERMINATED','REJECTED') NOT NULL,
  CONSTRAINT fk_stub_membership_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE \`member_recognitions\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`membership_id\` bigint NOT NULL,
  \`recognition_code\` enum('SENIOR_MEMBER','HONORARY_SENIOR_MEMBER','HONORARY_MEMBER','HONORARY_MENTOR','HONORARY_GRANDMASTER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  \`track\` enum('AUTO','MANUAL') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  \`status\` enum('ACTIVE','HISTORICAL') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  \`reason\` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  \`assigned_by_user_id\` bigint DEFAULT NULL,
  \`start_date\` date NOT NULL,
  \`end_date\` date DEFAULT NULL,
  \`active_lock\` bigint GENERATED ALWAYS AS (if((\`status\` = _utf8mb4'ACTIVE'),\`membership_id\`,NULL)) STORED,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_one_active_recognition\` (\`active_lock\`),
  KEY \`fk_recognition_assigned_by\` (\`assigned_by_user_id\`),
  KEY \`idx_recognitions_membership\` (\`membership_id\`),
  CONSTRAINT \`fk_recognition_assigned_by\` FOREIGN KEY (\`assigned_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`fk_recognition_membership\` FOREIGN KEY (\`membership_id\`) REFERENCES \`memberships\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE \`membership_audit_log\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`membership_id\` bigint DEFAULT NULL,
  \`event_type\` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  \`actor_type\` enum('SYSTEM','ADMIN','MEMBER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SYSTEM',
  \`actor_user_id\` bigint DEFAULT NULL,
  \`old_value\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  \`new_value\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  \`notes\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`fk_audit_actor\` (\`actor_user_id\`),
  KEY \`idx_audit_membership\` (\`membership_id\`),
  KEY \`idx_audit_event_type\` (\`event_type\`),
  CONSTRAINT \`fk_audit_actor\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`fk_audit_membership\` FOREIGN KEY (\`membership_id\`) REFERENCES \`memberships\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

// Synthetic mirror of the production recognition shape (no real personal data).
const HONORARY = [
  [1, 15, 'HONORARY_MENTOR'], [2, 22, 'HONORARY_MENTOR'], [3, 16, 'HONORARY_MEMBER'], [4, 92, 'HONORARY_MEMBER'],
  [5, 18, 'HONORARY_MEMBER'], [6, 11, 'HONORARY_MEMBER'], [7, 20, 'HONORARY_MEMBER'], [16, 26, 'HONORARY_MEMBER'],
];
const SENIOR = [[8, 12], [9, 13], [10, 14], [11, 17], [12, 23], [13, 77], [14, 80], [15, 81]];
const MEMBERSHIP_IDS = [...new Set([...HONORARY.map((h) => h[1]), ...SENIOR.map((s) => s[1]), 40, 41, 42])].sort((a, b) => a - b);
const userOf = (membershipId) => 100 + membershipId; // one individual per membership

async function seed(c) {
  for (const id of [1, ...MEMBERSHIP_IDS.map(userOf), 900, 901]) await c.query('INSERT INTO users (id, username) VALUES (?, ?)', [id, `u${id}`]);
  for (const m of MEMBERSHIP_IDS) {
    await c.query('INSERT INTO memberships (id, owner_type, user_id, lifecycle_state) VALUES (?, ?, ?, ?)', [
      m, m === 42 ? 'GROUP' : 'INDIVIDUAL', userOf(m), 'ACTIVE',
    ]);
  }
  for (const [id, m, code] of HONORARY) {
    const reason = id === 3 || id === 7
      ? 'Honorary recognition. Senior Member status also authorised; Honorary holds precedence.'
      : 'Honorary recognition awarded by Management.';
    await c.query(
      "INSERT INTO member_recognitions (id, membership_id, recognition_code, track, status, reason, assigned_by_user_id, start_date) VALUES (?, ?, ?, 'MANUAL', 'ACTIVE', ?, 1, '2026-09-29')",
      [id, m, code, reason],
    );
  }
  for (const [id, m] of SENIOR) {
    await c.query(
      "INSERT INTO member_recognitions (id, membership_id, recognition_code, track, status, reason, assigned_by_user_id, start_date) VALUES (?, ?, 'SENIOR_MEMBER', 'MANUAL', 'ACTIVE', 'Senior Member: owner-authorised exception.', 1, '2026-09-29')",
      [id, m],
    );
  }
  await c.query("INSERT INTO membership_audit_log (id, membership_id, event_type, actor_type, actor_user_id, notes) VALUES (415, 12, 'RECOGNITION_ASSIGNED', 'ADMIN', 1, 'baseline'), (416, NULL, 'SENIOR_STATUS_BATCH', 'ADMIN', 1, 'baseline')");
}

const RECOGNITION_HASH = `SELECT id, MD5(CONCAT_WS('|', id, membership_id, recognition_code, track, status, IFNULL(reason,''),
  IFNULL(assigned_by_user_id,''), start_date, IFNULL(end_date,''), created_at)) AS h FROM member_recognitions ORDER BY id`;
const AUDIT_HASH = `SELECT id, MD5(CONCAT_WS('|', id, IFNULL(membership_id,''), event_type, actor_type, IFNULL(actor_user_id,''),
  IFNULL(old_value,''), IFNULL(new_value,''), IFNULL(notes,''), created_at)) AS h FROM membership_audit_log ORDER BY id`;

function applyFile(sqlText, label) {
  const r = spawnSync(MYSQL_BIN, ['-h', HOST, '-P', String(PORT), '-u', USER, '--default-character-set=utf8mb4', DB], {
    input: sqlText, encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`${label} failed: ${r.stderr || r.stdout}`);
}

// ── tiny assertion runner ───────────────────────────────────────────────────
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
  } catch (err) {
    results.push([false, name, err.message]);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function expectError(c, sql, params, pattern) {
  try {
    await c.query(sql, params);
  } catch (err) {
    const text = `${err.code} ${err.errno} ${err.sqlMessage ?? err.message}`;
    assert(pattern.test(text), `wrong error: ${text}`);
    return;
  }
  throw new Error(`expected an error matching ${pattern}, but the statement succeeded: ${sql}`);
}
// Runs fn inside a transaction that is always rolled back.
async function scratch(c, fn) {
  await c.query('START TRANSACTION');
  try { await fn(); } finally { await c.query('ROLLBACK'); }
}

const SIGNAL = /45000|1644|TENURE-ARCH-001/;
const CHECK = /3819|ER_CHECK_CONSTRAINT_VIOLATED/;
const DUP = /1062|ER_DUP_ENTRY/;
const FK = /1451|1452|ER_ROW_IS_REFERENCED|ER_NO_REFERENCED_ROW/;

async function main() {
  const admin = await mysql.createConnection({ host: HOST, port: PORT, user: USER, multipleStatements: true });
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const c = await mysql.createConnection({ host: HOST, port: PORT, user: USER, database: DB, multipleStatements: true, dateStrings: true });
  await c.query(BASELINE_DDL);
  await seed(c);
  const [recBefore] = await c.query(RECOGNITION_HASH);
  const [auditBefore] = await c.query(AUDIT_HASH);
  const [criteriaLike] = await c.query('SELECT COUNT(*) AS n FROM member_recognitions');

  for (const f of MIGRATIONS) applyFile(readFileSync(join(ROOT, 'database/migrations', f), 'utf8'), f);
  if (MUTATION) {
    assert(MUTATIONS[MUTATION], `unknown mutation ${MUTATION}`);
    await c.query(MUTATIONS[MUTATION]);
    console.log(`(mutation applied: ${MUTATION})`);
  }

  // ── D. existing-row safety ────────────────────────────────────────────────
  await check('all six migrations registered in schema_migrations', async () => {
    const [rows] = await c.query('SELECT filename FROM schema_migrations ORDER BY filename');
    assert(JSON.stringify(rows.map((r) => r.filename)) === JSON.stringify(MIGRATIONS), JSON.stringify(rows));
  });
  await check('recognition rows 1-16 byte-identical (recorded columns)', async () => {
    const [after] = await c.query(RECOGNITION_HASH);
    assert(after.length === 16 && criteriaLike[0].n === 16, `row count ${after.length}`);
    assert(JSON.stringify(after) === JSON.stringify(recBefore), 'recognition row hashes changed');
  });
  await check('audit rows identical and subject_user_id NULL on every existing row', async () => {
    const [after] = await c.query(AUDIT_HASH);
    assert(JSON.stringify(after) === JSON.stringify(auditBefore), 'audit row hashes changed');
    const [[n]] = await c.query('SELECT COUNT(*) AS n FROM membership_audit_log WHERE subject_user_id IS NOT NULL');
    assert(n.n === 0, 'subject_user_id populated');
  });
  await check('zero rows in the three new tables', async () => {
    for (const t of ['recognized_service_periods', 'senior_status_overlays', 'senior_status_transitions']) {
      const [[n]] = await c.query(`SELECT COUNT(*) AS n FROM ${t}`);
      assert(n.n === 0, `${t} has rows`);
    }
  });
  await check('active_lock: NULL for the 8 Senior rows, membership_id for ACTIVE Honorary rows', async () => {
    const [rows] = await c.query('SELECT id, membership_id, recognition_code, active_lock FROM member_recognitions ORDER BY id');
    for (const r of rows) {
      if (r.recognition_code === 'SENIOR_MEMBER') assert(r.active_lock === null, `row ${r.id} lock ${r.active_lock}`);
      else assert(Number(r.active_lock) === Number(r.membership_id), `row ${r.id} lock ${r.active_lock}`);
    }
  });
  await check('Honorary rows 3 and 7 remain Honorary', async () => {
    const [rows] = await c.query('SELECT recognition_code FROM member_recognitions WHERE id IN (3, 7)');
    assert(rows.every((r) => r.recognition_code === 'HONORARY_MEMBER'), JSON.stringify(rows));
  });
  await check('SENIOR_MEMBER enum value retained', async () => {
    const [[col]] = await c.query("SELECT column_type AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'member_recognitions' AND column_name = 'recognition_code'");
    assert(col.t.includes("'SENIOR_MEMBER'"), col.t);
  });

  // ── 0123 legacy Senior guard ──────────────────────────────────────────────
  await check('guard: new SENIOR_MEMBER rows refused (MANUAL and AUTO)', () => scratch(c, async () => {
    for (const track of ['MANUAL', 'AUTO']) {
      await expectError(c, "INSERT INTO member_recognitions (membership_id, recognition_code, track, start_date) VALUES (40, 'SENIOR_MEMBER', ?, '2026-10-07')", [track], SIGNAL);
    }
  }));
  await check('guard: existing Senior rows cannot be updated, revoked or deleted', () => scratch(c, async () => {
    await expectError(c, "UPDATE member_recognitions SET reason = 'x' WHERE id = 8", [], SIGNAL);
    await expectError(c, "UPDATE member_recognitions SET status = 'HISTORICAL', end_date = '2026-10-07' WHERE id = 9", [], SIGNAL);
    await expectError(c, "UPDATE member_recognitions SET track = 'AUTO' WHERE id = 10", [], SIGNAL);
    await expectError(c, 'DELETE FROM member_recognitions WHERE id = 11', [], SIGNAL);
  }));
  await check('guard: a non-Senior row cannot be turned into SENIOR_MEMBER', () => scratch(c, async () => {
    await expectError(c, "UPDATE member_recognitions SET recognition_code = 'SENIOR_MEMBER' WHERE id = 3", [], SIGNAL);
  }));
  await check('guard: reads of legacy Senior rows still work', async () => {
    const [rows] = await c.query("SELECT id FROM member_recognitions WHERE recognition_code = 'SENIOR_MEMBER' ORDER BY id");
    assert(rows.map((r) => r.id).join(',') === '8,9,10,11,12,13,14,15', JSON.stringify(rows));
  });

  // ── 0124 active_lock rescope ──────────────────────────────────────────────
  await check('Recognition Class uniqueness still enforced (second ACTIVE Honorary refused)', () => scratch(c, async () => {
    await expectError(c, "INSERT INTO member_recognitions (membership_id, recognition_code, track, start_date) VALUES (15, 'HONORARY_MEMBER', 'MANUAL', '2026-10-07')", [], DUP);
  }));
  await check('Senior no longer takes the slot: a Senior holder can receive one Honorary, not two', () => scratch(c, async () => {
    await c.query("INSERT INTO member_recognitions (membership_id, recognition_code, track, start_date) VALUES (12, 'HONORARY_MEMBER', 'MANUAL', '2026-10-07')");
    await expectError(c, "INSERT INTO member_recognitions (membership_id, recognition_code, track, start_date) VALUES (12, 'HONORARY_MENTOR', 'MANUAL', '2026-10-07')", [], DUP);
  }));
  await check('Honorary lifecycle unaffected (revoke to HISTORICAL, then new ACTIVE)', () => scratch(c, async () => {
    await c.query("UPDATE member_recognitions SET status = 'HISTORICAL', end_date = '2026-10-07' WHERE id = 1");
    await c.query("INSERT INTO member_recognitions (membership_id, recognition_code, track, start_date) VALUES (15, 'HONORARY_GRANDMASTER', 'MANUAL', '2026-10-07')");
  }));

  // ── 0120 Senior overlay ───────────────────────────────────────────────────
  const AUTO_OK = "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, eligibility_date, qualification_snapshot) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-07', '2026-10-01', '{\"path\":\"P3\"}')";
  await check('overlay: valid AUTO and MANUAL (legacy Senior row of the same user) accepted', () => scratch(c, async () => {
    await c.query(AUTO_OK, [userOf(40)]);
    await c.query("INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id, legacy_recording_date) VALUES (?, 'ACTIVE', 'MANUAL', 8, '2026-09-29')", [userOf(12)]);
  }));
  await check('overlay: AUTO requires achieved_date, eligibility_date, snapshot and no legacy ref', () => scratch(c, async () => {
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, eligibility_date, qualification_snapshot) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-01', '{}')", [userOf(40)], CHECK);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, qualification_snapshot) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-07', '{}')", [userOf(40)], CHECK);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, eligibility_date) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-07', '2026-10-01')", [userOf(40)], CHECK);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, eligibility_date, qualification_snapshot, legacy_recognition_id) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-07', '2026-10-01', '{}', 8)", [userOf(12)], CHECK);
  }));
  await check('overlay: no backdating (eligibility_date after achieved_date refused)', () => scratch(c, async () => {
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, eligibility_date, qualification_snapshot) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-01', '2026-10-07', '{}')", [userOf(40)], CHECK);
  }));
  await check('overlay: snapshot must be valid JSON', () => scratch(c, async () => {
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, eligibility_date, qualification_snapshot) VALUES (?, 'ACTIVE', 'AUTO', '2026-10-07', '2026-10-01', 'not json')", [userOf(40)], CHECK);
  }));
  await check('overlay: MANUAL needs a legacy reference; Honorary rows 3/7 and other users\' Senior rows never qualify', () => scratch(c, async () => {
    // The insert trigger and the CHECK both reject this; whichever fires first, it is refused.
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance) VALUES (?, 'ACTIVE', 'MANUAL')", [userOf(12)], /3819|45000|1644/);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 3)", [userOf(16)], SIGNAL);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 7)", [userOf(20)], SIGNAL);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 9)", [userOf(12)], SIGNAL);
  }));
  await check('overlay: one per user; one per legacy recognition; created ACTIVE only', () => scratch(c, async () => {
    await c.query(AUTO_OK, [userOf(40)]);
    await expectError(c, AUTO_OK, [userOf(40)], DUP);
    await c.query("INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 8)", [userOf(12)]);
    // Re-using legacy row 8 for another user: refused by the trigger (wrong owner) or uq_sso_legacy_recognition.
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 8)", [userOf(13)], /1062|45000|1644/);
    await expectError(c, "INSERT INTO senior_status_overlays (user_id, status, provenance, achieved_date, eligibility_date, qualification_snapshot) VALUES (?, 'REMOVED', 'AUTO', '2026-10-07', '2026-10-01', '{}')", [userOf(41)], SIGNAL);
  }));
  await check('overlay: immutable fields; MANUAL snapshot stays NULL; status may move; no delete; user RESTRICT', () => scratch(c, async () => {
    await c.query(AUTO_OK, [userOf(40)]);
    await c.query("INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 8)", [userOf(12)]);
    const [[auto]] = await c.query('SELECT id FROM senior_status_overlays WHERE user_id = ?', [userOf(40)]);
    const [[manual]] = await c.query('SELECT id FROM senior_status_overlays WHERE user_id = ?', [userOf(12)]);
    await expectError(c, "UPDATE senior_status_overlays SET provenance = 'MANUAL' WHERE id = ?", [auto.id], SIGNAL);
    await expectError(c, "UPDATE senior_status_overlays SET qualification_snapshot = '{\"x\":1}' WHERE id = ?", [auto.id], SIGNAL);
    await expectError(c, "UPDATE senior_status_overlays SET achieved_date = '2026-10-08' WHERE id = ?", [auto.id], SIGNAL);
    await expectError(c, "UPDATE senior_status_overlays SET qualification_snapshot = '{}' WHERE id = ?", [manual.id], SIGNAL);
    await expectError(c, "UPDATE senior_status_overlays SET achieved_date = '2026-09-29' WHERE id = ?", [manual.id], SIGNAL);
    await c.query("UPDATE senior_status_overlays SET status = 'REMOVED' WHERE id = ?", [auto.id]);
    await c.query("UPDATE senior_status_overlays SET status = 'ACTIVE' WHERE id = ?", [auto.id]);
    await c.query("UPDATE senior_status_overlays SET historical_achievement_date = '2015-01-01' WHERE id = ?", [manual.id]);
    await expectError(c, "UPDATE senior_status_overlays SET historical_achievement_date = '2016-01-01' WHERE id = ?", [manual.id], SIGNAL);
    await expectError(c, 'DELETE FROM senior_status_overlays WHERE id = ?', [auto.id], SIGNAL);
    await expectError(c, 'DELETE FROM users WHERE id = ?', [userOf(40)], FK);
  }));
  await check('overlay coexists with an ACTIVE Recognition Class on the same membership', () => scratch(c, async () => {
    await c.query("INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 8)", [userOf(12)]);
    await c.query("INSERT INTO member_recognitions (membership_id, recognition_code, track, start_date) VALUES (12, 'HONORARY_SENIOR_MEMBER', 'MANUAL', '2026-10-07')");
  }));
  await check('legacy Senior row referenced by an overlay cannot be deleted (guard + FK)', () => scratch(c, async () => {
    await c.query("INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 8)", [userOf(12)]);
    await expectError(c, 'DELETE FROM member_recognitions WHERE id = 8', [], /45000|1644|1451/);
  }));

  // ── 0121 transitions ──────────────────────────────────────────────────────
  async function newAudit(subject) {
    const [r] = await c.query("INSERT INTO membership_audit_log (membership_id, subject_user_id, event_type, actor_type, actor_user_id) VALUES (NULL, ?, 'SENIOR_TEST', 'ADMIN', 1)", [subject]);
    return r.insertId;
  }
  await check('transitions: AWARDED -> REMOVED -> RESCINDED chain; append-only; one audit row each', () => scratch(c, async () => {
    await c.query(AUTO_OK, [userOf(40)]);
    const [[o]] = await c.query('SELECT id FROM senior_status_overlays WHERE user_id = ?', [userOf(40)]);
    const a1 = await newAudit(userOf(40));
    await c.query("INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, membership_audit_log_id) VALUES (?, NULL, 'ACTIVE', 'AWARDED', 'SYSTEM', ?)", [o.id, a1]);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, membership_audit_log_id) VALUES (?, NULL, 'ACTIVE', 'AWARDED', 'SYSTEM', ?)", [o.id, await newAudit(userOf(40))], SIGNAL);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, membership_audit_log_id) VALUES (?, 'REMOVED', 'ACTIVE', 'RESCINDED', 'ADMIN', 1, ?)", [o.id, await newAudit(userOf(40))], SIGNAL);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'ADMIN', 1, ?)", [o.id, await newAudit(userOf(40))], CHECK);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, reason, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'SYSTEM', 'r', ?)", [o.id, await newAudit(userOf(40))], CHECK);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, reason, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'ADMIN', 'r', ?)", [o.id, await newAudit(userOf(40))], CHECK);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, reason, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'ADMIN', 1, '   ', ?)", [o.id, await newAudit(userOf(40))], CHECK);
    await c.query("INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, reason, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'ADMIN', 1, 'governance removal', ?)", [o.id, await newAudit(userOf(40))]);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, reason, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'ADMIN', 1, 'again', ?)", [o.id, await newAudit(userOf(40))], SIGNAL);
    await c.query("INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, reason, membership_audit_log_id) VALUES (?, 'REMOVED', 'ACTIVE', 'RESCINDED', 'ADMIN', 1, 'rescinded', ?)", [o.id, await newAudit(userOf(40))]);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, membership_audit_log_id) VALUES (?, NULL, 'ACTIVE', 'CARRIED_OVER', 'SYSTEM', ?)", [o.id, await newAudit(userOf(40))], SIGNAL);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, reason, membership_audit_log_id) VALUES (?, 'ACTIVE', 'REMOVED', 'REMOVED', 'ADMIN', 1, 'dup audit', ?)", [o.id, a1], DUP);
    await expectError(c, "UPDATE senior_status_transitions SET reason = 'edited' WHERE overlay_id = ?", [o.id], SIGNAL);
    await expectError(c, 'DELETE FROM senior_status_transitions WHERE overlay_id = ?', [o.id], SIGNAL);
    await expectError(c, 'DELETE FROM membership_audit_log WHERE id = ?', [a1], FK);
  }));
  await check('transitions: CARRIED_OVER only for MANUAL overlays', () => scratch(c, async () => {
    await c.query("INSERT INTO senior_status_overlays (user_id, status, provenance, legacy_recognition_id) VALUES (?, 'ACTIVE', 'MANUAL', 8)", [userOf(12)]);
    const [[o]] = await c.query('SELECT id FROM senior_status_overlays WHERE user_id = ?', [userOf(12)]);
    await expectError(c, "INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, membership_audit_log_id) VALUES (?, NULL, 'ACTIVE', 'AWARDED', 'SYSTEM', ?)", [o.id, await newAudit(userOf(12))], SIGNAL);
    await c.query("INSERT INTO senior_status_transitions (overlay_id, from_status, to_status, transition_type, actor_type, actor_user_id, membership_audit_log_id) VALUES (?, NULL, 'ACTIVE', 'CARRIED_OVER', 'ADMIN', 1, ?)", [o.id, await newAudit(userOf(12))]);
  }));

  // ── 0122 audit subject user ───────────────────────────────────────────────
  await check('audit: legacy-shape inserts still work; subject_user_id optional, indexed, SET NULL on user delete', () => scratch(c, async () => {
    await c.query("INSERT INTO membership_audit_log (membership_id, event_type, actor_type) VALUES (12, 'LEGACY_SHAPE', 'SYSTEM')");
    await c.query("INSERT INTO membership_audit_log (subject_user_id, event_type, actor_type) VALUES (901, 'SUBJECT_SHAPE', 'SYSTEM')");
    await c.query('DELETE FROM users WHERE id = 901');
    const [[r]] = await c.query("SELECT subject_user_id FROM membership_audit_log WHERE event_type = 'SUBJECT_SHAPE'");
    assert(r.subject_user_id === null, 'subject not nulled');
    const [idx] = await c.query("SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'membership_audit_log' AND index_name = 'idx_audit_subject_user'");
    assert(idx.length === 1, 'index missing');
    await expectError(c, "INSERT INTO membership_audit_log (subject_user_id, event_type) VALUES (999999, 'X')", [], FK);
  }));
  await check('audit: membership_audit_log has no new UPDATE/DELETE protection triggers', async () => {
    const [t] = await c.query("SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND event_object_table = 'membership_audit_log'");
    assert(t.length === 0, JSON.stringify(t));
  });

  // ── 0119 service ledger ───────────────────────────────────────────────────
  const P = (o = {}) => {
    const row = {
      user_id: userOf(12), membership_id: 12, start_date: '2015-03-01', start_precision: 'EXACT', start_attestation: null,
      end_date: null, end_precision: null, end_attestation: null, evidence_kind: 'PERIOD', continuity_established: 1,
      basis: 'HISTORICAL_RECONCILIATION', native_source_type: null, native_source_id: null, established_by_type: 'ADMIN',
      established_by_user_id: 1, supersedes_period_id: null, ...o,
    };
    const cols = Object.keys(row);
    return [`INSERT INTO recognized_service_periods (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((k) => row[k])];
  };
  const ins = async (o) => { const [sql, v] = P(o); const [r] = await c.query(sql, v); return r.insertId; };
  const insErr = async (o, pattern) => { const [sql, v] = P(o); await expectError(c, sql, v, pattern); };

  await check('ledger: valid EXACT / MONTH+attestation / YEAR+attestation / open-ended rows accepted', () => scratch(c, async () => {
    await ins({});
    await ins({ start_date: '2015-03-01', start_precision: 'MONTH', start_attestation: 'BOUNDARY', end_date: '2018-01-01', end_precision: 'YEAR', end_attestation: 'PERIOD' });
    await ins({ membership_id: null, evidence_kind: 'POINT', continuity_established: 0, start_date: '2016-05-10' });
  }));
  await check('ledger: precision/attestation/encoding consistency enforced', () => scratch(c, async () => {
    await insErr({ start_precision: 'MONTH' }, CHECK);
    await insErr({ start_precision: 'EXACT', start_attestation: 'PERIOD' }, CHECK);
    await insErr({ start_precision: 'MONTH', start_attestation: 'PERIOD', start_date: '2015-03-15' }, CHECK);
    await insErr({ start_precision: 'YEAR', start_attestation: 'PERIOD', start_date: '2015-03-01' }, CHECK);
    await insErr({ end_date: '2018-01-01' }, CHECK);
    await insErr({ end_precision: 'EXACT' }, CHECK);
    await insErr({ end_date: '2018-02-01', end_precision: 'MONTH' }, CHECK);
  }));
  await check('ledger: POINT evidence cannot establish continuity', () => scratch(c, async () => {
    await insErr({ evidence_kind: 'POINT', continuity_established: 1 }, CHECK);
  }));
  await check('ledger: native basis <=> native source; verification fields consistent', () => scratch(c, async () => {
    await insErr({ basis: 'NATIVE_LIFECYCLE' }, CHECK);
    await insErr({ native_source_type: 'MEMBERSHIP_TERM', native_source_id: 5 }, CHECK);
    await insErr({ verification_status: 'VERIFIED' }, CHECK);
    await insErr({ verification_status: 'REJECTED', verified_by_user_id: 1, verified_at: '2026-10-07 00:00:00' }, CHECK);
    await insErr({ established_by_type: 'ADMIN', established_by_user_id: null }, CHECK);
  }));
  await check('ledger: individual ownership (other user\'s or GROUP membership refused)', () => scratch(c, async () => {
    await insErr({ membership_id: 13 }, SIGNAL);
    await insErr({ user_id: userOf(42), membership_id: 42 }, SIGNAL);
  }));
  await check('ledger: native capture idempotent; corrections append with supersession', () => scratch(c, async () => {
    const native = { basis: 'NATIVE_LIFECYCLE', native_source_type: 'MEMBERSHIP_TERM', native_source_id: 77, established_by_type: 'SYSTEM', established_by_user_id: null };
    const first = await ins(native);
    await insErr(native, DUP);
    const correction = await ins({ ...native, supersedes_period_id: first, start_date: '2015-04-01' });
    await insErr({ ...native, supersedes_period_id: first }, DUP); // one direct successor
    await c.query("UPDATE recognized_service_periods SET correction_state = 'CORRECTED' WHERE id = ?", [first]);
    await expectError(c, "UPDATE recognized_service_periods SET correction_state = 'CURRENT' WHERE id = ?", [first], SIGNAL);
    await insErr({ user_id: userOf(13), membership_id: 13, supersedes_period_id: correction }, SIGNAL); // cross-user
    await insErr({ correction_state: 'CORRECTED' }, SIGNAL);
  }));
  await check('ledger: immutable boundaries/evidence; verification decided once; no delete; user RESTRICT', () => scratch(c, async () => {
    const id = await ins({});
    for (const set of ["start_date = '2014-01-01'", "end_date = '2020-01-01', end_precision = 'EXACT'", "evidence_kind = 'BOUNDARY'",
      'continuity_established = 0', 'user_id = 1', "basis = 'GOVERNANCE_ATTESTATION'", "evidence_note = 'edited'"]) {
      await expectError(c, `UPDATE recognized_service_periods SET ${set} WHERE id = ?`, [id], SIGNAL);
    }
    await c.query("UPDATE recognized_service_periods SET verification_status = 'VERIFIED', verified_by_user_id = 1, verified_at = '2026-10-07 10:00:00' WHERE id = ?", [id]);
    await expectError(c, "UPDATE recognized_service_periods SET verification_status = 'REJECTED', verification_reason = 'x' WHERE id = ?", [id], SIGNAL);
    await expectError(c, 'DELETE FROM recognized_service_periods WHERE id = ?', [id], SIGNAL);
    await expectError(c, 'DELETE FROM users WHERE id = ?', [userOf(12)], FK);
  }));

  // ── idempotency: re-applying every migration body changes nothing ─────────
  await check('re-applying 0119-0124 (runner record removed) is idempotent', async () => {
    const [schemaBefore] = await c.query("SELECT table_name, column_name, column_type, generation_expression FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position");
    await c.query('DELETE FROM schema_migrations');
    for (const f of MIGRATIONS) applyFile(readFileSync(join(ROOT, 'database/migrations', f), 'utf8'), `${f} (re-run)`);
    const [schemaAfter] = await c.query("SELECT table_name, column_name, column_type, generation_expression FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position");
    assert(JSON.stringify(schemaAfter) === JSON.stringify(schemaBefore), 'schema changed on re-run');
    const [after] = await c.query(RECOGNITION_HASH);
    assert(JSON.stringify(after) === JSON.stringify(recBefore), 'recognition rows changed on re-run');
  });

  await c.end();

  const failed = results.filter((r) => !r[0]);
  for (const [ok, name, why] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      -> ${why}`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed${MUTATION ? ` (mutation: ${MUTATION})` : ''}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-wp2-schema aborted:', err.message);
  process.exit(3);
});
