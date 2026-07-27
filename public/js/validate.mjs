// @ts-check
// Field validation messages, defined once for both pages (SPEC Section 0
// "Shared Logic: One Definition, Two Runtimes"). The predicates live in
// config-form.mjs / list-grammar.mjs; this is the layer above them - which
// fields are checked and what a bad value says in the native bubble. It existed
// twice before and the copies drifted: /networks never grew the range, iface,
// SSID-pipe or IPv6-octet cases.
//
// Every refresher clears the custom message first - a non-empty one pins
// validity to customError and masks the native flags - and sets it again only
// while the value is bad.

import { ui } from './ui-ns.mjs';
import { IFACE_FIELDS, PREFIX_FIELDS, prefixValid, WIFI_TEXT_FIELDS, wifiTextValid, countryValid } from './config-form.mjs';
import { ipv6OctetValid, hostnameValid, ddnsHostnameValid, macValid, portListValid } from './list-grammar.mjs';
import { ifaceValid, resolveIfaceAssignment, IFACE_KEY_BY_FIELD } from './visibility.mjs';

// Numeric fields that get a friendly, localized message instead of the browser
// default ("Value must be <= 255"). Bounds stay declared as min/max on the
// inputs; this only renames the noun.
export const RANGE_NOUN = {
  LAN_VLAN_ID:    'LAN VLAN', GUEST_VLAN_ID: 'Guest VLAN', IOT_VLAN_ID:   'IoT VLAN',
  LAN_VPN_VLAN_ID: 'VLAN', WAN_VLAN_ID:   'VLAN', WAN_B_VLAN_ID: 'VLAN',
};

const IFACE_SET = new Set(IFACE_FIELDS);
const PREFIX_SET = new Set(PREFIX_FIELDS);
const WIFI_TEXT_SET = new Set(WIFI_TEXT_FIELDS);

const apply = (el, ok, key, vars) => {
  el.setCustomValidity('');
  if (ok) return false;
  el.setCustomValidity(ui.t(key, vars));
  return true;
};

export function refreshRangeValidity(el) {
  const noun = RANGE_NOUN[el.id];
  if (!noun) return false;
  el.setCustomValidity('');
  const v = el.validity;
  const bad = v.rangeOverflow || v.rangeUnderflow || v.stepMismatch || v.badInput;
  if (bad) el.setCustomValidity(ui.t('rangeMsg', { label: noun, min: el.min, max: el.max }));
  return bad;
}

/**
 * Charset first, then uniqueness: a name shared with another network or with one
 * wrtnova.sh owns would silently overwrite it. Only typed names are reported -
 * a default that would collide gets renamed by the allocator instead. Reads the
 * page's store (ui.configState) rather than the DOM, so it does not depend on
 * listener order; with no store registered the charset check still runs alone.
 * @param {any} el
 * @returns {boolean} true when the value is bad
 */
export const refreshIfaceValidity = (el) => {
  if (apply(el, ifaceValid(el.value), 'ifaceInvalid', { field: el.value })) return true;
  const key = IFACE_KEY_BY_FIELD[el.id];
  const cfg = key && ui.configState ? ui.configState() : null;
  if (!cfg) return false;
  const bad = resolveIfaceAssignment(cfg).byKey[key].conflict;
  return apply(el, !bad, bad === 'reserved' ? 'ifaceReserved' : 'ifaceDup', { field: el.value });
};
export const refreshPrefixValidity = (el) => apply(el, prefixValid(el.value), 'prefixInvalid', { field: el.value });
export const refreshWifiTextValidity = (el) => apply(el, wifiTextValid(el.value), 'wifiPipeInvalid', { field: el.id });
export const refreshCountryValidity = (el) => apply(el, countryValid(el.value), 'countryInvalid', { field: el.value });
export const refreshOctetV6Validity = (el) => apply(el, ipv6OctetValid(el.value), 'octetV6Invalid');
export const refreshHostnameValidity = (el) => apply(el, hostnameValid(el.value), 'hostnameInvalid', { field: el.value });
export const refreshDdnsValidity = (el) => apply(el, ddnsHostnameValid(el.value), 'ddnsHostnameInvalid', { field: el.value });
export const refreshMacValidity = (el) => apply(el, macValid(el.value), 'macInvalid', { field: el.value });
export const refreshPortsValidity = (el) => apply(el, portListValid(el.value), 'portInvalid', { field: el.value });

/**
 * Dispatch one element to its refresher by id or column role. Anything no rule
 * claims returns false, so a page can hand over every event target and fields it
 * does not have simply never match.
 * @param {any} el
 * @returns {boolean} true when the value is bad
 */
export function refreshValidityFor(el) {
  if (!el || !el.matches) return false;
  if (RANGE_NOUN[el.id]) return refreshRangeValidity(el);
  if (IFACE_SET.has(el.id)) return refreshIfaceValidity(el);
  if (PREFIX_SET.has(el.id)) return refreshPrefixValidity(el);
  if (WIFI_TEXT_SET.has(el.id)) return refreshWifiTextValidity(el);
  if (el.id === 'COUNTRY_CODE') return refreshCountryValidity(el);
  if (el.id === 'LOOKUP_HOSTNAME') return refreshDdnsValidity(el);
  if (el.id === 'WAN_MAC_ADDR') return refreshMacValidity(el);
  if (el.id === 'HOST_NAME' || el.matches('[data-col="host"]')) return refreshHostnameValidity(el);
  if (el.matches('[data-col="ports"]')) return refreshPortsValidity(el);
  if (el.matches('#ipv6-table [data-col="octet"]')) return refreshOctetV6Validity(el);
  return false;
}

/**
 * On blur a bad value sets its message and pops the bubble; on input the check
 * only re-runs, releasing the pin that message put on the element. Without the
 * second listener a field corrected mid-edit stays invalid until the next blur,
 * and Chrome keeps the stale bubble up.
 * @param {any} root  document (/builder) or the form (/networks)
 * @param {{ signal?: AbortSignal }} [opts]
 */
export function wireValidation(root, opts) {
  const o = opts || {};
  root.addEventListener('focusout', (e) => {
    if (refreshValidityFor(e.target)) e.target.reportValidity();
  }, o);
  root.addEventListener('input', (e) => {
    refreshValidityFor(e.target);
    // An interface-name conflict is the one message here that depends on the
    // OTHER fields, so editing one can clear or raise it on its siblings.
    if (IFACE_KEY_BY_FIELD[e.target.id]) {
      IFACE_FIELDS.forEach((id) => {
        const el = root.querySelector('#' + id);
        if (el && el !== e.target) refreshIfaceValidity(el);
      });
    }
  }, o);
}
