import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { readCurrentProductIdentity, validateNpmLauncherBinding } from '../../system/installation/module.ts';
import { resolveWebProfile } from '../../system/installation/contracts/web-profile.ts';

export const INSTANCE_SCHEMA = 'buildr.local-app-instance/v2';
const LEGACY_INSTANCE_SCHEMA = 'buildr.local-app-instance/v1';

function resolvedProfile(profile: any = null) {
  return profile || resolveWebProfile(readCurrentProductIdentity());
}

export function readLauncherIdentityFromEnvironment(env: any = process.env) {
  const file = env.BUILDR_LAUNCHER_IDENTITY;
  if (!file) return null;
  try {
    const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return value?.schemaVersion === 'buildr.launcher-identity/v1' && Number.isInteger(value.protocolVersion) ? value : null;
  } catch { return null; }
}

export function buildrWebInstancePath(profile: any = null) {
  return path.join(resolvedProfile(profile).dataRoot, 'instance.json');
}

export function buildrWebStartLockPath(profile: any = null) {
  return path.join(resolvedProfile(profile).dataRoot, 'instance-start.lock');
}

export function acquireBuildrWebStartLock(profile: any = null) {
  const file = buildrWebStartLockPath(profile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    const descriptor = fs.openSync(file, 'wx');
    fs.writeFileSync(descriptor, String(process.pid));
    fs.closeSync(descriptor);
    return { file, owner: true };
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
    let ownerPid: any = null;
    try { ownerPid = Number(fs.readFileSync(file, 'utf8')); } catch {}
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try { process.kill(ownerPid, 0); return { file, owner: false }; } catch {}
    }
    fs.rmSync(file, { force: true });
    return acquireBuildrWebStartLock(profile);
  }
}

export function releaseBuildrWebStartLock(lock: any) {
  if (lock?.owner) fs.rmSync(lock.file, { force: true });
}

export function readBuildrWebInstance(profile: any = null) {
  const file = buildrWebInstancePath(profile);
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

export function writeBuildrWebInstance(runtime: any, value: any) {
  const profile = value.webProfile || resolvedProfile();
  const file = buildrWebInstancePath(profile);
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

export function clearBuildrWebInstance(expected: any = null, profile: any = expected?.webProfile || null) {
  const current = readBuildrWebInstance(profile);
  if (expected && current && (current.secret !== expected.secret || current.url !== expected.url)) return false;
  fs.rmSync(buildrWebInstancePath(profile), { force: true });
  return true;
}

export async function healthyBuildrWebInstance(instance: any = readBuildrWebInstance()) {
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

function npmProductMatchesBinding(productIdentity: any, binding: any) {
  return productIdentity?.package === binding.package
    && productIdentity?.version === binding.version
    && productIdentity?.protocolIdentity === binding.protocolIdentity
    && productIdentity?.applicationPayloadDigest === binding.applicationPayloadDigest
    && productIdentity?.sourceCommit === binding.sourceCommit
    && productIdentity?.installationIdentity === binding.installationOwnershipIdentity
    && productIdentity?.channel === 'npm'
    && productIdentity?.runtime?.role === 'host';
}

export function npmLauncherInstanceDisposition(instance: any, currentBinding: any) {
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

export function matchesNpmLauncherBinding(instance: any, binding: any) {
  return npmLauncherInstanceDisposition(instance, binding).disposition === 'reuse';
}

export async function requestBuildrWebInstanceShutdown(instance: any, { fetchImpl = fetch, timeoutMs = 1000 }: any = {}) {
  let response;
  try {
    response = await fetchImpl(new URL('/api/v1/app/quit-instance', instance.url), {
      method: 'POST',
      headers: { 'x-buildr-instance': instance.secret },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause: any) {
    const error: Error & Record<string, any> = new Error('Buildr Web 实例未接受 Launcher 的认证退出请求。', { cause });
    error.code = 'launcher_handoff_shutdown_request_failed';
    throw error;
  }
  if (response.status !== 202) {
    const error: Error & Record<string, any> = new Error(`Buildr Web 实例拒绝 Launcher 的认证退出请求（HTTP ${response.status}）。`);
    error.code = 'launcher_handoff_shutdown_rejected';
    throw error;
  }
  return { status: 'accepted', pid: instance.pid };
}

export async function waitForBuildrWebInstanceExit(instance: any, {
  attempts = 40,
  intervalMs = 50,
  profile = instance?.webProfile || null,
  readInstance = readBuildrWebInstance,
}: any = {}) {
  for (let index = 0; index < attempts; index += 1) {
    const current = readInstance(profile);
    if (!current) return { status: 'exited', pid: instance.pid };
    if (current.secret !== instance.secret || current.url !== instance.url) {
      return { status: 'replaced', pid: instance.pid, replacementPid: current.pid };
    }
    await new Promise((resolve: any) => setTimeout(resolve, intervalMs));
  }
  return { status: 'timeout', pid: instance.pid };
}

export async function waitForBuildrWebInstance({ attempts = 40, intervalMs = 50, profile = null, match = null }: any = {}) {
  for (let index = 0; index < attempts; index += 1) {
    const healthy = await healthyBuildrWebInstance(readBuildrWebInstance(profile));
    if (healthy && (!match || match(healthy))) return healthy;
    await new Promise((resolve: any) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export function openDefaultBrowser(url: any, { platform = process.platform, spawnProcess = spawn }: any = {}) {
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
