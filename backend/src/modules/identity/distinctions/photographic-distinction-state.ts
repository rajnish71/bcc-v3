// backend/src/modules/identity/distinctions/photographic-distinction-state.ts
//
// Pure declaration lifecycle for Photographic Distinctions (0116).
// No DB, no Nest -- the service applies the returned transition inside a
// transaction alongside its identity_audit_log row.
//
//   DECLARED  <-- holder declare / re-declare (from none or WITHDRAWN)
//   WITHDRAWN <-- holder withdraw (from DECLARED)
//   REMOVED   <-- administrator remove (from DECLARED or WITHDRAWN),
//                 remembering the superseded state in pre_removal_state
//   restore   --> administrator returns REMOVED to pre_removal_state
//
// A holder can never re-declare a REMOVED entry. Rows are never deleted.
// Declarations are self-declared and UNVERIFIED: there is no evidence or
// verification state anywhere in this lifecycle, by design.

export type DistinctionDeclarationState = 'DECLARED' | 'WITHDRAWN' | 'REMOVED';
export type PreRemovalState = 'DECLARED' | 'WITHDRAWN';

export interface DeclarationSnapshot {
  state: DistinctionDeclarationState;
  pre_removal_state: PreRemovalState | null;
}

export type DistinctionAction = 'DECLARE' | 'WITHDRAW' | 'REMOVE' | 'RESTORE';

export type DistinctionAuditAction =
  | 'PHOTOGRAPHIC_DISTINCTION_DECLARED'
  | 'PHOTOGRAPHIC_DISTINCTION_REDECLARED'
  | 'PHOTOGRAPHIC_DISTINCTION_WITHDRAWN'
  | 'PHOTOGRAPHIC_DISTINCTION_REMOVED'
  | 'PHOTOGRAPHIC_DISTINCTION_RESTORED';

export interface DistinctionTransition {
  ok: true;
  next: DeclarationSnapshot;
  auditAction: DistinctionAuditAction;
  /** true when no row exists yet and the caller must INSERT. */
  create: boolean;
}

export interface DistinctionTransitionRejection {
  ok: false;
  code: 'ALREADY_DECLARED' | 'REMOVED_BY_ADMINISTRATOR' | 'NOT_DECLARED' | 'NOT_FOUND' | 'ALREADY_REMOVED' | 'NOT_REMOVED';
  message: string;
}

export type TransitionResult = DistinctionTransition | DistinctionTransitionRejection;

const reject = (
  code: DistinctionTransitionRejection['code'],
  message: string,
): DistinctionTransitionRejection => ({ ok: false, code, message });

export function transitionDeclaration(
  current: DeclarationSnapshot | null,
  action: DistinctionAction,
): TransitionResult {
  switch (action) {
    case 'DECLARE':
      if (!current) {
        return { ok: true, create: true, auditAction: 'PHOTOGRAPHIC_DISTINCTION_DECLARED', next: { state: 'DECLARED', pre_removal_state: null } };
      }
      if (current.state === 'WITHDRAWN') {
        return { ok: true, create: false, auditAction: 'PHOTOGRAPHIC_DISTINCTION_REDECLARED', next: { state: 'DECLARED', pre_removal_state: null } };
      }
      if (current.state === 'DECLARED') return reject('ALREADY_DECLARED', 'This distinction is already declared.');
      return reject('REMOVED_BY_ADMINISTRATOR', 'This distinction was removed by an administrator and cannot be re-declared.');

    case 'WITHDRAW':
      if (!current) return reject('NOT_FOUND', 'No declaration of this distinction exists.');
      if (current.state !== 'DECLARED') return reject('NOT_DECLARED', 'Only a declared distinction can be withdrawn.');
      return { ok: true, create: false, auditAction: 'PHOTOGRAPHIC_DISTINCTION_WITHDRAWN', next: { state: 'WITHDRAWN', pre_removal_state: null } };

    case 'REMOVE':
      if (!current) return reject('NOT_FOUND', 'No declaration of this distinction exists.');
      if (current.state === 'REMOVED') return reject('ALREADY_REMOVED', 'This declaration is already removed.');
      return { ok: true, create: false, auditAction: 'PHOTOGRAPHIC_DISTINCTION_REMOVED', next: { state: 'REMOVED', pre_removal_state: current.state } };

    case 'RESTORE':
      if (!current) return reject('NOT_FOUND', 'No declaration of this distinction exists.');
      if (current.state !== 'REMOVED' || !current.pre_removal_state) {
        return reject('NOT_REMOVED', 'Only a removed declaration can be restored.');
      }
      return { ok: true, create: false, auditAction: 'PHOTOGRAPHIC_DISTINCTION_RESTORED', next: { state: current.pre_removal_state, pre_removal_state: null } };
  }
}
