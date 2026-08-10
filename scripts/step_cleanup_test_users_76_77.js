// scripts/step_cleanup_test_users_76_77.js
//
// One-off cleanup of the two known test accounts ahead of resuming
// Membership Acquisition work.
//
//   user 76 -- username 'raghav', raghavchandra21@gmail.com
//     membership 82 -- PENDING, Basic Member, no membership_number, no
//     financial contribution. Fully disposable.
//
//   user 77 -- 'test@bhopal.info'
//     membership 83 -- ACTIVE, Individual Member, membership_number
//     BCC20260800053, NO financial contribution (pre-dates the
//     payment-gating fix in commit aab8961).
//     membership 84 -- ACTIVE, Individual Member, membership_number
//     BCC20260800054, financial_contributions id=1 (COMPLETED, Razorpay
//     TEST MODE, no real funds moved), financial_transactions id=2,
//     receipts id=2, 6 financial_event_outbox rows, 1
//     settlement_webhook_inbox row.
//
// IMPORTANT -- discovered during dry-run against production: this schema
// has two constitutional triggers enforcing MEM-007 that this script does
// NOT attempt to bypass:
//   trg_prevent_numbered_membership_delete -- BEFORE DELETE on memberships,
//     unconditionally blocks hard-deleting a membership that has an
//     allocated membership_number/number_serial. Its own message says:
//     "Retire it via lifecycle_state instead."
//   trg_membership_number_immutable -- BEFORE UPDATE, blocks changing or
//     nulling membership_number/number_serial once set.
// Memberships 83 and 84 both carry allocated numbers, so they CANNOT be
// hard-deleted by this or any script -- by design. They are retired to
// TERMINATED via the canonical MembershipLifecycleService.terminate()
// call instead (see scripts/tools/retire-test-memberships-83-84.ts),
// which must be run separately. Because those two memberships must
// continue to exist (and reference user 77 via a RESTRICT FK), user 77's
// `users` row also cannot be deleted. This script therefore:
//   - fully deletes user 76 and membership 82 (no number, no restriction)
//   - deletes the disposable Razorpay TEST MODE financial artifacts tied
//     to contribution 1 (explicit test-data exception authorized in
//     chat -- NOT a change to PAY-001 financial-immutability policy;
//     PAY-001 governs real settlement records, this is TEST MODE)
//   - deletes user 77's session/notification/consent/lockout noise
//   - does NOT touch membership_number_log, membership_audit_log, or
//     membership_approval_stages for memberships 83/84 -- those remain
//     as the legitimate history of the (now-terminated) memberships
//   - does NOT touch membership_number_pool -- serials 53/54 stay
//     permanently retired/non-reused per MP-003
//   - does NOT delete memberships 83/84 or the user 77 row
//
// Usage (run from the server, using the server's own backend/.env):
//   node scripts/step_cleanup_test_users_76_77.js            -- dry run (default)
//   node scripts/step_cleanup_test_users_76_77.js --execute   -- actually delete
//
// Run scripts/tools/retire-test-memberships-83-84.ts (separately, via
// ts-node with the Nest app context) either before or after this script;
// the two operations are independent.

const mysql = require('mysql2/promise');
const fs = require('fs');

const EXECUTE = process.argv.includes('--execute');

const CONTRIBUTION_ID = 1;

function readEnv(path, key) {
  const line = fs.readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${path}`);
  return line.slice(key.length + 1).trim();
}

async function assertDelete(connection, label, sql, params, expected) {
  const [result] = await connection.execute(sql, params);
  if (result.affectedRows !== expected) {
    throw new Error(
      `${label}: expected to delete ${expected} row(s), deleted ${result.affectedRows}. Aborting.`,
    );
  }
  console.log(`  [ok] ${label}: deleted ${result.affectedRows}`);
}

async function main() {
  const envPath = process.env.BACKEND_ENV_PATH || '/var/www/bcc-v3/backend/.env';
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'bcc_v3_app',
    password: readEnv(envPath, 'DB_PASSWORD'),
    database: 'bcc_v3',
  });

  try {
    // ---- Preconditions ---------------------------------------------------
    const [users] = await connection.execute(
      'SELECT id, username, email FROM users WHERE id IN (76, 77)',
    );
    if (users.length !== 2) {
      throw new Error(`Expected exactly 2 users for ids 76,77, found ${users.length}.`);
    }
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    if (byId[76].username !== 'raghav' || byId[76].email !== 'raghavchandra21@gmail.com') {
      throw new Error(`Refusing: user 76 does not match expected identity. Found: ${JSON.stringify(byId[76])}`);
    }
    if (byId[77].email !== 'test@bhopal.info') {
      throw new Error(`Refusing: user 77 does not match expected identity. Found: ${JSON.stringify(byId[77])}`);
    }

    const [memberships] = await connection.execute(
      'SELECT id, user_id, lifecycle_state, membership_number FROM memberships WHERE id IN (82, 83, 84)',
    );
    if (memberships.length !== 3) {
      throw new Error(`Expected exactly 3 memberships for ids 82,83,84, found ${memberships.length}.`);
    }
    const memById = Object.fromEntries(memberships.map((m) => [m.id, m]));
    if (memById[82].user_id !== 76 || memById[82].membership_number !== null) {
      throw new Error('Refusing: membership 82 shape mismatch (expected user 76, no number).');
    }
    if (memById[83].user_id !== 77 || memById[83].membership_number !== 'BCC20260800053') {
      throw new Error('Refusing: membership 83 shape mismatch.');
    }
    if (memById[84].user_id !== 77 || memById[84].membership_number !== 'BCC20260800054') {
      throw new Error('Refusing: membership 84 shape mismatch.');
    }

    const [contributions] = await connection.execute(
      'SELECT id, state, business_module, business_reference_id, payer_user_id FROM financial_contributions WHERE id = ?',
      [CONTRIBUTION_ID],
    );
    if (contributions.length !== 1) {
      throw new Error(`Expected exactly 1 financial_contributions row for id=${CONTRIBUTION_ID}, found ${contributions.length}.`);
    }
    const contribution = contributions[0];
    if (
      contribution.business_module !== 'MEMBERSHIP' ||
      Number(contribution.business_reference_id) !== 84 ||
      Number(contribution.payer_user_id) !== 77
    ) {
      throw new Error(`Refusing: contribution ${CONTRIBUTION_ID} shape mismatch. Found: ${JSON.stringify(contribution)}`);
    }

    console.log('Preconditions verified:');
    console.log(`  user 76: ${byId[76].username} / ${byId[76].email}`);
    console.log(`  user 77: ${byId[77].email}`);
    console.log(`  membership 82 (user 76): ${memById[82].lifecycle_state}, number=${memById[82].membership_number}`);
    console.log(`  membership 83 (user 77): ${memById[83].lifecycle_state}, number=${memById[83].membership_number}`);
    console.log(`  membership 84 (user 77): ${memById[84].lifecycle_state}, number=${memById[84].membership_number}`);
    console.log(`  contribution 1: ${contribution.state}, business_reference_id=${contribution.business_reference_id}`);

    if (!EXECUTE) {
      console.log('\nDry run only (no --execute flag). No rows deleted.');
      return;
    }

    await connection.beginTransaction();

    // ---- Step A: disposable TEST MODE financial artifacts for contribution 1 ----
    await assertDelete(connection, 'financial_event_outbox (contribution_id=1)', 'DELETE FROM financial_event_outbox WHERE contribution_id = ?', [CONTRIBUTION_ID], 6);
    await assertDelete(connection, 'settlement_webhook_inbox (contribution_id=1)', 'DELETE FROM settlement_webhook_inbox WHERE contribution_id = ?', [CONTRIBUTION_ID], 1);
    await assertDelete(connection, 'receipts (contribution_id=1)', 'DELETE FROM receipts WHERE contribution_id = ?', [CONTRIBUTION_ID], 1);
    await assertDelete(connection, 'financial_transactions (contribution_id=1)', 'DELETE FROM financial_transactions WHERE contribution_id = ?', [CONTRIBUTION_ID], 1);
    await assertDelete(connection, 'financial_refunds (contribution_id=1)', 'DELETE FROM financial_refunds WHERE contribution_id = ?', [CONTRIBUTION_ID], 0);
    await assertDelete(connection, 'financial_settlement_evidence (financial_contribution_id=1)', 'DELETE FROM financial_settlement_evidence WHERE financial_contribution_id = ?', [CONTRIBUTION_ID], 0);
    await assertDelete(connection, 'financial_contributions (id=1)', 'DELETE FROM financial_contributions WHERE id = ?', [CONTRIBUTION_ID], 1);

    // ---- Step B: membership 82 (user 76) -- no number, fully disposable ----
    await assertDelete(connection, 'membership_audit_log (membership_id=82)', 'DELETE FROM membership_audit_log WHERE membership_id = 82', [], 0);
    await assertDelete(connection, 'membership_approval_stages (membership_id=82)', 'DELETE FROM membership_approval_stages WHERE membership_id = 82', [], 0);
    await assertDelete(connection, 'memberships (id=82)', 'DELETE FROM memberships WHERE id = 82', [], 1);

    // ---- Step C: user 76 -- fully disposable ----
    await assertDelete(connection, 'auth_identities (user_id=76)', 'DELETE FROM auth_identities WHERE user_id = 76', [], 1);
    await assertDelete(connection, 'login_history (user_id=76)', 'DELETE FROM login_history WHERE user_id = 76', [], 0);
    await assertDelete(connection, 'refresh_tokens (user_id=76)', 'DELETE FROM refresh_tokens WHERE user_id = 76', [], 2);
    await assertDelete(connection, 'in_app_notifications (user_id=76)', 'DELETE FROM in_app_notifications WHERE user_id = 76', [], 0);
    await assertDelete(connection, 'notification_log (user_id=76)', 'DELETE FROM notification_log WHERE user_id = 76', [], 0);
    await assertDelete(connection, 'membership_consent_log (user_id=76)', 'DELETE FROM membership_consent_log WHERE user_id = 76', [], 1);
    await assertDelete(connection, 'identity_audit_log (target/actor=76)', 'DELETE FROM identity_audit_log WHERE target_user_id = 76 OR actor_id = 76', [], 1);
    await assertDelete(connection, 'account_lockouts (user_id/unlocked_by=76)', 'DELETE FROM account_lockouts WHERE user_id = 76 OR unlocked_by = 76', [], 0);
    await assertDelete(connection, 'email_verification_tokens (user_id=76)', 'DELETE FROM email_verification_tokens WHERE user_id = 76', [], 0);
    await assertDelete(connection, 'users (id=76)', 'DELETE FROM users WHERE id = 76', [], 1);

    // ---- Step D: user 77 -- session/notification/consent noise only.     ----
    // The `users` row itself and memberships 83/84 are NOT deleted -- see
    // header comment. membership_audit_log/approval_stages/number_log for
    // 83/84 are NOT touched -- they remain as the memberships' history.
    await assertDelete(connection, 'account_lockouts (user_id/unlocked_by=77)', 'DELETE FROM account_lockouts WHERE user_id = 77 OR unlocked_by = 77', [], 1);
    await assertDelete(connection, 'email_verification_tokens (user_id=77)', 'DELETE FROM email_verification_tokens WHERE user_id = 77', [], 1);
    await assertDelete(connection, 'login_history (user_id=77)', 'DELETE FROM login_history WHERE user_id = 77', [], 4);
    await assertDelete(connection, 'refresh_tokens (user_id=77)', 'DELETE FROM refresh_tokens WHERE user_id = 77', [], 7);
    await assertDelete(connection, 'in_app_notifications (user_id=77)', 'DELETE FROM in_app_notifications WHERE user_id = 77', [], 2);
    await assertDelete(connection, 'notification_log (user_id=77)', 'DELETE FROM notification_log WHERE user_id = 77', [], 5);
    await assertDelete(connection, 'membership_consent_log (user_id=77)', 'DELETE FROM membership_consent_log WHERE user_id = 77', [], 2);
    await assertDelete(connection, 'identity_audit_log (target/actor=77)', 'DELETE FROM identity_audit_log WHERE target_user_id = 77 OR actor_id = 77', [], 1);

    await connection.commit();
    console.log('\nCommitted.');
    console.log('User 76 (raghav) and membership 82: fully deleted.');
    console.log('User 77 (test@bhopal.info): session/notification noise deleted; users row and memberships 83/84 RETAINED (MEM-007 trigger-enforced, cannot be hard-deleted).');
    console.log('Contribution 1 + its transaction/receipt/outbox/webhook-inbox rows: deleted (Razorpay TEST MODE, explicit one-off exception).');
    console.log('membership_number_pool untouched: serials 53 and 54 remain permanently retired.');
    console.log('\nNext: run scripts/tools/retire-test-memberships-83-84.ts to transition memberships 83/84 to TERMINATED via the canonical lifecycle service.');
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error('\nABORTED, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
