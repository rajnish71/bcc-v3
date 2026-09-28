// backend/src/modules/financial/audit/request-provenance.util.ts
//
// Builds the explicit RequestProvenance object (remediation Section 13) for
// one HTTP request. Reads exactly five things: the server-generated request
// id, the client address resolved by Fastify's restricted trustProxy (see
// http/fastify-options.ts), the User-Agent header, the matched route
// pattern, and the authenticated actor's sub/sid from the verified JWT.
// Nothing else from the request -- no other headers, cookies, the
// Authorization header, or the body -- is ever read here.

import type { AccessTokenPayload } from '../../identity/auth/token.util';
import type { AuditContext, FinancialAuditActorType, RequestProvenance } from './financial-audit.types';

export interface ProvenanceSourceRequest {
  id: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  routeOptions?: { url?: string };
}

export function buildRequestProvenance(
  req: ProvenanceSourceRequest,
  actor?: Pick<AccessTokenPayload, 'sub' | 'sid'> | null,
): RequestProvenance {
  const userAgent = req.headers['user-agent'];
  return {
    requestId: req.id ?? null,
    actorUserId: actor?.sub ?? null,
    sessionId: actor?.sid ?? null,
    ipAddress: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    route: req.routeOptions?.url ?? null,
  };
}

// What controllers pass into Financial Engine / Business Module methods.
// Carries only who acted and in which request -- nothing provider-specific.
export function requestAuditContext(
  actorType: FinancialAuditActorType,
  req: ProvenanceSourceRequest,
  actor: Pick<AccessTokenPayload, 'sub' | 'sid'>,
): AuditContext {
  return { actorType, provenance: buildRequestProvenance(req, actor) };
}
