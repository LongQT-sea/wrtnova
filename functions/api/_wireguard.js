// WireGuard curve25519 keygen via the runtime Secure Curves API (X25519).
// The runtime generates and clamps; we only reformat the bytes to wg base64.
// Verified in workerd: the exported pubkey matches a reference curve25519
// derivation from the exported privkey, so the keys are byte-compatible with wg.

// raw bytes -> standard base64 (wg key format)
function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; ++i) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// base64url -> bytes (the jwk "d" field)
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// generateKeypair -> { privateKey, publicKey } as standard base64 (44 chars)
export async function generateKeypair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits'],
  );
  const rawPub = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  );
  // raw export not allowed for X25519 privkey; jwk "d" holds the 32-byte scalar
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const priv = b64urlToBytes(jwk.d);
  return { privateKey: bytesToB64(priv), publicKey: bytesToB64(rawPub) };
}
