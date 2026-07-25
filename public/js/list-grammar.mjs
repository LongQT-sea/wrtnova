// @ts-check
// Shared "host | octet | ports" list grammar - one definition, many call sites.
//
// PORT_FORWARD_LIST and IPV6_SERVER_LIST are stored in wrtnova.sh as a
// tab-indented, newline-separated block where each non-empty line is:
//
//   \thost | octet | ports
//
// This module is the single pure definition of that grammar. The DOM call
// sites (ui.serializeRows / networks readTable build the rows from a table;
// networks loadTable / history restoreTable rebuild the table from a string)
// share parseList/serializeList so the round-trip is defined in exactly one
// place. The empty-table default-row behavior stays in the DOM callers - it is
// view concern, not grammar.

/** @typedef {{ host: string, octet: string, ports: string }} ListRow */

// IPv4 (PORT_FORWARD_LIST) octet is decimal 1-254 (.1 is the router, a valid
// forward target); IPv6 (IPV6_SERVER_LIST) is a hex hostid, 1-4 digits, not 0.

/** Clamp an IPv4 octet to [1,254]; empty / non-numeric passes through. @param {string} octet @returns {string} */
export function clampOctet4(octet) {
  const s = String(octet == null ? '' : octet).trim();
  if (!/^-?\d+$/.test(s)) return s;
  return String(Math.max(1, Math.min(254, parseInt(s, 10))));
}

/** Valid IPv6 hostid? Empty passes (like prefixValid); else 1-4 hex digits, not 0. @param {string} octet @returns {boolean} */
export function ipv6OctetValid(octet) {
  const s = String(octet == null ? '' : octet).trim();
  if (!s) return true;
  return /^[0-9a-fA-F]{1,4}$/.test(s) && parseInt(s, 16) !== 0;
}

/** First octet in a stored IPV6_SERVER_LIST failing ipv6OctetValid, else null. @param {string} listStr @returns {string|null} */
export function firstInvalidIpv6Octet(listStr) {
  const bad = parseList(listStr).find((r) => !ipv6OctetValid(r.octet));
  return bad ? bad.octet : null;
}

// -- Value validators (hostname / ports / endpoint) --------------------------
// Empty passes everywhere: it means "use the wrtnova.sh default".

// RFC 1123 sec 2.1 relaxed RFC 952 to allow a leading digit, so a label's first
// char is [A-Za-z0-9]. Label: 1-63 chars, alnum ends, internal hyphens.
const HN_LABEL = '[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const HOSTNAME_RE = new RegExp('^' + HN_LABEL + '(\\.' + HN_LABEL + ')*$');

/** @param {string} v @returns {boolean} */
export function hostnameValid(v) {
  const s = String(v == null ? '' : v).trim();
  return !s || (s.length <= 253 && HOSTNAME_RE.test(s));
}

// Six colon-separated hex octets, e.g. F0:B4:29:2E:33:11 (upper or lower case),
// the form LuCI accepts. @param {string} v @returns {boolean}
export function macValid(v) {
  const s = String(v == null ? '' : v).trim();
  return !s || /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(s);
}

/** RFC 1035 FQDN for DDNS: a hostname with a dot (e.g. ddns.example.com). @param {string} v @returns {boolean} */
export function ddnsHostnameValid(v) {
  const s = String(v == null ? '' : v).trim();
  return !s || (s.includes('.') && hostnameValid(s));
}

function portTokenValid(tok) {
  const r = /^(\d{1,5})-(\d{1,5})$/.exec(tok);   // low-high range
  if (r) return +r[1] >= 1 && +r[2] <= 65535 && +r[1] <= +r[2];
  return /^\d{1,5}$/.test(tok) && +tok >= 1 && +tok <= 65535;
}

/** Space-separated ports/ranges within 1-65535. @param {string} v @returns {boolean} */
export function portListValid(v) {
  const s = String(v == null ? '' : v).trim();
  return !s || s.split(/\s+/).every(portTokenValid);
}

/** @param {string} listStr @returns {string|null} */
export function firstInvalidHost(listStr) {
  const bad = parseList(listStr).find((r) => r.host && !hostnameValid(r.host));
  return bad ? bad.host : null;
}

/** @param {string} listStr @returns {string|null} */
export function firstInvalidPort(listStr) {
  const bad = parseList(listStr).find((r) => !portListValid(r.ports));
  return bad ? bad.ports : null;
}

// The form has one "host:port" endpoint field; wrtnova.sh wants the two apart
// (endpoint_host= / endpoint_port=), so the emit paths split it here. A
// bracketed [ipv6] loses the brackets, which UCI rejects; a bare IPv6 has more
// than one ':' and is left whole rather than sliced at the wrong colon.
/** @param {string} raw @returns {{ host: string, port: string }} */
export function normalizeEndpoint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const b = /^\[([^\]]+)\](?::(\d+))?$/.exec(s);
  if (b) return { host: b[1], port: b[2] || '' };
  if ((s.match(/:/g) || []).length === 1) { const [host, port] = s.split(':'); return { host, port }; }
  return { host: s, port: '' };
}

// The inverse, for the two directions that arrive pre-split: a WARP
// registration and a restored build. A bare IPv6 host must be bracketed on the
// way back in, or normalizeEndpoint would see many colons and refuse to split
// it again - the port would be silently lost on the next build.
/** @param {string} [host] @param {string} [port] @returns {string} */
export function joinEndpoint(host, port) {
  const h = String(host == null ? '' : host).trim();
  const p = String(port == null ? '' : port).trim();
  if (!h || !p) return h;
  const bare6 = !h.startsWith('[') && (h.match(/:/g) || []).length > 1;
  return (bare6 ? `[${h}]` : h) + ':' + p;
}

/**
 * Parse a stored list block into rows. Blank lines and lines without a '|'
 * separator are skipped (matches the historical filter). Each field is
 * trimmed; missing trailing fields become ''.
 * @param {string} listStr
 * @returns {ListRow[]}
 */
export function parseList(listStr) {
  return String(listStr == null ? '' : listStr)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.includes('|'))
    .map((line) => {
      const p = line.split('|').map((s) => s.trim());
      return { host: p[0] || '', octet: p[1] || '', ports: p[2] || '' };
    });
}

/**
 * Serialize rows back into the stored list block. A row with neither host nor
 * octet is dropped (a blank row the user never filled). The result is wrapped
 * with leading/trailing newlines when non-empty, or '' when there are no rows.
 * kind selects octet handling: 'v4' clamps to 1-254; 'v6' only trims (the hex
 * hostid is validated at the DOM/build gates, never silently rewritten).
 * @param {ReadonlyArray<Partial<ListRow>>} rows
 * @param {'v4'|'v6'} [kind]
 * @returns {string}
 */
export function serializeList(rows, kind = 'v4') {
  const lines = [];
  for (const r of rows || []) {
    const host = String((r && r.host) || '').trim();
    const rawOctet = String((r && r.octet) || '').trim();
    const octet = kind === 'v6' ? rawOctet : clampOctet4(rawOctet);
    const ports = String((r && r.ports) || '').trim();
    if (!host && !octet) continue;
    lines.push('\t' + host + ' | ' + octet + ' | ' + ports);
  }
  return lines.length ? '\n' + lines.join('\n') + '\n' : '';
}
