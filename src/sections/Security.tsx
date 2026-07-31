// The tunnel, and what the router deliberately exposes.
//
// All of it is router-only: an access point terminates no tunnel and forwards no
// ports, so in AP mode the derivation drops every key here.

import { useField, useFieldState } from '@state/configStore';
import { validatorFor } from '@state/validation';
import { RowTable } from '@ui/RowTable';
import { t } from '@i18n/index';
import { BoundText, BoundToggle, Disclosure, Note, SectionPage } from './bound';

export function Security() {
  const apMode = useField('AP_MODE');
  const wg = useField('WG_ENABLE');

  if (apMode === '1') {
    return (
      <SectionPage title="sectionSecurity">
        <Note id="apModeNetworkNote" />
      </SectionPage>
    );
  }

  return (
    <SectionPage title="sectionSecurity">
      <BoundToggle k="WG_ENABLE" label="wgVpnClient" help="wgNetworkDesc" />

      {wg === '1' ? (
        <>
          <Note id="wgConfigNote" rich />

          <h3 className="field-label mt-3">{t('wgInterfaceSection')}</h3>
          <BoundText k="WG_PRIVATE_KEY" label="privateKey" secret mono unvalidated />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <BoundText
              k="WG_IPV4"
              label="clientIpv4"
              placeholder="172.16.0.2/32"
              mono
              unvalidated
            />
            <BoundText k="WG_IPV6" label="clientIpv6" placeholder="fd88::/128" mono unvalidated />
          </div>

          <h3 className="field-label mt-3">{t('wgPeerSection')}</h3>
          <BoundText k="PEER_PUBLIC_KEY" label="peerPublicKey" secret mono unvalidated />
          <BoundText
            k="ENDPOINT"
            label="endpoint"
            placeholder="vpn.example.com:51820"
            mono
            unvalidated
          />
          <BoundText k="PRESHARED_KEY" label="presharedKey" secret mono unvalidated />

          <Disclosure title="advancedWg">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <BoundText k="WG_DNS_V4" label="dnsV4" mono unvalidated />
              <BoundText k="WG_DNS_V6" label="dnsV6" mono unvalidated />
              <BoundText k="WG_MTU" label="wgMtu" placeholder="1420" mono unvalidated />
              <BoundText
                k="ALLOWED_IPS"
                label="allowedIps"
                placeholder="0.0.0.0/0 ::/0"
                mono
                unvalidated
              />
            </div>
            <h4 className="field-label mt-3">{t('wgSplitTunnelSection')}</h4>
            <p className="field-help">{t('splitTunnelHelp')}</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <BoundText k="SPLIT_TUNNEL_V4" label="splitTunnelV4" mono unvalidated />
              <BoundText k="SPLIT_TUNNEL_V6" label="splitTunnelV6" mono unvalidated />
            </div>
          </Disclosure>
        </>
      ) : null}

      <PortForwards />
      <Ipv6Servers />
      <DynamicDns />
    </SectionPage>
  );
}

function PortForwards() {
  const [value, set] = useFieldState('PORT_FORWARD_LIST');
  const error = validatorFor('PORT_FORWARD_LIST')(value);
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <RowTable
        id="PORT_FORWARD_LIST"
        label={t('ipv4PortForwarding')}
        help={t('portFwdNote')}
        error={error}
        value={value}
        onChange={set}
        kind="v4"
        octetLabel={t('tableLastOctet')}
        portsLabel={t('tablePortsSeparated')}
      />
    </div>
  );
}

function Ipv6Servers() {
  const [value, set] = useFieldState('IPV6_SERVER_LIST');
  const error = validatorFor('IPV6_SERVER_LIST')(value);
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <RowTable
        id="IPV6_SERVER_LIST"
        label={t('ipv6Exposure')}
        help={t('ipv6Note')}
        error={error}
        value={value}
        onChange={set}
        kind="v6"
        octetLabel={t('tableLastOctet')}
        portsLabel={t('tablePortsEmptyAll')}
      />
    </div>
  );
}

function DynamicDns() {
  const on = useField('DDNS_ENABLE');
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <BoundToggle k="DDNS_ENABLE" label="enableDdns" />
      {on === '1' ? (
        <>
          <BoundText
            k="LOOKUP_HOSTNAME"
            label="lookupHostname"
            placeholder="ddns.example.com"
            mono
          />
          <BoundText k="CLOUDFLARE_API_KEY" label="cloudflareApiToken" secret unvalidated />
          <Note id="ddnsNote" />
        </>
      ) : null}
    </div>
  );
}
