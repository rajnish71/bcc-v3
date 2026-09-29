// backend/src/modules/membership/entitlements/entitlement-layers.ts
//
// Pure (db-free) implementation of the MEM-006 resolution formula
//   Base(Class) + Active Recognition + Individual Overrides
// shared by EntitlementService.resolve() (single membership, with provenance)
// and EntitlementService.resolveMany() (batch, used by public-exposure
// filtering). Kept free of db imports so it is unit-testable under the
// project's CommonJS Jest config.

export interface BaseRow { key: string; value: string }
export interface OverrideRow {
  key: string;
  type: 'GRANT' | 'REVOKE';
  value: string;
  expiresAt: Date | null;
}

export function applyEntitlementLayers(
  base: BaseRow[],
  recognitionModifiers: BaseRow[],
  overrides: OverrideRow[],
  now: Date = new Date(),
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const r of base) resolved[r.key] = r.value;
  for (const r of recognitionModifiers) resolved[r.key] = r.value;
  for (const o of overrides) {
    if (o.expiresAt !== null && o.expiresAt.getTime() <= now.getTime()) continue;
    if (o.type === 'REVOKE') delete resolved[o.key];
    else resolved[o.key] = o.value;
  }
  return resolved;
}
