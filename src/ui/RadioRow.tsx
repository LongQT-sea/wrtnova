// A small set of mutually exclusive choices, shown as a segmented row.
//
// Radix RadioGroup rather than a native fieldset of inputs, for the roving
// tabstop: arrow keys move between options and Tab leaves the group, which is
// what a segmented control should do and is not what a pile of radios does.

import * as RadioGroup from '@radix-ui/react-radio-group';
import { useEffect, useRef, type ReactNode } from 'react';
import { helpId } from './Field';
import { registerField } from './fieldRegistry';

export interface RadioOption {
  value: string;
  label: string;
  help?: string;
}

export interface RadioRowProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  value: string;
  options: readonly RadioOption[];
  onChange: (v: string) => void;
  /** Stack the options and show each one's help text, for weightier choices. */
  stacked?: boolean;
  disabled?: boolean;
}

export function RadioRow({
  id,
  label,
  help,
  value,
  options,
  onChange,
  stacked,
  disabled,
}: RadioRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerField(id, ref.current);
    return () => registerField(id, null);
  }, [id]);

  return (
    <div className="py-1.5">
      <span className="field-label" id={id + '-label'}>
        {label}
      </span>
      {help ? (
        <p className="field-help mt-0.5" id={helpId(id)}>
          {help}
        </p>
      ) : null}
      <RadioGroup.Root
        ref={ref}
        id={id}
        value={value}
        disabled={disabled ?? false}
        onValueChange={onChange}
        aria-labelledby={id + '-label'}
        aria-describedby={help ? helpId(id) : undefined}
        className={
          stacked
            ? 'mt-1.5 flex flex-col gap-1.5'
            : 'mt-1.5 inline-flex flex-wrap gap-1 rounded-[var(--radius-field)] border border-rule p-0.5'
        }
      >
        {options.map((o) =>
          stacked ? (
            <label
              key={o.value}
              className="card flex cursor-pointer items-start gap-2.5 p-2.5 data-[on=true]:border-seg-lan"
              data-on={o.value === value}
            >
              <RadioGroup.Item
                value={o.value}
                className="mt-0.5 size-4 flex-none rounded-full border border-rule bg-surface data-[state=checked]:border-seg-lan data-[state=checked]:bg-seg-lan"
              >
                <RadioGroup.Indicator className="block size-full rounded-full border-[3px] border-surface" />
              </RadioGroup.Item>
              <span className="min-w-0">
                <span className="field-label cursor-pointer">{o.label}</span>
                {o.help ? <span className="field-help mt-0.5 block">{o.help}</span> : null}
              </span>
            </label>
          ) : (
            <RadioGroup.Item
              key={o.value}
              value={o.value}
              className="cursor-pointer rounded-[calc(var(--radius-field)-2px)] px-2.5 py-1 text-sm font-medium text-ink-soft data-[state=checked]:bg-seg-lan data-[state=checked]:text-white"
            >
              {o.label}
            </RadioGroup.Item>
          ),
        )}
      </RadioGroup.Root>
    </div>
  );
}
