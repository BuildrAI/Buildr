import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { readCurrentProductIdentity } from '../../../infrastructure/product-identity/current-product-identity.mjs';
import { validateNpmLauncherBinding } from '../../../infrastructure/product-identity/launcher-binding.mjs';
import { resolveWebProfile } from '../../../infrastructure/product-identity/web-profile.mjs';

export const INSTANCE_SCHEMA = 'buildr.local-app-instance/v2';
const LEGACY_INSTANCE_SCHEMA = 'buildr.local-app-instance/v1';

function resolvedProfile(profile = null) {
  return profile || resolveWebProfile(readCurrentProductIdentity());
}

export function readLauncherIdentityFromEnvironment(env = process.env) {
  const file = env.BUILDR_LAUNCHER_IDENTITY;
  if (!file) return null;
  try {
    const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return value?.schemaVersion === 'buildr.launcher-identity/v1' && Number.isInteger(value.protocolVersion) ? value : null;
  } catch { return null; }
}

export function localAppInstancePath(profile = null) {
  return path.join(resolvedProfile(profile).dataRoot, 'instance.json');
}

export function localAppStartLockPath(profile = null) {
  return path.join(resolvedProfile(profile).dataRoot, 'instance-start.lock');
}

export function acquireLocalAppStartLock(profile = null) {
  const file = localAppStartLockPath(profile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    const descriptor = fs.openSync(file, 'wx');
    fs.writeFileSync(descriptor, String(process.pid));
    fs.closeSync(descriptor);
    return { file, owner: true };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let ownerPid = null;
    try { ownerPid = Number(fs.readFileSync(file, 'utf8')); } catch {}
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try { process.kill(ownerPid, 0); return { file, owner: false }; } catch {}
    }
    fs.rmSync(file, { force: true });
    return acquireLocalAppStartLock(profile);
  }
}

export function releaseLocalAppStartLock(lock) {
  if (lock?.owner) fs.rmSync(lock.file, { force: true });
}

export function readLocalAppInstance(profile = null) {
  const file = localAppInstancePath(profile);
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (![INSTANCE_SCHEMA, LEGACY_INSTANCE_SCHEMA].includes(value.schemaVersion) || typeof value.url !== 'string' || typeof value.secret !== 'string' || !Number.isInteger(value.pid)) return null;
    return {
      ...value,
      launcherIdentity: value.launcherIdentity ?? null,
      productIdentity: value.productIdentity ?? null,
      webProfile: value.webProfile ?? null,
      file,
    };
  } catch {
    return null;
  }
}

export function writeLocalAppInstance(runtime, value) {
  const profile = value.webProfile || resolvedProfile();
  const file = localAppInstancePath(profile);
  runtime.atomicWriteJson(file, {
    schemaVersion: INSTANCE_SCHEMA,
    url: value.url,
    secret: value.secret,
    pid: value.pid,
    launcherIdentity: value.launcherIdentity ?? null,
    productIdentity: value.productIdentity ?? null,
    webProfile: profile,
  });
  return file;
}

export function clearLocalAppInstance(expected = null, profile = expected?.webProfile || null) {
  const current = readLocalAppInstance(profile);
  if (expected && current && (current.secret !== expected.secret || current.url !== expected.url)) return false;
  fs.rmSync(localAppInstancePath(profile), { force: true });
  return true;
}

export async function healthyLocalAppInstance(instance = readLocalAppInstance()) {
  if (!instance) return null;
  try {
    const response = await fetch(`${instance.url}/api/v1/health`, {
      headers: { 'x-buildr-instance': instance.secret },
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body.schemaVersion === 'buildr.local-app-health/v1' && body.status === 'ready'
      ? {
          ...instance,
          launcherIdentity: body.launcherIdentity ?? instance.launcherIdentity ?? null,
          productIdentity: body.productIdentity ?? instance.productIdentity ?? null,
          webProfile: body.webProfile ?? instance.webProfile ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

function npmProductMatchesBinding(productIdentity, binding) {
  return productIdentity?.package === binding.package
    && productIdentity?.version === binding.version
    && productIdentity?.protocolIdentity === binding.protocolIdentity
    && productIdentity?.applicationPayloadDigest === binding.applicationPayloadDigest
    && productIdentity?.sourceCommit === binding.sourceCommit
    && productIdentity?.installationIdentity === binding.installationOwnershipIdentity
    && productIdentity?.channel === 'npm'
    && productIdentity?.runtime?.role === 'host';
}

export function npmLauncherInstanceDisposition(instance, currentBinding) {
  if (!instance || !currentBinding) return { disposition: 'conflict', code: 'launcher_handoff_identity_incomplete' };
  if (!instance.launcherIdentity) {
    return npmProductMatchesBinding(instance.productIdentity, currentBinding)
      ? { disposition: 'handoff-cli', code: null }
      : { disposition: 'conflict', code: 'launcher_handoff_cli_ownership_conflict' };
  }
  let observedBinding;
  try {
    observedBinding = validateNpmLauncherBinding(instance.launcherIdentity);
  } catch {
    return { disposition: 'conflict', code: 'launcher_handoff_binding_invalid' };
  }
  if (!npmProductMatchesBinding(instance.productIdentity, observedBinding)) {
    return { disposition: 'conflict', code: 'launcher_handoff_binding_product_conflict' };
  }
  if (observedBinding.bindingIdentity === currentBinding.bindingIdentity) {
    return { disposition: 'reuse', code: null };
  }
  if (observedBinding.installationSlotIdentity === currentBinding.installationSlotIdentity
    && observedBinding.launcherOwnershipIdentity === currentBinding.launcherOwnershipIdentity) {
    return { disposition: 'handoff-launcher', code: null };
  }
  return { disposition: 'conflict', code: 'launcher_handoff_binding_ownership_conflict' };
}

export function matchesNpmLauncherBinding(instance, binding) {
  return npmLauncherInstanceDisposition(instance, binding).disposition === 'reuse';
}

export async function requestLocalAppInstanceShutdown(instance, { fetchImpl = fetch, timeoutMs = 1000 } = {}) {
  let response;
  try {
    response = await fetchImpl(new URL('/api/v1/app/quit-instance', instance.url), {
      method: 'POST',
      headers: { 'x-buildr-instance': instance.secret },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const error = new Error('Buildr Web 实例未接受 Launcher 的认证退出请求。', { cause });
    error.code = 'launcher_handoff_shutdown_request_failed';
    throw error;
  }
  if (response.status !== 202) {
    const error = new Error(`Buildr Web 实例拒绝 Launcher 的认证退出请求（HTTP ${response.status}）。`);
    error.code = 'launcher_handoff_shutdown_rejected';
    throw error;
  }
  return { status: 'accepted', pid: instance.pid };
}

export async function waitForLocalAppInstanceExit(instance, {
  attempts = 40,
  intervalMs = 50,
  profile = instance?.webProfile || null,
  readInstance = readLocalAppInstance,
} = {}) {
  for (let index = 0; index < attempts; index += 1) {
    const current = readInstance(profile);
    if (!current) return { status: 'exited', pid: instance.pid };
    if (current.secret !== instance.secret || current.url !== instance.url) {
      return { status: 'replaced', pid: instance.pid, replacementPid: current.pid };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { status: 'timeout', pid: instance.pid };
}

export async function waitForLocalAppInstance({ attempts = 40, intervalMs = 50, profile = null, match = null } = {}) {
  for (let index = 0; index < attempts; index += 1) {
    const healthy = await healthyLocalAppInstance(readLocalAppInstance(profile));
    if (healthy && (!match || match(healthy))) return healthy;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export function openDefaultBrowser(url, { platform = process.platform, spawnProcess = spawn } = {}) {
  let command;
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd.exe';
    args = ['/d', '/s', '/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawnProcess(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref?.();
  return { command, args };
}
