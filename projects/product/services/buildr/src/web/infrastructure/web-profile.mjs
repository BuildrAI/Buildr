import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.mjs';
export { productDataRoot } from '../../infrastructure/filesystem/product-data-root.mjs';

export const WEB_PROFILE_SCHEMA = 'buildr.web-profile/v1';
export const WEB_PROFILE_NAMES = Object.freeze(['released', 'development']);

function sha256(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function runtimeRole(identity) {
  return identity?.runtime?.role || identity?.runtimeRole || 'unknown';
}

function resolvePath(value, platform) {
  return platform === 'win32' ? path.win32.resolve(value) : path.resolve(value);
}

export function webProfileName(productIdentity) {
  const channel = productIdentity?.channel || 'unknown';
  const role = runtimeRole(productIdentity);
  if (channel === 'npm' && role === 'host') return 'released';
  if (channel === 'development' && role === 'development') return 'development';
  const error = new Error(`Buildr Web product identity不受支持：channel=${channel}, runtimeRole=${role}。`);
  error.code = 'web_profile_identity_invalid';
  error.status = 409;
  error.details = { channel, runtimeRole: role };
  throw error;
}

export function defaultWebDataRoot(profile, options = {}) {
  if (!WEB_PROFILE_NAMES.includes(profile)) throw new Error(`Unsupported Buildr Web profile: ${profile}.`);
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', profile === 'released' ? 'Buildr' : 'Buildr Dev');
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), profile === 'released' ? 'Buildr' : 'Buildr Dev');
  const stateHome = env.XDG_STATE_HOME || path.posix.join(home, '.local', 'state');
  return path.posix.join(stateHome, profile === 'released' ? 'buildr' : 'buildr-dev');
}

export function resolveWebProfile(productIdentity, options = {}) {
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

export function oppositeWebProfile(profile, productIdentity, options = {}) {
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

export function assertLauncherWebProfile(launcherIdentity, profile, options = {}) {
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
    const error = new Error(`Buildr Launcher与产品身份不匹配：Launcher channel=${channel}, runtimeRole=${role}, protocol=${launcherProtocol || 'unknown'}；产品 channel=${profile.channel}, runtimeRole=${profile.runtimeRole}, protocol=${productIdentity?.protocolIdentity || 'unknown'}。`);
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

export function sameWebProfile(left, right) {
  return Boolean(left?.schemaVersion === WEB_PROFILE_SCHEMA && right?.schemaVersion === WEB_PROFILE_SCHEMA && left.identity === right.identity);
}
