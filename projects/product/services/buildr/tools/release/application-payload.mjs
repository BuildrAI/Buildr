#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  APPLICATION_PAYLOAD_MANIFEST,
  APPLICATION_PAYLOAD_PROTOCOL_IDENTITY,
  APPLICATION_PAYLOAD_SCHEMA_VERSION,
  canonicalApplicationPayloadIdentity,
  validateApplicationPayloadManifest,
  verifyApplicationPayload,
} from '../../src/infrastructure/product-resources/index.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAIN_ENTRY = path.join(serviceRoot, 'tools/release/application-payload-entry.mjs');
const WORKER_ENTRY = path.join(serviceRoot, 'src/interfaces/local-app/http/read-worker.mjs');
const RESOURCE_SOURCES = Object.freeze([
  ['resources', 'product/resources', { exclude: new Set(['installation']) }],
  ['resources/installation/launcher', 'product/resources/installation/launcher', { include: new Set(['Buildr.icns', 'Buildr.ico']) }],
  ['package/targets/runtime', 'product/package/targets/runtime'],
  ['docs', 'product/docs', { include: new Set(['bootstrap-guide.md']) }],
  ['src/infrastructure/sqlite/migrations', 'product/src/infrastructure/sqlite/migrations'],
  ['web-dist', 'product/web-dist'],
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  const command = argv[2];
  const options = {};
  for (let index = 3; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith('--')) throw new Error(`Unsupported argument: ${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function assertDestination(output) {
  const resolved = path.resolve(output || '');
  if (!output || resolved === path.parse(resolved).root || resolved === serviceRoot) throw new Error('application payload --output must be a dedicated directory.');
  return resolved;
}

function copyFile(source, target, mode = null) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, mode ?? (fs.statSync(source).mode & 0o777));
}

function copyTree(sourceRoot, targetRoot, options = {}, relative = '') {
  const source = relative ? path.join(sourceRoot, relative) : sourceRoot;
  const entries = fs.readdirSync(source, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (!relative && options.exclude?.has(entry.name)) continue;
    if (!relative && options.include && !options.include.has(entry.name)) continue;
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`application payload input must not be a symlink: ${path.relative(serviceRoot, path.join(sourceRoot, childRelative))}`);
    if (entry.isDirectory()) copyTree(sourceRoot, targetRoot, options, childRelative);
    else if (entry.isFile()) copyFile(path.join(sourceRoot, childRelative), path.join(targetRoot, childRelative));
    else throw new Error(`application payload input must be a regular file: ${path.relative(serviceRoot, path.join(sourceRoot, childRelative))}`);
  }
}

function fileInventory(root, relative = '') {
  const current = relative ? path.join(root, relative) : root;
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const child = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`application payload output must not contain symlinks: ${child}`);
    if (entry.isDirectory()) files.push(...fileInventory(root, child));
    else if (entry.isFile()) {
      const file = path.join(root, child);
      const bytes = fs.readFileSync(file);
      files.push({ path: child.split(path.sep).join('/'), mode: fs.statSync(file).mode & 0o777, size: bytes.length, sha256: sha256(bytes) });
    } else throw new Error(`application payload output must contain only files and directories: ${child}`);
  }
  return files;
}

function packageMetadata() {
  return JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
}

function runtimePackageMetadata(metadata) {
  return {
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    license: metadata.license,
    repository: metadata.repository,
    homepage: metadata.homepage,
    bugs: metadata.bugs,
    keywords: metadata.keywords,
    publishConfig: metadata.publishConfig,
    type: metadata.type,
    engines: metadata.engines,
    dependencies: Object.fromEntries(Object.entries(metadata.dependencies || {}).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function dependencyInventory(resourceRoot, metadata) {
  return Object.keys(metadata.dependencies || {}).sort().map((name) => {
    const dependencyRoot = path.join(serviceRoot, 'node_modules', name);
    const dependency = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'package.json'), 'utf8'));
    const licenseName = fs.readdirSync(dependencyRoot).sort().find((candidate) => /^licen[sc]e(?:\.|$)/iu.test(candidate));
    if (!licenseName) throw new Error(`production dependency license is missing: ${name}`);
    const target = `licenses/dependencies/${name.replaceAll('/', '__')}-LICENSE`;
    copyFile(path.join(dependencyRoot, licenseName), path.join(resourceRoot, ...target.split('/')), 0o644);
    return { name, version: dependency.version, license: dependency.license, licensePath: `resources/${target}` };
  });
}

async function buildApplicationPayload(output, sourceCommit) {
  if (!/^[a-f0-9]{40,64}$/.test(sourceCommit || '')) throw new Error('--source-commit must be a full hexadecimal commit identity.');
  const { buildSync, formatMessagesSync } = await import('esbuild');
  const destination = assertDestination(output);
  if (fs.existsSync(destination)) throw new Error(`application payload output already exists: ${destination}`);
  fs.mkdirSync(path.join(destination, 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(destination, 'resources'), { recursive: true });
  try {
    const bundle = buildSync({
      absWorkingDir: serviceRoot,
      entryPoints: {
        'runtime/buildr': MAIN_ENTRY,
        'resources/runtime/read-worker': WORKER_ENTRY,
      },
      outdir: destination,
      outExtension: { '.js': '.cjs' },
      bundle: true,
      splitting: false,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      external: ['node:*'],
      legalComments: 'none',
      sourcemap: false,
      metafile: true,
      charset: 'utf8',
      logLevel: 'silent',
    });
    if (bundle.warnings.length) {
      const warnings = formatMessagesSync(bundle.warnings, { kind: 'warning', color: false });
      throw new Error(`application payload bundle emitted warnings:\n${warnings.join('\n')}`);
    }

    const resourceRoot = path.join(destination, 'resources');
    for (const [source, target, options] of RESOURCE_SOURCES) copyTree(path.join(serviceRoot, source), path.join(resourceRoot, target), options);
    copyFile(path.join(serviceRoot, 'LICENSE'), path.join(resourceRoot, 'product/LICENSE'), 0o644);
    copyFile(path.join(serviceRoot, 'README.md'), path.join(resourceRoot, 'product/README.md'), 0o644);
    const metadata = packageMetadata();
    fs.writeFileSync(path.join(resourceRoot, 'product/package.json'), `${JSON.stringify(runtimePackageMetadata(metadata), null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
    const productionDependencies = dependencyInventory(resourceRoot, metadata);
    const files = fileInventory(destination)
      .filter((entry) => entry.path !== APPLICATION_PAYLOAD_MANIFEST)
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const manifest = {
      schemaVersion: APPLICATION_PAYLOAD_SCHEMA_VERSION,
      packageName: metadata.name,
      buildrVersion: metadata.version,
      protocolIdentity: APPLICATION_PAYLOAD_PROTOCOL_IDENTITY,
      sourceCommit,
      enginesNode: metadata.engines.node,
      productionDependencies,
      files,
    };
    manifest.applicationPayloadDigest = canonicalApplicationPayloadIdentity(manifest);
    validateApplicationPayloadManifest(manifest);
    fs.writeFileSync(path.join(destination, APPLICATION_PAYLOAD_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
    verifyApplicationPayload(destination, { layout: 'frozen' });
    return { root: destination, manifest };
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

function appendGitHubOutput(result) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `payload_root=${result.root}`,
    `payload_manifest=${path.join(result.root, APPLICATION_PAYLOAD_MANIFEST)}`,
    `application_payload_digest=${result.manifest.applicationPayloadDigest}`,
    '',
  ].join('\n'));
}

export { buildApplicationPayload, verifyApplicationPayload };

async function main() {
  const { command, options } = parseArgs(process.argv);
  if (command === 'build') {
    const result = await buildApplicationPayload(options.output, options['source-commit']);
    appendGitHubOutput(result);
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    return;
  }
  if (command === 'verify') {
    const root = assertDestination(options.payload);
    const result = verifyApplicationPayload(root, { layout: options.layout || 'auto', readableOnly: options['readable-only'] === 'true' });
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    return;
  }
  throw new Error('Usage: application-payload.mjs build --output <dir> --source-commit <sha> | verify --payload <dir> [--layout frozen|installed]');
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
