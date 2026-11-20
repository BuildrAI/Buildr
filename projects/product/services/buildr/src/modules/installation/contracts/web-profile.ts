import {defaultHarnessDataRoot} from '@buildr-ai/buildr-harness/profile';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const WEB_PROFILE_SCHEMA = 'buildr.web-profile/v1';
export const WEB_PROFILE_NAMES = Object.freeze(['released', 'development']);

function sha256(value: any) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function runtimeRole(identity: any) {
  return identity?.runtime?.role || identity?.runtimeRole || 'unknown';
}

function resolvePath(value: any, platform: any) {
  return platform === 'win32' ? path.win32.resolve(value) : path.resolve(value);
}

function sameFilesystemPath(left: any, right: any) {
  if (!left || !right) return false;
  const canonical = (value: any) => {
    try { return fs.realpathSync(path.resolve(value)); } catch { return path.resolve(value); }
  };
  return canonical(left) === canonical(right);
}

export function webProfileName(productIdentity: any) {
  const channel = productIdentity?.channel || 'unknown';
  const role = runtimeRole(productIdentity);
  if (channel === 'npm' && role === 'host') return 'released';
  if (channel === 'development' && role === 'development') return 'development';
  const error: Error & Record<string, any> = new Error(`Buildr Web product identity不受支持：channel=${channel}, runtimeRole=${role}。`);
  error.code = 'web_profile_identity_invalid';
  error.status = 409;
  error.details = { channel, runtimeRole: role };
  throw error;
}

export function defaultWebDataRoot(profile: any, options: any = {}) {
  if (!WEB_PROFILE_NAMES.includes(profile)) throw new Error(`Unsupported Buildr Web profile: ${profile}.`);
  return defaultHarnessDataRoot(profile,options);
}

export function resolveWebProfile(productIdentity: any, options: any = {}) {
  const profile = webProfileName(productIdentity);
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const dataRoot = options.dataRoot
    ? resolvePath(options.dataRoot, platform)
    : env.BUILDR_APP_DATA_DIR
      ? resolvePath(env.BUILDR_APP_DATA_DIR, platform)
      : defaultWebDataRoot(profile, options);
  const channel = productIdentity.channel;
  const role = runtimeRole(productIdentity);
  const rootIdentity = sha256(resolvePath(dataRoot, platform));
  const identity = sha256(JSON.stringify({ schemaVersion: WEB_PROFILE_SCHEMA, profile, channel, runtimeRole: role, rootIdentity }));
  return Object.freeze({
    schemaVersion: WEB_PROFILE_SCHEMA,
    profile,
    channel,
    runtimeRole: role,
    dataRoot,
    rootIdentity,
    identity,
    overridden: Boolean(options.dataRoot || env.BUILDR_APP_DATA_DIR),
  });
}

export function oppositeWebProfile(profile: any, productIdentity: any, options: any = {}) {
  const opposite = profile.profile === 'released' ? 'development' : 'released';
  const channel = opposite === 'released' ? 'npm' : 'development';
  const role = opposite === 'released' ? 'host' : 'development';
  const env = options.env || process.env;
  const isolatedPeerRoot = env.BUILDR_APP_DATA_DIR
    ? path.join(resolvePath(env.BUILDR_APP_DATA_DIR, options.platform || process.platform), '.peer', opposite)
    : null;
  return resolveWebProfile({ ...productIdentity, channel, runtime: { ...(productIdentity?.runtime || {}), role } }, {
    ...options,
    env: { ...env, BUILDR_APP_DATA_DIR: '' },
    dataRoot: options.oppositeDataRoot || isolatedPeerRoot || defaultWebDataRoot(opposite, options),
  });
}

export function assertLauncherWebProfile(launcherIdentity: any, profile: any, options: any = {}) {
  if (!launcherIdentity) return null;
  const channel = launcherIdentity.channel || 'unknown';
  const role = launcherIdentity.runtimeRole
    || (launcherIdentity.developmentRuntime ? 'development' : channel === 'npm' ? 'host' : 'unknown');
  const productIdentity = options.productIdentity || null;
  const launcherProtocol = launcherIdentity.protocolIdentity
    || (Number.isInteger(launcherIdentity.protocolVersion) ? `buildr.web-protocol/v${launcherIdentity.protocolVersion}` : null);
  const protocolMismatch = Boolean(productIdentity?.protocolIdentity) && launcherProtocol !== productIdentity.protocolIdentity;
  let developmentBindingMismatch = false;
  if (profile.profile === 'development' && options.productRoot) {
    const runtime = launcherIdentity.developmentRuntime;
    developmentBindingMismatch = !launcherIdentity.sourceRoot
      || !sameFilesystemPath(launcherIdentity.sourceRoot, options.productRoot)
      || !runtime?.executable
      || !sameFilesystemPath(runtime.executable, productIdentity?.runtime?.executable)
      || runtime.version !== productIdentity?.runtime?.version;
  }
  if (channel !== profile.channel || role !== profile.runtimeRole || protocolMismatch || developmentBindingMismatch) {
    const error: Error & Record<string, any> = new Error(`Buildr Launcher与产品身份不匹配：Launcher channel=${channel}, runtimeRole=${role}, protocol=${launcherProtocol || 'unknown'}；产品 channel=${profile.channel}, runtimeRole=${profile.runtimeRole}, protocol=${productIdentity?.protocolIdentity || 'unknown'}。`);
    error.code = 'web_launcher_profile_mismatch';
    error.status = 409;
    error.details = {
      launcher: {
        channel,
        runtimeRole: role,
        protocolIdentity: launcherProtocol,
        sourceRoot: launcherIdentity.sourceRoot || null,
        runtimeExecutable: launcherIdentity.developmentRuntime?.executable || null,
        runtimeVersion: launcherIdentity.developmentRuntime?.version || null,
      },
      product: {
        channel: profile.channel,
        runtimeRole: profile.runtimeRole,
        protocolIdentity: productIdentity?.protocolIdentity || null,
        sourceRoot: options.productRoot || null,
        runtimeExecutable: productIdentity?.runtime?.executable || null,
        runtimeVersion: productIdentity?.runtime?.version || null,
      },
    };
    throw error;
  }
  return launcherIdentity;
}

export function sameWebProfile(left: any, right: any) {
  return Boolean(left?.schemaVersion === WEB_PROFILE_SCHEMA && right?.schemaVersion === WEB_PROFILE_SCHEMA && left.identity === right.identity);
}

/** Prefer the current Buildr Development Dev launcher, falling back to legacy Buildr Web Dev. */
export function developmentLauncherCandidates(platform: any = process.platform, options: any = {}) {
  const env = options.env || process.env;
  if (platform === 'darwin') {
    return ['/Applications/Buildr Development Dev.app', '/Applications/Buildr Web Dev.app'];
  }
  const localAppData = env.LOCALAPPDATA || path.join(options.home ?? os.homedir(), 'AppData', 'Local');
  return [
    path.join(localAppData, 'Programs', 'Buildr Development Dev'),
    path.join(localAppData, 'Programs', 'Buildr Web Dev'),
  ];
}

export function resolveDevelopmentLauncherRoot(platform: any = process.platform, options: any = {}) {
  const candidates = developmentLauncherCandidates(platform, options);
  for (const candidate of candidates) {
    const identityFile = platform === 'darwin'
      ? path.join(candidate, 'Contents', 'Resources', 'launcher-identity.json')
      : path.join(candidate, 'launcher-identity.json');
    if (fs.existsSync(identityFile) || fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}
