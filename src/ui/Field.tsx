// The labelled, described, error-bearing wrapper every control sits in.
//
// One place decides how a label, its help text and its error message relate, and
// one place wires aria-describedby, so no individual control can get that
// relationship subtly wrong 110 times over.

import type { ReactNode } from 'react';

export interface FieldChrome {
  /** Also the config key, which is what the validation sweep looks up. */
  id: string;
  label: ReactNode;
  help?: ReactNode;
  /** A localized message, or null when the field is currently acceptable. */
  error?: string | null;
}

export interface FieldProps extends FieldChrome {
  children: ReactNode;
  /** Put the control beside the label instead of under it. */
  inline?: boolean;
}

export const helpId = (id: string): string => id + '-help';
export const errorId = (id: string): string => id + '-error';

/**
 * The ids to hand a control so screen readers announce its help text and its
 * error. Returns undefined rather than an empty string, because an empty
 * aria-describedby is announced as a described element with nothing to say.
 */
export function describedBy(props: FieldChrome): string | undefined {
  const ids: string[] = [];
  if (props.help) ids.push(helpId(props.id));
  if (props.error) ids.push(errorId(props.id));
  return ids.length ? ids.join(' ') : undefined;
}

export function Field({ id, label, help, error, children, inline }: FieldProps) {
  return (
    <div
      className={
        inline
          ? 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5'
          : 'py-1.5'
      }
    >
      <div className={inline ? 'min-w-0 flex-1' : 'mb-1'}>
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {help ? (
          <p className="field-help mt-0.5" id={helpId(id)}>
            {help}
          </p>
        ) : null}
      </div>
      <div className={inline ? 'w-full sm:w-56 sm:flex-none' : undefined}>{children}</div>
      {error ? (
        <p className="field-error mt-1 w-full" id={errorId(id)} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A row of fields that share a line on wide screens. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{children}</div>;
}

/** A titled block of related fields, with no segment identity of its own. */
export function FieldSet({
  title,
  help,
  children,
}: {
  title: ReactNode;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="mt-4 border-0 p-0">
      <legend className="field-label mb-1 p-0">{title}</legend>
      {help ? <p className="field-help mb-1.5">{help}</p> : null}
      {children}
    </fieldset>
  );
}
