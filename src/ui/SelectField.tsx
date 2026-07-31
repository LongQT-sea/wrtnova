// A short, closed list of values.
//
// Native <select> on purpose. The three hard pickers in this product (device,
// timezone, chip lists) are built on Radix because they need search and
// multi-select behaviour that has to be hand-wired either way; a subnet mask or a
// Wi-Fi channel is a plain list, where the platform control already has correct
// keyboard handling and a far better phone experience than anything rebuilt.

import { useEffect, useRef, type ReactNode } from 'react';
import { Field, describedBy } from './Field';
import { registerField } from './fieldRegistry';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  value: string;
  options: readonly SelectOption[];
  onChange: (v: string) => void;
  inline?: boolean;
  disabled?: boolean;
  mono?: boolean;
}

export function SelectField({
  id,
  label,
  help,
  value,
  options,
  onChange,
  inline,
  disabled,
  mono,
}: SelectFieldProps) {
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    registerField(id, ref.current);
    return () => registerField(id, null);
  }, [id]);

  const chrome = { id, label, ...(help === undefined ? {} : { help }), error: null };

  return (
    <Field {...chrome} inline={inline ?? false}>
      <select
        ref={ref}
        id={id}
        className={'input' + (mono ? ' input-mono' : '')}
        value={value}
        disabled={disabled ?? false}
        aria-describedby={describedBy(chrome)}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
