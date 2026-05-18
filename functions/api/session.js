// /api/session — issue a session cookie (wrtnova_sid) if not present.
//
// All client state (saved config, WARP refresh token) is scoped to this SID
// in browser localStorage. Designed so we can later attach KV-backed server
// state without breaking the storage model.

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const cookies = parseCookies(request.headers.get('cookie') || '');
  let sid = cookies.wrtnova_sid;
  let setCookie = null;

  if (!sid) {
    sid = randomSid();
    setCookie = 'wrtnova_sid=' + sid +
                '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' +
                (url.protocol === 'https:' ? '; Secure' : '');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (setCookie) headers['Set-Cookie'] = setCookie;

  return new Response(JSON.stringify({ sid }), { status: 200, headers });
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

function randomSid() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
