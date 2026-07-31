// VLAN and interface-name allocation.
//
// The frontend owns both, so the emitted config is already conflict-free and
// the script's own resolve_vlans becomes a no-op on our output. The rule is the
// same for each: a value the user typed is an ANCHOR and is fixed; an untouched
// value is an AUTO that yields, taking the lowest free slot at or above its
// natural default.
//
// Only an anchor can truly collide, because an auto always has somewhere to go.
// So the conflict flags below are the only cases that block a build (FR-013) —
// an auto being reassigned is normal operation, surfaced in the plan panel
// rather than raised as an error.

import type { Config, RawConfig } from './types';

type Cfg = Partial<RawConfig> | Partial<Config>;

const on = (cfg: Cfg, k: keyof Config): boolean =>
  (cfg as Record<string, unknown>)[k] === '1';

const val = (cfg: Cfg, k: keyof Config): string =>
  String((cfg as Record<string, unknown>)[k] ?? '').trim();

// The full VLAN table in resolve order, mirroring the script. `flag` is the
// enable key; absent means always on, except wan which is router-only.
const VLAN_TABLE = [
  { key: 'lan', field: 'LAN_VLAN_ID', def: 1, max: 255 },
  { key: 'guest', field: 'GUEST_VLAN_ID', def: 5, max: 255, flag: 'GUEST_ENABLE' },
  { key: 'iot', field: 'IOT_VLAN_ID', def: 10, max: 255, flag: 'IOT_ENABLE' },
  { key: 'vpn', field: 'LAN_VPN_VLAN_ID', def: 15, max: 255, flag: 'WG_ENABLE' },
  { key: 'wan', field: 'WAN_VLAN_ID', def: 20, max: 4094, wan: true },
  { key: 'wanb', field: 'WAN_B_VLAN_ID', def: 21, max: 4094, wan: true, flag: 'WAN_B_ENABLE' },
] as const satisfies ReadonlyArray<{
  key: string;
  field: keyof Config;
  def: number;
  max: number;
  wan?: true;
  flag?: keyof Config;
}>;

export type VlanRowKey = (typeof VLAN_TABLE)[number]['key'];

export interface VlanAssignment {
  vid: number | null;
  userSet: boolean;
  participates: boolean;
  def: number;
  exhausted: boolean;
}

export interface VlanResult {
  byKey: Record<string, VlanAssignment>;
  conflict: { anchorCollision: boolean; trunkCollision: boolean; exhausted: boolean };
}

/** Expand the trunk list ("5 10-12 20") into a set of ids. */
export function trunkVids(list: string): Set<number> {
  const set = new Set<number>();
  String(list ?? '')
    .trim()
    .split(/\s+/)
    .forEach((tok) => {
      const rng = /^(\d+)-(\d+)$/.exec(tok);
      if (rng) {
        for (let v = Number(rng[1]); v <= Number(rng[2]); v++) set.add(v);
      } else if (/^\d+$/.test(tok)) {
        set.add(Number(tok));
      }
    });
  return set;
}

function vlanParticipates(cfg: Cfg, row: (typeof VLAN_TABLE)[number]): boolean {
  if (row.key === 'lan') return true;
  // An access point has no upstream of its own, so WAN and WAN-B are excluded.
  if ('wan' in row && row.wan && on(cfg, 'AP_MODE')) return false;
  if ('flag' in row && row.flag) return on(cfg, row.flag);
  return true;
}

export function resolveVlanAssignment(cfg: Cfg): VlanResult {
  const trunk = trunkVids(val(cfg, 'ADDITIONAL_VLAN_LIST'));
  const conflict = { anchorCollision: false, trunkCollision: false, exhausted: false };

  // Pass 1: classify each field as an anchor (a valid typed value) or an auto.
  const entries = VLAN_TABLE.map((row) => {
    const raw = val(cfg, row.field);
    const num = /^\d+$/.test(raw) ? Number(raw) : NaN;
    const valid = Number.isFinite(num) && num >= 1 && num <= row.max;
    return {
      row,
      part: vlanParticipates(cfg, row),
      userSet: valid,
      anchor: valid ? num : null,
    };
  });

  // Reserve participating anchors plus the trunk, flagging real collisions.
  const reserved = new Set<number>(trunk);
  const anchorSeen = new Set<number>();
  for (const e of entries) {
    if (!e.part || !e.userSet || e.anchor === null) continue;
    if (anchorSeen.has(e.anchor)) conflict.anchorCollision = true;
    anchorSeen.add(e.anchor);
    if (trunk.has(e.anchor)) conflict.trunkCollision = true;
    reserved.add(e.anchor);
  }

  // Pass 2: allocate the autos around the reserved set.
  const byKey: Record<string, VlanAssignment> = {};
  for (const e of entries) {
    const { key, def, max } = e.row;
    if (!e.part) {
      byKey[key] = { vid: null, userSet: e.userSet, participates: false, def, exhausted: false };
      continue;
    }
    if (e.userSet && e.anchor !== null) {
      byKey[key] = { vid: e.anchor, userSet: true, participates: true, def, exhausted: false };
      continue;
    }
    let pick: number | null = null;
    for (let v = def; v <= max && pick === null; v++) if (!reserved.has(v)) pick = v;
    for (let v = 1; v < def && pick === null; v++) if (!reserved.has(v)) pick = v;
    if (pick === null) {
      conflict.exhausted = true;
      byKey[key] = { vid: def, userSet: false, participates: true, def, exhausted: true };
    } else {
      reserved.add(pick);
      byKey[key] = { vid: pick, userSet: false, participates: true, def, exhausted: false };
    }
  }

  return { byKey, conflict };
}

/**
 * The value to emit per VLAN field: the resolved id when it participates and
 * differs from the field's natural default, else '' so we never write a
 * redundant default (Constitution V).
 */
export function resolveVlanEmit(cfg: Cfg): Record<string, string> {
  const { byKey } = resolveVlanAssignment(cfg);
  const out: Record<string, string> = {};
  for (const row of VLAN_TABLE) {
    const a = byKey[row.key];
    out[row.field] = a && a.participates && a.vid !== null && a.vid !== a.def ? String(a.vid) : '';
  }
  return out;
}

export function detectVlanConflict(cfg: Cfg): boolean {
  const { conflict } = resolveVlanAssignment(cfg);
  return conflict.anchorCollision || conflict.trunkCollision || conflict.exhausted;
}

// -- interface names ---------------------------------------------------------

/** What UCI accepts as a section name. Empty means "use the script's default". */
export const IFACE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function ifaceValid(v: string | undefined): boolean {
  return !v || IFACE_RE.test(v);
}

/**
 * Names the script or stock OpenWrt already owns. netifd keys interfaces by
 * section name, so a LAN-side network landing on one silently overwrites it:
 * the build succeeds and two networks quietly become one. Held unconditionally
 * rather than gated on the flags that create them, so enabling WAN-B or the
 * modem later cannot break a saved config.
 */
export const RESERVED_IFACES: readonly string[] = [
  'wan', 'wan_6', 'wanb', 'wanb_6', 'cellular', 'usb0', 'vpn', 'vpn_6', 'loopback', 'globals',
];

const IFACE_TABLE = [
  { key: 'lan', field: 'LAN_IFACE', def: 'lan', vlanKey: 'lan' },
  { key: 'guest', field: 'GUEST_IFACE', def: 'guest', vlanKey: 'guest', flag: 'GUEST_ENABLE' },
  { key: 'iot', field: 'IOT_IFACE', def: 'iot', vlanKey: 'iot', flag: 'IOT_ENABLE' },
  { key: 'vpn', field: 'LAN_VPN_IFACE', def: 'lan_vpn', vlanKey: 'vpn', flag: 'WG_ENABLE' },
] as const satisfies ReadonlyArray<{
  key: string;
  field: keyof Config;
  def: string;
  vlanKey: string;
  flag?: keyof Config;
}>;

export const IFACE_KEY_BY_FIELD: Record<string, string> = Object.fromEntries(
  IFACE_TABLE.map((r) => [r.field, r.key]),
);

export type IfaceConflict = '' | 'reserved' | 'dup' | 'invalid';

export interface IfaceAssignment {
  name: string;
  raw: string;
  userSet: boolean;
  participates: boolean;
  def: string;
  conflict: IfaceConflict;
}

export interface IfaceResult {
  byKey: Record<string, IfaceAssignment>;
  conflict: { anchorCollision: boolean; reservedCollision: boolean; exhausted: boolean };
}

export function resolveIfaceAssignment(cfg: Cfg): IfaceResult {
  const vlan = resolveVlanAssignment(cfg).byKey;
  const conflict = { anchorCollision: false, reservedCollision: false, exhausted: false };

  // A value failing the charset rule is deliberately not an anchor: it reserves
  // nothing, and blurring its precise message into a conflict one helps nobody.
  const entries = IFACE_TABLE.map((row) => {
    const raw = val(cfg, row.field);
    const userSet = raw !== '' && ifaceValid(raw);
    return {
      row,
      raw,
      part: 'flag' in row && row.flag ? on(cfg, row.flag) : true,
      userSet,
      anchor: userSet ? raw : '',
    };
  });

  // Duplicates are counted first so both sides of a collision are flagged.
  const reserved = new Set<string>(RESERVED_IFACES);
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.part && e.userSet) counts.set(e.anchor, (counts.get(e.anchor) ?? 0) + 1);
  }
  const flagged: Record<string, IfaceConflict> = {};
  for (const e of entries) {
    if (!e.part || !e.userSet) continue;
    if (RESERVED_IFACES.includes(e.anchor)) {
      conflict.reservedCollision = true;
      flagged[e.row.key] = 'reserved';
    } else if ((counts.get(e.anchor) ?? 0) > 1) {
      conflict.anchorCollision = true;
      flagged[e.row.key] = 'dup';
    }
    reserved.add(e.anchor);
  }

  const byKey: Record<string, IfaceAssignment> = {};
  for (const e of entries) {
    const { key, def, vlanKey } = e.row;
    const at = (name: string, c: IfaceConflict) => {
      byKey[key] = { name, raw: e.raw, userSet: e.userSet, participates: e.part, def, conflict: c };
    };
    if (!e.part) {
      at(def, '');
      continue;
    }
    if (e.userSet) {
      at(e.anchor, flagged[key] ?? '');
      continue;
    }
    if (e.raw !== '') {
      at(def, 'invalid'); // charset reject keeps the default
      continue;
    }
    const a = vlan[vlanKey];
    const vid = a && a.vid !== null ? a.vid : (a?.def ?? 0);
    let name: string | null = null;
    for (const cand of [def, 'vlan' + vid, def + '_' + vid]) {
      if (!reserved.has(cand)) {
        name = cand;
        break;
      }
    }
    if (name === null) {
      conflict.exhausted = true;
      name = def;
    } else {
      reserved.add(name);
    }
    at(name, '');
  }

  return { byKey, conflict };
}

/**
 * Unlike resolveVlanEmit this must also write auto-assigned values, because the
 * script's fallback is 'guest', not 'vlan5'.
 */
export function resolveIfaceEmit(cfg: Cfg): Record<string, string> {
  const { byKey } = resolveIfaceAssignment(cfg);
  const out: Record<string, string> = {};
  for (const row of IFACE_TABLE) {
    const a = byKey[row.key];
    out[row.field] = a && a.participates && a.name !== a.def ? a.name : '';
  }
  return out;
}

export function detectIfaceConflict(cfg: Cfg): boolean {
  const { conflict } = resolveIfaceAssignment(cfg);
  return conflict.anchorCollision || conflict.reservedCollision || conflict.exhausted;
}

// -- switch-target VLAN table cap --------------------------------------------

/** Hardware VLAN table slots on a swconfig switch. */
export const SWCONFIG_VLAN_MAX = 16;

/**
 * Targets whose built-in switch is swconfig-driven and exposes only a 16-entry
 * hardware VLAN table. ramips/mt7621 is DSA (bridge-vlan, no such limit) and is
 * deliberately excluded.
 */
export function isSwconfigTarget(target: string | undefined): boolean {
  const t = String(target ?? '');
  return t.startsWith('ath79/') || t === 'ramips/mt7620' || t === 'ramips/mt76x8';
}

export function countBaseVlanSlots(cfg: Cfg): number {
  return VLAN_TABLE.reduce((n, row) => n + (vlanParticipates(cfg, row) ? 1 : 0), 0);
}

function compressVids(sorted: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === (sorted[j] ?? 0) + 1) j++;
    out.push(i === j ? String(sorted[i]) : sorted[i] + '-' + sorted[j]);
    i = j + 1;
  }
  return out.join(' ');
}

/**
 * Fit the trunk list to the switch's slots: base networks reserve their own,
 * the rest is the trunk budget. Keeps the first `budget` ids in typed order and
 * drops the overflow, re-emitting both range-compressed. Unchanged on DSA.
 */
export function truncateAdditionalVlans(
  cfg: Cfg,
  target: string | undefined,
): { list: string; dropped: string; truncated: boolean; budget: number } {
  const raw = val(cfg, 'ADDITIONAL_VLAN_LIST');
  if (!isSwconfigTarget(target) || !raw) {
    return { list: raw, dropped: '', truncated: false, budget: SWCONFIG_VLAN_MAX };
  }

  // Expand in typed order, unique (a duplicate reserves no extra slot).
  const seen = new Set<number>();
  const vids: number[] = [];
  for (const tok of raw.split(/\s+/)) {
    const rng = /^(\d+)-(\d+)$/.exec(tok);
    if (rng) {
      for (let v = Number(rng[1]); v <= Number(rng[2]); v++) {
        if (!seen.has(v)) {
          seen.add(v);
          vids.push(v);
        }
      }
    } else if (/^\d+$/.test(tok)) {
      const v = Number(tok);
      if (!seen.has(v)) {
        seen.add(v);
        vids.push(v);
      }
    }
  }

  const budget = Math.max(0, SWCONFIG_VLAN_MAX - countBaseVlanSlots(cfg));
  if (vids.length <= budget) return { list: raw, dropped: '', truncated: false, budget };

  const kept = vids.slice(0, budget).sort((a, b) => a - b);
  const dropped = vids.slice(budget).sort((a, b) => a - b);
  return { list: compressVids(kept), dropped: compressVids(dropped), truncated: true, budget };
}
