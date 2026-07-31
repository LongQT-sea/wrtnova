// Submitting to, and polling, the OpenWrt ASU build server.
//
// CONSTITUTION III. `asuUrl` is always a server the user chose. The assembled
// script — root password, Wi-Fi passphrases, WireGuard keys, API tokens — goes
// straight there. Nothing in this module may route it through a WrtNova origin,
// and no WrtNova build endpoint exists to route it to.

import type { DeviceImage } from './types';

export const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';
const POLL_INTERVAL_MS = 5000;
const MAX_CONSECUTIVE_FAILURES = 200;

export interface AsuRequest {
  profile: string;
  target: string;
  version: string;
  version_code: string;
  packages: string[];
  /** The assembled script, secrets included. */
  defaults: string;
}

export interface AsuResponse {
  request_hash?: string;
  bin_dir?: string;
  images?: DeviceImage[];
  detail?: string;
  stderr?: string;
  queue_position?: number;
  status?: string;
}

export class AsuError extends Error {
  readonly stderr: string | undefined;
  constructor(message: string, stderr?: string) {
    super(message);
    this.name = 'AsuError';
    this.stderr = stderr;
  }
}

const trimSlashes = (u: string): string => u.replace(/\/+$/, '');

export interface SubmitOutcome {
  /** 'cached' means the server already had this exact image. */
  kind: 'cached' | 'queued';
  data: AsuResponse;
  asuBase: string;
}

export async function submitBuild(asuUrl: string, body: AsuRequest): Promise<SubmitOutcome> {
  const asuBase = trimSlashes(asuUrl);
  const res = await fetch(asuBase + '/api/v1/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, diff_packages: true, client: 'wrtnova/2.0' }),
  });

  let data: AsuResponse;
  try {
    data = (await res.json()) as AsuResponse;
  } catch {
    data = {};
  }

  if (res.status === 200) return { kind: 'cached', data, asuBase };
  if (res.status === 202) {
    if (!data.request_hash) {
      throw new AsuError('The build server accepted the request but returned no build id.');
    }
    return { kind: 'queued', data, asuBase };
  }
  throw new AsuError(data.detail || 'Build server returned HTTP ' + res.status, data.stderr);
}

export interface PollProgress {
  /** Position in the build queue, when the server reports one. */
  queuePosition?: number;
}

export interface PollOptions {
  onProgress?: (p: PollProgress) => void;
  signal?: AbortSignal;
  intervalMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll until the image is ready, the build fails, or the caller aborts. */
export async function pollBuild(
  asuBase: string,
  requestHash: string,
  opts: PollOptions = {},
): Promise<AsuResponse> {
  const base = trimSlashes(asuBase);
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  let failures = 0;

  for (;;) {
    if (opts.signal?.aborted) throw new AsuError('Build cancelled.');
    await sleep(interval);

    let res: Response;
    try {
      res = await fetch(base + '/api/v1/build/' + requestHash, { cache: 'no-cache' });
    } catch (err) {
      // A transient network blip should not abandon a build that may still be
      // running, so keep trying until the failures stop looking transient.
      if (++failures > MAX_CONSECUTIVE_FAILURES) {
        throw new AsuError('Lost contact with the build server: ' + (err as Error).message);
      }
      continue;
    }
    failures = 0;

    let data: AsuResponse;
    try {
      data = (await res.json()) as AsuResponse;
    } catch {
      data = {};
    }

    if (res.status === 202) {
      opts.onProgress?.(
        data.queue_position != null && data.queue_position > 0
          ? { queuePosition: data.queue_position }
          : {},
      );
      continue;
    }
    if (res.status === 200) return data;
    throw new AsuError(data.detail || 'Build failed (HTTP ' + res.status + ')', data.stderr);
  }
}

export interface ResolvedImage extends DeviceImage {
  url: string | null;
}

/**
 * Turn a finished response into download links, sysupgrade first — that is the
 * image most people want, and putting factory first invites flashing the wrong
 * one onto an already-OpenWrt router.
 */
export function resolveImages(data: AsuResponse, asuBase: string): ResolvedImage[] {
  const base = trimSlashes(asuBase);
  const binDir = data.bin_dir;
  const images = data.images ?? [];
  return images
    .slice()
    .sort((a, b) => Number(b.type === 'sysupgrade') - Number(a.type === 'sysupgrade'))
    .map((im) => ({
      ...im,
      url: binDir ? `${base}/store/${binDir}/${im.name}` : null,
    }));
}

/** The single link to record in history: the sysupgrade image if there is one. */
export function primaryImageUrl(data: AsuResponse, asuBase: string): string | null {
  const resolved = resolveImages(data, asuBase);
  const sys = resolved.find((i) => i.type === 'sysupgrade') ?? resolved.find((i) => i.type === 'factory');
  return (sys ?? resolved[0])?.url ?? null;
}

export interface AsuServer {
  label: string;
  url: string;
}

/** The operator's configured servers, or just the official one. */
export async function loadAsuServers(): Promise<AsuServer[]> {
  try {
    const r = await fetch('/api/asu-servers');
    if (!r.ok) return [{ label: 'sysupgrade.openwrt.org', url: ASU_DEFAULT }];
    const data = (await r.json()) as { servers?: AsuServer[] };
    const servers = data.servers ?? [];
    return servers.length ? servers : [{ label: 'sysupgrade.openwrt.org', url: ASU_DEFAULT }];
  } catch {
    return [{ label: 'sysupgrade.openwrt.org', url: ASU_DEFAULT }];
  }
}
