// Behavioural tests for OBS-01 (request correlation) and OBS-04 (client IP
// behind Cloudflare -> Nginx -> Fastify), run against the exact options
// main.ts passes to FastifyAdapter.

import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyServerOptions, registerRequestIdResponseHeader } from './fastify-options';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function buildApp(options: Record<string, unknown> = fastifyServerOptions): FastifyInstance {
  const app = Fastify(options);
  registerRequestIdResponseHeader(app);
  app.get('/probe', async (req) => ({ id: req.id, ip: req.ip }));
  app.get('/boom', async () => {
    throw new Error('boom');
  });
  return app;
}

describe('OBS-01 request id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('generates a UUID and returns it as X-Request-Id', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe' });
    const body = res.json();
    expect(body.id).toMatch(UUID_RE);
    expect(res.headers['x-request-id']).toBe(body.id);
  });

  it('ignores a client-supplied X-Request-Id / Request-Id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': 'attacker-chosen', 'request-id': 'attacker-chosen' },
    });
    const body = res.json();
    expect(body.id).not.toBe('attacker-chosen');
    expect(body.id).toMatch(UUID_RE);
    expect(res.headers['x-request-id']).toBe(body.id);
  });

  it('issues a distinct id per request', async () => {
    const a = (await app.inject({ method: 'GET', url: '/probe' })).json().id;
    const b = (await app.inject({ method: 'GET', url: '/probe' })).json().id;
    expect(a).not.toBe(b);
  });

  it('still returns X-Request-Id on an error response', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });
});

// Chain under test (see fastify-options.ts):
//   Client -> Cloudflare (CF-Connecting-IP) -> Nginx real_ip_header
//   CF-Connecting-IP, trusted only for Cloudflare ranges -> $remote_addr
//   -> X-Forwarded-For: $remote_addr -> Fastify trusts only 127.0.0.1.
// Each test is one shape of request Fastify can actually receive.
const REAL_CLIENT = '203.0.113.9';
const FORGED = '6.6.6.6';
const NGINX = '127.0.0.1';

describe('OBS-04 client IP', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  async function ipFor(remoteAddress: string, headers: Record<string, string>) {
    const res = await app.inject({ method: 'GET', url: '/probe', remoteAddress, headers });
    return res.json().ip as string;
  }

  it('target config: Nginx forwards X-Forwarded-For = $remote_addr (from CF-Connecting-IP) -> real client', async () => {
    expect(await ipFor(NGINX, { 'x-forwarded-for': REAL_CLIENT })).toBe(REAL_CLIENT);
  });

  describe('threat: forged client X-Forwarded-For must NOT become req.ip', () => {
    it('forged entry preserved by Cloudflare and appended to by Nginx (current $proxy_add_x_forwarded_for)', async () => {
      // Client sends "X-Forwarded-For: 6.6.6.6"; Cloudflare appends the real
      // client; Nginx (pre-change) appends $remote_addr. Only the rightmost
      // entry -- written by Nginx itself -- is ever trusted.
      expect(await ipFor(NGINX, { 'x-forwarded-for': `${FORGED}, ${REAL_CLIENT}` })).toBe(REAL_CLIENT);
      expect(await ipFor(NGINX, { 'x-forwarded-for': `${FORGED}, ${FORGED}, ${REAL_CLIENT}` })).toBe(REAL_CLIENT);
    });

    it('forged entry from a peer that is not the local Nginx (origin hit directly) is ignored entirely', async () => {
      expect(await ipFor('198.51.100.7', { 'x-forwarded-for': FORGED })).toBe('198.51.100.7');
    });

    it('forged CF-Connecting-IP / X-Real-IP reaching Fastify are never read -- only Nginx interprets CF-Connecting-IP', async () => {
      expect(
        await ipFor(NGINX, { 'x-forwarded-for': REAL_CLIENT, 'cf-connecting-ip': FORGED, 'x-real-ip': FORGED }),
      ).toBe(REAL_CLIENT);
      expect(await ipFor('198.51.100.7', { 'cf-connecting-ip': FORGED, 'x-real-ip': FORGED })).toBe('198.51.100.7');
    });
  });

  it('regression guard: the previous trustProxy:true returned the spoofed entry', async () => {
    const legacy = buildApp({ ...fastifyServerOptions, trustProxy: true });
    await legacy.ready();
    const res = await legacy.inject({
      method: 'GET',
      url: '/probe',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' },
    });
    expect(res.json().ip).toBe('6.6.6.6');
    await legacy.close();
  });
});
