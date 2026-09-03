#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { APPLICATION_PAYLOAD_MANIFEST, verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.ts';
import { assertGeneratedArtifactEntry } from '../build/generated-artifacts.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const releaseArtifactSchemaVersion: any = 'buildr.release-artifact/v1';
export const releaseArtifactManifestName: any = 'release-artifact.json';
export const releasePackMetadataName: any = 'npm-pack.json';
export const npmInstallationOriginSchemaVersion: any = 'buildr.installation-origin/v2';

function parsePackResult(stdout: any): any  {
  let payload: any;
  try {
    payload = JSON.parse(stdout);
  } catch (error: any) {
    throw new Error(`npm pack metadata is invalid: ${error.message}`);
  }
  if (!Array.isArray(payload) || payload.length !== 1) throw new Error('release artifact preparation must produce exactly one npm tarball');
  const [metadata]: any = payload;
  if (
    typeof metadata?.name !== 'string'
    || typeof metadata?.version !== 'string'
    || typeof metadata?.filename !== 'string'
    || path.basename(metadata.filename) !== metadata.filename
    || !Array.isArray(metadata?.files)
  ) throw new Error('npm pack metadata is missing package identity, filename, or inventory');
  return metadata;
}

function digest(buffer: any, algorithm: any, encoding: any = 'hex'): any  {
  return crypto.createHash(algorithm).update(buffer).digest(encoding);
}

function normalizedInventory(files: any): any  {
  return files.map((entry: any) => ({
    path: entry.path,
    size: entry.size,
    ...(Number.isInteger(entry.mode) ? { mode: entry.mode } : {}),
  })).sort((left: any, right: any) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function copyTree(source: any, target: any): any  {
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((left: any, right: any) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`npm staging refuses payload symlink: ${path.join(source, entry.name)}`);
    const from: any = path.join(source, entry.name);
    const to: any = path.join(target, entry.name);
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

function ownershipIdentity(origin: any): any  {
  return `sha256-${digest(Buffer.from(JSON.stringify(origin), 'utf8'), 'sha256')}`;
}

export function createNpmInstallationOrigin(payloadManifest: any): any  {
  const origin: any = {
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

function stagingPackageJson(payloadManifest: any, productMetadata: any): any  {
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
    exports: {
      './test-context': {
        types: './package/targets/test-context/index.d.ts',
        import: './test-context.mjs',
        default: './test-context.mjs',
      },
      './package.json': './package.json',
    },
    bin: { buildr: 'bin/buildr.mjs' },
    scripts: { postinstall: 'node scripts/postinstall.mjs' },
    files: [
      'LICENSE',
      'README.md',
      'application-payload.json',
      'installation-origin.json',
      'bin/buildr.mjs',
      'test-context.mjs',
      'package/targets/test-context/',
      'scripts/postinstall.mjs',
      'runtime/buildr.cjs',
      'payload/',
    ],
    engines: { node: payloadManifest.enginesNode },
  };
}

export function npmBinSource(): any  {
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

export function npmPostinstallSource(): any  {
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

export function createNpmPackStaging(payloadRoot: any, destination: any, options: any = {}): any  {
  const frozen: any = verifyApplicationPayload(path.resolve(payloadRoot), { layout: 'frozen' });
  if (!options.testContextRoot) throw new Error('npm pack staging requires explicit Test Context generated output.');
  const generatedArtifactManifest: any = JSON.parse(fs.readFileSync(path.join(frozen.root, 'resources/build/generated-artifacts.json'), 'utf8'));
  const testContextRoot: any = path.resolve(options.testContextRoot);
  assertGeneratedArtifactEntry(generatedArtifactManifest, 'test-context', testContextRoot);
  const root: any = path.resolve(destination);
  if (fs.existsSync(root)) throw new Error(`npm pack staging already exists: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  try {
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(root, 'payload'), { recursive: true });
    fs.mkdirSync(path.join(root, 'package/targets/test-context'), { recursive: true });
    fs.copyFileSync(path.join(frozen.root, APPLICATION_PAYLOAD_MANIFEST), path.join(root, APPLICATION_PAYLOAD_MANIFEST));
    fs.copyFileSync(path.join(frozen.root, 'runtime/buildr.cjs'), path.join(root, 'runtime/buildr.cjs'));
    copyTree(path.join(frozen.root, 'resources'), path.join(root, 'payload'));
    const productMetadata: any = JSON.parse(fs.readFileSync(path.join(root, 'payload/product/package.json'), 'utf8'));
    fs.copyFileSync(path.join(root, 'payload/product/LICENSE'), path.join(root, 'LICENSE'));
    fs.copyFileSync(path.join(root, 'payload/product/README.md'), path.join(root, 'README.md'));
    fs.copyFileSync(path.join(serviceRoot, 'test-context.mjs'), path.join(root, 'test-context.mjs'));
    copyTree(testContextRoot, path.join(root, 'package/targets/test-context'));
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(stagingPackageJson(frozen.manifest, productMetadata), null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(root, 'installation-origin.json'), `${JSON.stringify(createNpmInstallationOrigin(frozen.manifest), null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(root, 'bin/buildr.mjs'), npmBinSource(), { encoding: 'utf8', mode: 0o755 });
    fs.writeFileSync(path.join(root, 'scripts/postinstall.mjs'), npmPostinstallSource(), { encoding: 'utf8', mode: 0o755 });
    verifyApplicationPayload(root, { layout: 'installed' });
    return { root, manifest: frozen.manifest };
  } catch (error: any) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function assertNpmTarballInventory(inventory: any): any  {
  const paths: any = inventory.map((entry: any) => entry.path).sort();
  const required: any[] = [
    'application-payload.json',
    'installation-origin.json',
    'scripts/postinstall.mjs',
    'test-context.mjs',
    'package/targets/test-context/index.js',
    'package/targets/test-context/index.d.ts',
    'runtime/buildr.cjs',
    'payload/runtime/read-worker.cjs',
    'payload/product/package.json',
    'payload/product/resources/manifest.yml',
    'payload/product/resources/installation/launcher/Buildr.icns',
    'payload/product/resources/installation/launcher/Buildr.ico',
    'payload/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
    'payload/product/web-dist/index.html',
    'payload/licenses/dependencies/ajv-LICENSE',
    'payload/licenses/dependencies/yaml-LICENSE',
  ];
  for (const requiredPath of required) if (!paths.includes(requiredPath)) throw new Error(`npm tarball inventory is missing: ${requiredPath}`);
  const forbidden: any = paths.filter((value: any) => (
    /(^|\/)(?:node|node\.exe|npm|npm\.cmd|npx|npx\.cmd)$/iu.test(value)
    || /^payload\/product\/package\/launchers\//u.test(value)
    || /\.(?:app|pkg|msi|vbs|map)$/iu.test(value)
    || /(^|\/)(?:test|tests|fixtures?)(\/|$)/iu.test(value)
    || /(^|\/)buildr-web(\/|$)/iu.test(value)
    || /(^|\/)(?:vite\.config|node_modules)(?:\.|\/|$)/iu.test(value)
    || (value.endsWith('.ts') && !value.endsWith('.d.ts'))
  ));
  if (forbidden.length) throw new Error(`npm tarball inventory contains platform/development content: ${forbidden.join(', ')}`);
  return inventory;
}

export function createReleaseArtifact(payloadRoot: any, destination: any, options: any = {}): any  {
  const npmExecutable: any = options.npmExecutable ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  fs.mkdirSync(destination, { recursive: true });
  const stagingBase: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-pack-'));
  const stagingRoot: any = path.join(stagingBase, 'package');
  try {
    const staging: any = createNpmPackStaging(payloadRoot, stagingRoot, { testContextRoot: options.testContextRoot });
    const result: any = spawnCommandSync(npmExecutable, ['pack', stagingRoot, '--ignore-scripts', '--pack-destination', destination, '--json'], {
      cwd: stagingRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: path.join(stagingBase, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    if (result.status !== 0) throw new Error(`npm pack failed with exit ${result.status}: ${(result.stderr || '').trim()}`);

    const metadata: any = parsePackResult(result.stdout);
    assertNpmTarballInventory(metadata.files);
    const tarball: any = path.join(destination, metadata.filename);
    if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`npm pack did not create expected tarball: ${tarball}`);
    const buffer: any = fs.readFileSync(tarball);
    const integrity: any = `sha512-${digest(buffer, 'sha512', 'base64')}`;
    if (metadata.integrity && metadata.integrity !== integrity) throw new Error('npm pack integrity does not match the generated tarball bytes');

    const packMetadataPath: any = path.join(destination, releasePackMetadataName);
    fs.writeFileSync(packMetadataPath, `${result.stdout.trim()}\n`, 'utf8');
    const generatedArtifacts: any = JSON.parse(fs.readFileSync(path.join(payloadRoot, 'resources/build/generated-artifacts.json'), 'utf8'));
    const manifest: any = {
      schemaVersion: releaseArtifactSchemaVersion,
      packageName: metadata.name,
      version: metadata.version,
      filename: metadata.filename,
      size: buffer.length,
      sha256: digest(buffer, 'sha256'),
      integrity,
      applicationPayloadDigest: staging.manifest.applicationPayloadDigest,
      generatedArtifactIdentity: generatedArtifacts.identity,
      protocolIdentity: staging.manifest.protocolIdentity,
      sourceCommit: staging.manifest.sourceCommit,
      enginesNode: staging.manifest.enginesNode,
      packMetadata: releasePackMetadataName,
      inventory: normalizedInventory(metadata.files),
    };
    const manifestPath: any = path.join(destination, releaseArtifactManifestName);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { manifest, manifestPath, packMetadataPath, tarball };
  } finally {
    fs.rmSync(stagingBase, { recursive: true, force: true });
  }
}

export function readReleaseArtifact(manifestValue: any, expected: any = {}): any  {
  const manifestPath: any = path.resolve(manifestValue);
  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error: any) {
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
    || !/^sha256-[a-f0-9]{64}$/.test(manifest?.generatedArtifactIdentity || '')
    || manifest?.protocolIdentity !== 'buildr.web-protocol/v1'
    || !/^[a-f0-9]{40,64}$/.test(manifest?.sourceCommit || '')
    || typeof manifest?.enginesNode !== 'string'
    || !Array.isArray(manifest?.inventory)
  ) throw new Error('release artifact manifest does not satisfy buildr.release-artifact/v1');
  if (expected.packageName && manifest.packageName !== expected.packageName) throw new Error(`release artifact package ${manifest.packageName} does not match ${expected.packageName}`);
  if (expected.version && manifest.version !== expected.version) throw new Error(`release artifact version ${manifest.version} does not match ${expected.version}`);
  if (expected.applicationPayloadDigest && manifest.applicationPayloadDigest !== expected.applicationPayloadDigest) throw new Error('release artifact application payload digest does not match expected candidate');

  const tarball: any = path.join(path.dirname(manifestPath), manifest.filename);
  if (!fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) throw new Error(`release artifact tarball is missing: ${tarball}`);
  const buffer: any = fs.readFileSync(tarball);
  if (buffer.length !== manifest.size) throw new Error('release artifact tarball size does not match manifest');
  if (digest(buffer, 'sha256') !== manifest.sha256) throw new Error('release artifact tarball SHA-256 does not match manifest');
  if (`sha512-${digest(buffer, 'sha512', 'base64')}` !== manifest.integrity) throw new Error('release artifact tarball integrity does not match manifest');
  assertNpmTarballInventory(manifest.inventory);
  return { manifest, manifestPath, tarball };
}

function appendGitHubOutput(artifact: any): any  {
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

function parseArgs(argv: any): any  {
  const options: any = {};
  for (let index: any = 2; index < argv.length; index += 1) {
    const name: any = argv[index];
    if (!name.startsWith('--')) throw new Error(`Unsupported release artifact argument: ${name}`);
    const value: any = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  if (!options.payload || !options.output || !options['test-context']) throw new Error('Usage: release-artifact.ts --payload <frozen-payload-dir> --test-context <generated-dir> --output <destination>');
  return options;
}

function main(): any  {
  const options: any = parseArgs(process.argv);
  const artifact: any = createReleaseArtifact(path.resolve(options.payload), path.resolve(options.output), { testContextRoot: path.resolve(options['test-context']) });
  appendGitHubOutput(artifact);
  process.stdout.write(`${JSON.stringify(artifact.manifest, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
