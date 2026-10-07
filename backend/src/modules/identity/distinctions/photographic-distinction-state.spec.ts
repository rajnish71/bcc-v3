// Photographic Distinctions -- declaration lifecycle (pure transitions).

import { transitionDeclaration, type DeclarationSnapshot } from './photographic-distinction-state';

const DECLARED: DeclarationSnapshot = { state: 'DECLARED', pre_removal_state: null };
const WITHDRAWN: DeclarationSnapshot = { state: 'WITHDRAWN', pre_removal_state: null };
const REMOVED_FROM_DECLARED: DeclarationSnapshot = { state: 'REMOVED', pre_removal_state: 'DECLARED' };
const REMOVED_FROM_WITHDRAWN: DeclarationSnapshot = { state: 'REMOVED', pre_removal_state: 'WITHDRAWN' };

describe('Photographic Distinction declaration lifecycle', () => {
  it('holder declares a new distinction -> DECLARED (insert)', () => {
    const t = transitionDeclaration(null, 'DECLARE');
    expect(t).toEqual({ ok: true, create: true, auditAction: 'PHOTOGRAPHIC_DISTINCTION_DECLARED', next: DECLARED });
  });

  it('holder withdraws a declared distinction -> WITHDRAWN', () => {
    const t = transitionDeclaration(DECLARED, 'WITHDRAW');
    expect(t).toMatchObject({ ok: true, create: false, auditAction: 'PHOTOGRAPHIC_DISTINCTION_WITHDRAWN', next: WITHDRAWN });
  });

  it('holder can re-declare a WITHDRAWN distinction (update, not insert)', () => {
    const t = transitionDeclaration(WITHDRAWN, 'DECLARE');
    expect(t).toMatchObject({ ok: true, create: false, auditAction: 'PHOTOGRAPHIC_DISTINCTION_REDECLARED', next: DECLARED });
  });

  it('holder cannot re-declare a REMOVED distinction', () => {
    expect(transitionDeclaration(REMOVED_FROM_DECLARED, 'DECLARE')).toMatchObject({ ok: false, code: 'REMOVED_BY_ADMINISTRATOR' });
    expect(transitionDeclaration(REMOVED_FROM_WITHDRAWN, 'DECLARE')).toMatchObject({ ok: false, code: 'REMOVED_BY_ADMINISTRATOR' });
  });

  it('declaring an already-declared distinction is rejected', () => {
    expect(transitionDeclaration(DECLARED, 'DECLARE')).toMatchObject({ ok: false, code: 'ALREADY_DECLARED' });
  });

  it('only DECLARED can be withdrawn', () => {
    expect(transitionDeclaration(null, 'WITHDRAW')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(transitionDeclaration(WITHDRAWN, 'WITHDRAW')).toMatchObject({ ok: false, code: 'NOT_DECLARED' });
    expect(transitionDeclaration(REMOVED_FROM_DECLARED, 'WITHDRAW')).toMatchObject({ ok: false, code: 'NOT_DECLARED' });
  });

  it('admin remove records the superseded state', () => {
    expect(transitionDeclaration(DECLARED, 'REMOVE')).toMatchObject({ ok: true, next: REMOVED_FROM_DECLARED, auditAction: 'PHOTOGRAPHIC_DISTINCTION_REMOVED' });
    expect(transitionDeclaration(WITHDRAWN, 'REMOVE')).toMatchObject({ ok: true, next: REMOVED_FROM_WITHDRAWN });
    expect(transitionDeclaration(REMOVED_FROM_DECLARED, 'REMOVE')).toMatchObject({ ok: false, code: 'ALREADY_REMOVED' });
    expect(transitionDeclaration(null, 'REMOVE')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('admin restore returns the entry to its prior valid state', () => {
    expect(transitionDeclaration(REMOVED_FROM_DECLARED, 'RESTORE')).toMatchObject({ ok: true, next: DECLARED, auditAction: 'PHOTOGRAPHIC_DISTINCTION_RESTORED' });
    expect(transitionDeclaration(REMOVED_FROM_WITHDRAWN, 'RESTORE')).toMatchObject({ ok: true, next: WITHDRAWN });
  });

  it('restore of a non-removed entry is rejected', () => {
    expect(transitionDeclaration(DECLARED, 'RESTORE')).toMatchObject({ ok: false, code: 'NOT_REMOVED' });
    expect(transitionDeclaration(WITHDRAWN, 'RESTORE')).toMatchObject({ ok: false, code: 'NOT_REMOVED' });
    expect(transitionDeclaration(null, 'RESTORE')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('pre_removal_state is set if and only if state is REMOVED (mirrors chk_user_photo_dist_pre_removal)', () => {
    const starts: Array<DeclarationSnapshot | null> = [null, DECLARED, WITHDRAWN, REMOVED_FROM_DECLARED, REMOVED_FROM_WITHDRAWN];
    for (const s of starts) {
      for (const a of ['DECLARE', 'WITHDRAW', 'REMOVE', 'RESTORE'] as const) {
        const t = transitionDeclaration(s, a);
        if (t.ok) expect(t.next.state === 'REMOVED').toBe(t.next.pre_removal_state !== null);
      }
    }
  });
});
