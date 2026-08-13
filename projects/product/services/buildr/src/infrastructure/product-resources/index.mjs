import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const APPLICATION_PAYLOAD_SCHEMA_VERSION = 'buildr.application-payload/v1';
export const APPLICATION_PAYLOAD_MANIFEST = 'application-payload.json';
export const APPLICATION_PAYLOAD_PROTOCOL_IDENTITY = 'buildr.web-protocol/v1';

const MANIFEST_FIELDS = new Set([
  'schemaVersion',
  'packageName',
  'buildrVersion',
  'protocolIdentity',
  'sourceCommit',
  'enginesNode',
  'productionDependencies',
  'files',
  'applicationPayloadDigest',
]);
const FILE_FIELDS = new Set(['path', 'mode', 'size', 'sha256']);
const DEPENDENCY_FIELDS = new Set(['name', 'version', 'license', 'licensePath']);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertClosedObject(value, fields, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((field) => !fields.has(field));
  if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.sort().join(', ')}`);
}

function normalizeRelativePath(value, label = 'payload resource path') {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty POSIX relative path.`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error(`${label} must stay inside the application payload: ${value}`);
  }
  return normalized;
}

function canonicalManifestIdentity(manifest) {
  const { applicationPayloadDigest: ignored, ...identity } = manifest;
  return `sha256-${sha256(Buffer.from(JSON.stringify(identity), 'utf8'))}`;
}

export function validateApplicationPayloadManifest(value) {
  assertClosedObject(value, MANIFEST_FIELDS, 'application payload manifest');
  if (value.schemaVersion !== APPLICATION_PAYLOAD_SCHEMA_VERSION) throw new Error(`application payload schema must be ${APPLICATION_PAYLOAD_SCHEMA_VERSION}.`);
  if (value.packageName !== '@buildr-ai/buildr') throw new Error('application payload packageName must be @buildr-ai/buildr.');
  if (typeof value.buildrVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.buildrVersion)) throw new Error('application payload buildrVersion is invalid.');
  if (value.protocolIdentity !== APPLICATION_PAYLOAD_PROTOCOL_IDENTITY) throw new Error(`application payload protocolIdentity must be ${APPLICATION_PAYLOAD_PROTOCOL_IDENTITY}.`);
  if (typeof value.sourceCommit !== 'string' || !/^[a-f0-9]{40,64}$/.test(value.sourceCommit)) throw new Error('application payload sourceCommit must be a full hexadecimal commit identity.');
  if (typeof value.enginesNode !== 'string' || !value.enginesNode.trim()) throw new Error('application payload enginesNode is required.');
  if (!Array.isArray(value.productionDependencies)) throw new Error('application payload productionDependencies must be an array.');
  let previousDependency = '';
  for (const dependency of value.productionDependencies) {
    assertClosedObject(dependency, DEPENDENCY_FIELDS, 'application payload dependency');
    if (typeof dependency.name !== 'string' || typeof dependency.version !== 'string' || typeof dependency.license !== 'string') throw new Error('application payload dependency identity is incomplete.');
    if (dependency.name <= previousDependency) throw new Error('application payload productionDependencies must be uniquely sorted by name.');
    previousDependency = dependency.name;
    normalizeRelativePath(dependency.licensePath, 'dependency licensePath');
  }
  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error('application payload files must be a non-empty array.');
  let previous = '';
  for (const entry of value.files) {
    assertClosedObject(entry, FILE_FIELDS, 'application payload file');
    const relative = normalizeRelativePath(entry.path, 'application payload file path');
    if (relative <= previous) throw new Error('application payload files must be uniquely sorted by path.');
    previous = relative;
    if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) throw new Error(`application payload file mode is invalid: ${relative}`);
    if (!Number.isInteger(entry.size) || entry.size < 0) throw new Error(`application payload file size is invalid: ${relative}`);
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`application payload file SHA-256 is invalid: ${relative}`);
  }
  const filePaths = new Set(value.files.map((entry) => entry.path));
  for (const required of [
    'runtime/buildr.cjs',
    'resources/runtime/read-worker.cjs',
    'resources/product/package.json',
    'resources/product/package/manifest.yml',
    'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
    'resources/product/src/interfaces/local-app/web-dist/index.html',
  ]) if (!filePaths.has(required)) throw new Error(`application payload required file is missing: ${required}`);
  for (const dependency of value.productionDependencies) if (!filePaths.has(dependency.licensePath)) throw new Error(`application payload dependency license is missing: ${dependency.name}`);
  const forbidden = [...filePaths].filter((candidate) => /(^|\/)launchers?(\/|$)|\.(?:app|pkg|msi|vbs|map)$/iu.test(candidate));
  const forbiddenRuntime = forbidden.filter((candidate) => !/^resources\/product\/package\/launchers\/assets\/Buildr\.(?:icns|ico)$/u.test(candidate));
  if (forbiddenRuntime.length) throw new Error(`application payload contains channel/development files: ${forbiddenRuntime.join(', ')}`);
  if (typeof value.applicationPayloadDigest !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value.applicationPayloadDigest)) throw new Error('applicationPayloadDigest is invalid.');
  if (canonicalManifestIdentity(value) !== value.applicationPayloadDigest) throw new Error('applicationPayloadDigest does not match the canonical manifest identity.');
  return value;
}

function sourceServiceRoot() {
  try {
    const moduleUrl = import.meta.url;
    if (typeof moduleUrl === 'string' && moduleUrl.startsWith('file:')) return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
  } catch {}
  const invoked = path.resolve(process.argv[1] || '');
  if (path.basename(invoked) === 'buildr.mjs' && path.basename(path.dirname(invoked)) === 'bin') return path.resolve(path.dirname(invoked), '..');
  return null;
}

function candidateInstalledRoots() {
  const roots = [];
  if (process.env.BUILDR_APPLICATION_PAYLOAD_ROOT) roots.push(path.resolve(process.env.BUILDR_APPLICATION_PAYLOAD_ROOT));
  const invoked = path.resolve(process.argv[1] || '');
  if (path.basename(path.dirname(invoked)) === 'runtime') roots.push(path.resolve(path.dirname(invoked), '..'));
  if (process.platform === 'darwin') {
    const executableDir = path.dirname(process.execPath);
    if (path.basename(executableDir) === 'MacOS') roots.push(path.resolve(executableDir, '../Resources'));
  }
  if (process.platform === 'win32') roots.push(path.join(path.dirname(process.execPath), 'resources'));
  const source = sourceServiceRoot();
  if (source) roots.push(source);
  return [...new Set(roots)];
}

export function resolveApplicationPayloadRoot({ required = false } = {}) {
  for (const root of candidateInstalledRoots()) {
    if (fs.statSync(path.join(root, APPLICATION_PAYLOAD_MANIFEST), { throwIfNoEntry: false })?.isFile()) return root;
  }
  if (required) throw new Error('Buildr application payload root is missing; runtime will not fall back to cwd, PATH, or another channel.');
  return null;
}

export function readApplicationPayloadManifest(root = resolveApplicationPayloadRoot({ required: true })) {
  const manifestPath = path.join(path.resolve(root), APPLICATION_PAYLOAD_MANIFEST);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Buildr application payload manifest is invalid at ${manifestPath}: ${error.message}`);
  }
  return validateApplicationPayloadManifest(value);
}

function layoutForRoot(root, requested = 'auto') {
  if (requested === 'frozen' || requested === 'installed') return requested;
  if (fs.statSync(path.join(root, 'resources'), { throwIfNoEntry: false })?.isDirectory()) return 'frozen';
  if (fs.statSync(path.join(root, 'payload'), { throwIfNoEntry: false })?.isDirectory()) return 'installed';
  throw new Error(`Buildr application payload resource directory is missing at ${root}.`);
}

function physicalPath(root, logicalPath, layout) {
  if (layout === 'installed' && logicalPath.startsWith('resources/')) return path.join(root, 'payload', logicalPath.slice('resources/'.length));
  return path.join(root, ...logicalPath.split('/'));
}

function verifyFile(root, manifest, entry, layout) {
  const file = physicalPath(root, entry.path, layout);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`application payload file is missing or not a regular file: ${entry.path}`);
  if (layout === 'frozen' && (stat.mode & 0o777) !== entry.mode) throw new Error(`application payload file mode mismatch: ${entry.path}`);
  const bytes = fs.readFileSync(file);
  if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error(`application payload file digest mismatch: ${entry.path}`);
  return file;
}

export function verifyApplicationPayload(root = resolveApplicationPayloadRoot({ required: true }), options = {}) {
  const resolvedRoot = path.resolve(root);
  const manifest = readApplicationPayloadManifest(resolvedRoot);
  const layout = layoutForRoot(resolvedRoot, options.layout);
  const readableOnly = options.readableOnly === true;
  for (const entry of manifest.files) {
    if (readableOnly && entry.path === 'runtime/buildr.cjs' && !fs.existsSync(physicalPath(resolvedRoot, entry.path, layout))) continue;
    verifyFile(resolvedRoot, manifest, entry, layout);
  }
  return { root: resolvedRoot, layout, manifest };
}

export function resolveProductResource(relative, options = {}) {
  const logical = normalizeRelativePath(relative);
  const payloadRoot = resolveApplicationPayloadRoot();
  if (!payloadRoot) {
    const source = sourceServiceRoot();
    if (!source) throw new Error(`Buildr development source root is unavailable for resource: ${logical}`);
    const fallback = normalizeRelativePath(options.developmentFallback || (logical.startsWith('product/') ? logical.slice('product/'.length) : logical));
    return path.join(source, ...fallback.split('/'));
  }
  const manifest = readApplicationPayloadManifest(payloadRoot);
  const entryPath = `resources/${logical}`;
  const entry = manifest.files.find((candidate) => candidate.path === entryPath);
  const layout = layoutForRoot(payloadRoot);
  if (!entry) {
    const descendants = manifest.files.filter((candidate) => candidate.path.startsWith(`${entryPath}/`));
    if (!descendants.length) throw new Error(`application payload resource is not declared: ${entryPath}`);
    if (options.verify !== false) for (const descendant of descendants) verifyFile(payloadRoot, manifest, descendant, layout);
    return physicalPath(payloadRoot, entryPath, layout);
  }
  return options.verify === false ? physicalPath(payloadRoot, entry.path, layout) : verifyFile(payloadRoot, manifest, entry, layout);
}

export function resolveProductRoot() {
  const payloadRoot = resolveApplicationPayloadRoot();
  if (payloadRoot) {
    const layout = layoutForRoot(payloadRoot);
    return layout === 'installed' ? path.join(payloadRoot, 'payload', 'product') : path.join(payloadRoot, 'resources', 'product');
  }
  const source = sourceServiceRoot();
  if (!source) throw new Error('Buildr product root is unavailable.');
  return source;
}

export function canonicalApplicationPayloadIdentity(manifest) {
  return canonicalManifestIdentity(manifest);
}
