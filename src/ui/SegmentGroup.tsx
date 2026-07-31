// The field group that carries a segment's identity colour.
//
// This is what makes the Guest fields visibly the same thing as the Guest lane in
// the plan panel: a 3px left edge and a low-alpha tint in the segment's
// cable-pair colour, driven by one CSS variable so the group and the lane read
// from the same token. Colour is never the only signal -- the group is titled.

import type { ReactNode } from 'react';
import type { SegmentId } from '@core/types';

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
