// Shared request guards used by all API endpoints.
//
// What these guards actually provide:
//
//   originAllowed  — stops browser-based cross-origin fetch (CORS enforcement
//     by the browser). Any non-browser client (curl, scripts) can spoof the
//     Origin header trivially, so this is not a server-side security boundary.
//     Still worth having: stops lazy/accidental abuse from other web apps.
//
//   sessionPresent — adds one extra step for a scripter (they must call
//     /api/session first to obtain a valid cookie). /api/session is open to
//     anyone, so this is friction, not a lock. A determined caller can always
//     get a real session and replay it.
//
// THE REAL ENFORCEMENT IS CF RATE LIMITING - configure these rules in the
// Cloudflare dashboard (Security -> WAF -> Rate Limiting Rules):
//
//   * /api/warp/register  - 3 req / 10 sec / IP  (WARP device creation)
//   * /api/session        - 2 req / 10 sec / IP  (prevent cookie farming)
//
// Without those rules the guards below are speed bumps only. (The build path is
// fully client-side: the browser resolves packages and POSTs straight to ASU,
// so there is no /api/build endpoint to rate-limit and ASU throttles its own
// build submissions server-side.)

export function originAllowed(request, env) {
  const allowed = env.ALLOWED_ORIGIN;
  if (!allowed) return true;
  const origin = request.headers.get('Origin');
  if (!origin) return true; // same-origin request — browser omits Origin header
  const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
  return list.some(pat => {
    if (!pat.includes('*')) return pat === origin;
    // * matches one subdomain label (no dots)
    const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+') + '$');
    return re.test(origin);
  });
}

export function getSid(request) {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  return cookies.wrtnova_sid || null;
}

export function sessionPresent(request) {
  const sid = parseCookies(request.headers.get('cookie') || '').wrtnova_sid || '';
  return /^[0-9a-f]{32}$/.test(sid);
}

export function guardResponse(request, env, { requireSession = false } = {}) {
  if (!originAllowed(request, env)) return forbidden('Forbidden');
  if (requireSession && !sessionPresent(request)) return forbidden('No valid session');
  return null;
}

export function forbidden(msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseCookies(header) {
  const out = {};
  header.split(/;\s*/).forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}
