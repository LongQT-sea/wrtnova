// The network the current settings will produce, as data.
//
// This is the model behind the signature element. It is a pure function of the
// configuration so the panel cannot show one thing while the build does another,
// and so the interesting part -- which VLAN id and interface name were actually
// resolved, and what each lane is allowed to reach -- is testable without a DOM.
//
// FR-011 and FR-012 require an auto-assignment to be visible before building. The
// resolved id and name are on the lane, which is that requirement met; the
// `*Reassigned` flags mark the case worth calling out -- the allocator having moved
// a value because something else had taken it -- without raising a warning for
// something that is normal operation.

import type { RawConfig, SegmentId } from '@core/types';
import { derive } from '@core/derive';
import { resolveIfaceAssignment, resolveVlanAssignment } from '@core/vlan';

/** What a lane is permitted to talk to. */
export type Reach = 'internet' | 'tunnel' | 'noInternet' | 'isolated';

export interface Lane {
  id: SegmentId;
  enabled: boolean;
  /** The router's own address on this lane, e.g. 192.168.5.1. */
  address: string;
  /** The mask as the user chose it, e.g. /24. */
  subnet: string;
  vlanId: number;
  /**
   * The allocator MOVED this off the natural default because something else had
   * taken it. Simply being left blank does not count: every lane is auto by
   * default, so marking all of them would carry no information -- and the value
   * itself, shown right here, is what satisfies "visible before building".
   */
  vlanReassigned: boolean;
  iface: string;
  ifaceReassigned: boolean;
  reach: Reach[];
}

export interface Plan {
  /** An access point creates the same VLANs and SSIDs but routes nothing. */
  accessPoint: boolean;
  /** The address the node itself answers on. */
  address: string;
  lanes: Lane[];
}

const SEGMENTS: ReadonlyArray<{
  id: SegmentId;
  row: string;
  prefix: keyof RawConfig;
  subnet: keyof RawConfig;
  enable: keyof RawConfig | null;
}> = [
  { id: 'lan', row: 'lan', prefix: 'LAN_BASE_PREFIX', subnet: 'LAN_SUBNET', enable: null },
  { id: 'guest', row: 'guest', prefix: 'GUEST_BASE_PREFIX', subnet: 'GUEST_SUBNET', enable: 'GUEST_ENABLE' },
  { id: 'iot', row: 'iot', prefix: 'IOT_BASE_PREFIX', subnet: 'IOT_SUBNET', enable: 'IOT_ENABLE' },
  { id: 'vpn', row: 'vpn', prefix: 'LAN_VPN_BASE_PREFIX', subnet: 'LAN_VPN_SUBNET', enable: 'WG_ENABLE' },
];

const str = (raw: RawConfig, key: keyof RawConfig): string => String(raw[key] ?? '').trim();

function reachOf(id: SegmentId, raw: RawConfig, isRouter: boolean): Reach[] {
  // An access point terminates nothing: its lanes are layer 2, and traffic is
  // routed back to the main router, so claiming reachability here would be a lie.
  if (!isRouter) return [];
  switch (id) {
    case 'lan':
      return ['internet'];
    case 'guest':
      return raw.GUEST_ISOLATE === '1' ? ['internet', 'isolated'] : ['internet'];
    case 'iot':
      if (raw.IOT_INTERNET !== '1') return ['noInternet'];
      return raw.IOT_ROUTE_VIA_WG === '1' ? ['tunnel'] : ['internet'];
    case 'vpn':
      return ['tunnel'];
  }
}

/**
 * Memoized on the configuration's identity. The plan is a live view, so it is
 * read on every store change by several components; without this each of them
 * would get a fresh object and re-render even when nothing in the plan moved.
 */
const cache = new WeakMap<RawConfig, Plan>();

export function planOf(raw: RawConfig): Plan {
  const hit = cache.get(raw);
  if (hit) return hit;
  const plan = buildPlan(raw);
  cache.set(raw, plan);
  return plan;
}

export function buildPlan(raw: RawConfig): Plan {
  const emitted = derive(raw);
  const vlan = resolveVlanAssignment(raw).byKey;
  const iface = resolveIfaceAssignment(raw).byKey;

  const isRouter = emitted.AP_MODE !== '1';
  // wrtnova.sh addresses each network as prefix.<vlan id>.<host>, and an access
  // point takes its AP index as the host part.
  const host = isRouter ? '1' : str(raw, 'AP_INDEX') || '2';
  const basePrefix = str(raw, 'BASE_NET_PREFIX') || '192.168';
  const baseSubnet = str(raw, 'DEFAULT_SUBNET') || '/24';

  const lanes = SEGMENTS.map<Lane>((seg) => {
    const v = vlan[seg.row];
    const i = iface[seg.row];
    const vlanId = v?.vid ?? v?.def ?? 0;
    const prefix = str(raw, seg.prefix) || basePrefix;
    return {
      id: seg.id,
      enabled: seg.enable === null || raw[seg.enable] === '1',
      address: `${prefix}.${vlanId}.${host}`,
      subnet: str(raw, seg.subnet) || baseSubnet,
      vlanId,
      vlanReassigned: v ? !v.userSet && vlanId !== v.def : false,
      iface: i?.name ?? '',
      ifaceReassigned: i ? !i.userSet && i.name !== i.def : false,
      reach: reachOf(seg.id, raw, isRouter),
    };
  });

  const lanLane = lanes[0];
  return {
    accessPoint: !isRouter,
    address: lanLane ? lanLane.address : `${basePrefix}.1.${host}`,
    lanes,
  };
}
