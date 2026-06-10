// Unit tests for the pure WARP response shaper (functions/api/warp/register.js).
// shapeReg is the only pure piece of the merged WARP register endpoint; the
// network I/O (warpRegister) is not unit-tested here.
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shapeReg } from '../functions/api/warp/register.js';

const fullReg = {
  id: 'device-123',
  token: 'tok-abc',
  config: {
    peers: [{
      public_key: 'PEERPUBKEY=',
      endpoint: { v4: '162.159.192.1:2408', v6: '[2606:4700:d0::a]:2408', host: 'engage.cloudflareclient.com:2408' },
    }],
    interface: { addresses: { v4: '172.16.0.2', v6: '2606:4700:110::1' } },
  },
};

test('shapeReg: maps a full response to flat WG_* fields', () => {
  const out = shapeReg(fullReg, 'MYPRIVKEY=');
  assert.deepEqual(out, {
    private_key: 'MYPRIVKEY=',
    peer_public_key: 'PEERPUBKEY=',
    endpoint: '162.159.192.1',        // v4 preferred, port stripped
    endpoint_port: 2408,
    addresses_v4: '172.16.0.2/32',
    addresses_v6: '2606:4700:110::1/128',
    refresh_token: 'tok-abc',
    device_id: 'device-123',
  });
});

test('shapeReg: prefers v4 endpoint over host, stripping the port', () => {
  const out = shapeReg(fullReg, 'k');
  assert.equal(out.endpoint, '162.159.192.1');
});

test('shapeReg: falls back to host when no v4 endpoint, port stripped', () => {
  const reg = {
    config: { peers: [{ public_key: 'P', endpoint: { host: 'engage.cloudflareclient.com:2408' } }] },
  };
  const out = shapeReg(reg, 'k');
  assert.equal(out.endpoint, 'engage.cloudflareclient.com');
});

test('shapeReg: missing config/peers/addresses yields empty strings, port stays 2408', () => {
  const out = shapeReg({}, 'priv-only');
  assert.deepEqual(out, {
    private_key: 'priv-only',
    peer_public_key: '',
    endpoint: '',
    endpoint_port: 2408,
    addresses_v4: '',
    addresses_v6: '',
    refresh_token: '',
    device_id: '',
  });
});

test('shapeReg: token and id fall back to empty string when absent', () => {
  const out = shapeReg({ config: {} }, 'k');
  assert.equal(out.refresh_token, '');
  assert.equal(out.device_id, '');
});
