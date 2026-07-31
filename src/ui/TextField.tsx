// Text, secret and multi-line entry.
//
// Validity is reported on blur and released on the next keystroke (US6): a
// message that appears mid-word is noise, and one that stays after the value is
// corrected is a lie.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Field, describedBy } from './Field';
import { registerField } from './fieldRegistry';
import { t } from '@i18n/index';

export interface TextFieldProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  /** Evaluated against the whole config, so sibling-dependent rules work. */
  validate?: (v: string) => string | null;
  placeholder?: string;
  /** Machine values are set in mono: addresses, ids, keys, package names. */
  mono?: boolean;
  secret?: boolean;
  multiline?: boolean;
  rows?: number;
  inline?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'url' | 'email';
}

export function TextField(props: TextFieldProps) {
  const {
    id,
    label,
    help,
    value,
    onChange,
    validate,
    placeholder,
    mono,
    secret,
    multiline,
    rows,
    inline,
    disabled,
    autoComplete,
    inputMode,
  } = props;

  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [touched, setTouched] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    registerField(id, ref.current);
    return () => registerField(id, null);
  }, [id]);

  // A field the sweep has just pointed at should explain itself immediately,
  // even though the user has not blurred it yet.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSweep = () => setTouched(true);
    el.addEventListener('wrtnova:report', onSweep);
    return () => el.removeEventListener('wrtnova:report', onSweep);
  }, []);

  const issue = validate ? validate(value) : null;
  const error = touched ? issue : null;
  const chrome = { id, label, ...(help === undefined ? {} : { help }), error };
  const described = describedBy(chrome);

  const common = {
    id,
    value,
    placeholder: placeholder ?? '',
    disabled: disabled ?? false,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': described,
    className: 'input' + (mono ? ' input-mono' : ''),
    onChange: (e: { target: { value: string } }) => {
      if (touched) setTouched(false);
      onChange(e.target.value);
    },
    onBlur: () => setTouched(true),
  };

  return (
    <Field {...chrome} inline={inline ?? false}>
      {multiline ? (
        <textarea
          {...common}
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          rows={rows ?? 3}
        />
      ) : secret ? (
        <div className="relative">
          <input
            {...common}
            ref={ref as React.RefObject<HTMLInputElement>}
            type={revealed ? 'text' : 'password'}
            autoComplete={autoComplete ?? 'new-password'}
            className={common.className + ' pr-9'}
          />
          <button
            type="button"
            className="btn btn-ghost absolute top-1/2 right-1 -translate-y-1/2 px-1.5 py-1"
            aria-label={t(revealed ? 'hidePassword' : 'showPassword')}
            onClick={() => setRevealed((r) => !r)}
          >
            <EyeIcon off={revealed} />
          </button>
        </div>
      ) : (
        <input
          {...common}
          ref={ref as React.RefObject<HTMLInputElement>}
          type="text"
          {...(autoComplete === undefined ? {} : { autoComplete })}
          {...(inputMode === undefined ? {} : { inputMode })}
        />
      )}
    </Field>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M1 1l22 22" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
