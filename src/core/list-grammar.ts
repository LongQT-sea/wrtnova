// The "host | octet | ports" list grammar, and the value predicates that guard
// it.
//
// PORT_FORWARD_LIST and IPV6_SERVER_LIST are stored as a tab-indented,
// newline-separated block where each non-empty line is `\thost | octet | ports`.
// This is the single definition of that grammar, so the table -> string and
// string -> table directions cannot drift.

export interface ListRow {
  host: string;
  octet: string;
  ports: string;
}

const str = (v: unknown): string => (v == null ? '' : String(v));

// -- octets ------------------------------------------------------------------
// IPv4 forwards target a host in 1-254 (.1 is the router, a valid target).
// IPv6 exposure uses a hex host id, 1-4 digits, never 0.

/** Clamp an IPv4 octet to [1,254]. Empty and non-numeric pass through. */
export function clampOctet4(octet: string): string {
  const s = str(octet).trim();
  if (!/^-?\d+$/.test(s)) return s;
  return String(Math.max(1, Math.min(254, parseInt(s, 10))));
}

/** Empty passes (meaning "use the default"); else 1-4 hex digits, not zero. */
export function ipv6OctetValid(octet: string): boolean {
  const s = str(octet).trim();
  if (!s) return true;
  return /^[0-9a-fA-F]{1,4}$/.test(s) && parseInt(s, 16) !== 0;
}

// -- value predicates --------------------------------------------------------
// Empty passes everywhere: it means "use the provisioning script's default".

// RFC 1123 relaxed RFC 952 to allow a leading digit, so a label starts with an
// alphanumeric. Label: 1-63 characters, alphanumeric ends, internal hyphens.
const HN_LABEL = '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const HOSTNAME_RE = new RegExp('^' + HN_LABEL + '(\\.' + HN_LABEL + ')*$');

export function hostnameValid(v: string): boolean {
  const s = str(v).trim();
  return !s || (s.length <= 253 && HOSTNAME_RE.test(s));
}

/** Six colon-separated hex octets, the form LuCI accepts. */
export function macValid(v: string): boolean {
  const s = str(v).trim();
  return !s || /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(s);
}

/** Dynamic DNS needs a fully qualified name, so a dot is required. */
export function ddnsHostnameValid(v: string): boolean {
  const s = str(v).trim();
  return !s || (s.includes('.') && hostnameValid(s));
}

function portTokenValid(tok: string): boolean {
  const range = /^(\d{1,5})-(\d{1,5})$/.exec(tok);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return lo >= 1 && hi <= 65535 && lo <= hi;
  }
  return /^\d{1,5}$/.test(tok) && Number(tok) >= 1 && Number(tok) <= 65535;
}

/** Space-separated ports and ranges, each within 1-65535. */
export function portListValid(v: string): boolean {
  const s = str(v).trim();
  return !s || s.split(/\s+/).every(portTokenValid);
}

/** Two octets, e.g. "192.168". Empty means "use the default". */
export function prefixValid(v: string): boolean {
  const s = str(v).trim();
  if (!s) return true;
  const m = /^(\d{1,3})\.(\d{1,3})$/.exec(s);
  return !!m && Number(m[1]) <= 255 && Number(m[2]) <= 255;
}

/** Empty leaves the radio on its built-in regulatory domain. */
export function countryValid(v: string): boolean {
  const s = str(v).trim();
  return !s || /^[A-Za-z]{2}$/.test(s);
}

/**
 * A '|' would split a value across fields in the pipe-delimited wifi_networks
 * table the script parses, corrupting the config.
 */
export function wifiTextValid(v: string): boolean {
  return !str(v).includes('|');
}

// -- endpoint ----------------------------------------------------------------

/**
 * The form shows one "host:port" field; the script wants the two apart. A
 * bracketed [ipv6] loses its brackets, which UCI needs gone. A bare IPv6 has
 * more than one colon and is left whole rather than sliced at the wrong one.
 */
export function normalizeEndpoint(raw: string): { host: string; port: string } {
  const s = str(raw).trim();
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(s);
  if (bracketed) return { host: bracketed[1] ?? '', port: bracketed[2] ?? '' };
  if ((s.match(/:/g) || []).length === 1) {
    const [host = '', port = ''] = s.split(':');
    return { host, port };
  }
  return { host: s, port: '' };
}

/**
 * The inverse, for the two directions that arrive pre-split: a WARP
 * registration and a restored build. A bare IPv6 host must be bracketed on the
 * way back in, or the next normalizeEndpoint would see many colons, refuse to
 * split, and silently lose the port.
 */
export function joinEndpoint(host?: string, port?: string): string {
  const h = str(host).trim();
  const p = str(port).trim();
  if (!h || !p) return h;
  const bare6 = !h.startsWith('[') && (h.match(/:/g) || []).length > 1;
  return (bare6 ? `[${h}]` : h) + ':' + p;
}

// -- the list itself ---------------------------------------------------------

/** Blank lines and lines without a separator are skipped. */
export function parseList(listStr: string): ListRow[] {
  return str(listStr)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.includes('|'))
    .map((line) => {
      const p = line.split('|').map((s) => s.trim());
      return { host: p[0] ?? '', octet: p[1] ?? '', ports: p[2] ?? '' };
    });
}

/**
 * A row with neither host nor octet is dropped: it is a blank row the user
 * never filled. `kind` selects octet handling — 'v4' clamps, 'v6' only trims,
 * because a hex host id is validated at the gates and never silently rewritten.
 */
export function serializeList(
  rows: ReadonlyArray<Partial<ListRow>>,
  kind: 'v4' | 'v6' = 'v4',
): string {
  const lines: string[] = [];
  for (const r of rows) {
    const host = str(r?.host).trim();
    const rawOctet = str(r?.octet).trim();
    const octet = kind === 'v6' ? rawOctet : clampOctet4(rawOctet);
    const ports = str(r?.ports).trim();
    if (!host && !octet) continue;
    lines.push('\t' + host + ' | ' + octet + ' | ' + ports);
  }
  return lines.length ? '\n' + lines.join('\n') + '\n' : '';
}

export function firstInvalidHost(listStr: string): string | null {
  const bad = parseList(listStr).find((r) => r.host && !hostnameValid(r.host));
  return bad ? bad.host : null;
}

export function firstInvalidPort(listStr: string): string | null {
  const bad = parseList(listStr).find((r) => !portListValid(r.ports));
  return bad ? bad.ports : null;
}

export function firstInvalidIpv6Octet(listStr: string): string | null {
  const bad = parseList(listStr).find((r) => !ipv6OctetValid(r.octet));
  return bad ? bad.octet : null;
}
