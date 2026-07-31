// The upstream link: how the router gets online, and what it falls back to.
//
// Everything here is router-only. An access point has no upstream of its own, so
// the derivation drops these keys in AP mode and the section says so rather than
// offering controls that will be discarded.

import { useField } from '@state/configStore';
import { t } from '@i18n/index';
import { BoundText, BoundToggle, Disclosure, Note, SectionPage } from './bound';
import { BoundRadio } from './bound';

export function Internet() {
  const apMode = useField('AP_MODE');
  const wanType = useField('wan_type');
  const tagged = useField('WAN_IS_TAGGED');
  const wanB = useField('WAN_B_ENABLE');

  if (apMode === '1') {
    return (
      <SectionPage title="wan">
        <Note id="apModeHelp" />
        <Disclosure title="advancedWan">
          {/* Bridging the WAN port is a switch-port decision, not an upstream
              identity, so it stays meaningful on an access point. */}
          <BoundToggle k="BRIDGE_WAN_PORT" label="bridgeWanPort" help="bridgeWanPortNote" richHelp />
        </Disclosure>
      </SectionPage>
    );
  }

  return (
    <SectionPage title="wan">
      <BoundRadio
        k="wan_type"
        label="connectionType"
        options={[
          { value: 'dhcp', label: 'DHCP' },
          { value: 'pppoe', label: 'PPPoE' },
        ]}
      />

      {wanType === 'pppoe' ? (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <BoundText k="PPPOE_USERNAME" label="usernameLabel" mono unvalidated />
          <BoundText k="PPPOE_PASSWD" label="wifiPassword" secret unvalidated />
        </div>
      ) : null}

      <BoundText
        k="WAN_MAC_ADDR"
        label="wanMacAddress"
        placeholder="F0:B4:29:2E:33:11"
        mono
        inline
      />

      <BoundToggle k="WAN_IS_TAGGED" label="taggedWanVlan" help="taggedWanVlanNote" />
      {tagged === '1' ? (
        <BoundText k="WAN_VLAN_ID" label="wanVlanId" placeholder="20" mono inline />
      ) : null}

      <BoundToggle k="WAN_B_ENABLE" label="enableSecondaryWan" />
      {wanB === '1' ? (
        <BoundText k="WAN_B_VLAN_ID" label="wanBVlanId" placeholder="21" mono inline />
      ) : null}

      <div className="mt-4 border-t border-rule pt-3">
        <h3 className="field-label">{t('failover')}</h3>
        <BoundToggle k="CELLULAR_MODEM" label="enableMbimFailover" />
        <BoundToggle k="USB_TETHERING" label="enableUsbTethering" help="usbTetheringDevice" />
      </div>

      <Disclosure title="advancedWan">
        <BoundToggle k="BRIDGE_WAN_PORT" label="bridgeWanPort" help="bridgeWanPortNote" richHelp />
      </Disclosure>
    </SectionPage>
  );
}
