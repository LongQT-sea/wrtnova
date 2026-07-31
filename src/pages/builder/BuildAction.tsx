// The build: pre-flight sweep, submit, poll, results.
//
// CONSTITUTION III. The assembled script -- root password, Wi-Fi passphrases,
// WireGuard keys, API tokens -- is POSTed from here straight to the ASU server the
// user chose. There is no WrtNova build endpoint and nothing in this file may
// introduce one. The only WrtNova-origin request it makes is GET /wrtnova.sh.

import { useCallback, useRef, useState } from 'react';
import type { EmittedConfig, RawConfig } from '@core/types';
import { adguardHashFromRoot } from '@core/adguard';
import {
  AsuError,
  pollBuild,
  resolveImages,
  submitBuild,
  type ResolvedImage,
} from '@core/asu';
import { isStorageError, nextLighterDnsMode } from '@core/dns';
import { parseAdditionalPackages, resolvePackages, withBase64Pkg } from '@core/packages';
import { assembleScriptForBuild, fetchScriptBody } from '@core/script';
import { truncateAdditionalVlans } from '@core/vlan';
import { emittedFrom, useConfigStore } from '@state/configStore';
import { sectionOfKey, sweep } from '@state/validation';
import { revealField } from '@ui/fieldRegistry';
import { t, type MessageId } from '@i18n/index';

export interface BuildActionProps {
  /** Bring the offending field's section forward before focusing it (FR-015). */
  onNavigate: (section: string) => void;
}

type Phase = 'idle' | 'running' | 'done' | 'error';

interface Progress {
  message: string;
  percent: number;
}

const AUTO_RETRY_MESSAGE: Record<string, MessageId> = {
  dnsproxy: 'autoSwitchedDnsproxy',
  'https-dns-proxy': 'autoSwitchedHttpsDnsProxy',
  'adblock-fast': 'autoSwitchedAdblock',
  none: 'autoSwitchedDnsmasq',
};

export function BuildAction({ onNavigate }: BuildActionProps) {
  const target = useConfigStore((s) => s.target);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [images, setImages] = useState<ResolvedImage[]>([]);
  /** One downgrade, then stop, so a hopeless config cannot loop (FR-030). */
  const retried = useRef(false);

  const run = useCallback(async () => {
    const state = useConfigStore.getState();
    const board = state.target;
    if (!board) {
      setError(t('pickDeviceFirst'));
      return;
    }

    // Pre-flight. Refuse on the first offender that will actually be emitted, and
    // take the user to it rather than describing where it is.
    const issues = sweep(state.raw);
    const first = issues[0];
    if (first) {
      const section = sectionOfKey(first.key);
      if (section) onNavigate(section);
      setPhase('error');
      setProgress(null);
      setError(
        t(first.messageId as MessageId, first.vars) + ' ' + t('fixBeforeBuild'),
      );
      // Let the section mount before reaching for the control.
      requestAnimationFrame(() => {
        if (revealField(first.key)) {
          document.getElementById(first.key)?.dispatchEvent(new Event('wrtnova:report'));
        }
      });
      return;
    }

    setPhase('running');
    setError(null);
    setImages([]);
    setProgress({ message: t('preparingBuild'), percent: 5 });

    try {
      const cfg = await buildConfig(state.raw, board.target);
      const packages = resolvePackages({
        base: board.default_packages,
        device: board.device_packages,
        extra: parseAdditionalPackages(state.raw.additional_packages),
        config: cfg,
      });

      const body = await fetchScriptBody();
      const built = await assembleScriptForBuild(cfg, body);

      setProgress({ message: t('submittingToServer'), percent: 8 });
      const outcome = await submitBuild(state.asuUrl, {
        profile: board.profile,
        target: board.target,
        version: board.version,
        version_code: board.version_code,
        packages: withBase64Pkg(packages, built.compressed),
        defaults: built.script,
      });

      if (outcome.kind === 'cached') {
        setImages(resolveImages(outcome.data, outcome.asuBase));
        setProgress({ message: t('doneCachedBuild'), percent: 100 });
        setPhase('done');
        return;
      }

      const hash = outcome.data.request_hash ?? '';
      let percent = 15;
      const done = await pollBuild(outcome.asuBase, hash, {
        onProgress: (p) => {
          if (p.queuePosition != null) {
            setProgress({ message: t('inBuildQueue', { n: p.queuePosition }), percent: 8 });
          } else {
            percent = Math.min(94, percent + (percent < 85 ? 8 : 2));
            setProgress({ message: t('building'), percent });
          }
        },
      });

      setImages(resolveImages(done, outcome.asuBase));
      setProgress({ message: t('done'), percent: 100 });
      setPhase('done');
    } catch (e) {
      const err = e as Error;
      const message = err.message;

      // Too big for this device's flash: drop to the next-lighter DNS engine,
      // say what changed, and try once more.
      if (isStorageError(message) && !retried.current) {
        const next = nextLighterDnsMode(useConfigStore.getState().raw.DNS_MODE);
        if (next) {
          retried.current = true;
          const noteId = AUTO_RETRY_MESSAGE[next];
          useConfigStore.getState().patch({ DNS_MODE: next, ADGUARD_MAIN_DNS: '' });
          setRetryNote(message + (noteId ? ' ' + t(noteId) : ''));
          void run();
          return;
        }
      }

      setPhase('error');
      setProgress(null);
      setError(
        err instanceof AsuError && err.stderr
          ? t('buildFailed', { msg: message }) + '\n' + err.stderr
          : t('buildFailed', { msg: message }),
      );
    }
  }, [onNavigate]);

  return (
    <div className="card p-3">
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!target || phase === 'running'}
        onClick={() => {
          retried.current = false;
          setRetryNote(null);
          void run();
        }}
      >
        {phase === 'running' ? t('building') : t('buildFirmware')}
      </button>
      {target ? null : <p className="field-help mt-1.5">{t('pickDeviceHint')}</p>}

      {progress ? (
        <div className="mt-2.5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progress.message}
          >
            <div
              className="h-full bg-seg-lan transition-all"
              style={{ width: progress.percent + '%' }}
            />
          </div>
          <p className="field-help mt-1">{progress.message}</p>
        </div>
      ) : null}

      {error ? (
        <div className="note note-danger mt-2.5" role="alert">
          <p className="whitespace-pre-wrap">{error}</p>
          {isStorageError(error) ? (
            <p className="mt-1" dangerouslySetInnerHTML={{ __html: t('storageTip') }} />
          ) : null}
        </div>
      ) : null}

      {/* Outside the error block on purpose: the retry clears the error it was
          triggered by, and the user still has to be told what was changed on
          their behalf (FR-030) -- including when the retry then succeeds. */}
      {retryNote ? (
        <p className="note mt-2.5" role="status">
          {retryNote}
        </p>
      ) : null}

      {images.length ? <Results images={images} /> : null}
    </div>
  );
}

/**
 * Every produced image with its checksum and a link (FR-029). Sysupgrade first:
 * that is the image most people want, and leading with factory invites flashing
 * the wrong one onto an already-OpenWrt router.
 */
function Results({ images }: { images: ResolvedImage[] }) {
  return (
    <div className="mt-3 border-t border-rule pt-3">
      <h3 className="field-label">{t('buildImages')}</h3>
      <ul className="mt-1.5 space-y-2">
        {images.map((im) => (
          <li key={im.name}>
            {im.url ? (
              <a href={im.url} className="mono text-sm font-semibold text-seg-lan underline">
                {im.type}
              </a>
            ) : (
              <span className="mono text-sm font-semibold">{im.type}</span>
            )}
            <p className="field-help mono break-all">{im.name}</p>
            {im.sha256 ? (
              <p className="field-help mono break-all">
                {t('checksumLabel')} {im.sha256}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="note mt-2" dangerouslySetInnerHTML={{ __html: t('flashNote') }} />
    </div>
  );
}

/**
 * The config as it will be written: gated, trunk-truncated to the switch's VLAN
 * table, and carrying the derived AdGuard Home admin hash.
 *
 * The hash is a deterministic bcrypt of the root password, which is what keeps a
 * rebuild byte-identical and lets the build server serve a cached image (FR-032).
 */
async function buildConfig(raw: RawConfig, boardTarget: string): Promise<EmittedConfig> {
  const cfg = { ...emittedFrom(raw) };

  const trunc = truncateAdditionalVlans(cfg, boardTarget);
  if (trunc.truncated) cfg.ADDITIONAL_VLAN_LIST = trunc.list;

  if (cfg.ROOT_PASSWD) {
    const hash = await adguardHashFromRoot(cfg.ROOT_PASSWD);
    if (hash) cfg.ADGUARD_PASSWD = hash;
  }
  return cfg;
}
