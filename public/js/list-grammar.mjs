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
