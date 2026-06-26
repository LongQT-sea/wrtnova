// Structural-invariant tests for the shared config-form field schema
// (config-form.mjs), the single definition of the config editor's field list +
// ordering used by BOTH /builder and /networks (SPEC Section 0 "one
// definition"). These assert the schema is internally consistent; exact match
// to the real DOM forms is proven separately by the byte-parity harnesses
// (scripts/dev/parity-harness*.mjs). readForm/writeForm touch the DOM, so they
// are exercised in-browser by the harnesses, not here.
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_SCHEMA, keySets } from '../public/js/config-form.mjs';

const KINDS = new Set(['text', 'checkbox', 'radio', 'select', 'subnet', 'country', 'tz', 'table']);

test('BASE_SCHEMA: every descriptor has a known kind', () => {
  for (const [key, kind] of BASE_SCHEMA) {
    assert.ok(KINDS.has(kind), `key ${key} has unknown kind ${kind}`);
  }
});

test('BASE_SCHEMA: no duplicate config keys', () => {
  const keys = BASE_SCHEMA.map(([k]) => k).filter(k => k !== '__tz__');
  assert.equal(keys.length, new Set(keys).size, 'duplicate key in BASE_SCHEMA');
});

test('BASE_SCHEMA: exactly one tz descriptor; tables are portfwd + ipv6', () => {
  assert.equal(BASE_SCHEMA.filter(([, kind]) => kind === 'tz').length, 1);
  const tables = BASE_SCHEMA.filter(([, kind]) => kind === 'table');
  assert.deepEqual(tables.map(([key, , tableId]) => [key, tableId]), [
    ['PORT_FORWARD_LIST', 'portfwd'],
    ['IPV6_SERVER_LIST', 'ipv6'],
  ]);
});

test('BASE_SCHEMA: radio defaults match the contract', () => {
  const defs = Object.fromEntries(
    BASE_SCHEMA.filter(([, kind]) => kind === 'radio').map(([key, , , def]) => [key, def]),
  );
  assert.deepEqual(defs, { SSH_PASSWD_AUTH: '', wan_type: 'dhcp', DNS_MODE: 'adguardhome' });
});

test('keySets: partitions radios vs checkboxes; text/select/tz/table excluded', () => {
  const { radio, checkbox } = keySets(BASE_SCHEMA);
  assert.deepEqual([...radio].sort(), ['DNS_MODE', 'SSH_PASSWD_AUTH', 'wan_type']);
  // Spot-check representative checkboxes and exclusions.
  for (const k of ['GUEST_ENABLE', 'WG_ENABLE', 'WIFI_KVR', 'SOFTWARE_OFFLOAD']) {
    assert.ok(checkbox.has(k), `${k} should be a checkbox`);
  }
  for (const k of ['HOST_NAME', 'COUNTRY_CODE', 'PORT_FORWARD_LIST', 'ZONE_NAME']) {
    assert.ok(!radio.has(k) && !checkbox.has(k), `${k} should not be radio/checkbox`);
  }
});

test('keySets: composed builder schema routes device fields', () => {
  const builder = [...BASE_SCHEMA, ['AP_MODE', 'radio'], ['AP_INDEX', 'text'], ['NON_CT_ATH10K', 'checkbox']];
  const { radio, checkbox } = keySets(builder);
  assert.ok(radio.has('AP_MODE'));
  assert.ok(checkbox.has('NON_CT_ATH10K'));
  assert.ok(!radio.has('AP_INDEX') && !checkbox.has('AP_INDEX'));
});
