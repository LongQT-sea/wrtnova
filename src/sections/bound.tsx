// Store-bound wrappers around the design-system primitives.
//
// The sections below hold roughly 110 controls, so each one is written as a
// declaration -- key, label id, help id -- and the wiring (subscribe to that key,
// write that key, validate that key, localize those two message ids) happens once
// here. A control that spelled its own wiring out 110 times is 110 chances to bind
// the wrong key.

import type { ReactNode } from 'react';
import type { Flag, RawConfig } from '@core/types';
import { useFieldState } from '@state/configStore';
import { validatorFor } from '@state/validation';
import { t, type MessageId } from '@i18n/index';
import { Rich } from '@ui/Rich';
import { TextField } from '@ui/TextField';
import { Toggle } from '@ui/Toggle';
import { SelectField, type SelectOption } from '@ui/SelectField';
import { RadioRow, type RadioOption } from '@ui/RadioRow';
import { ChipPicker, type ChipOption } from '@ui/ChipPicker';

/** Keys holding free text. Flag-typed keys are excluded by the `string extends` test. */
export type TextKey = {
  [K in keyof RawConfig]: string extends RawConfig[K] ? K : never;
}[keyof RawConfig];

/** Keys holding a boolean flag. */
export type FlagKey = {
  [K in keyof RawConfig]: RawConfig[K] extends Flag ? K : never;
}[keyof RawConfig];

interface Chrome {
  label: MessageId;
  help?: MessageId;
  /** The help string carries inline markup (<code>, <strong>). */
  richHelp?: boolean;
  richLabel?: boolean;
}

function labelOf(p: Chrome): ReactNode {
  return p.richLabel ? <Rich id={p.label} /> : t(p.label);
}

function helpOf(p: Chrome): ReactNode | undefined {
  if (!p.help) return undefined;
  return p.richHelp ? <Rich id={p.help} /> : t(p.help);
}

export interface BoundTextProps extends Chrome {
  k: TextKey;
  placeholder?: string;
  placeholderId?: MessageId;
  mono?: boolean;
  secret?: boolean;
  multiline?: boolean;
  rows?: number;
  inline?: boolean;
  disabled?: boolean;
  /** Skip validation, for fields core/validate.ts has no rule for. */
  unvalidated?: boolean;
}

export function BoundText(p: BoundTextProps) {
  const [value, set] = useFieldState(p.k);
  const help = helpOf(p);
  const placeholder = p.placeholderId ? t(p.placeholderId) : p.placeholder;
  return (
    <TextField
      id={p.k}
      label={labelOf(p)}
      {...(help === undefined ? {} : { help })}
      value={value}
      onChange={set}
      {...(p.unvalidated ? {} : { validate: validatorFor(p.k) })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(p.mono === undefined ? {} : { mono: p.mono })}
      {...(p.secret === undefined ? {} : { secret: p.secret })}
      {...(p.multiline === undefined ? {} : { multiline: p.multiline })}
      {...(p.rows === undefined ? {} : { rows: p.rows })}
      {...(p.inline === undefined ? {} : { inline: p.inline })}
      {...(p.disabled === undefined ? {} : { disabled: p.disabled })}
    />
  );
}

export interface BoundToggleProps extends Chrome {
  k: FlagKey;
  disabled?: boolean;
}

export function BoundToggle(p: BoundToggleProps) {
  const [value, set] = useFieldState(p.k);
  const help = helpOf(p);
  return (
    <Toggle
      id={p.k}
      label={labelOf(p)}
      {...(help === undefined ? {} : { help })}
      value={value}
      onChange={set}
      {...(p.disabled === undefined ? {} : { disabled: p.disabled })}
    />
  );
}

export interface BoundSelectProps extends Chrome {
  k: TextKey;
  options: readonly SelectOption[];
  inline?: boolean;
  mono?: boolean;
  disabled?: boolean;
}

export function BoundSelect(p: BoundSelectProps) {
  const [value, set] = useFieldState(p.k);
  const help = helpOf(p);
  return (
    <SelectField
      id={p.k}
      label={labelOf(p)}
      {...(help === undefined ? {} : { help })}
      value={value}
      options={p.options}
      onChange={set}
      {...(p.inline === undefined ? {} : { inline: p.inline })}
      {...(p.mono === undefined ? {} : { mono: p.mono })}
      {...(p.disabled === undefined ? {} : { disabled: p.disabled })}
    />
  );
}

export interface BoundRadioProps<K extends keyof RawConfig> extends Chrome {
  k: K;
  options: readonly RadioOption[];
  stacked?: boolean;
  onPick?: (v: string) => void;
}

/**
 * Radios cover the keys with a closed union type (wan_type, DNS_MODE), so the
 * value is cast on the way in. The option list is what constrains it, and it is
 * declared next to the key at every call site.
 */
export function BoundRadio<K extends keyof RawConfig>(p: BoundRadioProps<K>) {
  const [value, set] = useFieldState(p.k);
  const help = helpOf(p);
  return (
    <RadioRow
      id={String(p.k)}
      label={labelOf(p)}
      {...(help === undefined ? {} : { help })}
      value={String(value)}
      options={p.options}
      onChange={(v) => {
        set(v as RawConfig[K]);
        p.onPick?.(v);
      }}
      {...(p.stacked === undefined ? {} : { stacked: p.stacked })}
    />
  );
}

export interface BoundChipsProps extends Chrome {
  k: TextKey;
  options: readonly ChipOption[];
  placeholderId: MessageId;
}

export function BoundChips(p: BoundChipsProps) {
  const [value, set] = useFieldState(p.k);
  const help = helpOf(p);
  return (
    <ChipPicker
      id={p.k}
      label={labelOf(p)}
      {...(help === undefined ? {} : { help })}
      value={value}
      onChange={set}
      options={p.options}
      placeholder={t(p.placeholderId)}
    />
  );
}

/** A titled section page, so every section has the same heading treatment. */
export function SectionPage({
  title,
  help,
  children,
}: {
  title: MessageId;
  help?: MessageId;
  children: ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-xl">{t(title)}</h2>
      {help ? <p className="field-help mt-1">{t(help)}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The "advanced options" disclosure every section closes with. */
export function Disclosure({ title, children }: { title: MessageId; children: ReactNode }) {
  return (
    <details className="mt-4 border-t border-rule pt-3">
      <summary className="disclosure-summary">
        <svg
          className="chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {t(title)}
      </summary>
      <div className="mt-1.5 border-l-2 border-rule pl-3">{children}</div>
    </details>
  );
}

/** An informational note, localized, optionally carrying inline markup. */
export function Note({
  id,
  rich,
  danger,
  vars,
}: {
  id: MessageId;
  rich?: boolean;
  danger?: boolean;
  vars?: Record<string, string | number>;
}) {
  return (
    <p className={'note mt-2' + (danger ? ' note-danger' : '')} role="note">
      {rich ? <Rich id={id} {...(vars === undefined ? {} : { vars })} /> : t(id, vars)}
    </p>
  );
}
