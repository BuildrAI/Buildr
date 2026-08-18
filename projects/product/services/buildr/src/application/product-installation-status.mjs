import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';

import {
  readCurrentInstallationOrigin,
  runtimeIdentityForOrigin,
} from '../infrastructure/product-identity/installation-origin.mjs';
import { registeredProductInstallations } from '../infrastructure/product-identity/installation-registry.mjs';
import { localAppDataRoot } from '../infrastructure/filesystem/workspace-registry-repository.mjs';
import { resolveApplicationPayloadRoot } from '../infrastructure/product-resources/index.mjs';
import { npmLauncherStatus } from '../infrastructure/product-launcher/index.mjs';
import { defaultWebDataRoot, oppositeWebProfile, resolveWebProfile } from '../infrastructure/product-identity/web-profile.mjs';
import { readWorkspaceRegistryFile } from '../infrastructure/filesystem/workspace-registry-repository.mjs';
import { parseWorkspaceManifest } from '../infrastructure/filesystem/workspace-manifest-repository.mjs';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function absent(channel, location, reason) {
  return { channel, status: 'absent', location, identity: null, runtime: null, reason };
}

function humanValue(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function printHumanInstallation(item, label = item?.channel || 'unknown') {
  const identity = item?.identity;
  const runtime = item?.runtime;
  console.log(`${label}: channel=${humanValue(item?.channel)} status=${humanValue(item?.status)} path=${humanValue(item?.location)}`);
  console.log(`  identity: Buildr=${humanValue(identity?.version)} protocol=${humanValue(identity?.protocolIdentity)} payload=${humanValue(identity?.applicationPayloadDigest)} ownership=${humanValue(identity?.ownershipIdentity)}`);
  console.log(`  runtime: role=${humanValue(runtime?.role)} Node=${humanValue(runtime?.version)} executable=${humanValue(runtime?.executable)} identity=${humanValue(runtime?.identity)}`);
}

function printHumanInstance(instance) {
  const identity = instance?.identity;
  const runtime = identity?.runtime;
  console.log(`current instance: status=${humanValue(instance?.status)} readiness=${humanValue(instance?.observation?.health)} pid=${humanValue(identity?.pid)} url=${humanValue(identity?.url)}`);
  console.log(`  identity: channel=${humanValue(identity?.channel)} Buildr=${humanValue(identity?.version)} protocol=${humanValue(identity?.protocolIdentity)} payload=${humanValue(identity?.applicationPayloadDigest)} ownership=${humanValue(identity?.ownershipIdentity)}`);
  console.log(`  runtime: role=${humanValue(identity?.runtimeRole || runtime?.role)} Node=${humanValue(runtime?.version)} executable=${humanValue(runtime?.executable)} identity=${humanValue(runtime?.identity)}`);
}

function registeredChannel(observed, channel) {
  if (observed.status === 'invalid') {
    return { channel, status: 'invalid', location: observed.file, identity: null, runtime: null, reason: observed.reason };
  }
  const candidates = observed.installations.filter((item) => item.entry?.origin.channel === channel);
  if (candidates.length === 0) return absent(channel, observed.file, 'no validated installation has enrolled this channel');
  const selected = candidates.findLast((item) => item.status === 'installed')
    ?? candidates.findLast((item) => item.status === 'invalid')
    ?? candidates.at(-1);
  return {
    channel,
    status: selected.status,
    location: selected.entry.entryPath,
    identity: selected.entry.origin,
    runtime: selected.entry.runtime,
    reason: selected.reason,
    registration: {
      registry: observed.file,
      envelopePath: selected.entry.envelopePath,
      productRoot: selected.entry.productRoot,
      entryPath: selected.entry.entryPath,
      identity: selected.entry.identity,
      updateAuthority: selected.entry.updateAuthority,
    },
  };
}

function developmentLauncherIdentity(options = {}) {
  const target = options.developmentLauncherRoot || (process.platform === 'darwin'
    ? '/Applications/Buildr Web Dev.app'
    : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Buildr Web Dev'));
  const file = process.platform === 'darwin'
    ? path.join(target, 'Contents', 'Resources', 'launcher-identity.json')
    : path.join(target, 'launcher-identity.json');
  const identity = readJson(file);
  if (!identity) return absent('development', file, 'development launcher identity is not present');
  if (identity.schemaVersion !== 'buildr.launcher-identity/v1' || identity.channel !== 'development') {
    return { channel: 'development', status: 'invalid', location: file, identity: null, runtime: null, reason: 'development launcher ownership identity is invalid' };
  }
  const developmentRuntime = identity.developmentRuntime || identity.nodeRuntime || null;
  return {
    channel: 'development',
    status: 'installed',
    location: file,
    identity: {
      version: identity.version || null,
      protocolIdentity: identity.protocolIdentity || (identity.protocolVersion ? `buildr.web-protocol/v${identity.protocolVersion}` : null),
      applicationPayloadDigest: identity.applicationPayloadDigest || null,
      ownershipIdentity: identity.ownershipIdentity || identity.buildId || null,
      sourceRoot: identity.sourceRoot || null,
      sourceCommit: identity.checkout?.head || null,
    },
    runtime: developmentRuntime ? { role: 'development', version: developmentRuntime.version || null, executable: developmentRuntime.executable || null, identity: developmentRuntime.identity || null } : null,
    reason: null,
  };
}

function instancePidAlive(pid, probe = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function loopbackInstanceUrl(value) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || !parsed.port
      || Number(parsed.port) < 1
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function workspaceRegistryInventory(profile) {
  const observation = readWorkspaceRegistryFile(path.join(profile.dataRoot, 'workspace-registry.json'));
  const entries = (observation.registry?.roots || []).map((registeredRoot) => {
    let canonicalRoot = path.resolve(registeredRoot);
    let workspaceId = null;
    let status = 'ready';
    let reason = null;
    try {
      canonicalRoot = fs.realpathSync.native(canonicalRoot);
      const manifest = parseWorkspaceManifest(fs.readFileSync(path.join(canonicalRoot, '.buildr', 'workspace.yml'), 'utf8'));
      workspaceId = manifest.canonical ? manifest.workspace.id : null;
      if (!workspaceId) throw new Error('Workspace manifest has no canonical UUID.');
    } catch (error) {
      status = 'invalid';
      reason = error.message;
    }
    let managementOwner = null;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(canonicalRoot, '.buildr', 'local', 'web-management.json'), 'utf8'));
      managementOwner = record?.owner || null;
    } catch {}
    return { registeredRoot, canonicalRoot, workspaceId, status, reason, managementOwner };
  });
  return { profile: profile.profile, dataRoot: profile.dataRoot, file: observation.file, status: observation.status, reason: observation.reason, entries };
}

function workspaceManagementInventory(profiles) {
  const registries = {
    released: workspaceRegistryInventory(profiles.released),
    development: workspaceRegistryInventory(profiles.development),
  };
  const conflicts = [];
  for (const profile of ['released', 'development']) {
    const registry = registries[profile];
    if (registry.status === 'invalid') conflicts.push({ type: 'registry-invalid', profile, registry: registry.file, reason: registry.reason });
    for (const entry of registry.entries) {
      if (entry.status === 'invalid') conflicts.push({ type: 'workspace-identity-invalid', profile, registry: registry.file, root: entry.registeredRoot, reason: entry.reason });
      if (entry.managementOwner && entry.managementOwner.profile !== profile) conflicts.push({ type: 'management-owner-conflict', profile, registry: registry.file, root: entry.canonicalRoot, owner: entry.managementOwner });
    }
  }
  for (const released of registries.released.entries.filter((entry) => entry.status === 'ready')) {
    for (const development of registries.development.entries.filter((entry) => entry.status === 'ready')) {
      if (released.canonicalRoot === development.canonicalRoot || released.workspaceId === development.workspaceId) {
        conflicts.push({
          type: 'cross-channel-registration',
          workspaceId: released.workspaceId === development.workspaceId ? released.workspaceId : null,
          releasedRoot: released.canonicalRoot,
          developmentRoot: development.canonicalRoot,
        });
      }
    }
  }
  return { registries, conflicts };
}

function annotateInstanceProfile(instance, profile) {
  const expectedChannel = profile === 'released' ? 'npm' : 'development';
  if (instance.identity && instance.identity.channel !== 'unknown' && instance.identity.channel !== expectedChannel) {
    return {
      ...instance,
      status: 'profile-conflict',
      reason: `${profile} Web Data Root中的instance属于${instance.identity.channel} channel；请通过旧实例公开退出动作停止后重新启动。`,
    };
  }
  return instance;
}

function observeCurrentInstance(options = {}) {
  const file = path.resolve(options.instanceFile || path.join(options.dataRoot || localAppDataRoot(), 'instance.json'));
  if (!fs.existsSync(file)) return { receipt: null, result: { status: 'absent', identity: null, observation: { file, pidAlive: false, endpoint: 'absent', health: 'not-probed' } } };
  const value = readJson(file);
  if (!value || !['buildr.local-app-instance/v1', 'buildr.local-app-instance/v2'].includes(value.schemaVersion) || typeof value.secret !== 'string' || !Number.isInteger(value.pid) || value.pid <= 0) {
    return { receipt: null, result: { status: 'invalid', identity: null, observation: { file, pidAlive: false, endpoint: 'invalid', health: 'not-probed' }, reason: 'current instance receipt is invalid' } };
  }
  const endpoint = loopbackInstanceUrl(value.url);
  if (!endpoint) {
    return { receipt: null, result: { status: 'invalid', identity: null, observation: { file, pidAlive: false, endpoint: 'invalid', health: 'not-probed' }, reason: 'current instance URL is not the canonical loopback origin' } };
  }
  const pidAlive = instancePidAlive(value.pid, options.pidProbe);
  const launcher = value.launcherIdentity || null;
  const product = value.productIdentity || null;
  return { receipt: value, endpoint, result: {
    status: pidAlive ? 'live-unverified' : 'stale',
    identity: {
      pid: value.pid,
      url: endpoint,
      channel: launcher?.channel || product?.channel || 'unknown',
      version: launcher?.version || product?.version || null,
      protocolIdentity: launcher?.protocolIdentity || (launcher?.protocolVersion ? `buildr.web-protocol/v${launcher.protocolVersion}` : null) || product?.protocolIdentity || null,
      applicationPayloadDigest: launcher?.applicationPayloadDigest || product?.applicationPayloadDigest || null,
      runtimeRole: launcher?.runtimeRole || product?.runtime?.role || 'unknown',
      ownershipIdentity: launcher?.ownershipIdentity || product?.installationIdentity || null,
      runtime: product?.runtime || null,
      webProfile: value.webProfile || null,
    },
    observation: {
      file,
      pidAlive,
      endpoint: 'loopback',
      health: 'not-probed',
      reason: 'Doctor uses a synchronous read-only path; health/readiness is not inferred from PID liveness.',
    },
    reason: pidAlive ? null : 'recorded process is not alive',
  } };
}

export function inspectCurrentInstance(options = {}) {
  return observeCurrentInstance(options).result;
}

export async function inspectCurrentInstanceReadiness(options = {}) {
  const observed = observeCurrentInstance(options);
  if (observed.result.status !== 'live-unverified') return observed.result;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? 1_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) throw new Error('Current instance readiness timeout must be between 1 and 5000 milliseconds.');
  let response;
  try {
    response = await fetchImpl(`${observed.endpoint}/api/v1/health`, {
      method: 'GET',
      headers: { 'x-buildr-instance': observed.receipt.secret },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return {
      ...observed.result,
      status: 'unreachable',
      observation: { ...observed.result.observation, health: 'unreachable', reason: 'validated loopback health endpoint was unreachable within the bounded probe' },
      reason: 'current instance health endpoint is unreachable',
    };
  }
  let body = null;
  try { body = await response.json(); } catch { /* reported as unhealthy below */ }
  const ready = response.ok
    && body?.schemaVersion === 'buildr.local-app-health/v1'
    && body.status === 'ready'
    && body.pid === observed.receipt.pid
    && isDeepStrictEqual(body.productIdentity, observed.receipt.productIdentity);
  if (!ready) {
    return {
      ...observed.result,
      status: 'unhealthy',
      observation: { ...observed.result.observation, health: 'unhealthy', reason: 'health response did not prove ready state, PID, and product identity' },
      reason: 'current instance health identity is unhealthy or incompatible',
    };
  }
  return {
    ...observed.result,
    status: 'ready',
    observation: { ...observed.result.observation, health: 'ready', reason: null },
    reason: null,
  };
}

export function buildInstallationInventory(productRoot, options = {}) {
  const current = readCurrentInstallationOrigin(productRoot, { payloadRoot: resolveApplicationPayloadRoot(), ...options });
  const registered = registeredProductInstallations({ file: options.installationRegistryFile, dataRoot: options.installationRegistryDataRoot });
  const knownNpm = registeredChannel(registered, 'npm');
  const npm = current.channel === 'npm'
    ? { channel: 'npm', status: 'current', location: current.receipt?.file || productRoot, identity: current, runtime: runtimeIdentityForOrigin(current), reason: null }
    : knownNpm;
  const development = current.channel === 'development'
    ? { channel: 'development', status: 'current', location: current.sourceRoot, identity: current, runtime: runtimeIdentityForOrigin(current), reason: null }
    : developmentLauncherIdentity(options);
  const currentInstallation = {
    channel: current.channel,
    status: current.channel === 'unknown' ? 'unknown' : 'current',
    location: current.receipt?.file || current.sourceRoot || productRoot,
    identity: current,
    runtime: runtimeIdentityForOrigin(current),
    reason: current.blockingReasons?.join('; ') || null,
  };
  const profileOptions = options.webProfileOptions || {};
  let currentProfile = null;
  try { currentProfile = resolveWebProfile(current, profileOptions); } catch {}
  const explicitRoots = options.instanceDataRoots;
  let releasedProfile;
  let developmentProfile;
  if (explicitRoots) {
    releasedProfile = resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, {
      ...profileOptions,
      dataRoot: explicitRoots.released || defaultWebDataRoot('released', profileOptions),
    });
    developmentProfile = resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, {
      ...profileOptions,
      dataRoot: explicitRoots.development || defaultWebDataRoot('development', profileOptions),
    });
  } else if (currentProfile?.overridden) {
    const peerProfile = oppositeWebProfile(currentProfile, current, profileOptions);
    releasedProfile = currentProfile.profile === 'released' ? currentProfile : peerProfile;
    developmentProfile = currentProfile.profile === 'development' ? currentProfile : peerProfile;
  } else {
    releasedProfile = resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, {
      ...profileOptions,
      dataRoot: defaultWebDataRoot('released', profileOptions),
    });
    developmentProfile = resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, {
      ...profileOptions,
      dataRoot: defaultWebDataRoot('development', profileOptions),
    });
  }
  const instances = {
    released: annotateInstanceProfile(inspectCurrentInstance({ dataRoot: releasedProfile.dataRoot, pidProbe: options.pidProbe }), 'released'),
    development: annotateInstanceProfile(inspectCurrentInstance({ dataRoot: developmentProfile.dataRoot, pidProbe: options.pidProbe }), 'development'),
  };
  instances.released.dataRoot = releasedProfile.dataRoot;
  instances.released.webProfile = releasedProfile;
  instances.development.dataRoot = developmentProfile.dataRoot;
  instances.development.webProfile = developmentProfile;
  const workspaceManagement = workspaceManagementInventory({ released: releasedProfile, development: developmentProfile });
  const currentInstance = options.instanceFile || options.instanceDataRoot || process.env.BUILDR_APP_DATA_DIR
    ? inspectCurrentInstance({ dataRoot: options.instanceDataRoot, instanceFile: options.instanceFile, pidProbe: options.pidProbe })
    : currentProfile
      ? instances[currentProfile.profile]
      : inspectCurrentInstance({ pidProbe: options.pidProbe });
  return {
    channels: { npm, development },
    launcher: ['darwin', 'win32'].includes(process.platform)
      ? npmLauncherStatus({ platform: process.platform, target: options.launcherTarget })
      : { schemaVersion: 'buildr.launcher-status/v1', channel: 'npm', platform: process.platform, status: 'not-applicable', installed: false, target: null, bindingPath: null, binding: null, diagnostic: null, nextActions: [] },
    currentInstallation,
    instances,
    workspaceManagement,
    currentInstance,
    installationRegistry: {
      schemaVersion: registered.registry?.schemaVersion || null,
      status: registered.status,
      file: registered.file,
      reason: registered.reason,
    },
  };
}

export async function buildInstallationStatusInventory(productRoot, options = {}) {
  const inventory = buildInstallationInventory(productRoot, options);
  const instances = {
    released: annotateInstanceProfile(await inspectCurrentInstanceReadiness({
      dataRoot: inventory.instances.released.dataRoot,
      pidProbe: options.pidProbe, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
    }), 'released'),
    development: annotateInstanceProfile(await inspectCurrentInstanceReadiness({
      dataRoot: inventory.instances.development.dataRoot,
      pidProbe: options.pidProbe, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
    }), 'development'),
  };
  for (const profile of ['released', 'development']) {
    instances[profile].dataRoot = inventory.instances[profile].dataRoot;
    instances[profile].webProfile = inventory.instances[profile].webProfile;
  }
  let currentInstance;
  if (options.instanceFile || options.instanceDataRoot || process.env.BUILDR_APP_DATA_DIR) {
    currentInstance = await inspectCurrentInstanceReadiness({
      dataRoot: options.instanceDataRoot,
      instanceFile: options.instanceFile,
      pidProbe: options.pidProbe,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
  } else {
    const profile = inventory.currentInstallation.channel === 'npm' ? 'released' : inventory.currentInstallation.channel === 'development' ? 'development' : null;
    currentInstance = profile ? instances[profile] : inventory.currentInstance;
  }
  return {
    ...inventory,
    instances,
    currentInstance,
  };
}

export function registerProductInstallationStatus(runtime) {
  async function installationStatus(args) {
    runtime.assertNoUnknownOptions(args, new Set(['--json']), new Set(['--json']));
    const result = await buildInstallationStatusInventory(runtime.productRoot());
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.installation-status/v1', ...result }, null, 2)}\n`);
    else {
      for (const channel of ['npm', 'development']) printHumanInstallation(result.channels[channel]);
      console.log(`npm launcher: status=${humanValue(result.launcher?.status)} target=${humanValue(result.launcher?.target)} binding=${humanValue(result.launcher?.binding?.bindingIdentity)}`);
      printHumanInstallation(result.currentInstallation, 'current installation');
      for (const profile of ['released', 'development']) {
        console.log(`${profile} Web Data Root: ${result.instances[profile].dataRoot}`);
        printHumanInstance(result.instances[profile]);
      }
      printHumanInstance(result.currentInstance);
    }
    return result;
  }
  Object.assign(runtime, {
    buildInstallationInventory: (options = {}) => buildInstallationInventory(runtime.productRoot(), options),
    buildInstallationStatusInventory: (options = {}) => buildInstallationStatusInventory(runtime.productRoot(), options),
    installationStatus,
  });
  return runtime;
}
