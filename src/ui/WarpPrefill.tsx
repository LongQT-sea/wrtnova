// "I don't have a VPN": one button that produces a working tunnel (US5).
//
// It writes into whichever configuration it is mounted in -- the builder's store
// on /builder, the network's shared store on /networks -- by going through the
// same scoped hook every field uses. Nothing here reaches for a particular store.
//
// The tunnel is switched ON as part of the fill, deliberately: WG_ENABLE gates
// every key the fill just wrote, so a filled-in tunnel left off would be dropped
// at build time without a word (US5 scenario 2).

import { useState } from 'react';
import { joinEndpoint } from '@core/list-grammar';
import { registerWarp, WarpError } from '@core/warp';
import { useScopedStore } from '@state/configStore';
import { useWarpIdentity } from '@state/warpScope';
import { t, type MessageId } from '@i18n/index';

interface Status {
  ok: boolean;
  messageId: MessageId;
}

export function WarpPrefill() {
  const store = useScopedStore();
  const identity = useWarpIdentity();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const reg = await registerWarp(identity.read());
      store.getState().patch({
        WG_ENABLE: '1',
        WG_PRIVATE_KEY: reg.WG_PRIVATE_KEY,
        PEER_PUBLIC_KEY: reg.PEER_PUBLIC_KEY,
        // WARP hands the host and the port back apart; the form asks for one
        // field and core/derive.ts splits it again on the way out.
        ENDPOINT: joinEndpoint(reg.ENDPOINT, reg.ENDPOINT_PORT),
        ENDPOINT_PORT: '',
        WG_IPV4: reg.WG_IPV4,
        WG_IPV6: reg.WG_IPV6,
        ALLOWED_IPS: reg.ALLOWED_IPS,
      });
      if (reg.warp_refresh_token) identity.write(reg.warp_refresh_token);
      setStatus({ ok: true, messageId: 'warpSuccess' });
    } catch (e) {
      const id = e instanceof WarpError ? e.messageId : 'warpFailed';
      setStatus({ ok: false, messageId: id as MessageId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5">
      <p className="field-help">{t('wgNeedConfig')}</p>
      <button
        type="button"
        className="btn btn-quiet mt-1.5"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? t('fetchingWarp') : t('prefillWithWarp')}
      </button>
      {status ? (
        <p
          className={status.ok ? 'note mt-2' : 'field-error mt-2'}
          role={status.ok ? 'status' : 'alert'}
        >
          {t(status.messageId)}
        </p>
      ) : null}
    </div>
  );
}
