// The networks you have, and the invitation to make the first one.
//
// A saved network is a whole house's worth of decisions, so the card leads with
// what those decisions were -- release, LAN subnet, DNS engine, tunnel -- rather
// than with a name and a date. Someone coming back after a month should recognise
// which network is which without opening one.

import { useState } from 'react';
import type { Network } from '@core/types';
import { useNetworksStore } from '@state/networksStore';
import { ConfirmDialog } from '@ui/ConfirmDialog';
import { t } from '@i18n/index';

export function NetworkList({ onOpen }: { onOpen: (id: string) => void }) {
  const networks = useNetworksStore((s) => s.networks);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Network | null>(null);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const net = useNetworksStore.getState().create(trimmed);
    setNaming(false);
    setName('');
    onOpen(net.id);
  };

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('networks')}</h1>
      <p className="field-help mt-1">{t('eachNetworkHolds')}</p>

      {networks.length === 0 && !naming ? (
        <div className="card mt-5 p-6 text-center">
          <p className="text-ink-soft">{t('noNetworksYet')}</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setNaming(true)}>
            {t('newNetwork')}
          </button>
        </div>
      ) : null}

      <ul className="mt-5 space-y-3">
        {networks.map((net) => (
          <li key={net.id}>
            <div className="card flex items-center gap-3 p-4">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpen(net.id)}
              >
                <p className="font-display truncate text-lg font-semibold">{net.name}</p>
                <p className="field-help mono mt-0.5 truncate">{summarize(net)}</p>
                <p className="field-help mt-1">{counts(net)}</p>
              </button>
              <button
                type="button"
                className="btn btn-quiet flex-none"
                onClick={() => onOpen(net.id)}
              >
                {t('config')}
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-none"
                aria-label={t('delete') + ' ' + net.name}
                onClick={() => setPendingDelete(net)}
              >
                &times;
              </button>
            </div>
          </li>
        ))}
      </ul>

      {networks.length || naming ? (
        <div className="mt-4">
          {naming ? (
            <div className="card flex flex-wrap items-end gap-2 p-4">
              <label className="min-w-0 flex-1">
                <span className="field-label">{t('networkName')}</span>
                <input
                  className="input mt-1 w-full"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') create();
                    if (e.key === 'Escape') setNaming(false);
                  }}
                />
              </label>
              <button type="button" className="btn btn-primary" onClick={create}>
                {t('save')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setNaming(false)}>
                {t('cancel')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setNaming(true)}>
              {t('newNetwork')}
            </button>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('deleteNetworkTitle')}
        body={pendingDelete?.name ?? ''}
        onConfirm={() => {
          if (pendingDelete) useNetworksStore.getState().remove(pendingDelete.id);
        }}
      />
    </div>
  );
}

const DNS_LABEL: Record<string, string> = {
  adguardhome: 'AdGuard Home',
  dnsproxy: 'dnsproxy',
  'https-dns-proxy': 'https-dns-proxy',
  'adblock-fast': 'adblock-fast',
};

/** The decisions worth recognising a network by. */
function summarize(net: Network): string {
  const c = net.shared_config;
  const parts: string[] = [];
  if (c.shared_version) parts.push('OpenWrt ' + c.shared_version);
  const prefix = c.LAN_BASE_PREFIX || c.BASE_NET_PREFIX;
  if (prefix) parts.push(`${prefix}.${c.LAN_VLAN_ID || '1'}.0${c.LAN_SUBNET || c.DEFAULT_SUBNET || '/24'}`);
  const dns = DNS_LABEL[String(c.DNS_MODE ?? '')];
  if (dns) parts.push(dns);
  if (c.WG_ENABLE === '1') parts.push(t('wireGuardVpn'));
  return parts.join(' · ') || t('notYetConfigured');
}

function counts(net: Network): string {
  const total = net.nodes.length;
  const built = net.nodes.filter((n) => n.last_build).length;
  return [
    t(total === 1 ? 'nodeCount' : 'nodesCount', { n: total }),
    built ? t('builtCount', { n: built }) : null,
    total - built ? t('pendingCount', { n: total - built }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
