// Field validity as the interface sees it.
//
// core/validate.ts returns message ids rather than strings, so it stays free of
// the i18n runtime; this is the thin layer that localizes them and decides what a
// component has to subscribe to in order to stay correct.
//
// Most rules depend only on the field's own value, so a control that re-renders on
// its own value is already correct. The interface-name rules are the exception:
// whether GUEST_IFACE is a duplicate depends on what LAN_IFACE says, so those
// fields subscribe to their resolved conflict -- a scalar -- and a sibling edit
// re-evaluates the group without every keystroke re-rendering it (US6).

import type { ConfigKey, RawConfig, SectionId } from '@core/types';
import { FIELDS } from '@core/schema';
import { pskVlanIssue, validateField, type FieldIssue } from '@core/validate';
import { resolveIfaceAssignment, type IfaceConflict } from '@core/vlan';
import { t, type MessageId } from '@i18n/index';
import { currentScope, emittedFrom, useConfigStore } from './configStore';

/**
 * Localize an issue. The cast is safe by construction: every message id
 * core/validate.ts can return is a key in the English catalogue, and the
 * catalogue is what defines MessageId -- so a renamed message breaks the build at
 * the catalogue, and this is the one place that has to trust that.
 */
export function messageFor(issue: FieldIssue): string {
  return t(issue.messageId as MessageId, issue.vars);
}

/**
 * The validator to hand a TextField, bound to the key it belongs to. Takes a
 * plain string because the UI-only keys are bound to controls too, and
 * core/validate.ts simply has no rule for them.
 *
 * The store is captured here rather than read on blur: this is called while the
 * control renders, so the scope in force is that control's own, and a field on
 * /networks must keep validating against the configuration it edits even when a
 * node's preview is mounted afterwards.
 */
export function validatorFor(key: string): (v: string) => string | null {
  const store = currentScope();
  return (v) => {
    const issue = validateField(key, v, store.getState().raw);
    return issue ? messageFor(issue) : null;
  };
}

/**
 * One interface field's resolved conflict. Subscribing to this is what keeps a
 * duplicate-name message live when the *other* field is the one being edited.
 */
export function useIfaceConflict(row: string): IfaceConflict {
  return useConfigStore((s) => resolveIfaceAssignment(s.raw).byKey[row]?.conflict ?? '');
}

/**
 * The shared-password VLAN scheme's group-level message: under one SSID the
 * password is what selects the network, so the participating networks' passwords
 * must differ (FR-016).
 */
export function usePskVlanError(): string | null {
  return useConfigStore((s) => {
    const issue = pskVlanIssue(s.raw);
    return issue ? messageFor(issue) : null;
  });
}

/**
 * Every issue that applies to what will actually be built.
 *
 * An issue on a field the gating blanks is not a reason to refuse: the value is
 * never emitted, so it cannot break the firmware. Filtering against the emitted
 * config is what makes "refuse on the first visible offender" (FR-015) mean the
 * same thing as "refuse on the first offender that matters".
 */
export function sweep(raw: RawConfig): FieldIssue[] {
  const emitted = emittedFrom(raw) as unknown as Record<string, unknown>;
  const out: FieldIssue[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || value === '') continue;
    if (key in emitted && String(emitted[key] ?? '') === '') continue;
    const issue = validateField(key, value, raw);
    if (issue) out.push(issue);
  }
  const psk = pskVlanIssue(raw);
  if (psk) out.push(psk);
  return out;
}

/**
 * The sections currently holding something that would refuse a build.
 *
 * Memoized on the raw object's identity, so the eight rail items can each ask
 * about themselves without eight sweeps per keystroke, and computed from the same
 * sweep() the build runs -- the dots cannot disagree with the refusal.
 */
const flaggedCache = new WeakMap<RawConfig, ReadonlySet<SectionId>>();

export function flaggedSections(raw: RawConfig): ReadonlySet<SectionId> {
  const hit = flaggedCache.get(raw);
  if (hit) return hit;
  const set = new Set<SectionId>();
  for (const issue of sweep(raw)) {
    const section = sectionOfKey(issue.key);
    if (section) set.add(section);
  }
  flaggedCache.set(raw, set);
  return set;
}

/**
 * Which section a key belongs to, so the sweep can navigate to its offender.
 * Read off the schema, so there is no second field table to keep in step.
 */
export function sectionOfKey(key: string): SectionId | null {
  return FIELDS[key as ConfigKey]?.section ?? null;
}

export type { FieldIssue };
