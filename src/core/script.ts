// Fetching, slicing, and assembling the provisioning script.
//
// CONSTITUTION II. The three marker lines below are byte-load-bearing. They are
// written here as one frozen literal, never built by interpolation and never
// normalized, because the browser locates them in the fetched wrtnova.sh by
// exact match. A single changed byte makes every build produce a script with
// either no configuration or no body.

import type { EmittedConfig } from './types';
import { renderConfigBlock, renderConfigBlockMasked } from './render-config';

export const MARKER = '# ===================\n# End config section\n# ===================\n';

const HEADER =
  '#!/bin/sh\n' +
  '# SPDX-License-Identifier: MIT\n' +
  '# Copyright (C) 2024 - 2026 Tieu Long (https://github.com/LongQT-sea/wrtnova)\n\n';

/** ASU caps uci-defaults at this size. */
export const ASU_MAX_BYTES = 40960;

// -- fetching the body -------------------------------------------------------

let bodyCache: string | null = null;
let bodyPromise: Promise<string> | null = null;

/** Split a fetched script on the marker, keeping everything after it. */
export function sliceBody(text: string): string {
  const idx = text.indexOf(MARKER);
  if (idx < 0) throw new Error('wrtnova.sh section marker not found');
  return text.slice(idx + MARKER.length);
}

/** Fetch /wrtnova.sh once per page, deduplicating concurrent first calls. */
export function fetchScriptBody(url = '/wrtnova.sh'): Promise<string> {
  if (bodyCache !== null) return Promise.resolve(bodyCache);
  if (!bodyPromise) {
    bodyPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch ' + url);
        return r.text();
      })
      .then((text) => {
        bodyCache = sliceBody(text);
        return bodyCache;
      })
      .catch((err) => {
        bodyPromise = null;
        throw err;
      });
  }
  return bodyPromise;
}

/** Test seam. */
export function __resetScriptCache(): void {
  bodyCache = null;
  bodyPromise = null;
}

// -- compression -------------------------------------------------------------

async function gzipBase64(str: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Config too large, and this browser cannot compress it.');
  }
  const gz = await new Response(
    new Blob([str]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  const u8 = new Uint8Array(gz);
  let raw = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    raw += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(raw).replace(/(.{76})/g, '$1\n');
}

/**
 * The compressed body is decoded to /tmp and sourced, so it still sees the
 * plaintext config variables emitted above it.
 */
function bodyStub(payload: string): string {
  return (
    'wrtnova_body=/tmp/wrtnova.sh\n' +
    'base64 -d <<\'WRTNOVA_B64\' 2>/dev/null | gunzip > "$wrtnova_body" 2>/dev/null\n' +
    payload +
    '\nWRTNOVA_B64\n' +
    '[ -s "$wrtnova_body" ] && . "$wrtnova_body"\n'
  );
}

/** A readable form of the custom script, for on-screen previews only. */
function customBlockPlain(cmd: string): string {
  if (!cmd) return '';
  return "cat > /tmp/_user_script.sh <<'USER_SCRIPT_EOF'\n" + cmd + '\nUSER_SCRIPT_EOF\n';
}

/** The submitted form: always gzip+base64, which needs coreutils-base64. */
async function customBlockGz(cmd: string): Promise<string> {
  return (
    '# === Custom script ===\n' +
    'u_script=/tmp/_user_script.sh\n' +
    'base64 -d <<\'USER_SCRIPT_B64\' 2>/dev/null | gunzip > "$u_script" 2>/dev/null\n' +
    (await gzipBase64(cmd)) +
    '\nUSER_SCRIPT_B64\n'
  );
}

function tooBig(script: string): Error {
  let hint =
    'Config too large even compressed. Reduce port forwards, IPv6 exposed servers';
  if (/^DOH_UPSTREAMS=/m.test(script)) hint += ', or DoH upstream URLs';
  return new Error(hint + '.');
}

// -- assembly ----------------------------------------------------------------

/**
 * The readable form shown in the interface. `masked` renders secrets as '****'.
 * Never submitted.
 */
export function assembleScriptForDisplay(
  cfg: Partial<EmittedConfig>,
  body: string,
  masked: boolean,
): string {
  const block = masked ? renderConfigBlockMasked(cfg) : renderConfigBlock(cfg);
  return HEADER + block + customBlockPlain(String(cfg.CUSTOM_SCRIPT ?? '')) + MARKER + body;
}

export interface AssembledScript {
  script: string;
  /** True when the payload needs coreutils-base64 on the device to decode. */
  compressed: boolean;
}

/**
 * The real script POSTed to the build server, secrets included.
 *
 * When it exceeds the size cap, the header, config block and custom block stay
 * plaintext — so the configuration remains readable on the router — and only
 * the body is compressed.
 */
export async function assembleScriptForBuild(
  cfg: Partial<EmittedConfig>,
  body: string,
): Promise<AssembledScript> {
  const custom = String(cfg.CUSTOM_SCRIPT ?? '');
  const hasCustom = custom !== '';
  const customGz = hasCustom ? await customBlockGz(custom) : '';
  const prefix = HEADER + renderConfigBlock(cfg) + customGz + MARKER;

  const full = prefix + body;
  if (new Blob([full]).size <= ASU_MAX_BYTES) return { script: full, compressed: hasCustom };

  const out = prefix + bodyStub(await gzipBase64(body));
  if (new Blob([out]).size > ASU_MAX_BYTES) throw tooBig(full);
  return { script: out, compressed: true };
}
