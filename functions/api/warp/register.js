// POST /api/warp/register - register or refresh a Cloudflare WARP device and
// return the full WG field set ready to populate the WireGuard form.
//
// Body: { warp_refresh_token? }
//   empty                            -> fresh registration
//   "token,device_id,wg_private_key" -> reuse the device (no new private key)
//
// Env (CF Pages settings):
//   PROXY_SERVER   e.g. https://warp-proxy.example.com
//   PROXY_SECRET   shared secret matching the proxy

import { generateKeypair } from '../_wireguard.js';
import { guardResponse } from '../_guard.js';

const ENDPOINT_PORT = 2408;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const block = guardResponse(request, env, { requireSession: true });
  if (block) return block;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const clientIP = request.headers.get('CF-Connecting-IP') || '';
  const existingToken = String(body.warp_refresh_token || '');

  let reg;
  try {
    reg = await warpRegister(env, clientIP, existingToken);
  } catch (e) {
    return json({ error: 'WARP registration failed', message: e.message }, 502);
  }

  const warp_refresh_token = [reg.refresh_token, reg.device_id, reg.private_key]
    .filter(Boolean).join(',');

  return json({
    WG_PRIVATE_KEY:  reg.private_key     || '',
    PEER_PUBLIC_KEY: reg.peer_public_key || '',
    ENDPOINT:        reg.endpoint        || '',
    ENDPOINT_PORT:   String(reg.endpoint_port || ''),
    WG_IPV4:         reg.addresses_v4   || '',
    WG_IPV6:         reg.addresses_v6   || '',
    ALLOWED_IPS:     '0.0.0.0/0 ::/0',
    warp_refresh_token,
  });
}

// === warpRegister ===
// refreshToken "token,device_id,wg_private_key" - the format the browser stores
// and replays. Present -> skip /reg and GET the device.
export async function warpRegister(env, clientIP, refreshToken) {
  const PROXY_SERVER = (env.PROXY_SERVER || '').replace(/\/+$/, '');
  const PROXY_SECRET = env.PROXY_SECRET;
  if (!PROXY_SERVER || !PROXY_SECRET) {
    throw new Error('WARP proxy not configured (set PROXY_SERVER and PROXY_SECRET in CF Pages env vars).');
  }

  const baseHeaders = {
    'Content-Type': 'application/json',
    'X-Proxy-Secret': PROXY_SECRET,
    'X-Client-IP': clientIP || '',
  };

  // existing registration: skip /reg, GET the device by id
  if (refreshToken) {
    const parts = String(refreshToken).split(',');
    if (parts.length >= 3) {
      const [token, deviceId, privateKeyB64] = parts;
      const r = await fetch(PROXY_SERVER + '/warp-api/reg/' + encodeURIComponent(deviceId), {
        method: 'GET',
        headers: { ...baseHeaders, Authorization: 'Bearer ' + token },
      });
      const body = await r.text();
      if (!r.ok) {
        throw new Error('WARP refresh failed: HTTP ' + r.status + ' ' + body.slice(0, 200));
      }
      const reg = JSON.parse(body);
      // GET /reg/{id} may omit token/id -> keep them from the stored token
      if (!reg.token) reg.token = token;
      if (!reg.id)    reg.id    = deviceId;
      return shapeReg(reg, privateKeyB64);
    }
  }

  // fresh registration: new keypair, POST /reg
  const { privateKeyB64, publicKeyB64 } = await generateWgKeypair();
  const body = {
    key: publicKeyB64,
    install_id: '',
    fcm_token: '',
    model: 'PC',
    serial_number: '',
    name: '',
    locale: 'en_US',
  };

  const r = await fetch(PROXY_SERVER + '/warp-api/reg', {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error('WARP /reg HTTP ' + r.status + ' ' + text.slice(0, 200));
  }
  const reg = JSON.parse(text);
  return shapeReg(reg, privateKeyB64);
}

// === internals ===

// WG curve25519 keypair via the runtime Secure Curves API; see ../_wireguard.js
async function generateWgKeypair() {
  const { privateKey, publicKey } = await generateKeypair();
  return { privateKeyB64: privateKey, publicKeyB64: publicKey };
}

// shape the WARP API response into the flat WG_* fields the build path wants
export function shapeReg(reg, privateKeyB64) {
  const cfg = reg.config || {};
  const peer = (cfg.peers && cfg.peers[0]) || {};
  const ep = peer.endpoint || {};
  const addrs = (cfg.interface && cfg.interface.addresses) || {};

  const stripPort = (s) => s ? String(s).replace(/:\d+$/, '') : '';
  const v4Host = stripPort(ep.v4);
  // prefer the IPv4 endpoint
  const endpoint = v4Host || stripPort(ep.host);

  return {
    private_key:     privateKeyB64,
    peer_public_key: peer.public_key || '',
    endpoint,
    endpoint_port:   ENDPOINT_PORT,
    addresses_v4:    addrs.v4 ? addrs.v4 + '/32' : '',
    addresses_v6:    addrs.v6 ? addrs.v6 + '/128' : '',
    refresh_token:   reg.token || '',
    device_id:       reg.id    || '',
  };
}

function json(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
