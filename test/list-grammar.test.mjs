// Unit tests for the shared "host | octet | ports" list grammar: serializeRows
// and the table round-trip to PORT_FORWARD_LIST / IPV6_SERVER_LIST and back.
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseList, serializeList, clampOctet4, ipv6OctetValid, firstInvalidIpv6Octet,
  hostnameValid, ddnsHostnameValid, macValid, portListValid, firstInvalidHost, firstInvalidPort,
  normalizeEndpoint, joinEndpoint } from '../public/js/list-grammar.mjs';

// ---------------------------------------------------------------------------
// parseList
// ---------------------------------------------------------------------------

test('parseList: parses tab-indented host | octet | ports lines', () => {
  const rows = parseList('\tdocker-host | 20 | 80 443\n\tnas | 30 | 5000');
  assert.deepEqual(rows, [
    { host: 'docker-host', octet: '20', ports: '80 443' },
    { host: 'nas', octet: '30', ports: '5000' },
  ]);
});

test('parseList: skips blank lines and lines without a separator', () => {
  const rows = parseList('\n  \nheader line without pipe\n\thost | 5 | 22\n');
  assert.deepEqual(rows, [{ host: 'host', octet: '5', ports: '22' }]);
});

test('parseList: trims each field and tolerates missing trailing fields', () => {
  assert.deepEqual(parseList('  a |  7  |  '), [{ host: 'a', octet: '7', ports: '' }]);
  assert.deepEqual(parseList('a | 7'), [{ host: 'a', octet: '7', ports: '' }]);
});

test('parseList: empty / null / undefined input -> []', () => {
  assert.deepEqual(parseList(''), []);
  assert.deepEqual(parseList(null), []);
  assert.deepEqual(parseList(undefined), []);
});

// ---------------------------------------------------------------------------
// serializeList
// ---------------------------------------------------------------------------

test('serializeList: empty rows -> empty string (no leading/trailing newline)', () => {
  assert.equal(serializeList([]), '');
  assert.equal(serializeList(undefined), '');
});

test('serializeList: wraps non-empty output with leading and trailing newline', () => {
  const out = serializeList([{ host: 'h', octet: '20', ports: '80' }]);
  assert.equal(out, '\n\th | 20 | 80\n');
});

test('serializeList: drops a row with neither host nor octet, keeps octet-only', () => {
  const out = serializeList([
    { host: '', octet: '', ports: '80' },     // dropped (blank row)
    { host: '', octet: '90', ports: '' },      // kept (octet present)
  ]);
  assert.equal(out, '\n\t | 90 | \n');
});

test('serializeList: trims fields before emitting', () => {
  assert.equal(serializeList([{ host: ' h ', octet: ' 20 ', ports: ' 80 ' }]), '\n\th | 20 | 80\n');
});

test('serializeList: v4 clamps the last octet to 1-254', () => {
  assert.equal(serializeList([{ host: 'lo', octet: '0', ports: '80' }], 'v4'), '\n\tlo | 1 | 80\n');
  assert.equal(serializeList([{ host: 'hi', octet: '300', ports: '80' }], 'v4'), '\n\thi | 254 | 80\n');
  assert.equal(serializeList([{ host: 'ok', octet: '42', ports: '80' }], 'v4'), '\n\tok | 42 | 80\n');
  // default kind is v4
  assert.equal(serializeList([{ host: 'd', octet: '255', ports: '' }]), '\n\td | 254 | \n');
});

test('serializeList: v6 trims but never clamps the hex hostid', () => {
  assert.equal(serializeList([{ host: 'h', octet: ' ff ', ports: '80' }], 'v6'), '\n\th | ff | 80\n');
  assert.equal(serializeList([{ host: 'h', octet: '1', ports: '80' }], 'v6'), '\n\th | 1 | 80\n');
  assert.equal(serializeList([{ host: 'h', octet: 'abcd', ports: '' }], 'v6'), '\n\th | abcd | \n');
});

// ---------------------------------------------------------------------------
// clampOctet4
// ---------------------------------------------------------------------------

test('clampOctet4: clamps numeric input into [1, 254]', () => {
  assert.equal(clampOctet4('0'), '1');
  assert.equal(clampOctet4('1'), '1');
  assert.equal(clampOctet4('42'), '42');
  assert.equal(clampOctet4('254'), '254');
  assert.equal(clampOctet4('255'), '254');
  assert.equal(clampOctet4('300'), '254');
  assert.equal(clampOctet4('-5'), '1');
});

test('clampOctet4: leaves empty / non-numeric input untouched', () => {
  assert.equal(clampOctet4(''), '');
  assert.equal(clampOctet4('  '), '');
  assert.equal(clampOctet4('abc'), 'abc');
  assert.equal(clampOctet4(null), '');
  assert.equal(clampOctet4(undefined), '');
});

// ---------------------------------------------------------------------------
// ipv6OctetValid / firstInvalidIpv6Octet
// ---------------------------------------------------------------------------

test('ipv6OctetValid: empty passes, hex 1-4 digits pass, 0 and non-hex fail', () => {
  assert.equal(ipv6OctetValid(''), true);
  assert.equal(ipv6OctetValid('  '), true);
  assert.equal(ipv6OctetValid('1'), true);        // 1 is allowed
  assert.equal(ipv6OctetValid('20'), true);
  assert.equal(ipv6OctetValid('ff'), true);
  assert.equal(ipv6OctetValid('FFFF'), true);
  assert.equal(ipv6OctetValid('0'), false);       // all-zero rejected
  assert.equal(ipv6OctetValid('0000'), false);
  assert.equal(ipv6OctetValid('g1'), false);      // non-hex
  assert.equal(ipv6OctetValid('12345'), false);   // > 4 digits
  assert.equal(ipv6OctetValid(null), true);
});

test('firstInvalidIpv6Octet: returns the first bad octet or null', () => {
  assert.equal(firstInvalidIpv6Octet('\ta | 20 | 80\n\tb | ff | 443'), null);
  assert.equal(firstInvalidIpv6Octet('\ta | 20 | 80\n\tb | 0 | 443'), '0');
  assert.equal(firstInvalidIpv6Octet(''), null);
});

// ---------------------------------------------------------------------------
// hostnameValid (RFC 1123) / ddnsHostnameValid (RFC 1035 FQDN)
// ---------------------------------------------------------------------------

test('hostnameValid: empty passes; RFC 1123 labels pass', () => {
  assert.equal(hostnameValid(''), true);          // empty = use default
  assert.equal(hostnameValid('  '), true);
  assert.equal(hostnameValid(null), true);
  assert.equal(hostnameValid('WrtNova'), true);
  assert.equal(hostnameValid('docker-host'), true);
  assert.equal(hostnameValid('3com'), true);       // RFC 1123 allows a leading digit
  assert.equal(hostnameValid('a'), true);
  assert.equal(hostnameValid('ddns.example.com'), true);  // multi-label ok
});

test('hostnameValid: rejects bad characters, edge hyphens, and over-length labels', () => {
  assert.equal(hostnameValid('bad_host'), false);  // underscore not allowed
  assert.equal(hostnameValid('has space'), false);
  assert.equal(hostnameValid('-lead'), false);     // leading hyphen
  assert.equal(hostnameValid('trail-'), false);    // trailing hyphen
  assert.equal(hostnameValid('a..b'), false);      // empty label
  assert.equal(hostnameValid('host!'), false);
  assert.equal(hostnameValid('a'.repeat(64)), false);          // label > 63
  assert.equal(hostnameValid('a'.repeat(63)), true);           // label == 63 ok
});

test('ddnsHostnameValid: empty passes; requires a dot (FQDN)', () => {
  assert.equal(ddnsHostnameValid(''), true);
  assert.equal(ddnsHostnameValid('ddns.example.com'), true);
  assert.equal(ddnsHostnameValid('example.com'), true);
  assert.equal(ddnsHostnameValid('nodot'), false);            // single label rejected
  assert.equal(ddnsHostnameValid('bad_host.com'), false);     // still hostname-checked
});

// ---------------------------------------------------------------------------
// macValid (WAN MAC address)
// ---------------------------------------------------------------------------

test('macValid: empty passes; six colon-separated hex pairs, any case', () => {
  assert.equal(macValid(''), true);                       // empty = leave stock MAC
  assert.equal(macValid('   '), true);                    // whitespace-only trims to empty
  assert.equal(macValid('F0:B4:29:2E:33:11'), true);      // uppercase
  assert.equal(macValid('f0:b4:29:2e:33:11'), true);      // lowercase
  assert.equal(macValid('  F0:B4:29:2E:33:11  '), true);  // surrounding whitespace trimmed
  assert.equal(macValid('F0:B4:29:2E:33'), false);        // only five octets
  assert.equal(macValid('F0:B4:29:2E:33:11:22'), false);  // seven octets
  assert.equal(macValid('F0-B4-29-2E-33-11'), false);     // hyphen separators rejected
  assert.equal(macValid('F0:B4:29:2E:33:GG'), false);     // non-hex digit
  assert.equal(macValid('F0:B4:29:2E:33:1'), false);      // single-digit octet
  assert.equal(macValid('F0B4.292E.3311'), false);        // Cisco dotted form rejected
});

// ---------------------------------------------------------------------------
// portListValid / firstInvalidHost / firstInvalidPort
// ---------------------------------------------------------------------------

test('portListValid: empty passes; single ports and ranges within 1-65535 pass', () => {
  assert.equal(portListValid(''), true);           // empty = all (IPv6)
  assert.equal(portListValid('80'), true);
  assert.equal(portListValid('80 443 8080'), true);
  assert.equal(portListValid('1000-2000'), true);
  assert.equal(portListValid('80 443 1000-2000'), true);
  assert.equal(portListValid('65535'), true);
});

test('portListValid: rejects 0, out-of-range, inverted ranges, and non-numeric', () => {
  assert.equal(portListValid('0'), false);
  assert.equal(portListValid('70000'), false);
  assert.equal(portListValid('80 70000'), false);
  assert.equal(portListValid('90-80'), false);     // low > high
  assert.equal(portListValid('0-100'), false);     // low < 1
  assert.equal(portListValid('http'), false);
});

test('firstInvalidHost / firstInvalidPort: return the first offender or null', () => {
  assert.equal(firstInvalidHost('\tok-host | 20 | 80\n\tbad_host | 30 | 443'), 'bad_host');
  assert.equal(firstInvalidHost('\tok-host | 20 | 80'), null);
  assert.equal(firstInvalidHost('\t | 20 | 80'), null);          // empty host skipped
  assert.equal(firstInvalidPort('\ta | 20 | 80\n\tb | 30 | 70000'), '70000');
  assert.equal(firstInvalidPort('\ta | 20 | 80 443'), null);
});

// ---------------------------------------------------------------------------
// normalizeEndpoint
// ---------------------------------------------------------------------------

test('normalizeEndpoint: strips brackets and lifts a trailing port', () => {
  assert.deepEqual(normalizeEndpoint('[2606:4700:d0::a29f:c006]:2408'),
    { host: '2606:4700:d0::a29f:c006', port: '2408' });
  assert.deepEqual(normalizeEndpoint('[2606:4700:d0::a29f:c006]'),
    { host: '2606:4700:d0::a29f:c006', port: '' });
});

test('normalizeEndpoint: splits host:port for IPv4 / hostname (single colon)', () => {
  assert.deepEqual(normalizeEndpoint('162.159.192.3:2408'), { host: '162.159.192.3', port: '2408' });
  assert.deepEqual(normalizeEndpoint('engage.cloudflareclient.com:1234'),
    { host: 'engage.cloudflareclient.com', port: '1234' });
});

test('normalizeEndpoint: leaves bare IPv6 and plain hosts untouched', () => {
  assert.deepEqual(normalizeEndpoint('2606:4700:d0::a29f:c006'),
    { host: '2606:4700:d0::a29f:c006', port: '' });
  assert.deepEqual(normalizeEndpoint('engage.cloudflareclient.com'),
    { host: 'engage.cloudflareclient.com', port: '' });
  assert.deepEqual(normalizeEndpoint('  1.2.3.4  '), { host: '1.2.3.4', port: '' });
});

// ---------------------------------------------------------------------------
// round-trip
// ---------------------------------------------------------------------------

test('round-trip: parse(serialize(rows)) === rows for normalized rows', () => {
  const rows = [
    { host: 'docker-host', octet: '20', ports: '80 443' },
    { host: 'nas', octet: '30', ports: '' },
  ];
  assert.deepEqual(parseList(serializeList(rows)), rows);
});

test('round-trip: serialize(parse(str)) is stable (idempotent re-serialize)', () => {
  const str = '\n\tdocker-host | 20 | 80 443\n\tnas | 30 | 5000\n';
  const once = serializeList(parseList(str));
  assert.equal(serializeList(parseList(once)), once);
  assert.equal(once, str);
});

// ---------------------------------------------------------------------------
// joinEndpoint - the inverse, for the two paths that arrive pre-split
// ---------------------------------------------------------------------------

test('joinEndpoint: puts host and port back into one field value', () => {
  assert.equal(joinEndpoint('engage.cloudflareclient.com', '2408'), 'engage.cloudflareclient.com:2408');
  assert.equal(joinEndpoint('162.159.192.3', '2408'), '162.159.192.3:2408');
});

test('joinEndpoint: brackets a bare IPv6 so it can be split again', () => {
  assert.equal(joinEndpoint('2606:4700:d0::a29f:c006', '2408'), '[2606:4700:d0::a29f:c006]:2408');
  // already bracketed - do not double up
  assert.equal(joinEndpoint('[2606:4700:d0::a29f:c006]', '2408'), '[2606:4700:d0::a29f:c006]:2408');
});

test('joinEndpoint: a missing half yields the host alone, never a stray colon', () => {
  assert.equal(joinEndpoint('host.example', ''), 'host.example');
  assert.equal(joinEndpoint('host.example', undefined), 'host.example');
  assert.equal(joinEndpoint('', '2408'), '');
  assert.equal(joinEndpoint(undefined, undefined), '');
});

// The form shows one field and wrtnova.sh wants two, so every WARP prefill and
// every restored build makes this trip. Losing the port here would silently
// build a tunnel against the default 51820.
test('joinEndpoint -> normalizeEndpoint round-trips, IPv6 included', () => {
  for (const [host, port] of [
    ['engage.cloudflareclient.com', '2408'],
    ['162.159.192.3', '51820'],
    ['2606:4700:d0::a29f:c006', '2408'],
  ]) {
    assert.deepEqual(normalizeEndpoint(joinEndpoint(host, port)), { host, port },
      `round trip failed for ${host}:${port}`);
  }
});
