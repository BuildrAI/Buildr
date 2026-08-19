import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { sameFilesystemPath } from '../filesystem/filesystem-path-identity.mjs';
import { inspectProductUpdateAuthority, validateProductInstallationRegistryEntry } from './installation-registry.mjs';
import { validateFormalInstallationOriginPayloadBinding, validateInstallationOrigin } from './installation-origin.mjs';
import { readApplicationPayloadManifest } from '../product-resources/index.mjs';

export const NPM_LAUNCHER_BINDING_SCHEMA = 'buildr.npm-launcher-binding/v2';
export const DEFAULT_NPM_LAUNCHER_WEB_PORT = 4457;

const LEGACY_NPM_LAUNCHER_BINDING_SCHEMA = 'buildr.npm-launcher-binding/v1';

const BINDING_FIELDS = new Set([
  'schemaVersion', 'channel', 'platform', 'target', 'bindingPath', 'package', 'version',
  'protocolIdentity', 'applicationPayloadDigest', 'sourceCommit', 'installationOwnershipIdentity',
  'installationSlotIdentity', 'launcherOwnershipIdentity', 'packageRoot', 'prefix', 'originEnvelope',
  'hostNode', 'packageEntry', 'webPort', 'bindingIdentity',
]);
const LEGACY_BINDING_FIELDS = new Set([...BINDING_FIELDS].filter((field) => field !== 'webPort'));
const FILE_IDENTITY_FIELDS = new Set(['path', 'version', 'sha256']);
const ENTRY_IDENTITY_FIELDS = new Set(['path', 'sha256']);
const WEB_PORT_FIELDS = new Set(['preferred', 'fallback']);

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fileDigest(file) {
  return digest(fs.readFileSync(file));
}

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field));
  if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.sort().join(', ')}.`);
}

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  return path.resolve(value);
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 identity.`);
  return value;
}

export function normalizeNpmLauncherWebPort(value = DEFAULT_NPM_LAUNCHER_WEB_PORT) {
  const policy = typeof value === 'number' ? { preferred: value, fallback: 'random' } : value;
  closed(policy, WEB_PORT_FIELDS, 'npm launcher web port policy');
  if (!Number.isInteger(policy.preferred) || policy.preferred < 0 || policy.preferred > 65535) {
    throw new Error(`Invalid npm Launcher port: ${policy.preferred}.`);
  }
  if (policy.fallback !== 'random') throw new Error(`Unsupported npm Launcher port fallback: ${policy.fallback}.`);
  return Object.freeze({ preferred: policy.preferred, fallback: 'random' });
}

function bindingMaterial(value) {
  const material = {
    schemaVersion: value.schemaVersion,
    channel: value.channel,
    platform: value.platform,
    target: path.resolve(value.target),
    bindingPath: path.resolve(value.bindingPath),
    package: value.package,
    version: value.version,
    protocolIdentity: value.protocolIdentity,
    applicationPayloadDigest: value.applicationPayloadDigest,
    sourceCommit: value.sourceCommit,
    installationOwnershipIdentity: value.installationOwnershipIdentity,
    installationSlotIdentity: value.installationSlotIdentity,
    launcherOwnershipIdentity: value.launcherOwnershipIdentity,
    packageRoot: path.resolve(value.packageRoot),
    prefix: path.resolve(value.prefix),
    originEnvelope: path.resolve(value.originEnvelope),
    hostNode: {
      path: path.resolve(value.hostNode.path),
      version: value.hostNode.version,
      sha256: value.hostNode.sha256,
    },
    packageEntry: {
      path: path.resolve(value.packageEntry.path),
      sha256: value.packageEntry.sha256,
    },
  };
  if (value.schemaVersion === NPM_LAUNCHER_BINDING_SCHEMA) material.webPort = normalizeNpmLauncherWebPort(value.webPort);
  return material;
}

export function npmLauncherInstallationSlotIdentity(value) {
  return digest(JSON.stringify({
    package: '@buildr-ai/buildr',
    packageRoot: path.resolve(value.packageRoot),
    prefix: path.resolve(value.prefix),
    originEnvelope: path.resolve(value.originEnvelope),
  }));
}

export function npmLauncherOwnershipIdentity(value) {
  return digest(JSON.stringify({
    schemaVersion: value.schemaVersion,
    platform: value.platform,
    target: path.resolve(value.target),
    installationSlotIdentity: value.installationSlotIdentity,
  }));
}

export function validateNpmLauncherBinding(value, options = {}) {
  const legacy = value?.schemaVersion === LEGACY_NPM_LAUNCHER_BINDING_SCHEMA;
  if (legacy && !options.allowLegacy) throw new Error(`Unsupported npm launcher binding schema: ${value.schemaVersion}.`);
  if (!legacy && value?.schemaVersion !== NPM_LAUNCHER_BINDING_SCHEMA) throw new Error(`Unsupported npm launcher binding schema: ${value?.schemaVersion || '<missing>'}.`);
  closed(value, legacy ? LEGACY_BINDING_FIELDS : BINDING_FIELDS, 'npm launcher binding');
  closed(value.hostNode, FILE_IDENTITY_FIELDS, 'npm launcher Host Node identity');
  closed(value.packageEntry, ENTRY_IDENTITY_FIELDS, 'npm launcher package entry identity');
  if (!legacy) normalizeNpmLauncherWebPort(value.webPort);
  if (value.channel !== 'npm') throw new Error('npm launcher binding channel must be npm.');
  if (!['darwin', 'win32'].includes(value.platform)) throw new Error(`Unsupported npm launcher platform: ${value.platform}.`);
  for (const field of ['package', 'version', 'protocolIdentity', 'sourceCommit']) {
    if (typeof value[field] !== 'string' || !value[field]) throw new Error(`npm launcher binding ${field} is required.`);
  }
  if (value.package !== '@buildr-ai/buildr') throw new Error(`Unexpected npm launcher package: ${value.package}.`);
  sha256(value.applicationPayloadDigest, 'npm launcher application payload digest');
  sha256(value.installationOwnershipIdentity, 'npm launcher installation ownership identity');
  sha256(value.installationSlotIdentity, 'npm launcher installation slot identity');
  sha256(value.launcherOwnershipIdentity, 'npm launcher ownership identity');
  sha256(value.hostNode.sha256, 'npm launcher Host Node digest');
  sha256(value.packageEntry.sha256, 'npm launcher package entry digest');
  if (typeof value.hostNode.version !== 'string' || !value.hostNode.version) throw new Error('npm launcher Host Node version is required.');
  const material = bindingMaterial(value);
  const expectedSlot = npmLauncherInstallationSlotIdentity(material);
  if (material.installationSlotIdentity !== expectedSlot) throw new Error('npm launcher installation slot identity is invalid.');
  const expectedOwnership = npmLauncherOwnershipIdentity(material);
  if (material.launcherOwnershipIdentity !== expectedOwnership) throw new Error('npm launcher ownership identity is invalid.');
  const expectedBinding = digest(JSON.stringify(material));
  if (value.bindingIdentity !== expectedBinding) throw new Error('npm launcher binding identity is invalid.');
  return Object.freeze({ ...material, bindingIdentity: expectedBinding });
}

export function createNpmLauncherBinding({ registration, platform, target, bindingPath, webPort = DEFAULT_NPM_LAUNCHER_WEB_PORT }) {
  if (registration?.status !== 'installed' || !registration.entry) throw new Error('npm launcher requires an installed, registry-proven npm installation.');
  const entry = validateProductInstallationRegistryEntry(registration.entry);
  if (entry.origin.channel !== 'npm') throw new Error(`npm launcher cannot bind installation channel ${entry.origin.channel}.`);
  const authority = inspectProductUpdateAuthority(entry.updateAuthority, {
    productRoot: entry.productRoot,
    envelopePath: entry.envelopePath,
    entryPath: entry.entryPath,
    runtimeExecutable: entry.runtime.executable,
  });
  if (authority.status !== 'ready') throw new Error(`npm launcher update authority is ${authority.status}: ${authority.reason}`);
  const origin = validateFormalInstallationOriginPayloadBinding(
    validateInstallationOrigin(JSON.parse(fs.readFileSync(entry.envelopePath, 'utf8'))),
    readApplicationPayloadManifest(path.dirname(entry.envelopePath)),
  );
  if (origin.ownershipIdentity !== entry.origin.ownershipIdentity) throw new Error('npm launcher registry origin differs from the current installation envelope.');
  const material = {
    schemaVersion: NPM_LAUNCHER_BINDING_SCHEMA,
    channel: 'npm',
    platform,
    target: absolute(target, 'npm launcher target'),
    bindingPath: absolute(bindingPath, 'npm launcher bindingPath'),
    package: origin.package,
    version: origin.version,
    protocolIdentity: origin.protocolIdentity,
    applicationPayloadDigest: origin.applicationPayloadDigest,
    sourceCommit: origin.sourceCommit,
    installationOwnershipIdentity: origin.ownershipIdentity,
    installationSlotIdentity: npmLauncherInstallationSlotIdentity({
      packageRoot: entry.productRoot,
      prefix: authority.authority.prefix,
      originEnvelope: entry.envelopePath,
    }),
    launcherOwnershipIdentity: null,
    packageRoot: entry.productRoot,
    prefix: authority.authority.prefix,
    originEnvelope: entry.envelopePath,
    hostNode: {
      path: entry.runtime.executable,
      version: entry.runtime.version,
      sha256: fileDigest(entry.runtime.executable),
    },
    packageEntry: {
      path: entry.entryPath,
      sha256: fileDigest(entry.entryPath),
    },
    webPort: normalizeNpmLauncherWebPort(webPort),
  };
  material.launcherOwnershipIdentity = npmLauncherOwnershipIdentity(material);
  return validateNpmLauncherBinding({ ...material, bindingIdentity: digest(JSON.stringify(bindingMaterial(material))) });
}

function drift(code, message, binding) {
  return { status: 'stale', code, message, binding };
}

export function inspectNpmLauncherBinding(value, options = {}) {
  let binding;
  try { binding = validateNpmLauncherBinding(value, { allowLegacy: true }); } catch (error) {
    return { status: 'invalid', code: 'launcher.binding_invalid', message: error.message, binding: null };
  }
  if (options.target && !sameFilesystemPath(binding.target, options.target)) return drift('launcher.target_drift', 'Launcher target differs from its binding.', binding);
  for (const [file, expected, code, label] of [
    [binding.hostNode.path, binding.hostNode.sha256, 'launcher.host_node_drift', 'Host Node'],
    [binding.packageEntry.path, binding.packageEntry.sha256, 'launcher.package_entry_drift', 'Buildr package entry'],
  ]) {
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return drift(code, `${label} is unavailable: ${file}.`, binding);
    if (fileDigest(file) !== expected) return drift(code, `${label} digest changed: ${file}.`, binding);
  }
  let origin;
  try {
    origin = validateFormalInstallationOriginPayloadBinding(
      validateInstallationOrigin(JSON.parse(fs.readFileSync(binding.originEnvelope, 'utf8'))),
      readApplicationPayloadManifest(path.dirname(binding.originEnvelope)),
    );
  } catch (error) {
    return drift('launcher.installation_origin_drift', error.message, binding);
  }
  const comparisons = [
    ['package', binding.package, origin.package],
    ['version', binding.version, origin.version],
    ['protocol', binding.protocolIdentity, origin.protocolIdentity],
    ['payload', binding.applicationPayloadDigest, origin.applicationPayloadDigest],
    ['source commit', binding.sourceCommit, origin.sourceCommit],
    ['installation ownership', binding.installationOwnershipIdentity, origin.ownershipIdentity],
  ];
  const mismatch = comparisons.find(([, expected, actual]) => expected !== actual);
  if (mismatch) return drift('launcher.installation_identity_drift', `Launcher ${mismatch[0]} identity differs from the npm installation.`, binding);
  if (!fs.statSync(binding.packageRoot, { throwIfNoEntry: false })?.isDirectory()) return drift('launcher.package_root_drift', `Buildr package root is unavailable: ${binding.packageRoot}.`, binding);
  if (!fs.statSync(binding.prefix, { throwIfNoEntry: false })?.isDirectory()) return drift('launcher.prefix_drift', `npm prefix is unavailable: ${binding.prefix}.`, binding);
  if (binding.schemaVersion === LEGACY_NPM_LAUNCHER_BINDING_SCHEMA) {
    return drift('launcher.binding_legacy', 'npm Launcher binding uses legacy schema v1; run repair to migrate it.', binding);
  }
  return { status: 'ready', code: null, message: null, binding };
}

export function readAndInspectNpmLauncherBinding(file, options = {}) {
  let value;
  try { value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (error) {
    return { status: error.code === 'ENOENT' ? 'absent' : 'invalid', code: error.code === 'ENOENT' ? 'launcher.absent' : 'launcher.binding_unreadable', message: error.message, binding: null };
  }
  return inspectNpmLauncherBinding(value, options);
}
