/** Portable, byte-bound release inputs. This consumer never loads or prepares an SDK. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { containsCredentialMaterial } from '../../buildr/tools/release/release-authority.ts';
import { parsePackageCompatibility, type PackageCompatibility } from '../../buildr/tools/release/package-compatibility.ts';

export const PLUGIN_PACKAGE = '@buildr-ai/buildr-dsh-plugin';
export const PLUGIN_REGISTRY = 'https://registry.npmjs.org/';
export const CANDIDATE_SCHEMA = 'buildr.dsh-plugin-release-candidate/v1';
export const PLUGIN_SERVICE_PATH = 'projects/product/services/dsh-plugin';
export const SOURCE_SDK_MANIFEST = 'sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json';
export interface SourceSdkIdentity {
  baseline: { tag: string; commit: string; version: string };
  manifestSha256: string;
  patchSha256: string;
  contracts: Record<string, unknown>;
}
export interface ReleaseCandidate {
  schemaVersion: typeof CANDIDATE_SCHEMA;
  packageName: typeof PLUGIN_PACKAGE;
  version: string;
  sourceCommit: string;
  sourceTree: string;
  registry: typeof PLUGIN_REGISTRY;
  filename: string;
  size: number;
  sha256: string;
  integrity: string;
  npmTag: 'next' | 'latest';
  sourceSdk: SourceSdkIdentity;
  compatibility?: PackageCompatibility;
  fileCount: number;
  published: false;
}
const sha = (bytes: Buffer, algorithm: string, encoding: 'hex' | 'base64' = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const gitIdentity = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
function fail(reason: string): never { throw new Error(`dsh_release_candidate_invalid: ${reason}`); }
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
  return value as Record<string, any>;
}
function filename(value: unknown): string {
  if (typeof value !== 'string' || basename(value) !== value || /[\\/:]/.test(value) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/.test(value)) fail('unsafe tarball filename');
  return value;
}
function sdkIdentity(value: unknown): SourceSdkIdentity {
  const input = object(value), baseline = object(input.baseline);
  if (baseline.tag !== 'dsh-v0.2.0-rc.2' || baseline.commit !== '639ed015397290b3745d163aafe02ffee4aa3f84' || baseline.version !== '0.2.0-rc.2') fail('unexpected source SDK baseline');
  if (!digest.test(input.manifestSha256 ?? '') || !digest.test(input.patchSha256 ?? '')) fail('invalid source SDK digests');
  const contracts = object(input.contracts);
  return { baseline: { tag: baseline.tag, commit: baseline.commit, version: baseline.version }, manifestSha256: input.manifestSha256, patchSha256: input.patchSha256, contracts };
}
/** Bind transported claims to the reviewed source inputs without loading an SDK. */
export function sourceSdkIdentityFromFiles(manifestBytes: Buffer, patchBytes: Buffer): SourceSdkIdentity {
  const manifest = object(JSON.parse(manifestBytes.toString('utf8'))), api = object(manifest.api);
  if (manifest.schemaVersion !== 'buildr.dsh-source-patch/v2' || object(manifest.patch).path !== 'dsh-v0.2.0-rc.2-event-sources-settings.patch' || manifest.patch.sha256 !== sha(patchBytes, 'sha256')) fail('fixed source SDK patch identity mismatch');
  const recordContext = object(api.recordContext), recordContexts = object(api.recordContexts);
  if (!Array.isArray(api.slots) || recordContext.type !== 'TrajectoryRecordContext' || recordContexts.property !== 'TrajectorySnapshot.recordContexts' || recordContext.idEncoding !== "JSON.stringify(['trajectory-record', internalRecordId])" || !api.eventSources) fail('fixed source SDK contracts mismatch');
  return sdkIdentity({ baseline: manifest.upstream, manifestSha256: sha(manifestBytes, 'sha256'), patchSha256: sha(patchBytes, 'sha256'),
    contracts: { slots: api.slots, recordContext: recordContext.type, recordContexts: recordContexts.property, rawEventRefs: true, idEncoding: recordContext.idEncoding, eventSources: api.eventSources } });
}
export function parseReleaseCandidate(value: unknown): ReleaseCandidate {
  const input = object(value);
  if (containsCredentialMaterial(input)) fail('candidate cannot contain credentials');
  if (input.schemaVersion !== CANDIDATE_SCHEMA || input.packageName !== PLUGIN_PACKAGE || input.registry !== PLUGIN_REGISTRY || input.published !== false) fail('unexpected candidate schema, package or registry');
  if (!semver.test(input.version ?? '') || !gitIdentity.test(input.sourceCommit ?? '') || !gitIdentity.test(input.sourceTree ?? '')) fail('invalid version or source identity');
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > 128 * 1024 * 1024 || !digest.test(input.sha256 ?? '') || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(input.integrity ?? '')) fail('invalid byte identity');
  if (!Number.isSafeInteger(input.fileCount) || input.fileCount < 1 || input.npmTag !== (input.version.includes('-') ? 'next' : 'latest')) fail('invalid inventory or npm tag');
  if ('sdk' in input || 'tarball' in input) fail('candidate cannot depend on absolute build paths');
  return { schemaVersion: CANDIDATE_SCHEMA, packageName: PLUGIN_PACKAGE, version: input.version, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, registry: PLUGIN_REGISTRY,
    filename: filename(input.filename), size: input.size, sha256: input.sha256, integrity: input.integrity, npmTag: input.npmTag, sourceSdk: sdkIdentity(input.sourceSdk), ...(input.compatibility === undefined ? {} : { compatibility: parsePackageCompatibility(input.compatibility) }), fileCount: input.fileCount, published: false };
}
export function createReleaseCandidate(input: { version: string; sourceCommit: string; sourceTree: string; filename: string; bytes: Buffer; sourceSdk: SourceSdkIdentity; fileCount: number }): ReleaseCandidate {
  const candidate = parseReleaseCandidate({ schemaVersion: CANDIDATE_SCHEMA, packageName: PLUGIN_PACKAGE, registry: PLUGIN_REGISTRY, version: input.version, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree,
    filename: input.filename, size: input.bytes.length, sha256: sha(input.bytes, 'sha256'), integrity: `sha512-${sha(input.bytes, 'sha512', 'base64')}`,
    sourceSdk: input.sourceSdk, fileCount: input.fileCount, published: false, npmTag: input.version.includes('-') ? 'next' : 'latest' });
  const metadata = inspectPluginTarballContents(input.bytes, candidate, false);
  return metadata.buildrCompatibility === undefined ? candidate : parseReleaseCandidate({ ...candidate, compatibility: metadata.buildrCompatibility });
}
function regularFile(path: string, limit: number): Buffer {
  const state = lstatSync(path);
  if (!state.isFile() || state.size > limit || realpathSync(path) !== path) fail('input must be a bounded regular file at its real path');
  return readFileSync(path);
}
function tarNumber(bytes: Buffer): number {
  const text = bytes.toString('ascii').replace(/\0.*$/s, '').trim();
  if (!/^[0-7]+$/.test(text)) fail('invalid tar numeric field');
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) fail('unsafe tar numeric field');
  return value;
}
function paxPath(bytes: Buffer): string | undefined {
  let position = 0, path: string | undefined;
  while (position < bytes.length) {
    const space = bytes.indexOf(32, position);
    const length = Number(bytes.subarray(position, space).toString());
    if (space < position || !Number.isSafeInteger(length) || length <= space - position + 1 || position + length > bytes.length) fail('invalid extended tar header');
    const entry = bytes.subarray(space + 1, position + length).toString('utf8');
    if (!entry.endsWith('\n')) fail('invalid extended tar entry');
    if (entry.startsWith('path=')) path = entry.slice(5, -1);
    position += length;
  }
  return path;
}
/** Read only archive metadata; never extract or execute the package. */
export function inspectPluginTarball(bytes: Buffer, candidate: ReleaseCandidate): Record<string, any> {
  return inspectPluginTarballContents(bytes,candidate,true);
}
function inspectPluginTarballContents(bytes: Buffer, candidate: ReleaseCandidate, enforceCompatibility: boolean): Record<string, any> {
  const tar = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 });
  let position = 0, nextPath: string | undefined, metadata: Record<string, any> | undefined, files = 0;
  const paths = new Set<string>();
  while (position + 512 <= tar.length) {
    const header = tar.subarray(position, position + 512);
    if (header.every(byte => byte === 0)) { if (tar.subarray(position).some(byte => byte !== 0)) fail('archive has trailing material'); break; }
    const expectedChecksum = tarNumber(header.subarray(148, 156));
    const checksum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== expectedChecksum) fail('tar header checksum mismatch');
    const length = tarNumber(header.subarray(124, 136)), start = position + 512;
    const end = start + length;
    if (end > tar.length) fail('truncated tar entry');
    const body = tar.subarray(start, end), kind = String.fromCharCode(header[156] || 48);
    const string = (start: number, end: number) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const prefix = string(345, 500), name = string(0, 100);
    position = start + Math.ceil(length / 512) * 512;
    if (kind === 'x') { nextPath = paxPath(body) ?? nextPath; continue; }
    if (kind === 'L') { nextPath = body.toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (kind === 'g') { if (paxPath(body)) fail('global archive path is unsupported'); continue; }
    const path = nextPath ?? (prefix ? `${prefix}/${name}` : name); nextPath = undefined;
    if (!path.startsWith('package/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) fail('unsafe package archive path');
    if (kind === '5') continue;
    if (kind !== '0') fail('package archive cannot contain links or special files');
    if (paths.has(path)) fail('duplicate archive file');
    paths.add(path); files++;
    if (/\.(?:ts|tsx|mts)$/.test(path) && !path.endsWith('.d.ts') || /(?:^|\/)(?:\.npmrc|\.env(?:\.[^/]+)?)$/.test(path) || path.endsWith('.node')) fail('package contains development, credential or native files');
    if (path === 'package/package.json') { try { metadata = object(JSON.parse(body.toString('utf8'))); } catch { fail('invalid package metadata'); } }
  }
  if (!metadata || files !== candidate.fileCount) fail('archive metadata or inventory does not match candidate');
  if (metadata.name !== PLUGIN_PACKAGE || metadata.version !== candidate.version || metadata.private === true) fail('archive package identity mismatch');
  const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  if (typeof repository !== 'string' || repository.replace(/^git\+/, '').replace(/\.git\/?$/, '').replace(/\/$/, '') !== 'https://github.com/BuildrAI/Buildr') fail('archive repository mismatch');
  if (['preinstall', 'install', 'postinstall', 'prepare'].some(key => Object.hasOwn(metadata.scripts ?? {}, key))) fail('plugin cannot contain installation scripts');
  const sdk = object(metadata.buildrDshSourceSdk);
  const compatibility=metadata.buildrCompatibility===undefined?undefined:parsePackageCompatibility(metadata.buildrCompatibility);
  if (enforceCompatibility && !isDeepStrictEqual(compatibility, candidate.compatibility)) fail('archive compatibility mismatch');
  if (!isDeepStrictEqual(sdk.upstream, candidate.sourceSdk.baseline) || sdk.sourceManifestSha256 !== candidate.sourceSdk.manifestSha256 || sdk.sourcePatchSha256 !== candidate.sourceSdk.patchSha256 || !isDeepStrictEqual(sdk.compiledContracts, candidate.sourceSdk.contracts)) fail('archive source SDK identity mismatch');
  return metadata;
}
export function readReleaseCandidate(manifestValue: string, expected: { version?: string; sourceCommit?: string; sourceTree?: string; sourceSdk?: SourceSdkIdentity } = {}): { manifest: ReleaseCandidate; manifestPath: string; tarball: string } {
  const input = resolve(manifestValue);
  const manifestPath = join(realpathSync(dirname(input)), basename(input));
  const manifest = parseReleaseCandidate(JSON.parse(regularFile(manifestPath, 256 * 1024).toString('utf8')));
  for (const field of ['version', 'sourceCommit', 'sourceTree'] as const) if (expected[field] !== undefined && manifest[field] !== expected[field]) fail(`candidate ${field} drift`);
  if (expected.sourceSdk && !isDeepStrictEqual(manifest.sourceSdk, expected.sourceSdk)) fail('candidate fixed source SDK drift');
  const tarball = join(dirname(manifestPath), manifest.filename), bytes = regularFile(tarball, 128 * 1024 * 1024);
  if (bytes.length !== manifest.size || sha(bytes, 'sha256') !== manifest.sha256 || `sha512-${sha(bytes, 'sha512', 'base64')}` !== manifest.integrity) fail('tarball byte identity mismatch');
  inspectPluginTarball(bytes, manifest);
  return { manifest, manifestPath, tarball };
}
