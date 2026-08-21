#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { APPLICATION_PAYLOAD_MANIFEST, verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const releaseArtifactSchemaVersion = 'buildr.release-artifact/v1';
export const releaseArtifactManifestName = 'release-artifact.json';
export const releasePackMetadataName = 'npm-pack.json';
export const npmInstallationOriginSchemaVersion = 'buildr.installation-origin/v2';

function parsePackResult(stdout) {
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`npm pack metadata is invalid: ${error.message}`);
  }
  if (!Array.isArray(payload) || payload.length !== 1) throw new Error('release artifact preparation must produce exactly one npm tarball');
  const [metadata] = payload;
  if (
    typeof metadata?.name !== 'string'
    || typeof metadata?.version !== 'string'
    || typeof metadata?.filename !== 'string'
    || path.basename(metadata.filename) !== metadata.filename
    || !Array.isArray(metadata?.files)
  ) throw new Error('npm pack metadata is missing package identity, filename, or inventory');
  return metadata;
}

function digest(buffer, algorithm, encoding = 'hex') {
  return crypto.createHash(algorithm).update(buffer).digest(encoding);
}

function normalizedInventory(files) {
  return files.map((entry) => ({
    path: entry.path,
    size: entry.size,
    ...(Number.isInteger(entry.mode) ? { mode: entry.mode } : {}),
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function copyTree(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`npm staging refuses payload symlink: ${path.join(source, entry.name)}`);
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(to, fs.statSync(from).mode & 0o777);
    } else throw new Error(`npm staging accepts only regular payload files: ${from}`);
  }
}

function ownershipIdentity(origin) {
  return `sha256-${digest(Buffer.from(JSON.stringify(origin), 'utf8'), 'sha256')}`;
}

export function createNpmInstallationOrigin(payloadManifest) {
  const origin = {
    schemaVersion: npmInstallationOriginSchemaVersion,
    channel: 'npm',
    runtimeRole: 'host',
    package: payloadManifest.packageName,
    version: payloadManifest.buildrVersion,
    protocolIdentity: payloadManifest.protocolIdentity,
    applicationPayloadDigest: payloadManifest.applicationPayloadDigest,
    sourceCommit: payloadManifest.sourceCommit,
    sourceTag: null,
    installUnit: `${payloadManifest.packageName}@${payloadManifest.buildrVersion}`,
  };
  return { ...origin, ownershipIdentity: ownershipIdentity(origin) };
}

function stagingPackageJson(payloadManifest, productMetadata) {
  return {
    name: payloadManifest.packageName,
    version: payloadManifest.buildrVersion,
    description: productMetadata.description,
    license: productMetadata.license,
    repository: productMetadata.repository,
    homepage: productMetadata.homepage,
    bugs: productMetadata.bugs,
    keywords: productMetadata.keywords,
    publishConfig: productMetadata.publishConfig,
    type: 'module',
    bin: { buildr: 'bin/buildr.mjs' },
    scripts: { postinstall: 'node scripts/postinstall.mjs' },
    files: [
      'LICENSE',
      'README.md',
      'application-payload.json',
      'installation-origin.json',
      'bin/buildr.mjs',
      'scripts/postinstall.mjs',
      'runtime/buildr.cjs',
      'payload/',
    ],
    engines: { node: payloadManifest.enginesNode },
  };
}

export function npmBinSource() {
  return `#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 15) {
  console.error('Buildr requires a host Node matching >=24.15.0 <25; it will not download or select another Node runtime.');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.BUILDR_APPLICATION_PAYLOAD_ROOT = root;
process.env.BUILDR_NPM_ENTRY_PATH = fileURLToPath(import.meta.url);
await import(pathToFileURL(path.join(root, 'runtime', 'buildr.cjs')).href);
`;
}

export function npmPostinstallSource() {
  return `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'bin', 'buildr.mjs');
const result = spawnSync(process.execPath, [entry, '__internal', 'enroll-npm-installation'], {
  cwd: root,
  env: { ...process.env, BUILDR_INTERNAL_PRODUCT_REENTRY: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
`;
}

export function createNpmPackStaging(payloadRoot, destination) {
  const frozen = verifyApplicationPayload(path.resolve(payloadRoot), { layout: 'frozen' });
  const root = path.resolve(destination);
  if (fs.existsSync(root)) throw new Error(`npm pack staging already exists: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  try {
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(root, 'payload'), { recursive: true });
    fs.copyFileSync(path.join(frozen.root, APPLICATION_PAYLOAD_MANIFEST), path.join(root, APPLICATION_PAYLOAD_MANIFEST));
    fs.copyFileSync(path.join(frozen.root, 'runtime/buildr.cjs'), path.join(root, 'runtime/buildr.cjs'));
    copyTree(path.join(frozen.root, 'resources'), path.join(root, 'payload'));
    const productMetadata = JSON.parse(fs.readFileSync(path.join(root, 'payload/product/package.json'), 'utf8'));
    fs.copyFileSync(path.join(root, 'payload/product/LICENSE'), path.join(root, 'LICENSE'));
    fs.copyFileSync(path.join(root, 'payload/product/README.md'), path.join(root, 'README.md'));
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(stagingPackageJson(frozen.manifest, productMetadata), null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(root, 'installation-origin.json'), `${JSON.stringify(createNpmInstallationOrigin(frozen.manifest), null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(root, 'bin/buildr.mjs'), npmBinSource(), { encoding: 'utf8', mode: 0o755 });
    fs.writeFileSync(path.join(root, 'scripts/postinstall.mjs'), npmPostinstallSource(), { encoding: 'utf8', mode: 0o755 });
    verifyApplicationPayload(root, { layout: 'installed' });
    return { root, manifest: frozen.manifest };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function assertNpmTarballInventory(inventory) {
  const paths = inventory.map((entry) => entry.path).sort();
  const required = [
    'application-payload.json',
    'installation-origin.json',
    'scripts/postinstall.mjs',
    'runtime/buildr.cjs',
    'payload/runtime/read-worker.cjs',
    'payload/product/package.json',
    'payload/product/resources/manifest.yml',
    'payload/product/resources/installation/launcher/Buildr.icns',
    'payload/product/resources/installation/launcher/Buildr.ico',
    'payload/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
    'payload/product/web-dist/index.html',
    'payload/licenses/dependencies/yaml-LICENSE',
  ];
  for (const requiredPath of required) if (!paths.includes(requiredPath)) throw new Error(`npm tarball inventory is missing: ${requiredPath}`);
  const forbidden = paths.filter((value) => (
    /(^|\/)(?:node|node\.exe|npm|npm\.cmd|npx|npx\.cmd)$/iu.test(value)
    || /^payload\/product\/package\/launchers\//u.test(value)
    || /\.(?:app|pkg|msi|vbs|map)$/iu.test(value)
    || /(^|\/)(?:test|tests|fixtures?)(\/|$)/iu.test(value)
    || /(^|\/)buildr-web(\/|$)/iu.test(value)
    || /(^|\/)(?:vite\.config|node_modules)(?:\.|\/|$)/iu.test(value)
  ));
  if (forbidden.length) throw new Error(`npm tarball inventory contains platform/development content: ${forbidden.join(', ')}`);
  return inventory;
}

export function createReleaseArtifact(payloadRoot, destination, options = {}) {
  const npmExecutable = options.npmExecutable ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  fs.mkdirSync(destination, { recursive: true });
  const stagingBase = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-pack-'));
  const stagingRoot = path.join(stagingBase, 'package');
  try {
    const staging = createNpmPackStaging(payloadRoot, stagingRoot);
    const result = spawnCommandSync(npmExecutable, ['pack', stagingRoot, '--ignore-scripts', '--pack-destination', destination, '--json'], {
      cwd: stagingRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: path.join(stagingBase, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    if (result.status !== 0) throw new Error(`npm pack failed with exit ${result.status}: ${(result.stderr || '').trim()}`);

    const metadata = parsePackResult(result.stdout);
    assertNpmTarballInventory(metadata.files);
    const tarball = path.join(destination, metadata.filename);
    if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`npm pack did not create expected tarball: ${tarball}`);
    const buffer = fs.readFileSync(tarball);
    const integrity = `sha512-${digest(buffer, 'sha512', 'base64')}`;
    if (metadata.integrity && metadata.integrity !== integrity) throw new Error('npm pack integrity does not match the generated tarball bytes');

    const packMetadataPath = path.join(destination, releasePackMetadataName);
    fs.writeFileSync(packMetadataPath, `${result.stdout.trim()}\n`, 'utf8');
    const manifest = {
      schemaVersion: releaseArtifactSchemaVersion,
      packageName: metadata.name,
      version: metadata.version,
      filename: metadata.filename,
      size: buffer.length,
      sha256: digest(buffer, 'sha256'),
      integrity,
      applicationPayloadDigest: staging.manifest.applicationPayloadDigest,
      protocolIdentity: staging.manifest.protocolIdentity,
      sourceCommit: staging.manifest.sourceCommit,
      enginesNode: staging.manifest.enginesNode,
      packMetadata: releasePackMetadataName,
      inventory: normalizedInventory(metadata.files),
    };
    const manifestPath = path.join(destination, releaseArtifactManifestName);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { manifest, manifestPath, packMetadataPath, tarball };
  } finally {
    fs.rmSync(stagingBase, { recursive: true, force: true });
  }
}

export function readReleaseArtifact(manifestValue, expected = {}) {
  const manifestPath = path.resolve(manifestValue);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`release artifact manifest is invalid: ${error.message}`);
  }
  if (
    manifest?.schemaVersion !== releaseArtifactSchemaVersion
    || typeof manifest?.packageName !== 'string'
    || typeof manifest?.version !== 'string'
    || typeof manifest?.filename !== 'string'
    || path.basename(manifest.filename) !== manifest.filename
    || !Number.isInteger(manifest?.size)
    || !/^[a-f0-9]{64}$/.test(manifest?.sha256 || '')
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(manifest?.integrity || '')
    || !/^sha256-[a-f0-9]{64}$/.test(manifest?.applicationPayloadDigest || '')
    || manifest?.protocolIdentity !== 'buildr.web-protocol/v1'
    || !/^[a-f0-9]{40,64}$/.test(manifest?.sourceCommit || '')
    || typeof manifest?.enginesNode !== 'string'
    || !Array.isArray(manifest?.inventory)
  ) throw new Error('release artifact manifest does not satisfy buildr.release-artifact/v1');
  if (expected.packageName && manifest.packageName !== expected.packageName) throw new Error(`release artifact package ${manifest.packageName} does not match ${expected.packageName}`);
  if (expected.version && manifest.version !== expected.version) throw new Error(`release artifact version ${manifest.version} does not match ${expected.version}`);
  if (expected.applicationPayloadDigest && manifest.applicationPayloadDigest !== expected.applicationPayloadDigest) throw new Error('release artifact application payload digest does not match expected candidate');

  const tarball = path.join(path.dirname(manifestPath), manifest.filename);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`release artifact tarball is missing: ${tarball}`);
  const buffer = fs.readFileSync(tarball);
  if (buffer.length !== manifest.size) throw new Error('release artifact tarball size does not match manifest');
  if (digest(buffer, 'sha256') !== manifest.sha256) throw new Error('release artifact tarball SHA-256 does not match manifest');
  if (`sha512-${digest(buffer, 'sha512', 'base64')}` !== manifest.integrity) throw new Error('release artifact tarball integrity does not match manifest');
  assertNpmTarballInventory(manifest.inventory);
  return { manifest, manifestPath, tarball };
}

function appendGitHubOutput(artifact) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `tarball=${artifact.tarball}`,
    `manifest=${artifact.manifestPath}`,
    `pack_metadata=${artifact.packMetadataPath}`,
    `filename=${artifact.manifest.filename}`,
    `integrity=${artifact.manifest.integrity}`,
    `application_payload_digest=${artifact.manifest.applicationPayloadDigest}`,
    '',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith('--')) throw new Error(`Unsupported release artifact argument: ${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  if (!options.payload || !options.output) throw new Error('Usage: release-artifact.mjs --payload <frozen-payload-dir> --output <destination>');
  return options;
}

function main() {
  const options = parseArgs(process.argv);
  const artifact = createReleaseArtifact(path.resolve(options.payload), path.resolve(options.output));
  appendGitHubOutput(artifact);
  process.stdout.write(`${JSON.stringify(artifact.manifest, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
