// A searchable single-select over a large list: the device picker (several
// thousand board titles) and the timezone picker.
//
// Radix has no combobox, so the pattern is assembled here from Popover plus a
// text input and a listbox: Radix contributes the focus trap, the dismiss
// behaviour and the collision-aware positioning, and the roving aria-activedescendant
// is wired below. The rendered list is capped, because a listbox with three
// thousand DOM nodes is slow to build and useless to read -- past the cap the
// user is told to keep typing rather than handed a wall.

import * as Popover from '@radix-ui/react-popover';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field, describedBy } from './Field';
import { registerField } from './fieldRegistry';
import { t } from '@i18n/index';

const RENDER_CAP = 150;

export interface ComboboxProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  /** The currently chosen item, shown when the popover is closed. */
  value: string;
  /** Called with the chosen item, or '' when the selection is cleared. */
  onChange: (v: string) => void;
  /** Every selectable item. Filtering happens here unless `search` is given. */
  items: readonly string[];
  /** Overrides the default word-wise substring filter. */
  search?: (query: string) => readonly string[];
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  mono?: boolean;
}

/** Word-wise, so "archer c7" finds "TP-Link Archer C7 v5"; a substring test does not. */
function defaultSearch(items: readonly string[], query: string): readonly string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((i) => {
    const lc = i.toLowerCase();
    return words.every((w) => lc.includes(w));
  });
}

export function Combobox(props: ComboboxProps) {
  const { id, label, help, value, onChange, items, search, placeholder, emptyLabel } = props;
  const { loading, disabled, mono } = props;

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

  const matches = useMemo(
    () => (search ? search(query) : defaultSearch(items, query)),
    [search, items, query],
  );
  const shown = matches.slice(0, RENDER_CAP);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view while the arrow keys walk past the fold.
  useEffect(() => {
    if (!open) return;
    document.getElementById(listId + '-' + active)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  const commit = (item: string) => {
    onChange(item);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === 'Enter') {
      const item = shown[active];
      if (item !== undefined) {
        e.preventDefault();
        commit(item);
      }
    }
  };

  const chrome = { id, label, ...(help === undefined ? {} : { help }), error: null };

  return (
    <Field {...chrome}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-describedby={describedBy(chrome)}
            disabled={(disabled ?? false) || (loading ?? false)}
            className={
              'input flex items-center justify-between gap-2 text-left' +
              (mono ? ' input-mono' : '')
            }
          >
            <span className={value ? 'truncate' : 'truncate text-ink-soft'}>
              {loading ? t('loading') : value || (placeholder ?? '')}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="flex-none text-ink-soft"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
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
              className={'input mb-1.5' + (mono ? ' input-mono' : '')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder ?? ''}
              role="searchbox"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={shown.length ? listId + '-' + active : undefined}
            />
            <div
              id={listId}
              role="listbox"
              aria-label={typeof label === 'string' ? label : id}
              className="max-h-64 overflow-y-auto"
            >
              {shown.length === 0 ? (
                <p className="field-help px-1.5 py-2">{emptyLabel ?? t('noMatches')}</p>
              ) : (
                shown.map((item, i) => (
                  <div
                    key={item}
                    id={listId + '-' + i}
                    role="option"
                    aria-selected={item === value}
                    data-active={i === active}
                    className={'option' + (mono ? ' mono' : '')}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(item)}
                  >
                    {item}
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
    </Field>
  );
}
