// WARP prefill: the session, the reuse, and the failures a user has to be able
// to act on (US5, FR-042 to FR-045).
//
// No tunnel is ever registered here. Every request is answered by a stub, which
// is also the only honest way to test the rate-limit path.
//
// The module is re-imported for each case because it caches the session promise
// on purpose -- one /api/session per page load -- and every case here starts from
// a page that has not asked for one yet.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Warp = typeof import('@core/warp');

interface Call {
  url: string;
  body: unknown;
}

let warp: Warp;
let calls: Call[] = [];
let reply: (url: string, nth: number) => Response;

const ok = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const fail = (status: number, data: unknown = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const REG = {
  WG_PRIVATE_KEY: 'priv',
  PEER_PUBLIC_KEY: 'peer',
  ENDPOINT: '162.159.192.1',
  ENDPOINT_PORT: '2408',
  WG_IPV4: '172.16.0.2/32',
  WG_IPV6: 'fd01:5ca1:ab1e::1/128',
  ALLOWED_IPS: '0.0.0.0/0 ::/0',
  warp_refresh_token: 'tok,dev,priv',
};

const registerCalls = (): Call[] => calls.filter((c) => c.url === '/api/warp/register');
const sessionCalls = (): Call[] => calls.filter((c) => c.url === '/api/session');

beforeEach(async () => {
  calls = [];
  reply = () => ok(REG);
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const nth = calls.filter((c) => c.url === url).length;
    // A dead network rejects rather than throwing, the way the real one does.
    try {
      return Promise.resolve(reply(url, nth));
    } catch (e) {
      return Promise.reject(e);
    }
  });
  vi.resetModules();
  warp = await import('@core/warp');
});

afterEach(() => vi.unstubAllGlobals());

describe('registration', () => {
  it('returns the uppercase field set the endpoint promises', async () => {
    expect(await warp.registerWarp('')).toEqual(REG);
  });

  it('replays a stored identity rather than asking for a new one (FR-044)', async () => {
    await warp.registerWarp('tok,dev,priv');
    expect(registerCalls()[0]?.body).toEqual({ warp_refresh_token: 'tok,dev,priv' });
  });

  it('tolerates a reply missing fields', async () => {
    reply = () => ok({ WG_PRIVATE_KEY: 'priv' });
    const reg = await warp.registerWarp('');
    expect(reg.WG_PRIVATE_KEY).toBe('priv');
    expect(reg.ENDPOINT).toBe('');
    expect(reg.warp_refresh_token).toBe('');
  });
});

describe('the session (FR-042)', () => {
  it('is established before the first registration', async () => {
    await warp.registerWarp('');
    expect(calls[0]?.url).toBe('/api/session');
  });

  it('is asked for once per page, not once per registration', async () => {
    await warp.registerWarp('');
    await warp.registerWarp('tok,dev,priv');
    expect(sessionCalls()).toHaveLength(1);
    expect(registerCalls()).toHaveLength(2);
  });

  it('is asked for again, once, when the cookie has gone', async () => {
    reply = (url, nth) =>
      url === '/api/warp/register' && nth === 1 ? fail(403, { error: 'No valid session' }) : ok(REG);
    const reg = await warp.registerWarp('');
    expect(reg.WG_PRIVATE_KEY).toBe('priv');
    expect(sessionCalls()).toHaveLength(2);
  });

  it('never rejects, so a site without the endpoint still works (FR-045)', async () => {
    reply = () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(warp.ensureSession()).resolves.toBeUndefined();
  });
});

describe('failures in plain language (FR-045)', () => {
  const idOf = async (): Promise<string> => {
    try {
      await warp.registerWarp('');
      return 'no error';
    } catch (e) {
      return e instanceof warp.WarpError ? e.messageId : 'wrong type';
    }
  };

  it('reads a 429 as "wait a moment"', async () => {
    reply = (url) => (url === '/api/warp/register' ? fail(429) : ok(REG));
    expect(await idOf()).toBe('warpTooMany');
  });

  it('reads an unparseable rate-limit page the same way', async () => {
    reply = (url) =>
      url === '/api/warp/register'
        ? new Response('<html>too many requests</html>', { status: 429 })
        : ok(REG);
    expect(await idOf()).toBe('warpTooMany');
  });

  it('says so when the operator never configured the proxy', async () => {
    reply = (url) =>
      url === '/api/warp/register'
        ? fail(502, {
            error: 'WARP registration failed',
            message:
              'WARP proxy not configured (set PROXY_SERVER and PROXY_SECRET in CF Pages env vars).',
          })
        : ok(REG);
    expect(await idOf()).toBe('warpNotConfigured');
  });

  it('falls back to the generic failure for anything else', async () => {
    reply = (url) =>
      url === '/api/warp/register' ? fail(502, { message: 'upstream exploded' }) : ok(REG);
    expect(await idOf()).toBe('warpFailed');
  });

  it('reports a dead network as a failure rather than a raw TypeError', async () => {
    reply = (url) => {
      if (url === '/api/warp/register') throw new TypeError('Failed to fetch');
      return ok(REG);
    };
    expect(await idOf()).toBe('warpFailed');
  });
});
