import { guardResponse } from './_guard.js';

const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';

export function getAsuServers(env) {
  const servers = [];
  const primary = env.ASU_URL || ASU_DEFAULT;
  servers.push({ label: hostname(primary), url: primary });
  for (let i = 2; ; i++) {
    const url = env['ASU_URL_' + i];
    if (!url) break;
    servers.push({ label: hostname(url), url });
  }
  return servers;
}

function hostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const block = guardResponse(request, env);
  if (block) return block;

  return new Response(JSON.stringify({ servers: getAsuServers(env) }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
