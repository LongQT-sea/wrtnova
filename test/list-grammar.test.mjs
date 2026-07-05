// Unit tests for the shared "host | octet | ports" list grammar
// (Section 0 Test Strategy: "serializeRows / table round-trip ... round-trips
// to PORT_FORWARD_LIST / IPV6_SERVER_LIST and back").
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseList, serializeList, clampOctet4, ipv6OctetValid, firstInvalidIpv6Octet } from '../public/js/list-grammar.mjs';

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
