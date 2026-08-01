// Cloudflare WARP: the session, the registration, and what a failure means.
//
// Two WrtNova-origin endpoints, neither of which is handed anything of the
// user's: /api/session issues the cookie /api/warp/register insists on
// (Constitution VI), and the registration returns a tunnel identity Cloudflare
// created for this browser. The reply's UPPERCASE keys are the contract -- they
// are named after the wrtnova.sh variables they fill, and renaming them here
// would only invite a second spelling to drift from the first.
//
// Like core/validate.ts, this returns message IDS rather than sentences: the
// operator may not have configured the proxy at all, and "the app said 502" is
// not something a user can act on (FR-045).

import type { WarpRegistration } from './types';

/** A failure the interface can explain. `messageId` is a catalogue key. */
export class WarpError extends Error {
  readonly messageId: string;

  constructor(messageId: string) {
    super(messageId);
    this.name = 'WarpError';
    this.messageId = messageId;
  }
}

const SESSION_URL = '/api/session';
const REGISTER_URL = '/api/warp/register';

let session: Promise<void> | null = null;

/**
 * Establish the session both pages need before a tunnel can be registered
 * (FR-042).
 *
 * It never rejects and never throws: a site without the WARP proxy configured,
 * or one served with the functions unavailable, must behave exactly as before
 * everywhere else (FR-045, US5 scenario 5).
 */
export function ensureSession(force = false): Promise<void> {
  if (force || !session) {
    session = fetch(SESSION_URL, { credentials: 'same-origin' }).then(
      () => undefined,
      () => undefined,
    );
  }
  return session;
}

/**
 * Register a tunnel, reusing `refreshToken` when there is one.
 *
 * Passing the stored token back is what makes a second prefill return the SAME
 * device instead of creating another one (FR-044): the endpoint replays it to
 * Cloudflare and hands back the identity it already issued, private key
 * included.
 */
export async function registerWarp(refreshToken: string): Promise<WarpRegistration> {
  await ensureSession();

  let res = await post(refreshToken);
  // The cookie can be gone even though init asked for one -- a tab left open past
  // its expiry, or a browser that dropped it. Ask again and retry once, rather
  // than telling the user to reload the page.
  if (res.status === 403) {
    await ensureSession(true);
    res = await post(refreshToken);
  }

  const data = await body(res);
  if (!res.ok) throw new WarpError(failureId(res.status, data));
  return shape(data);
}

// -- internals ---------------------------------------------------------------

function post(refreshToken: string): Promise<Response> {
  return fetch(REGISTER_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ warp_refresh_token: refreshToken }),
  }).catch(() => {
    throw new WarpError('warpFailed');
  });
}

type Reply = Partial<Record<keyof WarpRegistration, unknown>> & {
  error?: unknown;
  message?: unknown;
};

/** A rate limiter answers in HTML, so a body that will not parse is not a bug. */
async function body(res: Response): Promise<Reply> {
  try {
    return (await res.json()) as Reply;
  } catch {
    return {};
  }
}

function failureId(status: number, data: Reply): string {
  const said = `${String(data.message ?? '')} ${String(data.error ?? '')}`;
  // Cloudflare's rate limiting sits in front of the function, so the 429 may
  // arrive as an opaque page whose only evidence is the status itself.
  if (status === 429 || said.includes('429')) return 'warpTooMany';
  if (/not configured/i.test(said)) return 'warpNotConfigured';
  return 'warpFailed';
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

function shape(data: Reply): WarpRegistration {
  return {
    WG_PRIVATE_KEY: text(data.WG_PRIVATE_KEY),
    PEER_PUBLIC_KEY: text(data.PEER_PUBLIC_KEY),
    ENDPOINT: text(data.ENDPOINT),
    ENDPOINT_PORT: text(data.ENDPOINT_PORT),
    WG_IPV4: text(data.WG_IPV4),
    WG_IPV6: text(data.WG_IPV6),
    ALLOWED_IPS: text(data.ALLOWED_IPS),
    warp_refresh_token: text(data.warp_refresh_token),
  };
}
