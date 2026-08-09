// scripts/step22c_repair_membership_84_approval_stage.js
//
// STEP 22C — one-off historical test-artifact repair, membership id 84 ONLY.
//
// Step 22B (scripts/step22b_repair_membership_84.js) reset membership 84's
// lifecycle_state from the pre-Step-22 test artifact 'APPROVED' back to
// 'PENDING', with pending_contribution_id restored to the now-legitimately-
// COMPLETED contribution 1. That script did NOT touch
// membership_approval_stages, so stale row id=34 (stage=COORDINATOR,
// decision=APPROVED, created under the OLD pre-payment-ordering workflow)
// was left behind.
//
// membership_approval_stages has UNIQUE KEY uq_appstage (membership_id, stage),
// and ApplicationWorkflowService.recordStageDecision() refuses to decide a
// stage twice:
//   "The COORDINATOR stage has already been decided for this application."
// (application-workflow.service.ts, ConflictException). For membership 84's
// class (Individual Member / OPERATIONAL / PAYMENT_REQUIRED), COORDINATOR is
// the ONLY required stage (requiredStages() returns ['COORDINATOR'] for any
// non-CONSTITUTIONAL class per application-workflow.service.ts). With the
// stale row present, POST /api/v1/membership/84/approve can never succeed --
// not even to re-run the real decision that Step 23 needs to exercise.
//
// This script deletes ONLY that one stale row (id=34) so the real approval
// endpoint can be called fresh, going through
// ApplicationWorkflowService.recordStageDecision() ->
// MembershipLifecycleService.approve() exactly as production code intends.
//
// It does NOT:
//   - touch memberships, financial_contributions, financial_transactions,
//     receipts, or financial_refunds
//   - touch any approval_stages row other than id=34
//   - touch any membership other than id=84
//   - modify any lifecycle transition definition or service method
//   - introduce a new lifecycle state or a reusable "reset approval stage"
//     feature
//   - run automatically -- must be invoked deliberately, once
//
// Preconditions verified (all must hold, or the script aborts with no writes):
//   1. memberships.id = 84 exists
//   2. memberships.lifecycle_state = 'PENDING'
//   3. memberships.pending_contribution_id = 1
//   4. financial_contributions.id = 1, state = 'COMPLETED'
//   5. membership_classes row for membership 84 is type OPERATIONAL
//      (i.e. NOT CONSTITUTIONAL -- COORDINATOR is the sole required stage)
//   6. exactly ONE row in membership_approval_stages for membership_id = 84
//   7. that row is id = 34, stage = 'COORDINATOR', decision = 'APPROVED'
//
// Usage (run from the server, using the server's own backend/.env):
//   node scripts/step22c_repair_membership_84_approval_stage.js

const mysql = require('mysql2/promise');
const fs = require('fs');

const MEMBERSHIP_ID = 84;
const EXPECTED_CONTRIBUTION_ID = 1;
const EXPECTED_STAGE_ROW_ID = 34;

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
    // ---- Precondition 1-3: membership state ------------------------------
    const [memberships] = await connection.execute(
      'SELECT id, lifecycle_state, pending_contribution_id, membership_class_id FROM memberships WHERE id = ?',
      [MEMBERSHIP_ID],
    );
    if (memberships.length !== 1) {
      throw new Error(`Expected exactly one membership row for id=${MEMBERSHIP_ID}, found ${memberships.length}.`);
    }
    const membership = memberships[0];

    if (membership.lifecycle_state !== 'PENDING') {
      throw new Error(
        `Refusing to touch membership ${MEMBERSHIP_ID}: expected lifecycle_state 'PENDING', found '${membership.lifecycle_state}'.`,
      );
    }
    if (Number(membership.pending_contribution_id) !== EXPECTED_CONTRIBUTION_ID) {
      throw new Error(
        `Refusing to touch membership ${MEMBERSHIP_ID}: expected pending_contribution_id=${EXPECTED_CONTRIBUTION_ID}, found ${membership.pending_contribution_id}.`,
      );
    }

    // ---- Precondition 4: contribution state -------------------------------
    const [contributions] = await connection.execute(
      'SELECT id, state, business_module, business_reference_id FROM financial_contributions WHERE id = ?',
      [EXPECTED_CONTRIBUTION_ID],
    );
    if (contributions.length !== 1) {
      throw new Error(`Expected exactly one financial_contributions row for id=${EXPECTED_CONTRIBUTION_ID}, found ${contributions.length}.`);
    }
    const contribution = contributions[0];
    if (contribution.state !== 'COMPLETED') {
      throw new Error(`Refusing to proceed: contribution ${EXPECTED_CONTRIBUTION_ID} is '${contribution.state}', not 'COMPLETED'.`);
    }
    if (contribution.business_module !== 'MEMBERSHIP' || Number(contribution.business_reference_id) !== MEMBERSHIP_ID) {
      throw new Error(
        `Refusing to proceed: contribution ${EXPECTED_CONTRIBUTION_ID} does not reference membership ${MEMBERSHIP_ID} (business_module=${contribution.business_module}, business_reference_id=${contribution.business_reference_id}).`,
      );
    }

    // ---- Precondition 5: membership class is OPERATIONAL (not CONSTITUTIONAL) --
    const [classes] = await connection.execute(
      'SELECT id, type, activation_mode FROM membership_classes WHERE id = ?',
      [membership.membership_class_id],
    );
    if (classes.length !== 1) {
      throw new Error(`Expected exactly one membership_classes row for id=${membership.membership_class_id}, found ${classes.length}.`);
    }
    const membershipClass = classes[0];
    if (membershipClass.type !== 'OPERATIONAL') {
      throw new Error(
        `Refusing to proceed: membership ${MEMBERSHIP_ID} class type is '${membershipClass.type}', not 'OPERATIONAL' -- ` +
        `required-stage assumption (COORDINATOR only) would be wrong for a CONSTITUTIONAL class.`,
      );
    }

    // ---- Precondition 6-7: exactly the one known stale COORDINATOR row ----
    const [stages] = await connection.execute(
      'SELECT id, membership_id, stage, decision, actor_user_id, created_at FROM membership_approval_stages WHERE membership_id = ?',
      [MEMBERSHIP_ID],
    );
    if (stages.length !== 1) {
      throw new Error(`Expected exactly one membership_approval_stages row for membership_id=${MEMBERSHIP_ID}, found ${stages.length}.`);
    }
    const stage = stages[0];
    if (
      Number(stage.id) !== EXPECTED_STAGE_ROW_ID ||
      stage.stage !== 'COORDINATOR' ||
      stage.decision !== 'APPROVED'
    ) {
      throw new Error(
        `Refusing to delete: approval-stage row does not match the expected stale artifact ` +
        `(expected id=${EXPECTED_STAGE_ROW_ID}, stage=COORDINATOR, decision=APPROVED; found id=${stage.id}, stage=${stage.stage}, decision=${stage.decision}).`,
      );
    }

    // ---- All preconditions verified -- perform the narrow repair ----------
    await connection.beginTransaction();

    const [result] = await connection.execute(
      'DELETE FROM membership_approval_stages WHERE id = ? AND membership_id = ? AND stage = ? AND decision = ?',
      [EXPECTED_STAGE_ROW_ID, MEMBERSHIP_ID, 'COORDINATOR', 'APPROVED'],
    );
    if (result.affectedRows !== 1) {
      throw new Error(`Expected to delete exactly 1 row, deleted ${result.affectedRows} -- rolling back.`);
    }

    await connection.execute(
      `INSERT INTO membership_audit_log (membership_id, event_type, actor_type, old_value, new_value, notes)
       VALUES (?, 'APPROVAL_STAGE_DECIDED', 'ADMIN', ?, ?, ?)`,
      [
        MEMBERSHIP_ID,
        JSON.stringify({ approvalStageRowId: EXPECTED_STAGE_ROW_ID, stage: 'COORDINATOR', decision: 'APPROVED', actorUserId: stage.actor_user_id, createdAt: stage.created_at }),
        JSON.stringify({ approvalStageRowId: null }),
        'STEP 22C one-off historical test-artifact repair: deleted stale membership_approval_stages row id=34 ' +
          '(COORDINATOR/APPROVED, recorded under the pre-Step-22 workflow before payment-then-approval ordering ' +
          'existed). This is historical test-artifact cleanup, not normal application behavior -- no lifecycle ' +
          'code changed, no reusable reset mechanism introduced. Clears the way for the real ' +
          'POST /api/v1/membership/84/approve endpoint to record a fresh COORDINATOR decision through ' +
          'ApplicationWorkflowService.recordStageDecision(). Scoped to membership id 84 only; financial records untouched.',
      ],
    );

    await connection.commit();

    const [after] = await connection.execute(
      'SELECT id, membership_id, stage, decision FROM membership_approval_stages WHERE membership_id = ?',
      [MEMBERSHIP_ID],
    );
    console.log('DELETED ROW:', stage);
    console.log('REMAINING COORDINATOR-STAGE ROWS FOR MEMBERSHIP 84:', after);
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
