import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { atomicWriteJson, withExclusiveFileLock } from '../filesystem/index.mjs';
import { localAppDataRoot } from '../filesystem/workspace-registry-repository.mjs';
import { sameFilesystemPath } from '../filesystem/filesystem-path-identity.mjs';
import {
  runtimeIdentityForOrigin,
  validateFormalInstallationOriginPayloadBinding,
  validateInstallationOrigin,
} from './installation-origin.mjs';
import { readApplicationPayloadManifest } from '../product-resources/index.mjs';

export const PRODUCT_INSTALLATION_REGISTRY_SCHEMA = 'buildr.product-installation-registry/v1';

const REGISTRY_FIELDS = new Set(['schemaVersion', 'installations']);
const INSTALLATION_FIELDS = new Set([
  'origin',
  'envelopePath',
  'productRoot',
  'entryPath',
  'runtime',
  'updateAuthority',
  'identity',
]);
const RUNTIME_FIELDS = new Set(['role', 'executable', 'version', 'platform', 'architecture', 'identity']);
const UPDATE_AUTHORITY_FIELDS = new Set(['type', 'nodeExecutable', 'npmCliPath', 'prefix', 'identity']);

function sha256(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function assertClosed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field));
  if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.sort().join(', ')}.`);
}

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  return path.resolve(value);
}

function updateAuthorityMaterial(value) {
  return {
    type: value.type,
    nodeExecutable: path.resolve(value.nodeExecutable),
    npmCliPath: path.resolve(value.npmCliPath),
    prefix: path.resolve(value.prefix),
  };
}

export function validateProductUpdateAuthority(value) {
  if (value === null) return null;
  assertClosed(value, UPDATE_AUTHORITY_FIELDS, 'product installation updateAuthority');
  if (value.type !== 'npm-cli') throw new Error(`Unsupported product update authority: ${value.type}.`);
  const material = updateAuthorityMaterial(value);
  const expected = sha256(JSON.stringify(material));
  if (value.identity !== expected) throw new Error('Product update authority identity is invalid.');
  return Object.freeze({ ...material, identity: expected });
}

export function createProductUpdateAuthority(value) {
  const material = updateAuthorityMaterial({ ...value, type: 'npm-cli' });
  return validateProductUpdateAuthority({ ...material, identity: sha256(JSON.stringify(material)) });
}

function pathIsEqualOrInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function inspectProductUpdateAuthority(value, options = {}) {
  let authority;
  try { authority = validateProductUpdateAuthority(value); } catch (error) {
    return { status: 'invalid', authority: null, reason: error.message };
  }
  if (!authority) return { status: 'absent', authority: null, reason: 'npm update authority is not enrolled' };
  for (const [file, label] of [[authority.nodeExecutable, 'Host Node'], [authority.npmCliPath, 'npm CLI']]) {
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      return { status: 'stale', authority, reason: `Registered npm update authority ${label} is unavailable: ${file}.` };
    }
  }
  if (!fs.statSync(authority.prefix, { throwIfNoEntry: false })?.isDirectory()) {
    return { status: 'stale', authority, reason: `Registered npm update authority prefix is unavailable: ${authority.prefix}.` };
  }
  if (options.runtimeExecutable && !sameFilesystemPath(authority.nodeExecutable, options.runtimeExecutable)) {
    return { status: 'invalid', authority, reason: 'Registered npm update authority Host Node does not match the installation runtime.' };
  }
  if (options.productRoot && !pathIsEqualOrInside(fs.realpathSync(options.productRoot), fs.realpathSync(authority.prefix))) {
    return { status: 'invalid', authority, reason: 'Registered npm product root is outside its update authority prefix.' };
  }
  if (options.envelopePath && !pathIsEqualOrInside(path.dirname(fs.realpathSync(options.envelopePath)), fs.realpathSync(authority.prefix))) {
    return { status: 'invalid', authority, reason: 'Registered npm envelope root is outside its update authority prefix.' };
  }
  if (options.entryPath && !pathIsEqualOrInside(fs.realpathSync(options.entryPath), fs.realpathSync(authority.prefix))) {
    return { status: 'invalid', authority, reason: 'Registered npm entry is outside its update authority prefix.' };
  }
  return { status: 'ready', authority, reason: null };
}

function runtimeValue(value, origin) {
  assertClosed(value, RUNTIME_FIELDS, 'product installation runtime');
  const executable = absolute(value.executable, 'product installation runtime executable');
  if (value.role !== origin.runtimeRole) throw new Error('Product installation runtime role does not match origin.');
  for (const field of ['version', 'platform', 'architecture', 'identity']) {
    if (typeof value[field] !== 'string' || !value[field]) throw new Error(`Product installation runtime ${field} is required.`);
  }
  const expectedIdentity = sha256(JSON.stringify({
    role: value.role,
    executable,
    version: value.version,
    ownershipIdentity: origin.ownershipIdentity,
  }));
  if (value.identity !== expectedIdentity) throw new Error('Product installation runtime identity is invalid.');
  return Object.freeze({
    role: value.role,
    executable,
    version: value.version,
    platform: value.platform,
    architecture: value.architecture,
    identity: expectedIdentity,
  });
}

function installationMaterial(value) {
  const origin = validateInstallationOrigin(value.origin);
  if (origin.channel !== 'npm') throw new Error('Product installation registry accepts only formal npm origins.');
  const envelopePath = absolute(value.envelopePath, 'product installation envelopePath');
  const productRoot = absolute(value.productRoot, 'product installation productRoot');
  const entryPath = absolute(value.entryPath, 'product installation entryPath');
  const runtime = runtimeValue(value.runtime, origin);
  const updateAuthority = validateProductUpdateAuthority(value.updateAuthority);
  return { origin, envelopePath, productRoot, entryPath, runtime, updateAuthority };
}

export function productInstallationRegistryEntryIdentity(value) {
  return sha256(JSON.stringify(installationMaterial(value)));
}

export function validateProductInstallationRegistryEntry(value) {
  assertClosed(value, INSTALLATION_FIELDS, 'product installation registry entry');
  const material = installationMaterial(value);
  const expected = sha256(JSON.stringify(material));
  if (value.identity !== expected) throw new Error('Product installation registry entry identity is invalid.');
  return Object.freeze({ ...material, identity: expected });
}

export function validateProductInstallationRegistry(value) {
  assertClosed(value, REGISTRY_FIELDS, 'product installation registry');
  if (value.schemaVersion !== PRODUCT_INSTALLATION_REGISTRY_SCHEMA) {
    throw new Error(`Product installation registry schema must be ${PRODUCT_INSTALLATION_REGISTRY_SCHEMA}.`);
  }
  if (!Array.isArray(value.installations)) throw new Error('Product installation registry installations must be an array.');
  const installations = value.installations.map(validateProductInstallationRegistryEntry);
  const identities = new Set();
  for (const entry of installations) {
    if (identities.has(entry.identity)) throw new Error(`Product installation registry contains duplicate entry ${entry.identity}.`);
    identities.add(entry.identity);
  }
  return Object.freeze({ schemaVersion: PRODUCT_INSTALLATION_REGISTRY_SCHEMA, installations: Object.freeze(installations) });
}

export function productInstallationRegistryPath(options = {}) {
  return path.resolve(options.file || path.join(options.dataRoot || localAppDataRoot(), 'product-installations.json'));
}

export function productInstallationRegistryLockPath(options = {}) {
  return `${productInstallationRegistryPath(options)}.lock`;
}

function emptyRegistry() {
  return { schemaVersion: PRODUCT_INSTALLATION_REGISTRY_SCHEMA, installations: [] };
}

export function readProductInstallationRegistry(options = {}) {
  const file = productInstallationRegistryPath(options);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { file, status: 'absent', registry: validateProductInstallationRegistry(emptyRegistry()), reason: null };
    return { file, status: 'invalid', registry: null, reason: `Cannot read product installation registry: ${error.message}` };
  }
  try {
    return { file, status: 'ready', registry: validateProductInstallationRegistry(value), reason: null };
  } catch (error) {
    return { file, status: 'invalid', registry: null, reason: error.message };
  }
}

function writeRegistry(file, registry) {
  atomicWriteJson(file, registry, { flag: 'wx', mode: 0o600 });
}

function readReceipt(file) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new Error(`Cannot read product installation envelope ${file}: ${error.message}`);
  }
  return validateInstallationOrigin(value);
}

function readPayloadBoundReceipt(file) {
  const receipt = readReceipt(file);
  const manifest = readApplicationPayloadManifest(path.dirname(file));
  return validateFormalInstallationOriginPayloadBinding(receipt, manifest);
}

function readProductMetadata(root) {
  let value;
  try { value = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch (error) {
    throw new Error(`Cannot read registered Buildr package identity at ${root}: ${error.message}`);
  }
  if (value.name !== '@buildr-ai/buildr' || typeof value.version !== 'string') throw new Error('Registered product root is not @buildr-ai/buildr.');
  return value;
}

export function createProductInstallationRegistryEntry({ envelopePath, productRoot, entryPath, runtimeExecutable = process.execPath, updateAuthority = null }) {
  const resolvedEnvelope = absolute(envelopePath, 'product installation envelopePath');
  const resolvedProductRoot = absolute(productRoot, 'product installation productRoot');
  const resolvedEntry = absolute(entryPath, 'product installation entryPath');
  const resolvedRuntime = absolute(runtimeExecutable, 'product installation runtime executable');
  const origin = readPayloadBoundReceipt(resolvedEnvelope);
  const metadata = readProductMetadata(resolvedProductRoot);
  if (metadata.name !== origin.package || metadata.version !== origin.version) throw new Error('Product installation envelope does not match the registered product root.');
  for (const [file, label] of [[resolvedEntry, 'entry'], [resolvedRuntime, 'runtime']]) {
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`Product installation ${label} path is unavailable: ${file}.`);
  }
  const runtime = runtimeIdentityForOrigin(origin, { executable: resolvedRuntime });
  const material = {
    origin,
    envelopePath: resolvedEnvelope,
    productRoot: resolvedProductRoot,
    entryPath: resolvedEntry,
    runtime,
    updateAuthority: validateProductUpdateAuthority(updateAuthority),
  };
  return validateProductInstallationRegistryEntry({ ...material, identity: sha256(JSON.stringify(material)) });
}

export function enrollProductInstallation(input, options = {}) {
  const entry = createProductInstallationRegistryEntry(input);
  const registryFile = productInstallationRegistryPath(options);
  return withExclusiveFileLock(productInstallationRegistryLockPath(options), registryFile, () => {
    const observed = readProductInstallationRegistry({ file: registryFile });
    if (observed.status === 'invalid') throw new Error(observed.reason);
    const matchingIndex = observed.registry.installations.findIndex((item) => (
      item.origin.ownershipIdentity === entry.origin.ownershipIdentity
      && sameFilesystemPath(item.envelopePath, entry.envelopePath)
      && sameFilesystemPath(item.productRoot, entry.productRoot)
      && sameFilesystemPath(item.entryPath, entry.entryPath)
    ));
    const matching = matchingIndex === -1 ? null : observed.registry.installations[matchingIndex];
    if (matching?.identity === entry.identity || (matching?.updateAuthority && !entry.updateAuthority)) {
      return { action: 'reused', file: observed.file, entry: matching, registry: observed.registry };
    }
    const installations = matchingIndex === -1
      ? [...observed.registry.installations, entry]
      : observed.registry.installations.map((item, index) => index === matchingIndex ? entry : item);
    const registry = validateProductInstallationRegistry({
      schemaVersion: PRODUCT_INSTALLATION_REGISTRY_SCHEMA,
      installations,
    });
    writeRegistry(observed.file, registry);
    return { action: matchingIndex === -1 ? 'registered' : 'updated', file: observed.file, entry, registry };
  }, {
    timeoutMs: options.lockTimeoutMs,
    retryDelayMs: options.lockRetryDelayMs,
    now: options.lockNow,
    wait: options.lockWait,
    ownerAlive: options.lockOwnerAlive,
    onAcquired: options.onRegistryLockAcquired,
  });
}

export function inspectProductInstallationRegistryEntry(value) {
  let entry;
  try { entry = validateProductInstallationRegistryEntry(value); } catch (error) {
    return { status: 'invalid', entry: null, reason: error.message };
  }
  let receipt;
  try { receipt = readPayloadBoundReceipt(entry.envelopePath); } catch (error) {
    const missing = !fs.existsSync(entry.envelopePath)
      || !fs.existsSync(path.join(path.dirname(entry.envelopePath), 'application-payload.json'));
    return { status: missing ? 'stale' : 'invalid', entry, reason: error.message };
  }
  if (receipt.ownershipIdentity !== entry.origin.ownershipIdentity || JSON.stringify(receipt) !== JSON.stringify(entry.origin)) {
    return { status: 'invalid', entry, reason: 'Registered product installation envelope identity drifted.' };
  }
  let metadata;
  try { metadata = readProductMetadata(entry.productRoot); } catch (error) {
    return { status: fs.existsSync(entry.productRoot) ? 'invalid' : 'stale', entry, reason: error.message };
  }
  if (metadata.name !== receipt.package || metadata.version !== receipt.version) {
    return { status: 'invalid', entry, reason: 'Registered product package identity drifted.' };
  }
  for (const [file, label] of [[entry.entryPath, 'entry'], [entry.runtime.executable, 'runtime']]) {
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return { status: 'stale', entry, reason: `Registered product ${label} path is unavailable: ${file}.` };
  }
  if (entry.updateAuthority) {
    const authority = inspectProductUpdateAuthority(entry.updateAuthority, {
      productRoot: entry.productRoot,
      envelopePath: entry.envelopePath,
      entryPath: entry.entryPath,
      runtimeExecutable: entry.runtime.executable,
    });
    if (authority.status !== 'ready') return { status: authority.status, entry, reason: authority.reason };
  }
  return { status: 'installed', entry, reason: null };
}

export function registeredProductInstallations(options = {}) {
  const observed = readProductInstallationRegistry(options);
  if (observed.status === 'invalid') return { ...observed, installations: [] };
  return {
    ...observed,
    installations: observed.registry.installations.map(inspectProductInstallationRegistryEntry),
  };
}

export function findRegisteredProductInstallation(origin, options = {}) {
  if (!origin?.ownershipIdentity) return null;
  const observed = registeredProductInstallations(options);
  const productRoot = options.productRoot || null;
  const envelopePath = options.envelopePath || null;
  const entryPath = options.entryPath || null;
  return observed.installations.findLast((item) => (
    item.entry?.origin.ownershipIdentity === origin.ownershipIdentity
    && (!productRoot || sameFilesystemPath(item.entry.productRoot, productRoot))
    && (!envelopePath || sameFilesystemPath(item.entry.envelopePath, envelopePath))
    && (!entryPath || sameFilesystemPath(item.entry.entryPath, entryPath))
  )) ?? null;
}
