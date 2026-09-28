// backend/src/http/fastify-options.ts
//
// Fastify server options shared by main.ts and the behavioural tests in
// fastify-options.spec.ts, so the tests exercise exactly the production
// configuration.
//
// OBS-01 request correlation: every request gets a server-generated UUID.
// requestIdHeader: false means Fastify never adopts an inbound
// X-Request-Id / Request-Id header as req.id -- a client cannot dictate the
// id stored in financial_audit_log.request_id. The generated id is echoed
// back as the X-Request-Id response header.
//
// OBS-04 client IP. Production trust chain:
//
//   Client -> Cloudflare (sets CF-Connecting-IP)
//     -> Nginx: real_ip_header CF-Connecting-IP, set_real_ip_from ONLY the
//        official Cloudflare ranges => canonical $remote_addr
//     -> Nginx sends X-Forwarded-For: $remote_addr (overwrites, never appends)
//     -> Fastify on 127.0.0.1:3001 trusts ONLY the local Nginx hop.
//
// X-Forwarded-For is never Nginx's real-IP source: clients can pre-populate
// it and Cloudflare appends to it, so it can carry client-controlled values.
// Fastify takes req.ip from the rightmost X-Forwarded-For entry only when
// the socket peer is 127.0.0.1; any other peer's X-Forwarded-For is ignored.
// `trustProxy: true` (the previous value) trusted every hop and returned the
// leftmost, client-controllable entry.

import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';

export const TRUSTED_PROXY = '127.0.0.1';

export const fastifyServerOptions = {
  trustProxy: TRUSTED_PROXY,
  requestIdHeader: false as const,
  genReqId: (): string => randomUUID(),
};

export function registerRequestIdResponseHeader(instance: FastifyInstance): void {
  instance.addHook('onRequest', (request, reply, done) => {
    reply.header('X-Request-Id', request.id);
    done();
  });
}
