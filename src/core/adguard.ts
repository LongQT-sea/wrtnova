// The AdGuard Home admin password, derived from the root password.
//
// The user logs into AdGuard Home with the same credential they set for the
// router, so the hash is derived rather than asked for.
//
// The salt is derived DETERMINISTICALLY from the password (SHA-256, first 16
// bytes) so the same password always yields the same hash. That is load-bearing
// for FR-032: a stable hash is what makes a rebuild byte-identical and lets the
// build server serve a cached image. bcrypt's cost factor still protects the
// hash; identical passwords sharing a hash is an acceptable trade for a derived
// router admin credential.
//
// Do not "fix" this to use a random salt. It would silently stop every existing
// user's rebuild from hitting the cache.

import bcrypt from 'bcryptjs';

const resolved = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

async function deterministicSalt(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const saltBytes = new Uint8Array(digest).subarray(0, 16);
  return '$2a$10$' + bcrypt.encodeBase64(saltBytes, 16);
}

/** The bcrypt hash for a root password. Empty password yields an empty hash. */
export function adguardHashFromRoot(password: string): Promise<string> {
  if (!password) return Promise.resolve('');
  const cached = resolved.get(password);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(password);
  if (existing) return existing;

  const promise = (async () => {
    const salt = await deterministicSalt(password);
    const hash = bcrypt.hashSync(password, salt);
    resolved.set(password, hash);
    return hash;
  })();
  inFlight.set(password, promise);
  return promise;
}

/** The already-computed hash, if there is one. For synchronous previews. */
export function adguardHashIfReady(password: string): string | undefined {
  if (!password) return '';
  return resolved.get(password);
}

/** Test seam. */
export function __resetAdguardCache(): void {
  resolved.clear();
  inFlight.clear();
}
