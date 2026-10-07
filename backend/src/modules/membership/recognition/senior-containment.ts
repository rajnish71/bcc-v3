// backend/src/modules/membership/recognition/senior-containment.ts
//
// WP0 — Senior/Tenure containment (TENURE-ARCH-001 v1.1, §19/§20).
//
// The legacy recognition-based Senior pathway (Senior stored as
// member_recognitions SENIOR_MEMBER, configurable recognition_criteria
// thresholds, 365.25-day / join_year tenure, unverified DOB) is
// non-conforming. Until the approved Senior Status Overlay is implemented
// under a later work package, NO path may create, assign, revoke, supersede,
// auto-evaluate or re-configure Senior through it.
//
// Containment is write-side only: existing SENIOR_MEMBER rows (including the
// 8 protected MANUAL records) are not touched, and read paths keep working.
// Every blocked call throws -- never a silent no-op or empty result.

import { ConflictException } from '@nestjs/common';

export const SENIOR_CONTAINMENT_CODE = 'SENIOR_LEGACY_PATHWAY_CONTAINED';

export const SENIOR_CONTAINMENT_MESSAGE =
  'Senior Member status changes and automatic Senior evaluation are temporarily disabled ' +
  'while the approved Senior Status architecture (TENURE-ARCH-001) is implemented. ' +
  'Existing Senior Member records are unchanged.';

export function seniorContainmentError(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: SENIOR_CONTAINMENT_CODE,
    message: SENIOR_CONTAINMENT_MESSAGE,
  });
}

// Throws unconditionally. Declared `void` (not `never`) so the legacy code
// left below each call stays type-checked and the containment is a one-line
// revert per call site.
export function assertLegacySeniorPathwayContained(): void {
  throw seniorContainmentError();
}

export function isSeniorStatusCode(code: string): boolean {
  return code === 'SENIOR_MEMBER';
}
