// DNS resolution, ad blocking, and what the firewall drops.
//
// The engine choice is the load-bearing decision in this section: it sets the
// package footprint, and it is the thing the storage auto-retry walks down when a
// device turns out to be too small (FR-030).

import { useEffect, useMemo, useState } from 'react';
import { DOH_PROVIDERS, isAdguard, isDohEngine } from '@core/dns';
import { useConfigStore, useField } from '@state/configStore';
import { loadCountries, loadFeeds, type Country, type Feed } from '@state/staticData';
import { t } from '@i18n/index';
import {
  BoundChips,
  BoundRadio,
  BoundText,
  BoundToggle,
  Disclosure,
  Note,
  SectionPage,
} from './bound';

export function Filtering() {
  const dnsMode = useField('DNS_MODE');
  const apMode = useField('AP_MODE');
  const markDnsTouched = useConfigStore((s) => s.markDnsTouched);
  const doh = isDohEngine(dnsMode);

  return (
    <SectionPage title="encryptedDns">
      <BoundRadio
        k="DNS_MODE"
        label="dnsEngine"
        stacked
        onPick={markDnsTouched}
        options={[
          { value: 'adguardhome', label: t('adguardHome'), help: t('adguardHomeHelp') },
          { value: 'dnsproxy', label: t('dnsproxy'), help: t('dnsproxyHelp') },
          {
            value: 'https-dns-proxy',
            label: t('dnsHttpsDnsProxy'),
            help: t('httpsDnsProxyHelp'),
          },
          { value: 'adblock-fast', label: t('dnsAdblockFast'), help: t('adblockFastHelp') },
          { value: 'none', label: t('dnsNone'), help: t('dnsNoneHelp') },
        ]}
      />

      {isAdguard(dnsMode) ? (
        <>
          <Note id="adguardRamNote" rich />
          <BoundToggle k="ADGUARD_MAIN_DNS" label="adguardMainDns" help="adguardMainDnsHelp" />
        </>
      ) : null}

      {doh ? <DohUpstreams /> : null}

      <div className="mt-4 border-t border-rule pt-3">
        <BoundToggle k="FORCE_DNS" label="forceDns" help="forceDnsHelp" />
        <BoundToggle k="BLOCK_DOT_DOQ" label="blockDotDoq" help="blockDotDoqHelp" />
        <BoundToggle k="BLOCK_DOH" label="blockDoh" help="blockDohHelp" />
      </div>

      {apMode === '1' ? null : <BanipGroups />}

      <Disclosure title="advancedDns">
        <DnsmasqMode />
      </Disclosure>
    </SectionPage>
  );
}

/**
 * The upstream resolver list, plus a preset picker that appends one provider's URL
 * at a time. The bootstrap addresses for a chosen provider are DERIVED from this
 * list rather than appended to the bootstrap field, so removing a provider removes
 * its plain-text addresses with it -- the script feeds BOOTSTRAP_DNS to fallback_dns
 * too, and a stale entry would leave a resolver the user thought they removed
 * reachable unencrypted.
 */
function DohUpstreams() {
  const upstreams = useField('DOH_UPSTREAMS');
  const set = useConfigStore((s) => s.set);

  return (
    <>
      <label className="field-label mt-3 block" htmlFor="doh-preset">
        {t('dohPresetPh')}
      </label>
      <select
        id="doh-preset"
        className="input input-mono mt-1"
        value=""
        onChange={(e) => {
          const url = e.target.value;
          if (!url) return;
          const lines = upstreams.split('\n').map((l) => l.trim()).filter(Boolean);
          if (!lines.includes(url)) set('DOH_UPSTREAMS', [...lines, url].join('\n'));
        }}
      >
        <option value="">{t('dohPresetPh')}</option>
        {DOH_PROVIDERS.map((p) => (
          <option key={p.url} value={p.url}>
            {p.name}
          </option>
        ))}
      </select>

      <BoundText
        k="DOH_UPSTREAMS"
        label="dohUpstreams"
        help="dohUpstreamsHelp"
        placeholderId="dohUpstreamsPh"
        multiline
        rows={3}
        mono
        unvalidated
      />
      <BoundText
        k="BOOTSTRAP_DNS"
        label="bootstrapDns"
        help="bootstrapDnsHelp"
        placeholderId="bootstrapDnsPh"
        multiline
        rows={2}
        mono
        unvalidated
      />
    </>
  );
}

/**
 * The form asks the positive question ("one dnsmasq per network?", default no) and
 * the derivation inverts it into DNSMASQ_SINGLE_INSTANCE, so the emitted key
 * matches the script's own sense.
 */
function DnsmasqMode() {
  const multi = useField('DNSMASQ_MULTI_INSTANCE');
  return (
    <>
      <BoundToggle k="DNSMASQ_MULTI_INSTANCE" label="dnsmasqMulti" help="dnsmasqMultiHelp" />
      {multi === '1' ? <Note id="dnsmasqMultiNote" rich /> : null}
    </>
  );
}

function BanipGroups() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);

  useEffect(() => {
    let live = true;
    void Promise.all([loadCountries(), loadFeeds()]).then(([c, f]) => {
      if (!live) return;
      setCountries(c);
      setFeeds(f);
    });
    return () => {
      live = false;
    };
  }, []);

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.code, label: `${c.name} (${c.code.toUpperCase()})` })),
    [countries],
  );
  // The `country` feed is added automatically when any country is selected, and
  // `doh` comes from BLOCK_DOH, so neither is offered here.
  const feedOptions = useMemo(
    () =>
      feeds
        .filter((f) => f.name !== 'country' && f.name !== 'doh')
        .map((f) => ({ value: f.name, label: f.descr ? `${f.name} - ${f.descr}` : f.name })),
    [feeds],
  );

  return (
    <div className="mt-4 border-t border-rule pt-3">
      <h3 className="field-label">{t('firewall')}</h3>
      <BoundChips
        k="BANIP_COUNTRY_LIST"
        label="countryBlockingSection"
        help="banipCountryHelp"
        options={countryOptions}
        placeholderId="banipAddCountryPh"
      />
      <BoundChips
        k="BANIP_FEEDS"
        label="threatFeedsSection"
        help="banipFeedsHelp"
        options={feedOptions}
        placeholderId="banipAddFeedPh"
      />
      <Note id="banipMemoryNote" />
    </div>
  );
}
