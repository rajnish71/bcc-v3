// backend/src/modules/membership/numbering/number-prefix.ts
//
// HA Decision B3 -- Membership Number YYYY/MM source for new individual
// membership registrations: the membership registration/application creation
// date (memberships.applied_at). Never account creation, approval, or
// activation. Pure, dependency-free so the lifecycle service can import it
// even where specs replace MembershipNumberingService with a stub.
//
// Reads the date in the server's local zone, matching how toMysqlDatetime()
// wrote it. memberships.created_at (the same INSERT that wrote applied_at --
// NOT users.created_at) is the fallback only for a legacy row with no
// applied_at. A row with neither is refused rather than numbered from the
// activation clock.
export function resolveNumberPrefix(
  membership: { id?: unknown; applied_at?: unknown; created_at?: unknown },
): { joinYear: number; joinMonth: number } {
  const parse = (v: unknown): Date | null => {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const registeredAt = parse(membership.applied_at) ?? parse(membership.created_at);
  if (!registeredAt) {
    throw new Error(
      `Membership ${String(membership.id ?? '?')} has no registration date (applied_at / created_at); refusing to derive a Membership Number YYYY/MM (HA B3).`,
    );
  }
  return { joinYear: registeredAt.getFullYear(), joinMonth: registeredAt.getMonth() + 1 };
}
