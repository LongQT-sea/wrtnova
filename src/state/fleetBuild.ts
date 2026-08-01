// Building a fleet: one independent build per node.
//
// CONSTITUTION III. Each node's assembled script -- root password, Wi-Fi
// passphrases, WireGuard keys, API tokens -- is POSTed from here straight to the
// ASU server the user chose, exactly as the single-node builder does. There is no
// WrtNova build endpoint and nothing here may introduce one.
//
// FR-041 / SC-006: the nodes are independent. Every failure is caught inside the
// node that produced it, so a board that will not build cannot stop the rest of
// the house from being built.

import { create } from 'zustand';
import type { FleetNode, Network } from '@core/types';
import { adguardHashFromRoot } from '@core/adguard';
import {
  AsuError,
  pollBuild,
  primaryImageUrl,
  resolveImages,
  submitBuild,
  type AsuResponse,
  type ResolvedImage,
} from '@core/asu';
import { isStorageError, nextLighterDnsMode } from '@core/dns';
import { loadDeviceTarget } from '@core/openwrt';
import { parseAdditionalPackages, resolvePackages, withBase64Pkg } from '@core/packages';
import { assembleScriptForBuild, fetchScriptBody } from '@core/script';
import { emissionFor } from './configStore';
import { nodeRawCached, nodeIssues, nodePlan } from './fleet';
import { isAp, nodeVersion, useNetworksStore } from './networksStore';
import { peekSharedScope } from './sharedScope';
import { messageFor } from './validation';
import { t, type MessageId } from '@i18n/index';

export type BuildPhase = 'idle' | 'running' | 'done' | 'error';

export interface NodeBuild {
  phase: BuildPhase;
  percent: number;
  message: string;
  error: string | null;
  /** What was changed on the node's behalf, and why (FR-030). */
  note: string | null;
  images: ResolvedImage[];
}

const IDLE: NodeBuild = {
  phase: 'idle',
  percent: 0,
  message: '',
  error: null,
  note: null,
  images: [],
};

const AUTO_RETRY_MESSAGE: Record<string, MessageId> = {
  dnsproxy: 'autoSwitchedDnsproxy',
  'https-dns-proxy': 'autoSwitchedHttpsDnsProxy',
  'adblock-fast': 'autoSwitchedAdblock',
  none: 'autoSwitchedDnsmasq',
};

export interface FleetBuildState {
  /** Keyed by node id; a node with no entry has never been built this session. */
  builds: Record<string, NodeBuild>;
  buildNode: (netId: string, nodeId: string, asuUrl: string) => Promise<void>;
  /** Every node with a device, started together. */
  buildAll: (netId: string, asuUrl: string) => Promise<void>;
  forget: (nodeId: string) => void;
}

export const buildOf = (builds: Record<string, NodeBuild>, nodeId: string): NodeBuild =>
  builds[nodeId] ?? IDLE;

export const useFleetBuildStore = create<FleetBuildState>((set, get) => {
  const patch = (nodeId: string, p: Partial<NodeBuild>): void =>
    set((s) => ({ builds: { ...s.builds, [nodeId]: { ...buildOf(s.builds, nodeId), ...p } } }));

  /**
   * Re-read the network on every step rather than closing over it: a build runs
   * for minutes, alongside its siblings, and one of them may have moved the
   * shared configuration in the meantime.
   */
  const currentNode = (netId: string, nodeId: string): [Network, FleetNode] | null => {
    const net = useNetworksStore.getState().networks.find((n) => n.id === netId);
    const node = net?.nodes.find((n) => n.id === nodeId);
    return net && node ? [net, node] : null;
  };

  async function run(netId: string, nodeId: string, asuUrl: string, attempt: number): Promise<void> {
    const found = currentNode(netId, nodeId);
    if (!found) return;
    const [net, node] = found;

    // The DNS engine this attempt is built with, captured before anything can
    // move it, so an auto-retry can tell "nothing has changed yet" from "a
    // sibling has already downgraded on my behalf".
    const builtDns = String(net.shared_config.DNS_MODE ?? '');

    try {
      patch(nodeId, { phase: 'running', percent: 5, message: t('preparingBuild'), error: null });

      const raw = nodeRawCached(net, node);
      const board = await resolveNodeTarget(net, node);

      const cfg = { ...emissionFor(raw, board.target).config };
      if (cfg.ROOT_PASSWD) {
        const hash = await adguardHashFromRoot(cfg.ROOT_PASSWD);
        if (hash) cfg.ADGUARD_PASSWD = hash;
      }

      // Additive rather than overriding: the shared list is what every node
      // needs, the node's is what this board needs on top of it.
      const packages = resolvePackages({
        base: board.default_packages,
        device: board.device_packages,
        extra: [
          ...parseAdditionalPackages(net.shared_config.additional_packages),
          ...parseAdditionalPackages(node.overrides.additional_packages),
        ],
        config: cfg,
      });

      const body = await fetchScriptBody();
      const built = await assembleScriptForBuild(cfg, body);

      patch(nodeId, { percent: 8, message: t('submittingToServer') });
      const outcome = await submitBuild(asuUrl, {
        profile: board.profile,
        target: board.target,
        version: board.version,
        version_code: board.version_code,
        packages: withBase64Pkg(packages, built.compressed),
        defaults: built.script,
      });

      if (outcome.kind === 'cached') {
        finish(netId, nodeId, outcome.data, outcome.asuBase, t('doneCachedBuild'));
        return;
      }

      let percent = 15;
      const done = await pollBuild(outcome.asuBase, outcome.data.request_hash ?? '', {
        onProgress: (p) => {
          if (p.queuePosition != null) {
            patch(nodeId, { percent: 8, message: t('inBuildQueue', { n: p.queuePosition }) });
          } else {
            percent = Math.min(94, percent + (percent < 85 ? 8 : 2));
            patch(nodeId, { percent, message: t('building') });
          }
        },
      });

      finish(netId, nodeId, done, outcome.asuBase, t('done'));
    } catch (e) {
      const err = e as Error;

      // Too big for this board's flash. The DNS engine is shared, so the
      // downgrade is applied to the network and every node that fails after it
      // rebuilds at the lighter engine rather than each stepping down in turn.
      const retry = attempt < 4 ? planDnsRetry(netId, nodeId, builtDns, err.message) : null;
      if (retry) {
        patch(nodeId, {
          percent: 2,
          message: t('preparingBuild'),
          note: err.message + (AUTO_RETRY_MESSAGE[retry] ? ' ' + t(AUTO_RETRY_MESSAGE[retry]) : ''),
        });
        await run(netId, nodeId, asuUrl, attempt + 1);
        return;
      }

      patch(nodeId, {
        phase: 'error',
        percent: 0,
        message: '',
        error:
          err instanceof AsuError && err.stderr
            ? t('buildFailed', { msg: err.message }) + '\n' + err.stderr
            : t('buildFailed', { msg: err.message }),
      });
    }
  }

  function finish(
    netId: string,
    nodeId: string,
    data: AsuResponse,
    asuBase: string,
    message: string,
  ): void {
    useNetworksStore.getState().recordBuild(netId, nodeId, primaryImageUrl(data, asuBase));
    patch(nodeId, {
      phase: 'done',
      percent: 100,
      message,
      error: null,
      images: resolveImages(data, asuBase),
    });
  }

  return {
    builds: {},

    buildNode: async (netId, nodeId, asuUrl) => {
      if (buildOf(get().builds, nodeId).phase === 'running') return;
      const found = currentNode(netId, nodeId);
      if (!found) return;
      const [net, node] = found;

      const refusal = preflight(net, node);
      if (refusal) {
        patch(nodeId, { phase: 'error', percent: 0, message: '', error: refusal, images: [] });
        return;
      }
      patch(nodeId, { note: null, images: [] });
      await run(netId, nodeId, asuUrl, 0);
    },

    buildAll: async (netId, asuUrl) => {
      const net = useNetworksStore.getState().networks.find((n) => n.id === netId);
      if (!net) return;
      // One fetch of the provisioning script for the whole fleet rather than one
      // per node; core/script.ts caches it.
      void fetchScriptBody().catch(() => {});
      const ready = net.nodes.filter((n) => n.device_target.profile);
      await Promise.allSettled(ready.map((n) => get().buildNode(netId, n.id, asuUrl)));
    },

    forget: (nodeId) =>
      set((s) => {
        const { [nodeId]: _gone, ...rest } = s.builds;
        return { builds: rest };
      }),
  };
});

/**
 * What would make this node's firmware wrong, before anything is sent. The same
 * sweep the single-node builder refuses on, run over the merged configuration, so
 * a fleet and a single router refuse for the same reasons (FR-015).
 */
function preflight(net: Network, node: FleetNode): string | null {
  if (!node.device_target.profile) return t('selectDeviceFirst');

  const issue = nodeIssues(net, node)[0];
  if (issue) return messageFor(issue);

  // Conflicts the allocator could not resolve reach no field of their own -- an
  // exhausted range belongs to no one row -- so the plan is asked directly.
  const blocked = nodePlan(net, node).lanes.find((l) => l.conflict !== '');
  if (blocked) {
    return blocked.conflict.startsWith('vlan') ? t('fixVlanConflict') : t('fixIfaceConflict');
  }
  return null;
}

/**
 * The node's board, resolved at the release it actually builds at. A node that
 * pinned a different release than the one its device was chosen against needs
 * that release's package lists and version code, not the ones it cached.
 */
async function resolveNodeTarget(net: Network, node: FleetNode) {
  const target = node.device_target;
  const version = nodeVersion(net, node);
  if (!version || version === target.version) return target;
  return loadDeviceTarget(version, { id: target.profile, target: target.target }, target.title);
}

/**
 * The next DNS engine to try after a too-big-for-flash failure, or null when
 * there is nothing left to give up. Applied to the shared config, which is where
 * the engine lives.
 */
function planDnsRetry(
  netId: string,
  nodeId: string,
  builtDns: string,
  message: string,
): string | null {
  if (!isStorageError(message)) return null;
  const store = useNetworksStore.getState();
  const net = store.networks.find((n) => n.id === netId);
  const node = net?.nodes.find((n) => n.id === nodeId);
  if (!net || !node) return null;
  // An access point installs no DNS engine, so there is nothing to downgrade.
  if (isAp(node)) return null;

  const current = String(net.shared_config.DNS_MODE ?? '');
  // A sibling has already stepped down: rebuild at what the network says now.
  if (current !== builtDns) return current;

  const next = nextLighterDnsMode(current);
  if (!next) return null;

  // Through the editing store when the shared config is open, so the form shows
  // what was decided on the user's behalf -- and so its own write-back does not
  // put the heavier engine straight back.
  const scope = peekSharedScope(netId);
  if (scope) scope.getState().patch({ DNS_MODE: next, ADGUARD_MAIN_DNS: '' });
  else store.setShared(netId, { ...net.shared_config, DNS_MODE: next, ADGUARD_MAIN_DNS: '' });
  return next;
}
