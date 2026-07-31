// "Show generated config": the raw output, one disclosure below the plan.
//
// US2 is about trust. The product's promise is that secrets never leave the
// browser, and a user who cannot inspect the output cannot verify anything. So:
//
//   - it reflects the form with nothing to press (scenario 1)
//   - secrets are masked by default and revealing them is deliberate (scenario 2)
//   - COPYING ALWAYS YIELDS THE REAL VALUES: masking is a display concern, and a
//     pasted config full of '****' would be a broken feature (scenario 3)
//   - the whole assembled script is available, honouring the masking choice
//     (scenario 4)

import { useEffect, useState } from 'react';
import type { EmittedConfig } from '@core/types';
import { adguardHashFromRoot, adguardHashIfReady } from '@core/adguard';
import { renderConfigBlock, renderConfigBlockMasked } from '@core/render-config';
import { assembleScriptForDisplay, fetchScriptBody } from '@core/script';
import { useConfigStore } from '@state/configStore';
import { emittedFrom } from '@state/configStore';
import { t } from '@i18n/index';

export function ConfigDisclosure() {
  const raw = useConfigStore((s) => s.raw);
  const [revealed, setRevealed] = useState(false);
  const [fullScript, setFullScript] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  /** Bumped when the derived AdGuard hash lands, since bcrypt is async. */
  const [hashTick, setHashTick] = useState(0);

  // The provisioning script body is only needed for the full-script view, so it is
  // fetched when the user asks for it rather than on every page load.
  useEffect(() => {
    if (!fullScript || body !== null) return;
    let live = true;
    void fetchScriptBody()
      .then((b) => live && setBody(b))
      .catch(() => live && setBody(''));
    return () => {
      live = false;
    };
  }, [fullScript, body]);

  // The AdGuard Home hash is derived from the root password at build time. Deriving
  // it here too keeps the preview equal to what gets submitted; until bcrypt has
  // finished the first time, the preview simply omits it.
  useEffect(() => {
    if (!raw.ROOT_PASSWD) return;
    let live = true;
    void adguardHashFromRoot(raw.ROOT_PASSWD).then(() => live && setHashTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, [raw.ROOT_PASSWD]);

  void hashTick;
  const cfg: EmittedConfig = {
    ...emittedFrom(raw),
    ADGUARD_PASSWD: adguardHashIfReady(raw.ROOT_PASSWD) ?? '',
  };

  const render = (masked: boolean): string =>
    fullScript
      ? assembleScriptForDisplay(cfg, body ?? '', masked)
      : masked
        ? renderConfigBlockMasked(cfg)
        : renderConfigBlock(cfg);

  const shown = render(!revealed);

  const copy = async () => {
    try {
      // Deliberately the unmasked render, whatever is on screen.
      await navigator.clipboard.writeText(render(false));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <details className="card mt-3 p-3">
      <summary className="disclosure-summary">
        <svg
          className="chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {t('showGeneratedConfig')}
      </summary>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Check checked={revealed} onChange={setRevealed} label={t('revealSecrets')} />
        <Check checked={fullScript} onChange={setFullScript} label={t('fullScript')} />
        <button type="button" className="btn btn-quiet ml-auto py-1" onClick={() => void copy()}>
          {copied === 'ok' ? t('copied') : t('copy')}
        </button>
      </div>

      <pre className="mono mt-2 max-h-80 overflow-auto rounded-[var(--radius-field)] bg-sunken p-2.5 text-2xs leading-relaxed whitespace-pre-wrap">
        {shown}
      </pre>

      <p className="field-help mt-1.5">{t('copyRealValues')}</p>
      {copied === 'fail' ? (
        <p className="field-error mt-1" role="alert">
          {t('copyFailed')}
        </p>
      ) : null}
    </details>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="field-help">{label}</span>
    </label>
  );
}
