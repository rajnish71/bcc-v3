// scripts/step22b_repair_membership_84.js
//
// STEP 22B — one-off historical test-artifact repair, membership id 84 ONLY.
//
// Membership 84 is a pre-Step-22 test artifact: it was pushed to APPROVED
// under the OLD workflow (admin approval before payment existed). Under the
// current workflow (PAY-001 workflow-ordering fix), a Financial Contribution
// settles while the membership is still PENDING, and only an administrator's
// separate final approval moves PENDING -> APPROVED -> ACTIVE.
//
// Contribution 1 has now been legitimately reconciled to COMPLETED (real
// Razorpay payment pay_TNjMycYTQgAN5x, captured, replayed through the
// corrected RazorpayWebhookService -- see commits ca1e878 / 94d3286).
// MembershipFinancialListener.handleContributionCompleted() could not act on
// it because recordPaymentReceived() requires PENDING and membership 84 is
// APPROVED -- by design, no application code transitions APPROVED -> PENDING.
//
// This script performs the narrow, one-time data correction needed to put
// membership 84 back into the state the NEW workflow expects it to have
// reached on its own: PENDING, with pending_contribution_id still pointing
// at the now-COMPLETED contribution, ready for a real final-approval test.
//
// It does NOT:
//   - touch any other membership row (WHERE id = 84 always, no exceptions)
//   - modify any lifecycle transition definition or service method
//   - introduce a new lifecycle state
//   - alter financial_contributions / financial_transactions / receipts
//   - run automatically -- must be invoked deliberately, once
//
// Usage (run from the server, using the server's own backend/.env):
//   node scripts/step22b_repair_membership_84.js

const mysql = require('mysql2/promise');
const fs = require('fs');

const MEMBERSHIP_ID = 84;

function readEnv(path, key) {
  const line = fs.readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in ${path}`);
  return line.slice(key.length + 1).trim();
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
    const [before] = await connection.execute(
      'SELECT id, lifecycle_state, pending_contribution_id, membership_class_id FROM memberships WHERE id = ?',
      [MEMBERSHIP_ID],
    );
    if (before.length !== 1) throw new Error(`Expected exactly one membership row for id=${MEMBERSHIP_ID}, found ${before.length}`);
    const membership = before[0];

    if (membership.lifecycle_state !== 'APPROVED') {
      console.log(`Membership ${MEMBERSHIP_ID} is already '${membership.lifecycle_state}', not 'APPROVED' -- refusing to touch it.`);
      return;
    }

    const [contribution] = await connection.execute(
      'SELECT id, state FROM financial_contributions WHERE id = ?',
      [membership.pending_contribution_id],
    );
    if (contribution.length !== 1 || contribution[0].state !== 'COMPLETED') {
      throw new Error(
        `Refusing to reset membership ${MEMBERSHIP_ID}: pending_contribution_id ${membership.pending_contribution_id} is not a COMPLETED contribution.`,
      );
    }

    await connection.beginTransaction();

    const [result] = await connection.execute(
      "UPDATE memberships SET lifecycle_state = 'PENDING' WHERE id = ? AND lifecycle_state = 'APPROVED'",
      [MEMBERSHIP_ID],
    );
    if (result.affectedRows !== 1) {
      throw new Error(`Expected to update exactly 1 row, updated ${result.affectedRows} -- rolling back.`);
    }

    await connection.execute(
      `INSERT INTO membership_audit_log (membership_id, event_type, actor_type, old_value, new_value, notes)
       VALUES (?, 'LIFECYCLE_TRANSITION', 'ADMIN', ?, ?, ?)`,
      [
        MEMBERSHIP_ID,
        JSON.stringify({ state: 'APPROVED' }),
        JSON.stringify({ state: 'PENDING' }),
        'STEP 22B one-off historical test-artifact repair: membership 84 was pushed to APPROVED under the pre-Step-22 workflow, before the payment-then-approval ordering existed. Contribution 1 has since been legitimately reconciled to COMPLETED via a corrected/replayed Razorpay webhook (pay_TNjMycYTQgAN5x). Reset to PENDING so the NEW workflow (payment already received -> final admin approval -> ACTIVE) can be exercised correctly. Scoped to membership id 84 only; no lifecycle code changed.',
      ],
    );

    await connection.commit();

    const [after] = await connection.execute(
      'SELECT id, lifecycle_state, pending_contribution_id, membership_class_id FROM memberships WHERE id = ?',
      [MEMBERSHIP_ID],
    );
    console.log('BEFORE:', before[0]);
    console.log('AFTER: ', after[0]);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
