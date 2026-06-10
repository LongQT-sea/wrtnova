// Unit tests for the shared "host | octet | ports" list grammar
// (Section 0 Test Strategy: "serializeRows / table round-trip ... round-trips
// to PORT_FORWARD_LIST / IPV6_SERVER_LIST and back").
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseList, serializeList } from '../public/js/list-grammar.mjs';

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
  const out = serializeList([{ host: 'h', octet: '2', ports: '80' }]);
  assert.equal(out, '\n\th | 2 | 80\n');
});

test('serializeList: drops a row with neither host nor octet, keeps octet-only', () => {
  const out = serializeList([
    { host: '', octet: '', ports: '80' },     // dropped (blank row)
    { host: '', octet: '9', ports: '' },       // kept (octet present)
  ]);
  assert.equal(out, '\n\t | 9 | \n');
});

test('serializeList: trims fields before emitting', () => {
  assert.equal(serializeList([{ host: ' h ', octet: ' 2 ', ports: ' 80 ' }]), '\n\th | 2 | 80\n');
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
