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

// Hosts live at .10-.99: leaves the low end for router/infra and the high end
// for DHCP.
const OCTET_MIN = 10;
const OCTET_MAX = 99;

/**
 * Clamp a last-octet string to [OCTET_MIN, OCTET_MAX]. Empty or non-numeric
 * input passes through unchanged (the grammar stays lenient; the DOM keeps the
 * raw text). Numeric input is clamped and re-stringified.
 * @param {string} octet
 * @returns {string}
 */
export function clampOctet(octet) {
  const s = String(octet == null ? '' : octet).trim();
  if (!/^-?\d+$/.test(s)) return s;
  const n = parseInt(s, 10);
  return String(Math.max(OCTET_MIN, Math.min(OCTET_MAX, n)));
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
 * with leading/trailing newlines when non-empty, or '' when there are no rows -
 * byte-identical to the previous ui.serializeRows / readTable output.
 * @param {ReadonlyArray<Partial<ListRow>>} rows
 * @returns {string}
 */
export function serializeList(rows) {
  const lines = [];
  for (const r of rows || []) {
    const host = String((r && r.host) || '').trim();
    const octet = clampOctet(String((r && r.octet) || '').trim());
    const ports = String((r && r.ports) || '').trim();
    if (!host && !octet) continue;
    lines.push('\t' + host + ' | ' + octet + ' | ' + ports);
  }
  return lines.length ? '\n' + lines.join('\n') + '\n' : '';
}
