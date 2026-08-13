import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { localAppDataRoot } from '../../../infrastructure/filesystem/workspace-registry-repository.mjs';

const INSTANCE_SCHEMA = 'buildr.local-app-instance/v1';

export function readLauncherIdentityFromEnvironment(env = process.env) {
  const file = env.BUILDR_LAUNCHER_IDENTITY;
  if (!file) return null;
  try {
    const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return value?.schemaVersion === 'buildr.launcher-identity/v1' && Number.isInteger(value.protocolVersion) ? value : null;
  } catch { return null; }
}

export function localAppInstancePath() {
  return path.join(localAppDataRoot(), 'instance.json');
}

function startLockPath() {
  return path.join(localAppDataRoot(), 'instance-start.lock');
}

export function acquireLocalAppStartLock() {
  const file = startLockPath();
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
    return acquireLocalAppStartLock();
  }
}

export function releaseLocalAppStartLock(lock) {
  if (lock?.owner) fs.rmSync(lock.file, { force: true });
}

export function readLocalAppInstance() {
  const file = localAppInstancePath();
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.schemaVersion !== INSTANCE_SCHEMA || typeof value.url !== 'string' || typeof value.secret !== 'string' || !Number.isInteger(value.pid)) return null;
    return { ...value, launcherIdentity: value.launcherIdentity ?? null, productIdentity: value.productIdentity ?? null, file };
  } catch {
    return null;
  }
}

export function writeLocalAppInstance(runtime, value) {
  const file = localAppInstancePath();
  runtime.atomicWriteJson(file, {
    schemaVersion: INSTANCE_SCHEMA,
    url: value.url,
    secret: value.secret,
    pid: value.pid,
    launcherIdentity: value.launcherIdentity ?? null,
    productIdentity: value.productIdentity ?? null,
  });
  return file;
}

export function clearLocalAppInstance(expected = null) {
  const current = readLocalAppInstance();
  if (expected && current && (current.secret !== expected.secret || current.url !== expected.url)) return false;
  fs.rmSync(localAppInstancePath(), { force: true });
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
        }
      : null;
  } catch {
    return null;
  }
}

export async function waitForLocalAppInstance({ attempts = 40, intervalMs = 50 } = {}) {
  for (let index = 0; index < attempts; index += 1) {
    const healthy = await healthyLocalAppInstance();
    if (healthy) return healthy;
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
