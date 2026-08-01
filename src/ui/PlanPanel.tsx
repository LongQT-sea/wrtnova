// The signature element: a live plan of the network the current settings will
// produce.
//
// This replaces the always-on dump of shell variables as the primary feedback
// surface, because GUEST_VLAN_ID='5' tells a first-time user nothing and
// "Guest - 192.168.5.1 - vlan 5" tells them everything. The raw config is still
// available, one disclosure down (ConfigDisclosure).
//
// A home network is four lanes cut out of one pipe, so that is what this draws:
// the router at the top, then one lane per segment in its cable-pair colour,
// carrying its address, VLAN badge, mask and what it is allowed to reach. Disabled
// lanes stay visible but greyed -- a nervous first-timer needs to see what they are
// not getting as much as what they are.

import type { SegmentId } from '@core/types';
import { planOf, type Lane, type LaneConflict, type Reach } from '@state/plan';
import { useConfigStore } from '@state/configStore';
import { SEGMENT_VAR } from './SegmentGroup';
import { t, type MessageId } from '@i18n/index';

export const SEGMENT_NAME: Record<SegmentId, MessageId> = {
  lan: 'segLan',
  guest: 'segGuest',
  iot: 'segIot',
  vpn: 'segVpn',
};

const REACH_NAME: Record<Reach, MessageId> = {
  internet: 'reachInternet',
  tunnel: 'reachTunnel',
  noInternet: 'reachNoInternet',
  isolated: 'reachIsolated',
};

/** The badge is short; the explanation rides along as its title. */
const CONFLICT_DETAIL: Record<Exclude<LaneConflict, ''>, MessageId> = {
  vlanDuplicate: 'vlanDupWarn',
  vlanTrunked: 'vlanDupWarn',
  vlanExhausted: 'fixVlanConflict',
  ifaceReserved: 'ifaceDupWarn',
  ifaceDuplicate: 'ifaceDupWarn',
  ifaceInvalid: 'fixIfaceConflict',
};

export function PlanPanel() {
  const target = useConfigStore((s) => s.target);
  const plan = useConfigStore((s) => planOf(s.raw));

  return (
    <section className="card p-3" aria-label={t('planTitle')}>
      <h2 className="font-display text-sm font-semibold tracking-wide uppercase">
        {t('planTitle')}
      </h2>

      {target === null ? (
        <p className="field-help mt-2">{t('planEmpty')}</p>
      ) : (
        // Keyed on the board: picking a device replays the one orchestrated
        // moment in the interface, the lanes staggering in over 240 ms.
        <div key={target.profile} className="mt-2">
          <div className="lane-enter rounded-[var(--radius-field)] border border-rule bg-sunken px-2.5 py-2">
            <p className="field-help">{plan.accessPoint ? t('accessPoint') : t('router')}</p>
            <p className="font-display truncate text-base font-semibold">{target.title}</p>
            <p className="field-help mono">
              {plan.address} · {target.version}
            </p>
          </div>

          <ul className="mt-2 space-y-2">
            {plan.lanes.map((lane, i) => (
              <LaneRow key={lane.id} lane={lane} index={i} />
            ))}
          </ul>

          {plan.accessPoint ? <p className="note mt-2">{t('apModeNetworkNote')}</p> : null}
        </div>
      )}
    </section>
  );
}

function LaneRow({ lane, index }: { lane: Lane; index: number }) {
  return (
    <li
      className={'lane-enter' + (lane.enabled ? '' : ' opacity-45')}
      // The stagger is the only motion in the product beyond 120ms state
      // transitions, and prefers-reduced-motion collapses it to nothing.
      style={{
        ['--seg' as string]: SEGMENT_VAR[lane.id],
        animationDelay: 40 * (index + 1) + 'ms',
      }}
    >
      <div className="flex items-baseline gap-2 border-l-[3px] border-[var(--seg)] py-0.5 pl-2">
        {/* Colour is never the only signal: every lane carries its name. */}
        <span className="font-display text-xs font-semibold tracking-wide text-[var(--seg)] uppercase">
          {t(SEGMENT_NAME[lane.id])}
        </span>
        {lane.enabled ? (
          <span className="mono ml-auto text-xs text-ink">
            {lane.address}
            <span className="text-ink-soft">{lane.subnet}</span>
          </span>
        ) : (
          <span className="field-help ml-auto">{t('laneOff')}</span>
        )}
      </div>

      {lane.enabled ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-2.5">
          <Badge moved={lane.vlanReassigned}>vlan {lane.vlanId}</Badge>
          <Badge moved={lane.ifaceReassigned}>{lane.iface}</Badge>
          {lane.reach.map((r) => (
            <span key={r} className="field-help">
              {t(REACH_NAME[r])}
            </span>
          ))}
          {/* A conflict is surfaced on the lane that owns it, so the panel the user
              is watching is where they find out a build will be refused (FR-013). */}
          {lane.conflict ? (
            <span
              className="chip border-danger text-danger"
              title={t(CONFLICT_DETAIL[lane.conflict])}
            >
              {t('laneConflict')}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * A resolved value. Marked only when the allocator had to move it off its natural
 * default, which is the case the user could not have predicted (FR-011, FR-012).
 */
function Badge({ moved, children }: { moved: boolean; children: React.ReactNode }) {
  return (
    <span className="chip" {...(moved ? { title: t('laneAutoTitle') } : {})}>
      {children}
      {moved ? <span className="text-ink-soft">· {t('laneAuto')}</span> : null}
    </span>
  );
}
