// The field group that carries a segment's identity colour.
//
// This is what makes the Guest fields visibly the same thing as the Guest lane in
// the plan panel: a 3px left edge and a low-alpha tint in the segment's
// cable-pair colour, driven by one CSS variable so the group and the lane read
// from the same token. Colour is never the only signal -- the group is titled.

import * as Checkbox from '@radix-ui/react-checkbox';
import type { ReactNode } from 'react';
import type { Flag, SegmentId } from '@core/types';

export const SEGMENT_VAR: Record<SegmentId, string> = {
  lan: 'var(--seg-lan)',
  guest: 'var(--seg-guest)',
  iot: 'var(--seg-iot)',
  vpn: 'var(--seg-vpn)',
};

export interface SegmentGroupProps {
  segment: SegmentId;
  title: ReactNode;
  /** Rendered beside the title: the segment's enable control. */
  control?: ReactNode;
  /** Rendered at the trailing edge: the resolved address and VLAN badge. */
  aside?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
  /** Greyed rather than hidden, so the user can see what they are not getting. */
  muted?: boolean;
}

export function SegmentGroup({
  segment,
  title,
  control,
  aside,
  help,
  children,
  muted,
}: SegmentGroupProps) {
  return (
    <section
      className={'seg-group mt-3' + (muted ? ' opacity-60' : '')}
      style={{ ['--seg' as string]: SEGMENT_VAR[segment] }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {control}
          <h3 className="seg-title">{title}</h3>
        </div>
        {aside}
      </header>
      {help ? <p className="field-help mt-0.5">{help}</p> : null}
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/**
 * The light form, for a lone control that belongs to a segment but does not
 * deserve a whole tinted group -- guest curfew, IoT fast transition. It carries
 * the edge and the name so the control still reads as that segment's (T059).
 */
export function SegmentMark({
  segment,
  children,
}: {
  segment: SegmentId;
  children: ReactNode;
}) {
  return (
    <div
      className="border-l-[3px] border-[var(--seg)] pl-2.5"
      style={{ ['--seg' as string]: SEGMENT_VAR[segment] }}
    >
      {children}
    </div>
  );
}

/**
 * A segment's enable switch, for the group header. The group's own title already
 * names it, so the control carries the name for screen readers only and the header
 * does not say "Guest" twice.
 */
export function SegmentToggle({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: Flag;
  onChange: (v: Flag) => void;
}) {
  const state = value === '1' ? 'checked' : 'unchecked';
  return (
    <Checkbox.Root
      id={id}
      checked={value === '1'}
      onCheckedChange={(next) => onChange(next === true ? '1' : '')}
      aria-label={name}
      className="toggle-track"
      data-state={state}
    >
      <span className="toggle-thumb" data-state={state} />
    </Checkbox.Root>
  );
}
