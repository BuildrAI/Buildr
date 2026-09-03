import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { spawnCommandSync } from '../../../infrastructure/process.ts';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import {
  readApplicationPayloadManifest,
  validateApplicationPayloadManifest,
} from '../../../infrastructure/product-resources/index.ts';

export const INSTALLATION_ORIGIN_SCHEMA = 'buildr.installation-origin/v2';
export const INSTALLATION_CHANNELS = Object.freeze(['npm', 'development', 'unknown']);
export const RUNTIME_ROLES = Object.freeze(['host', 'workspace', 'development', 'unknown']);
export const BUILDR_PROTOCOL_IDENTITY = 'buildr.web-protocol/v1';

const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'channel',
  'runtimeRole',
  'package',
  'version',
  'protocolIdentity',
  'applicationPayloadDigest',
  'sourceCommit',
  'sourceTag',
  'installUnit',
  'ownershipIdentity',
]);

function sha256(value: any) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function originMaterial(value: any) {
  return {
    schemaVersion: INSTALLATION_ORIGIN_SCHEMA,
    channel: value.channel,
    runtimeRole: value.runtimeRole,
    package: value.package,
    version: value.version,
    protocolIdentity: value.protocolIdentity,
    applicationPayloadDigest: value.applicationPayloadDigest ?? null,
    sourceCommit: value.sourceCommit ?? null,
    sourceTag: value.sourceTag ?? null,
    installUnit: value.installUnit,
  };
}

export function installationOwnershipIdentity(value: any) {
  return sha256(JSON.stringify(originMaterial(value)));
}

export function createInstallationOrigin(value: any) {
  const material = originMaterial(value);
  return validateInstallationOrigin({ ...material, ownershipIdentity: installationOwnershipIdentity(material) });
}

function text(value: any, field: any, { nullable = false }: any = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Installation origin ${field} must be ${nullable ? 'null or ' : ''}a non-empty string.`);
  return value;
}

export function validateInstallationOrigin(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Installation origin must be an object.');
  const keys = Object.keys(value).sort();
  const expected = [...RECEIPT_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`Installation origin fields must be closed: ${expected.join(', ')}.`);
  if (value.schemaVersion !== INSTALLATION_ORIGIN_SCHEMA) throw new Error(`Unsupported installation origin schema: ${value.schemaVersion || '<missing>'}.`);
  if (!INSTALLATION_CHANNELS.slice(0, -1).includes(value.channel)) throw new Error(`Unsupported installation channel: ${value.channel}.`);
  if (!RUNTIME_ROLES.slice(0, -1).includes(value.runtimeRole)) throw new Error(`Unsupported runtime role: ${value.runtimeRole}.`);
  if ((value.channel === 'npm') !== (value.runtimeRole === 'host')) throw new Error('npm installation origin must use the host runtime role.');
  if ((value.channel === 'development') !== (value.runtimeRole === 'development')) throw new Error('Development installation origin must use the development runtime role.');
  for (const field of ['package', 'version', 'protocolIdentity', 'installUnit', 'ownershipIdentity']) text(value[field], field);
  for (const field of ['applicationPayloadDigest', 'sourceCommit', 'sourceTag']) text(value[field], field, { nullable: true });
  if (value.package !== '@buildr-ai/buildr') throw new Error(`Unexpected installation package: ${value.package}.`);
  if (value.protocolIdentity !== BUILDR_PROTOCOL_IDENTITY) throw new Error(`Unexpected Buildr protocol identity: ${value.protocolIdentity}.`);
  if (value.applicationPayloadDigest !== null && !/^sha256-[a-f0-9]{64}$/.test(value.applicationPayloadDigest)) throw new Error('Installation application payload digest is invalid.');
  if (value.sourceCommit !== null && !/^[a-f0-9]{40}$/.test(value.sourceCommit)) throw new Error('Installation source commit is invalid.');
  if (!/^sha256-[a-f0-9]{64}$/.test(value.ownershipIdentity)) throw new Error('Installation ownership identity is invalid.');
  const expectedOwnership = installationOwnershipIdentity(value);
  if (value.ownershipIdentity !== expectedOwnership) throw new Error(`Installation ownership identity mismatch: expected ${expectedOwnership}, received ${value.ownershipIdentity}.`);
  return Object.freeze({ ...value });
}

export function validateFormalInstallationOriginPayloadBinding(value: any, payloadManifest: any) {
  const origin = validateInstallationOrigin(value);
  if (origin.channel === 'development') return origin;
  if (origin.channel !== 'npm') throw new Error(`Unsupported formal installation channel: ${origin.channel}.`);
  if (!payloadManifest) throw new Error(`Formal ${origin.channel} installation origin requires an application payload manifest.`);
  const manifest = validateApplicationPayloadManifest(payloadManifest);
  const bindings = [
    ['package', origin.package, manifest.packageName],
    ['version', origin.version, manifest.buildrVersion],
    ['protocolIdentity', origin.protocolIdentity, manifest.protocolIdentity],
    ['applicationPayloadDigest', origin.applicationPayloadDigest, manifest.applicationPayloadDigest],
    ['sourceCommit', origin.sourceCommit, manifest.sourceCommit],
  ];
  const mismatches = bindings
    .filter(([, receipt, payload]: any) => receipt !== payload)
    .map(([field, receipt, payload]: any) => `${field}: receipt=${receipt ?? '<null>'}, payload=${payload ?? '<null>'}`);
  if (mismatches.length) throw new Error(`Formal installation origin does not match the application payload manifest (${mismatches.join('; ')}).`);
  return origin;
}

function readJson(file: any) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read installation origin ${file}: ${error.message}`);
  }
}

function git(root: any, args: any) {
  const result = spawnCommandSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function developmentOrigin(productRoot: any, metadata: any) {
  const gitRoot = git(productRoot, ['rev-parse', '--show-toplevel']);
  if (!gitRoot) return null;
  let canonicalGitRoot;
  let canonicalProductRoot;
  try {
    canonicalGitRoot = fs.realpathSync(gitRoot);
    canonicalProductRoot = fs.realpathSync(productRoot);
  } catch { return null; }
  const expected = path.join(canonicalGitRoot, 'projects', 'product', 'services', 'buildr');
  if (!sameFilesystemPath(canonicalProductRoot, expected)) return null;
  const sourceCommit = git(productRoot, ['rev-parse', 'HEAD']);
  if (!sourceCommit) return null;
  const base = {
    schemaVersion: INSTALLATION_ORIGIN_SCHEMA,
    channel: 'development',
    runtimeRole: 'development',
    package: metadata.name,
    version: metadata.version,
    protocolIdentity: BUILDR_PROTOCOL_IDENTITY,
    applicationPayloadDigest: null,
    sourceCommit,
    sourceTag: null,
    installUnit: canonicalProductRoot,
  };
  return {
    ...createInstallationOrigin(base),
    sourceRoot: canonicalProductRoot,
    gitRoot: canonicalGitRoot,
    dirty: Boolean(git(productRoot, ['status', '--porcelain=v1', '--untracked-files=normal'])),
  };
}

function unknownOrigin(metadata: any, reasons: any) {
  return Object.freeze({
    schemaVersion: INSTALLATION_ORIGIN_SCHEMA,
    channel: 'unknown',
    runtimeRole: 'unknown',
    package: metadata?.name || null,
    version: metadata?.version || null,
    protocolIdentity: BUILDR_PROTOCOL_IDENTITY,
    applicationPayloadDigest: null,
    sourceCommit: null,
    sourceTag: null,
    installUnit: null,
    ownershipIdentity: null,
    blockingReasons: reasons,
  });
}

function receiptCandidates(productRoot: any, options: any = {}) {
  const candidates: any[] = [];
  const explicit = options.env?.BUILDR_INSTALLATION_IDENTITY ?? process.env.BUILDR_INSTALLATION_IDENTITY;
  if (explicit) candidates.push({ file: path.resolve(explicit), authority: 'explicit-environment' });
  if (options.payloadRoot) candidates.push({ file: path.join(path.resolve(options.payloadRoot), 'installation-origin.json'), authority: 'payload-envelope' });
  candidates.push({ file: path.join(productRoot, 'installation-origin.json'), authority: 'package-root' });
  return candidates.filter((item: any, index: any, all: any) => all.findIndex((candidate: any) => candidate.file === item.file) === index);
}

export function readCurrentInstallationOrigin(productRoot: any, options: any = {}) {
  const root = path.resolve(productRoot);
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { metadata = null; }
  if (metadata?.name !== '@buildr-ai/buildr' || !metadata?.version) return unknownOrigin(metadata, ['当前 product root 没有有效的 @buildr-ai/buildr package identity。']);
  const invalid: any[] = [];
  for (const candidate of receiptCandidates(root, options)) {
    const raw = readJson(candidate.file);
    if (!raw) continue;
    try {
      const value = validateInstallationOrigin(raw);
      if (value.channel === 'npm') {
        const payloadManifest = options.payloadManifest
          ? validateApplicationPayloadManifest(options.payloadManifest)
          : readApplicationPayloadManifest(options.payloadRoot || path.dirname(candidate.file));
        validateFormalInstallationOriginPayloadBinding(value, payloadManifest);
      }
      if (value.version !== metadata.version) throw new Error(`receipt version ${value.version} differs from package version ${metadata.version}.`);
      return Object.freeze({ ...value, receipt: { authority: candidate.authority, file: candidate.file } });
    } catch (error: any) {
      invalid.push(`${candidate.authority}: ${error.message}`);
    }
  }
  if (invalid.length) return unknownOrigin(metadata, invalid);
  const development = developmentOrigin(root, metadata);
  if (development) return Object.freeze({ ...development, receipt: { authority: 'git-worktree', file: null } });
  return unknownOrigin(metadata, ['没有 installation-origin receipt，且 product root 不是 canonical Buildr Service Git checkout。']);
}

export function runtimeIdentityForOrigin(origin: any, options: any = {}) {
  const executable = path.resolve(options.executable || process.execPath);
  const role = RUNTIME_ROLES.includes(origin?.runtimeRole) ? origin.runtimeRole : 'unknown';
  return Object.freeze({
    role,
    executable,
    version: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    identity: sha256(JSON.stringify({ role, executable, version: process.versions.node, ownershipIdentity: origin?.ownershipIdentity || null })),
  });
}
