// The "host | octet | ports" row editor behind PORT_FORWARD_LIST and
// IPV6_SERVER_LIST.
//
// The value is the tab-indented block the config key actually holds, parsed and
// re-serialized by core/list-grammar.ts. This component never builds that string
// itself, so the table and the emitted config cannot drift apart.

import { useEffect, useRef, type ReactNode } from 'react';
import { parseList, serializeList, type ListRow } from '@core/list-grammar';
import { registerField } from './fieldRegistry';
import { helpId } from './Field';
import { t } from '@i18n/index';

export interface RowTableProps {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  value: string;
  onChange: (v: string) => void;
  /** v4 clamps the octet to 1-254; v6 keeps the hex host id verbatim. */
  kind: 'v4' | 'v6';
  octetLabel: string;
  portsLabel: string;
}

export function RowTable({
  id,
  label,
  help,
  error,
  value,
  onChange,
  kind,
  octetLabel,
  portsLabel,
}: RowTableProps) {
  const ref = useRef<HTMLTableElement>(null);

  useEffect(() => {
    registerField(id, ref.current);
    return () => registerField(id, null);
  }, [id]);

  const rows = parseList(value);
  // One trailing blank row to type into, which serializeList drops if untouched.
  const shown: ListRow[] = [...rows, { host: '', octet: '', ports: '' }];

  const write = (next: ListRow[]) => onChange(serializeList(next, kind));

  const edit = (i: number, field: keyof ListRow, v: string) => {
    const next = shown.map((r, j) => (i === j ? { ...r, [field]: v } : r));
    write(next);
  };

  return (
    <div className="py-1.5">
      <span className="field-label">{label}</span>
      {help ? (
        <p className="field-help mt-0.5" id={helpId(id)}>
          {help}
        </p>
      ) : null}

      <div className="mt-1.5 overflow-x-auto">
        <table ref={ref} className="w-full min-w-[26rem] border-collapse text-sm" id={id}>
          <thead>
            <tr className="text-left">
              <th className="field-help pb-1 font-normal">{t('tableHostname')}</th>
              <th className="field-help w-24 pb-1 font-normal">{octetLabel}</th>
              <th className="field-help pb-1 font-normal">{portsLabel}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                <td className="pr-1.5 pb-1">
                  <input
                    className="input input-mono"
                    value={row.host}
                    aria-label={t('tableHostname')}
                    onChange={(e) => edit(i, 'host', e.target.value)}
                  />
                </td>
                <td className="pr-1.5 pb-1">
                  <input
                    className="input input-mono"
                    value={row.octet}
                    aria-label={octetLabel}
                    onChange={(e) => edit(i, 'octet', e.target.value)}
                  />
                </td>
                <td className="pr-1.5 pb-1">
                  <input
                    className="input input-mono"
                    value={row.ports}
                    aria-label={portsLabel}
                    onChange={(e) => edit(i, 'ports', e.target.value)}
                  />
                </td>
                <td className="pb-1">
                  {i < rows.length ? (
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5"
                      aria-label={t('delete')}
                      onClick={() => write(shown.filter((_, j) => j !== i))}
                    >
                      &times;
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="field-error mt-1" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
