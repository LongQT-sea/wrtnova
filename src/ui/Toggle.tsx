// A boolean control over the `Flag` type.
//
// CONSTITUTION IV: off is '' and never '0'. `Flag` has no '0' member, so this
// component cannot produce one -- the guarantee is the type's, not this file's.

import * as Checkbox from '@radix-ui/react-checkbox';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Flag } from '@core/types';
import { registerField } from './fieldRegistry';
import { helpId } from './Field';

export interface ToggleProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  value: Flag;
  onChange: (v: Flag) => void;
  disabled?: boolean;
}

export function Toggle({ id, label, help, value, onChange, disabled }: ToggleProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerField(id, ref.current);
    return () => registerField(id, null);
  }, [id]);

  const checked = value === '1';

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Checkbox.Root
        ref={ref}
        id={id}
        checked={checked}
        disabled={disabled ?? false}
        onCheckedChange={(next) => onChange(next === true ? '1' : '')}
        aria-describedby={help ? helpId(id) : undefined}
        className="toggle-track mt-0.5 disabled:opacity-50"
        data-state={checked ? 'checked' : 'unchecked'}
      >
        <span className="toggle-thumb" data-state={checked ? 'checked' : 'unchecked'} />
      </Checkbox.Root>
      <div className="min-w-0">
        <label
          className="field-label cursor-pointer select-none"
          htmlFor={id}
          data-disabled={disabled ? 'true' : undefined}
        >
          {label}
        </label>
        {help ? (
          <p className="field-help mt-0.5" id={helpId(id)}>
            {help}
          </p>
        ) : null}
      </div>
    </div>
  );
}
