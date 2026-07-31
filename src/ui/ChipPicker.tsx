// Multi-select over a long list, shown as removable chips: banIP country blocking
// and threat feeds.
//
// The value is the space-separated string the config key actually holds, so this
// component is the only place that knows the list is stored that way and the
// section above it never assembles one by hand.

import * as Popover from '@radix-ui/react-popover';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field, describedBy } from './Field';
import { registerField } from './fieldRegistry';
import { t } from '@i18n/index';

const RENDER_CAP = 120;

export interface ChipOption {
  /** What goes into the config value. */
  value: string;
  /** What the user reads and searches. */
  label: string;
}

export interface ChipPickerProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  /** Space-separated, exactly as the config key stores it. */
  value: string;
  onChange: (v: string) => void;
  options: readonly ChipOption[];
  placeholder?: string;
  disabled?: boolean;
}

const split = (v: string): string[] => v.trim().split(/\s+/).filter(Boolean);

export function ChipPicker({
  id,
  label,
  help,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: ChipPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerField(id, triggerRef.current);
    return () => registerField(id, null);
  }, [id]);

  const selected = useMemo(() => split(value), [value]);
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return m;
  }, [options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(selected);
    return options.filter(
      (o) =>
        !chosen.has(o.value) &&
        (!q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)),
    );
  }, [options, query, selected]);
  const shown = matches.slice(0, RENDER_CAP);

  useEffect(() => setActive(0), [query]);

  const add = (v: string) => {
    if (selected.includes(v)) return;
    onChange([...selected, v].join(' '));
    setQuery('');
    inputRef.current?.focus();
  };

  const remove = (v: string) => onChange(selected.filter((s) => s !== v).join(' '));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      const item = shown[active];
      if (item) {
        e.preventDefault();
        add(item.value);
      }
    } else if (e.key === 'Backspace' && query === '') {
      const last = selected[selected.length - 1];
      if (last) remove(last);
    }
  };

  const chrome = { id, label, ...(help === undefined ? {} : { help }), error: null };

  return (
    <Field {...chrome}>
      <div className="space-y-1.5">
        {selected.length ? (
          <ul className="flex flex-wrap gap-1" aria-label={typeof label === 'string' ? label : id}>
            {selected.map((v) => (
              <li key={v}>
                <span className="chip">
                  <span className="truncate">{labelOf.get(v) ?? v}</span>
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={t('delete') + ' ' + (labelOf.get(v) ?? v)}
                    onClick={() => remove(v)}
                    disabled={disabled ?? false}
                  >
                    &times;
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              ref={triggerRef}
              id={id}
              type="button"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-describedby={describedBy(chrome)}
              disabled={disabled ?? false}
              className="input text-left text-ink-soft"
            >
              {placeholder ?? ''}
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="popover w-[var(--radix-popover-trigger-width)] min-w-64 p-1.5"
              sideOffset={4}
              align="start"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                inputRef.current?.focus();
              }}
            >
              <input
                ref={inputRef}
                className="input mb-1.5"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder ?? ''}
                role="searchbox"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={shown.length ? listId + '-' + active : undefined}
              />
              <div id={listId} role="listbox" className="max-h-64 overflow-y-auto">
                {shown.length === 0 ? (
                  <p className="field-help px-1.5 py-2">{t('noMatches')}</p>
                ) : (
                  shown.map((o, i) => (
                    <div
                      key={o.value}
                      id={listId + '-' + i}
                      role="option"
                      aria-selected={false}
                      data-active={i === active}
                      className="option"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => add(o.value)}
                    >
                      {o.label}
                    </div>
                  ))
                )}
              </div>
              {matches.length > shown.length ? (
                <p className="field-help border-t border-rule px-1.5 pt-1.5">{t('narrowSearch')}</p>
              ) : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </Field>
  );
}
