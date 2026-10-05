/** Rebuild an explicitly selected source-patched DSH SDK in an owned, unique build directory. */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DSH_SDK_BASELINES, DSH_SDK_COMMIT_MARKER, type DshSdkBaseline } from './sdk-baselines.ts';
import { createSdkRequire } from './sdk-require.ts';

export const SOURCE_SDK_RECEIPT = '.buildr-dsh-source-sdk.json';
export const SOURCE_SDK_SLOTS = ['conversation.trajectory.column', 'conversation.trajectory.inspector.objects'] as const;
export const SOURCE_RECORD_ID_ENCODING = "JSON.stringify(['trajectory-record', internalRecordId])";
const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRAJECTORY = 'packages/client/ui-trajectory';
const CLIENT_PROJECTS = ['packages/client/ui-sidebar/tsconfig.json', 'packages/client/ui-sidebar-browser/tsconfig.client.json', 'packages/api/remotes/tsconfig.client.json', `${TRAJECTORY}/tsconfig.json`];
/** Client substitutions are independently selected; they never expand the Host graph. */
export const SOURCE_CLIENT_PLUGINS = [
  { path: 'packages/client/ui-settings-agent-loop', name: '@deepseek-ai/dsh-client-ui-settings-agent-loop', entryId: 'ui-settings-agent-loop' },
] as const;
/** The v2 source boundary is explicit; shared Session/LLM runtime code is not replaced. */
export const SOURCE_HOST_PLUGINS = [
  { path: 'packages/core/tools', name: '@deepseek-ai/dsh-tools', entryId: 'tools' },
  { path: 'packages/core/agent-loop', name: '@deepseek-ai/dsh-agent-loop', entryId: 'agent-loop' },
  { path: 'packages/context/agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', entryId: 'agent-instructions' },
  { path: 'packages/skill/skill', name: '@deepseek-ai/dsh-skill', entryId: 'skill' },
  { path: 'packages/skill/skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', entryId: 'skill-filesystem' },
  { path: 'packages/skill/tool-skill', name: '@deepseek-ai/dsh-tool-skill', entryId: 'tool-skill' },
  { path: 'packages/fs/tool-fs', name: '@deepseek-ai/dsh-tool-fs', entryId: 'tool-fs' },
  { path: 'packages/shell/tool-bash', name: '@deepseek-ai/dsh-tool-bash', entryId: 'tool-bash' },
  { path: 'packages/shell/tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', entryId: 'tool-pwsh' },
] as const;
export const SOURCE_EVENT_CONTRACT = {
  schemaVersion: 'dsh.event-sources/v1', eventProperty: 'data.eventSources',
  messageProperty: 'message.source.eventSources', recordProperty: 'TrajectoryRecordContext.eventSources',
} as const;
const CAPTURE_TYPE_FILES = ['packages/core/session/src/types.ts', 'packages/core/session/src/event-sources.ts', 'packages/llm/llm/src/types.ts', 'packages/client/ui-conversation/src/client/contract/records.ts'];
/** Only the reviewed persistence acknowledgement and exact public-type catalogue maintenance. */
const CAPTURE_MAINTENANCE_FILES = [
  'docs/persistence-schema.json',
  'docs/persistence-catalog.md', 'docs/persistence-catalog.zh.md', 'docs/persistence-catalog.i18n.yaml',
  'docs/persistence-changes/2026-10-05-event-sources.md', 'docs/persistence-changes/2026-10-05-event-sources.zh.md',
  'docs/persistence-changes/2026-10-05-event-sources.i18n.yaml', 'docs/persistence-changes/2026-10-05-event-sources.schema.json',
  'docs/subsystems/tools.md', 'docs/subsystems/tools.zh.md', 'docs/subsystems/tools.i18n.yaml',
  'docs/subsystems/session.md', 'docs/subsystems/session.zh.md', 'docs/subsystems/session.i18n.yaml',
  'docs/subsystems/skills.md', 'docs/subsystems/skills.zh.md', 'docs/subsystems/skills.i18n.yaml',
  'docs/config-catalog.md', 'docs/config-catalog.zh.md', 'docs/config-catalog.i18n.yaml',
  'scripts/gen-cordis-catalog.ts', 'scripts/type-equiv.manifest.json',
  'packages/extensions/tool-cordis/src/api-catalog.ts',
  'docs/event-producer-consumer.md', 'docs/event-producer-consumer.zh.md',
  'packages/core/scope/src/scoped-events.generated.ts',
  'packages/extensions/cordis-client-runner/src/client/slot-catalog.ts',
  'docs/persistence-changes/historical-formats/README.md',
  'docs/persistence-changes/historical-formats/README.zh.md',
  'docs/persistence-changes/historical-formats/README.i18n.yaml',
];
const HOST_ARTIFACT_DIRECTORY = '.buildr-host';

interface PatchFile { path: string; baseSha256: string | null; patchedSha256: string }
export interface SourcePatchManifest {
  schemaVersion: 'buildr.dsh-source-patch/v1' | 'buildr.dsh-source-patch/v2';
  upstream: DshSdkBaseline;
  patch: { path: string; sha256: string };
  files: PatchFile[];
  hostPackages?: string[];
  clientPackages?: string[];
  api: {
    slots: readonly string[];
    recordContext: { type: 'TrajectoryRecordContext'; declarationPath: string; idEncoding: typeof SOURCE_RECORD_ID_ENCODING };
    recordContexts: { property: 'TrajectorySnapshot.recordContexts'; declarationPath: string; scope: 'loaded-session-window' };
    rawrefs: { property: 'TrajectoryRecordContext.eventRefs'; declarationPath: string; sequence: 'non-negative-safe-integer' };
    eventSources?: typeof SOURCE_EVENT_CONTRACT;
  };
}
export interface FileDigest { path: string; sha256: string; kind?: 'symlink' }
export interface SourceHostArtifacts {
  directory: typeof HOST_ARTIFACT_DIRECTORY;
  entries: Array<{ packagePath: string; name: string; entryId: string; entry: string }>;
  files: FileDigest[];
}
export interface SourceSdkReceipt {
  schemaVersion: 'buildr.dsh-source-sdk/v1' | 'buildr.dsh-source-sdk/v2';
  status: 'ready';
  baseline: DshSdkBaseline;
  sourceManifest: { path: string; sha256: string };
  patchSha256: string;
  sourceCheckout: string;
  upstreamArchiveSha256: string;
  sourceFiles: FileDigest[];
  declarations: FileDigest[];
  artifacts: FileDigest[];
  remotePackages: string[];
  hostArtifacts?: SourceHostArtifacts;
  clientPackages?: string[];
  contracts: { slots: readonly string[]; recordContext: 'TrajectoryRecordContext'; recordContexts: 'TrajectorySnapshot.recordContexts'; rawEventRefs: true; idEncoding: typeof SOURCE_RECORD_ID_ENCODING; eventSources?: typeof SOURCE_EVENT_CONTRACT };
}

/** Hash bytes without conflating upstream version, source patch and generated artifacts. */
export function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function fail(message: string): never { throw new Error(`dsh_source_sdk_invalid: ${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
  return value;
}
function hash(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`${label} must be a full lowercase SHA256`);
  return result;
}
/** Admit only portable, relative file addresses; Git patch paths never select an arbitrary root. */
export function sourceRelativePath(value: unknown): string {
  const result = text(value, 'file path');
  if (isAbsolute(result) || result.includes('\\') || /[\u0000-\u001f]/.test(result) || result.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe relative path ${JSON.stringify(result)}`);
  return result;
}
function patchPath(value: unknown, capture = false, hostPackages: readonly string[] = [], clientPackages: readonly string[] = []): string {
  const result = sourceRelativePath(value);
  const host = hostPackages.find(root => result.startsWith(`${root}/`));
  const allowedHost = host !== undefined && (result.startsWith(`${host}/src/`) || result.startsWith(`${host}/tests/`)
    || result === `${host}/package.json` || /^tsconfig(?:\.[a-z-]+)?\.json$/.test(result.slice(host.length + 1))
    || ['README.md', 'README.zh.md', 'README.i18n.yaml', 'tsdown.config.ts'].includes(result.slice(host.length + 1)));
  const client = clientPackages.find(root => result.startsWith(`${root}/`));
  const allowedClient = client !== undefined && (result.startsWith(`${client}/src/`) || result.startsWith(`${client}/tests/`)
    || result === `${client}/package.json` || /^tsconfig(?:\.[a-z-]+)?\.json$/.test(result.slice(client.length + 1))
    || ['README.md', 'README.zh.md', 'README.i18n.yaml', 'tsdown.config.ts'].includes(result.slice(client.length + 1)));
  if (!result.startsWith(`${TRAJECTORY}/`) && result !== 'pnpm-lock.yaml'
    && !(capture && (allowedHost || allowedClient || CAPTURE_TYPE_FILES.includes(result) || CAPTURE_MAINTENANCE_FILES.includes(result)))) fail(`patch target is outside the ${capture ? 'selected capture' : 'trajectory'} source input: ${result}`);
  if (result.split('/').some(part => ['node_modules', 'lib', '.git'].includes(part))) fail(`patch cannot change generated or installed content: ${result}`);
  return result;
}
/** Parse persistent patch metadata; a published version is never an API-support flag. */
export function parseSourcePatchManifest(value: unknown): SourcePatchManifest {
  const input = object(value, 'source patch manifest');
  if (input.schemaVersion !== 'buildr.dsh-source-patch/v1' && input.schemaVersion !== 'buildr.dsh-source-patch/v2') fail('unsupported source patch manifest version');
  const capture = input.schemaVersion === 'buildr.dsh-source-patch/v2';
  const hostPackages = capture ? parseHostPackages(input.hostPackages) : [];
  if (!capture && Object.hasOwn(input, 'clientPackages')) fail('legacy source patches cannot select Client substitutions');
  const clientPackages = capture && Object.hasOwn(input, 'clientPackages') ? parseClientPackages(input.clientPackages) : undefined;
  const upstream = object(input.upstream, 'upstream');
  const baseline = DSH_SDK_BASELINES.find(item => item.tag === upstream.tag && item.commit === upstream.commit && item.version === upstream.version);
  if (baseline === undefined || baseline.version !== '0.2.0-rc.2') fail('source patch requires the exact verified rc.2 upstream tag and commit');
  const patch = object(input.patch, 'patch');
  if (!Array.isArray(input.files) || input.files.length === 0) fail('source patch must enumerate every changed file');
  const files = input.files.map((entry, index) => {
    const file = object(entry, `files[${index}]`);
    return { path: patchPath(file.path, capture, hostPackages, clientPackages), baseSha256: file.baseSha256 === null ? null : hash(file.baseSha256, 'baseSha256'), patchedSha256: hash(file.patchedSha256, 'patchedSha256') };
  });
  if (new Set(files.map(file => file.path)).size !== files.length) fail('duplicate patch file');
  for (const required of [`${TRAJECTORY}/src/client/trajectory-extension-contract.ts`, `${TRAJECTORY}/src/client/index.ts`, `${TRAJECTORY}/src/client/trajectory-contract.ts`]) {
    if (!files.some(file => file.path === required)) fail(`patch is missing required API source ${required}`);
  }
  const api = object(input.api, 'api');
  const recordContext = object(api.recordContext, 'api.recordContext');
  const recordContexts = object(api.recordContexts, 'api.recordContexts');
  const rawrefs = object(api.rawrefs, 'api.rawrefs');
  const extensionPath = `${TRAJECTORY}/src/client/trajectory-extension-contract.ts`;
  const snapshotPath = `${TRAJECTORY}/src/client/trajectory-contract.ts`;
  if (!Array.isArray(api.slots) || JSON.stringify([...api.slots].sort()) !== JSON.stringify([...SOURCE_SDK_SLOTS].sort())) fail('manifest must name the two exact annotation slots');
  if (recordContext.type !== 'TrajectoryRecordContext' || recordContext.idEncoding !== SOURCE_RECORD_ID_ENCODING || recordContext.declarationPath !== extensionPath || recordContexts.property !== 'TrajectorySnapshot.recordContexts' || recordContexts.declarationPath !== snapshotPath || recordContexts.scope !== 'loaded-session-window' || rawrefs.property !== 'TrajectoryRecordContext.eventRefs' || rawrefs.declarationPath !== extensionPath || rawrefs.sequence !== 'non-negative-safe-integer') fail('manifest does not describe the required raw event-address API');
  if (capture) parseEventSourceContract(api.eventSources, 'api.eventSources');
  return {
    schemaVersion: input.schemaVersion, upstream: baseline, patch: { path: sourceRelativePath(patch.path), sha256: hash(patch.sha256, 'patch.sha256') }, files,
    ...(capture ? { hostPackages } : {}),
    ...(clientPackages === undefined ? {} : { clientPackages }),
    api: { slots: SOURCE_SDK_SLOTS, recordContext: { type: 'TrajectoryRecordContext', declarationPath: extensionPath, idEncoding: SOURCE_RECORD_ID_ENCODING }, recordContexts: { property: 'TrajectorySnapshot.recordContexts', declarationPath: snapshotPath, scope: 'loaded-session-window' }, rawrefs: { property: 'TrajectoryRecordContext.eventRefs', declarationPath: extensionPath, sequence: 'non-negative-safe-integer' }, ...(capture ? { eventSources: SOURCE_EVENT_CONTRACT } : {}) },
  };
}
function parseHostPackages(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) fail('v2 must select Host producer packages');
  const packages = value.map(sourceRelativePath);
  if (new Set(packages).size !== packages.length || packages.some(path => !SOURCE_HOST_PLUGINS.some(plugin => plugin.path === path))) fail('Host packages must be distinct members of the capture allowlist');
  return packages;
}
function parseClientPackages(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) fail('Client substitutions must be a nonempty explicit selection');
  const packages = value.map(sourceRelativePath);
  if (new Set(packages).size !== packages.length || packages.some(path => !SOURCE_CLIENT_PLUGINS.some(plugin => plugin.path === path))) fail('Client packages must be distinct members of the narrow substitution allowlist');
  return packages;
}
function parseEventSourceContract(value: unknown, label: string): typeof SOURCE_EVENT_CONTRACT {
  const contract = object(value, label);
  if (Object.keys(contract).length !== Object.keys(SOURCE_EVENT_CONTRACT).length || Object.entries(SOURCE_EVENT_CONTRACT).some(([key, expected]) => contract[key] !== expected)) fail(`${label} lacks the exact durable event source contract`);
  return SOURCE_EVENT_CONTRACT;
}
function readManifest(file: string): SourcePatchManifest { return parseSourcePatchManifest(JSON.parse(readFileSync(file, 'utf8'))); }
function git(root: string, args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); }
function fileHash(file: string): string {
  if (!lstatSync(file).isFile()) fail(`expected a regular file: ${file}`);
  return sha256(readFileSync(file));
}
/** Resolve one owned build root without following a pre-existing symlink into another workspace. */
export function ownedBuildRoot(serviceRoot: string): string {
  const root = realpathSync(serviceRoot);
  const build = join(root, 'build');
  if (!existsSync(build)) mkdirSync(build);
  if (!lstatSync(build).isDirectory() || lstatSync(build).isSymbolicLink() || realpathSync(build) !== build) fail('service build directory is not an owned regular directory');
  return build;
}
function contained(root: string, target: string): string {
  const absolute = resolve(target);
  if (absolute === root || !absolute.startsWith(`${root}${sep}`)) fail(`path must be strictly inside ${root}: ${target}`);
  return absolute;
}
/** Select a new build output without deleting or overwriting a pre-existing directory. */
export function newBuildOutput(serviceRoot: string, requested: string): string {
  const build = ownedBuildRoot(serviceRoot);
  const target = contained(build, resolve(serviceRoot, requested));
  let parent = dirname(target);
  while (parent !== build) {
    if (existsSync(parent) && (lstatSync(parent).isSymbolicLink() || realpathSync(parent) !== parent)) fail('output ancestor is not owned by this build');
    parent = dirname(parent);
  }
  if (existsSync(target)) fail(`output already exists; select a unique --output instead: ${target}`);
  return target;
}
function digestFile(root: string, path: string): FileDigest {
  const absolute = contained(root, join(root, sourceRelativePath(path)));
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    const link = readlinkSync(absolute);
    contained(root, resolve(dirname(absolute), link));
    return { path, sha256: sha256(link), kind: 'symlink' };
  }
  if (!stat.isFile()) fail(`expected file at ${path}`);
  return { path, sha256: sha256(readFileSync(absolute)) };
}
function snapshotFiles(root: string, current = root): FileDigest[] {
  const files: FileDigest[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) files.push(...snapshotFiles(root, absolute));
    else files.push(digestFile(root, relative(root, absolute).split(sep).join('/')));
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function generatedFiles(root: string, sourceFiles: FileDigest[], current = root): FileDigest[] {
  const original = new Set(sourceFiles.map(file => file.path));
  const files: FileDigest[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) files.push(...generatedFiles(root, sourceFiles, absolute));
    else {
      const path = relative(root, absolute).split(sep).join('/');
      if (!original.has(path) && /(?:\.d\.ts|\.js)$/.test(path)) files.push(digestFile(root, path));
    }
  }
  return files;
}
function verifyDigests(root: string, files: FileDigest[], label: string): void {
  if (files.length === 0 || new Set(files.map(file => file.path)).size !== files.length) fail(`${label} must enumerate distinct files`);
  for (const file of files) {
    const actual = digestFile(root, file.path);
    if (actual.sha256 !== file.sha256 || actual.kind !== file.kind) fail(`${label} changed: ${file.path}`);
  }
}

/** Verify the selected repository and reconstruct from its commit, never its possibly modified worktree. */
export function verifySourcePatchInput(sourceRoot: string, manifestFile: string): { source: string; manifest: SourcePatchManifest; patchFile: string } {
  const source = realpathSync(sourceRoot);
  const manifest = readManifest(manifestFile);
  if (realpathSync(git(source, ['rev-parse', '--show-toplevel'])) !== source) fail('SDK input must be its own exact Git checkout, not a directory inside another repository');
  if (git(source, ['rev-parse', 'HEAD']) !== manifest.upstream.commit) fail('SDK Git HEAD does not match the pinned source baseline');
  const basePackage = JSON.parse(git(source, ['show', `${manifest.upstream.commit}:package.json`]));
  if (basePackage.version !== manifest.upstream.version) fail('upstream package version disagrees with the baseline');
  const patchFile = contained(realpathSync(dirname(manifestFile)), resolve(dirname(manifestFile), manifest.patch.path));
  if (fileHash(patchFile) !== manifest.patch.sha256) fail('source patch hash mismatch');
  const targets = git(source, ['apply', '--numstat', patchFile]).split('\n').map(line => sourceRelativePath(line.split('\t')[2])).sort();
  if (JSON.stringify(targets) !== JSON.stringify(manifest.files.map(file => file.path).sort())) fail('patch targets differ from the complete manifest file list');
  for (const file of manifest.files) {
    let base: Buffer | undefined;
    try { base = execFileSync('git', ['show', `${manifest.upstream.commit}:${file.path}`], { cwd: source, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) {
      if (file.baseSha256 !== null) throw error;
      // A null base hash is accepted only for a file absent from the exact upstream tree.
    }
    if ((base === undefined ? null : sha256(base)) !== file.baseSha256) fail(`base file hash mismatch: ${file.path}`);
  }
  return { source, manifest, patchFile };
}
/** Reuse third-party dependencies while redirecting workspace links to this SDK's own generated artifacts. */
export function mirrorSdkDependencies(source: string, sdk: string, installed: string, output: string): void {
  mkdirSync(output);
  for (const entry of readdirSync(installed, { withFileTypes: true })) {
    const input = join(installed, entry.name);
    const target = join(output, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      mirrorSdkDependencies(source, sdk, input, target);
      continue;
    }
    const actual = realpathSync(input);
    const workspaceRelative = relative(source, actual);
    const workspace = actual.startsWith(`${source}${sep}`) && !workspaceRelative.split(sep).includes('node_modules');
    const mapped = workspace ? join(sdk, workspaceRelative) : actual;
    symlinkSync(mapped, target, lstatSync(actual).isDirectory() ? 'dir' : 'file');
  }
}
function linkDependencies(source: string, sdk: string, current = sdk): void {
  const relativeDirectory = relative(sdk, current);
  const installed = join(source, relativeDirectory, 'node_modules');
  if (existsSync(installed)) mirrorSdkDependencies(source, sdk, installed, join(current, 'node_modules'));
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'node_modules') linkDependencies(source, sdk, join(current, entry.name));
  }
}
/** Apply inside a new non-repository SDK root even when its owned build parent belongs to Git. */
export function applySourcePatch(sdk: string, patchFile: string): void {
  const target = realpathSync(sdk);
  contained(ownedBuildRoot(SERVICE_ROOT), target);
  if (basename(target) !== 'sdk' || !basename(dirname(target)).startsWith('dsh-source-sdk-') || existsSync(join(target, '.git'))) fail('source patch target must be a newly reconstructed non-repository SDK');
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(target) };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  execFileSync('git', ['apply', '--no-index', '--check', patchFile], { cwd: target, env });
  execFileSync('git', ['apply', '--no-index', patchFile], { cwd: target, env });
}

/** Materialize a new stage without deleting, moving or patching an unknown or shared directory. */
export function stageSourceSdk(sourceRoot: string, manifestFile: string, serviceRoot = SERVICE_ROOT): { sdk: string; stage: string; manifest: SourcePatchManifest; sourceFiles: FileDigest[] } {
  const input = verifySourcePatchInput(sourceRoot, manifestFile);
  if (!existsSync(join(input.source, 'node_modules'))) fail('SDK dependencies must already be installed explicitly with a frozen lockfile and ignored scripts');
  const stage = mkdtempSync(join(ownedBuildRoot(serviceRoot), 'dsh-source-sdk-'));
  const sdk = join(stage, 'sdk');
  mkdirSync(sdk);
  const archive = join(stage, 'upstream.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, input.manifest.upstream.commit], { cwd: input.source });
  execFileSync('tar', ['-xf', archive, '-C', sdk]);
  applySourcePatch(sdk, input.patchFile);
  for (const file of input.manifest.files) if (fileHash(join(sdk, file.path)) !== file.patchedSha256) fail(`patched file hash mismatch: ${file.path}`);
  const sourceFiles = snapshotFiles(sdk);
  writeFileSync(join(stage, 'source-patch.manifest.json'), readFileSync(manifestFile));
  writeFileSync(join(stage, 'source.patch'), readFileSync(input.patchFile));
  writeFileSync(join(sdk, DSH_SDK_COMMIT_MARKER), `${input.manifest.upstream.commit}\n`);
  linkDependencies(input.source, sdk);
  return { sdk, stage, manifest: input.manifest, sourceFiles };
}

const API_PROBE = `import type { SlotMap } from '@deepseek-ai/dsh-client-ui-slots';
import type { TrajectoryRecordContext, TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
type Require<T extends true> = T;
type NotAny<T> = 0 extends (1 & T) ? false : true;
type Column = SlotMap['conversation.trajectory.column'];
type Objects = SlotMap['conversation.trajectory.inspector.objects'];
export type ColumnOwner = Require<Column extends {kind:'list';scope:'session';owner:{record:TrajectoryRecordContext}} ? true : false>;
export type ObjectOwner = Require<Objects extends {kind:'list';scope:'session';owner:{record:TrajectoryRecordContext}} ? true : false>;
export type KnownRecord = Require<NotAny<TrajectoryRecordContext>>;
export type KnownRefs = Require<NotAny<TrajectoryRecordContext['eventRefs']>>;
export type RawRefs = Require<TrajectoryRecordContext['eventRefs'][number] extends {readonly sessionId:SessionId;readonly seq:number} ? true : false>;
export type RecordIdentity = Require<TrajectoryRecordContext extends {readonly recordId:string;readonly kind:string;readonly transient:boolean} ? true : false>;
export type SnapshotContexts = Require<NonNullable<TrajectorySnapshot['recordContexts']> extends readonly TrajectoryRecordContext[] ? true : false>;
`;
const CAPTURE_API_PROBE = `import type { EventSources, SessionEventMap } from '@deepseek-ai/dsh-session/types';
export type KnownRecordedSource = Require<NotAny<NonNullable<TrajectoryRecordContext['eventSources']>[number]>>;
export type KnownRecordedPayload = Require<NotAny<NonNullable<TrajectoryRecordContext['eventSources']>[number]['sources']>>;
export type RecordedSource = Require<NonNullable<TrajectoryRecordContext['eventSources']>[number] extends {readonly seq:number;readonly sources:EventSources} ? true : false>;
export type DurableToolSource = Require<NotAny<NonNullable<SessionEventMap['tool/result']['eventSources']>>>;
export type SourceSchema = Require<EventSources['schemaVersion'] extends 'dsh.event-sources/v1' ? true : false>;
export type SourceStatus = Require<EventSources['status'] extends 'confirmed'|'unknown'|'not-applicable' ? true : false>;
`;

/** Resolve source aliases to package-owned generated declarations, including vendor packages whose output is lib/. */
export function sdkDeclarationPaths(sdk: string): Record<string, string[]> {
  const ts = createSdkRequire(sdk)('typescript');
  const base = ts.readConfigFile(join(sdk, 'tsconfig.base.json'), ts.sys.readFile);
  const roots = new Map<string, string>();
  return Object.fromEntries(Object.entries(base.config.compilerOptions.paths ?? {}).map(([name, values]) => [name, (values as string[]).map(value => {
    const absolute = resolve(sdk, value);
    if (absolute.endsWith('.d.ts')) return absolute;
    const index = absolute.indexOf(`${sep}src${sep}`) >= 0 ? absolute.indexOf(`${sep}src${sep}`) : absolute.endsWith(`${sep}src`) ? absolute.length - `${sep}src`.length : -1;
    if (index < 0) return absolute;
    const packageRoot = absolute.slice(0, index);
    let output = roots.get(packageRoot);
    if (output === undefined) {
      const file = join(packageRoot, 'package.json');
      const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
      const main = typeof manifest.exports?.['.'] === 'object' ? manifest.exports['.'].types : manifest.types;
      output = typeof main === 'string' ? dirname(main) : 'lib/types';
      roots.set(packageRoot, output);
    }
    const mapped = resolve(packageRoot, output, `.${absolute.slice(index + `${sep}src`.length)}`).replace(/\.tsx?$/, '.d.ts');
    return existsSync(join(mapped, 'index.d.ts')) ? join(mapped, 'index.d.ts') : mapped;
  })]));
}

/** Check the generated declaration API with the SDK's actual compiler, not a marker or string search. */
export function verifySourceSdkApi(sdkRoot: string, capture = false): void {
  const sdk = resolve(sdkRoot);
  const ts = createSdkRequire(sdk)('typescript');
  const probe = mkdtempSync(join(ownedBuildRoot(SERVICE_ROOT), 'dsh-sdk-api-probe-'));
  const file = join(probe, 'api.ts');
  writeFileSync(file, API_PROBE + (capture ? CAPTURE_API_PROBE : ''));
  const base = ts.readConfigFile(join(sdk, 'tsconfig.base.client.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(base.config, ts.sys, sdk);
  const paths = sdkDeclarationPaths(sdk);
  const program = ts.createProgram([file], { ...parsed.options, paths, noEmit: true, composite: false, incremental: false, skipLibCheck: true, types: ['node'], typeRoots: [join(sdk, 'node_modules/@types')] });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) fail(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (path: string) => path, getCurrentDirectory: () => sdk, getNewLine: () => '\n' }));
}

/** Hash exact Git archive bytes, including declared CRLF files, without normalizing source or trusting a marker. */
export function archiveSourceDigests(sdk: string, archive: string): FileDigest[] {
  const tar = createSdkRequire(resolve(sdk))('tar');
  const files: FileDigest[] = [];
  tar.t({ file: archive, sync: true, onReadEntry(entry: { type: string; path: string; linkpath?: string; on(name: string, callback: (data: Buffer) => void): void; resume(): void }) {
    if (entry.type === 'File') {
      const hash = createHash('sha256');
      entry.on('data', data => hash.update(data));
      entry.on('end', () => { files.push({ path: sourceRelativePath(entry.path), sha256: hash.digest('hex') }); });
    } else if (entry.type === 'SymbolicLink') {
      files.push({ path: sourceRelativePath(entry.path), sha256: sha256(text(entry.linkpath, 'archive symlink target')), kind: 'symlink' });
      entry.resume();
    } else if (entry.type === 'Directory') entry.resume();
    else fail(`unsupported upstream archive entry type ${entry.type}`);
  } });
  if (files.length === 0) fail('empty upstream archive');
  return files;
}

/** Recheck the pristine Git artifact and complete source tree; a forged marker or shortened receipt cannot attest an SDK. */
function verifyReconstructedSource(sdk: string, receipt: SourceSdkReceipt, manifest: SourcePatchManifest): void {
  const selected = verifySourcePatchInput(receipt.sourceCheckout, receipt.sourceManifest.path);
  const archive = join(dirname(sdk), 'upstream.tar');
  const bytes = execFileSync('git', ['archive', '--format=tar', receipt.baseline.commit], { cwd: selected.source, maxBuffer: 512 * 1024 * 1024 });
  if (sha256(bytes) !== receipt.upstreamArchiveSha256 || fileHash(archive) !== receipt.upstreamArchiveSha256) fail('pristine upstream archive changed');
  const archived = archiveSourceDigests(sdk, archive);
  const expected = [...new Set([...archived.map(file => file.path), ...manifest.files.map(file => file.path)])].sort();
  if (JSON.stringify(expected) !== JSON.stringify(receipt.sourceFiles.map(file => file.path).sort())) fail('source receipt does not enumerate the complete reconstructed tree');
  const changed = new Set(manifest.files.map(file => file.path));
  const source = new Map(receipt.sourceFiles.map(file => [file.path, file]));
  for (const file of archived) {
    if (changed.has(file.path)) continue;
    const actual = source.get(file.path);
    if (actual?.sha256 !== file.sha256 || actual.kind !== file.kind) fail(`SDK source no longer matches the exact upstream archive bytes: ${file.path}`);
  }
}

function parseDigestList(value: unknown, label: string): FileDigest[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must enumerate file digests`);
  return value.map((entry, index): FileDigest => {
    const file = object(entry, `${label}[${index}]`);
    if (file.kind !== undefined && file.kind !== 'symlink') fail(`${label}[${index}].kind must be symlink when present`);
    const digest = { path: sourceRelativePath(file.path), sha256: hash(file.sha256, `${label}[${index}].sha256`) };
    return file.kind === 'symlink' ? { ...digest, kind: 'symlink' } : digest;
  });
}
function hostEntry(packagePath: string): string {
  const plugin = SOURCE_HOST_PLUGINS.find(item => item.path === packagePath);
  if (plugin === undefined) fail('unknown Host producer package');
  return `${HOST_ARTIFACT_DIRECTORY}/packages/${plugin.entryId}/lib/index.js`;
}
/** V2 receipts attest the shared producer closure, not only generated types. */
export function parseSourceHostArtifacts(value: unknown): SourceHostArtifacts {
  const input = object(value, 'receipt.hostArtifacts');
  if (input.directory !== HOST_ARTIFACT_DIRECTORY || !Array.isArray(input.entries) || input.entries.length === 0) fail('receipt must enumerate Host producer entries');
  const entries = input.entries.map((value, index) => {
    const entry = object(value, `receipt.hostArtifacts.entries[${index}]`);
    const plugin = SOURCE_HOST_PLUGINS.find(item => item.path === entry.packagePath);
    if (plugin === undefined || entry.name !== plugin.name || entry.entryId !== plugin.entryId || entry.entry !== hostEntry(plugin.path)) fail('Host entry disagrees with its allowed package identity');
    return { packagePath: plugin.path, name: plugin.name, entryId: plugin.entryId, entry: hostEntry(plugin.path) };
  });
  if (new Set(entries.map(entry => entry.packagePath)).size !== entries.length) fail('duplicate Host producer entry');
  const files = parseDigestList(input.files, 'receipt.hostArtifacts.files');
  if (new Set(files.map(file => file.path)).size !== files.length || files.some(file => file.kind !== undefined || !file.path.startsWith(`${HOST_ARTIFACT_DIRECTORY}/`))) fail('Host artifacts must be distinct regular files in their owned closure');
  for (const entry of entries) {
    if (!files.some(file => file.path === entry.entry) || !files.some(file => file.path === `${HOST_ARTIFACT_DIRECTORY}/packages/${entry.entryId}/package.json`)) fail('Host receipt is missing executable or package metadata');
  }
  return { directory: HOST_ARTIFACT_DIRECTORY, entries, files };
}

/** Validate persisted JSON fields before constructing a receipt; source and artifact checks remain separate. */
export function parseSourceSdkReceipt(value: unknown): SourceSdkReceipt {
  const input = object(value, 'source SDK receipt');
  if ((input.schemaVersion !== 'buildr.dsh-source-sdk/v1' && input.schemaVersion !== 'buildr.dsh-source-sdk/v2') || input.status !== 'ready') fail('SDK source candidate has not completed preparation');
  const capture = input.schemaVersion === 'buildr.dsh-source-sdk/v2';
  const upstream = object(input.baseline, 'receipt.baseline');
  const baseline = DSH_SDK_BASELINES.find(item => item.tag === upstream.tag && item.commit === upstream.commit && item.version === upstream.version);
  if (baseline === undefined || baseline.version !== '0.2.0-rc.2') fail('receipt requires the exact verified rc.2 baseline');
  const manifest = object(input.sourceManifest, 'receipt.sourceManifest');
  const contracts = object(input.contracts, 'receipt.contracts');
  if (JSON.stringify(contracts.slots) !== JSON.stringify(SOURCE_SDK_SLOTS) || contracts.rawEventRefs !== true || contracts.recordContext !== 'TrajectoryRecordContext' || contracts.recordContexts !== 'TrajectorySnapshot.recordContexts' || contracts.idEncoding !== SOURCE_RECORD_ID_ENCODING) fail('receipt lacks the required annotation contracts');
  if (!Array.isArray(input.remotePackages) || input.remotePackages.length === 0) fail('receipt.remotePackages must enumerate Host contributors');
  if (capture) parseEventSourceContract(contracts.eventSources, 'receipt.contracts.eventSources');
  return {
    schemaVersion: input.schemaVersion, status: 'ready', baseline,
    sourceManifest: { path: text(manifest.path, 'receipt.sourceManifest.path'), sha256: hash(manifest.sha256, 'receipt.sourceManifest.sha256') },
    patchSha256: hash(input.patchSha256, 'receipt.patchSha256'),
    sourceCheckout: text(input.sourceCheckout, 'receipt.sourceCheckout'),
    upstreamArchiveSha256: hash(input.upstreamArchiveSha256, 'receipt.upstreamArchiveSha256'),
    sourceFiles: parseDigestList(input.sourceFiles, 'receipt.sourceFiles'),
    declarations: parseDigestList(input.declarations, 'receipt.declarations'),
    artifacts: parseDigestList(input.artifacts, 'receipt.artifacts'),
    remotePackages: input.remotePackages.map((entry, index) => text(entry, `receipt.remotePackages[${index}]`)),
    ...(capture ? { hostArtifacts: parseSourceHostArtifacts(input.hostArtifacts) } : {}),
    ...(capture && Object.hasOwn(input, 'clientPackages') ? { clientPackages: parseClientPackages(input.clientPackages) } : {}),
    contracts: { slots: SOURCE_SDK_SLOTS, rawEventRefs: true, recordContext: 'TrajectoryRecordContext', recordContexts: 'TrajectorySnapshot.recordContexts', idEncoding: SOURCE_RECORD_ID_ENCODING, ...(capture ? { eventSources: SOURCE_EVENT_CONTRACT } : {}) },
  };
}

/** Reject changed source, patch metadata, declarations or browser artifacts before a candidate build. */
export function validatePreparedSourceSdk(sdkRoot: string, serviceRoot = SERVICE_ROOT): SourceSdkReceipt {
  const sdk = realpathSync(sdkRoot);
  return verifyPreparedSourceReceipt(sdk, JSON.parse(readFileSync(join(sdk, SOURCE_SDK_RECEIPT), 'utf8')), serviceRoot);
}
function verifyPreparedSourceReceipt(sdk: string, value: unknown, serviceRoot: string): SourceSdkReceipt {
  const build = ownedBuildRoot(serviceRoot);
  contained(build, sdk);
  const receipt = parseSourceSdkReceipt(value);
  const manifest = readManifest(receipt.sourceManifest.path);
  const capture = manifest.schemaVersion === 'buildr.dsh-source-patch/v2';
  if ((receipt.schemaVersion === 'buildr.dsh-source-sdk/v2') !== capture) fail('SDK receipt and patch manifest disagree on capture version');
  if (fileHash(receipt.sourceManifest.path) !== receipt.sourceManifest.sha256 || JSON.stringify(manifest.upstream) !== JSON.stringify(receipt.baseline) || receipt.patchSha256 !== manifest.patch.sha256) fail('prepared metadata no longer matches the persistent source patch manifest');
  if (String(JSON.parse(readFileSync(join(sdk, 'package.json'), 'utf8')).version) !== receipt.baseline.version) fail('prepared SDK version changed');
  if (readFileSync(join(sdk, DSH_SDK_COMMIT_MARKER), 'utf8').trim() !== receipt.baseline.commit) fail('prepared SDK base marker changed');
  if (JSON.stringify(receipt.contracts?.slots) !== JSON.stringify(SOURCE_SDK_SLOTS) || receipt.contracts.rawEventRefs !== true || receipt.contracts.recordContext !== 'TrajectoryRecordContext' || receipt.contracts.recordContexts !== 'TrajectorySnapshot.recordContexts' || receipt.contracts.idEncoding !== SOURCE_RECORD_ID_ENCODING) fail('receipt lacks the required annotation contracts');
  for (const file of manifest.files) if (fileHash(join(sdk, file.path)) !== file.patchedSha256) fail(`prepared patch source changed: ${file.path}`);
  verifyDigests(sdk, receipt.sourceFiles, 'source');
  verifyReconstructedSource(sdk, receipt, manifest);
  verifyDigests(sdk, receipt.declarations, 'generated declaration');
  verifyDigests(sdk, receipt.artifacts, 'generated artifact');
  for (const required of [`${TRAJECTORY}/lib/types/client/index.d.ts`, `${TRAJECTORY}/lib/types/client/trajectory-extension-contract.d.ts`]) if (!receipt.declarations.some(file => file.path === required)) fail(`missing generated API declaration ${required}`);
  if (!receipt.artifacts.some(file => file.path === `${TRAJECTORY}/lib/client.js`)) fail('missing generated trajectory browser artifact');
  if (capture) {
    const host = receipt.hostArtifacts!;
    if (JSON.stringify(host.entries.map(entry => entry.packagePath).sort()) !== JSON.stringify([...manifest.hostPackages!].sort())) fail('Host artifact selection differs from the source manifest');
    verifyDigests(sdk, host.files, 'Host producer artifact');
    const actual = snapshotFiles(sdk, join(sdk, host.directory));
    if (JSON.stringify(actual) !== JSON.stringify([...host.files].sort((a, b) => a.path.localeCompare(b.path)))) fail('Host receipt does not enumerate its complete closure');
    for (const entry of host.entries) {
      const packaged = JSON.parse(readFileSync(join(sdk, host.directory, 'packages', entry.entryId, 'package.json'), 'utf8'));
      if (packaged.name !== entry.name || packaged.version !== receipt.baseline.version) fail('Host producer package metadata changed');
    }
    if (JSON.stringify(receipt.clientPackages) !== JSON.stringify(manifest.clientPackages)) fail('Client artifact selection differs from the source manifest');
    for (const packagePath of manifest.clientPackages ?? []) {
      const selected = SOURCE_CLIENT_PLUGINS.find(plugin => plugin.path === packagePath)!;
      const packaged = JSON.parse(readFileSync(join(sdk, packagePath, 'package.json'), 'utf8'));
      if (packaged.name !== selected.name || packaged.version !== receipt.baseline.version) fail('Client substitution package metadata changed');
      for (const file of ['lib/index.js', 'lib/client.js']) if (!receipt.artifacts.some(item => item.path === `${packagePath}/${file}`)) fail(`missing selected Client artifact ${packagePath}/${file}`);
      if (!receipt.declarations.some(item => item.path === `${packagePath}/lib/types/client/index.d.ts`)) fail(`missing selected Client declaration ${packagePath}`);
    }
  }
  verifySourceSdkApi(sdk, capture);
  return receipt;
}

/** Resolve only the existing tsdown package build command; never invoke a package manager with automatic installation. */
export function trajectoryBundleTool(sdk: string): string {
  return sourceBundleTool(sdk, TRAJECTORY);
}
function sourceBundleTool(sdk: string, packagePath: string): string {
  const manifest = JSON.parse(readFileSync(join(sdk, packagePath, 'package.json'), 'utf8'));
  if (manifest.scripts?.bundle !== 'tsdown') fail('upstream trajectory bundle script is not the verified tsdown build tool');
  return createSdkRequire(sdk).resolve('tsdown/run');
}

/** Bundle all selected producers together so their Tools/Skill services share one module graph. */
export async function buildSourceHostArtifacts(sdk: string, manifest: SourcePatchManifest): Promise<SourceHostArtifacts> {
  if (manifest.schemaVersion !== 'buildr.dsh-source-patch/v2') fail('Host artifacts require a v2 capture manifest');
  const plugins = manifest.hostPackages!.map(path => SOURCE_HOST_PLUGINS.find(plugin => plugin.path === path)!);
  const out = join(sdk, HOST_ARTIFACT_DIRECTORY);
  if (existsSync(out)) fail('Host artifact output must be a new owned directory');
  mkdirSync(out);
  const manifests = new Map(plugins.map(plugin => {
    const value = object(JSON.parse(readFileSync(join(sdk, plugin.path, 'package.json'), 'utf8')), plugin.name);
    if (value.name !== plugin.name || value.version !== manifest.upstream.version) fail('selected Host package identity disagrees with the manifest');
    return [plugin.name, value];
  }));
  const runtimePath = (plugin: typeof plugins[number], specifier: string): string => {
    const value = manifests.get(plugin.name)!;
    const exports = object(value.exports, `${plugin.name}.exports`);
    const subpath = specifier === plugin.name ? '.' : `.${specifier.slice(plugin.name.length)}`;
    let target = exports[subpath];
    if (target === undefined) {
      const wildcard = Object.keys(exports).find(key => key.endsWith('*') && subpath.startsWith(key.slice(0, -1)));
      if (wildcard !== undefined && typeof exports[wildcard] === 'string') target = String(exports[wildcard]).replace('*', subpath.slice(wildcard.length - 1));
    }
    const entry = typeof target === 'string' ? target : object(target, `${plugin.name} export ${subpath}`).default;
    const relativeFile = sourceRelativePath(text(entry, `${plugin.name} runtime export`).replace(/^\.\//, ''));
    const file = join(sdk, plugin.path, relativeFile);
    const compiled = relativeFile.startsWith('lib/') && !relativeFile.startsWith('lib/types/') ? join(sdk, plugin.path, relativeFile.replace(/^lib\//, 'lib/types/')) : file;
    if (!existsSync(compiled) || !lstatSync(compiled).isFile() || !compiled.endsWith('.js')) fail(`selected Host runtime export was not compiled: ${specifier}`);
    return compiled;
  };
  const entryPoints: Record<string, string> = {};
  for (const plugin of plugins) {
    const value = manifests.get(plugin.name)!;
    const exports = object(value.exports, `${plugin.name}.exports`);
    const packagedExports: Record<string, unknown> = {};
    for (const [key, definition] of Object.entries(exports)) {
      if (key === './package.json') { packagedExports[key] = './package.json'; continue; }
      if (key.includes('*')) continue;
      const target = typeof definition === 'string' ? definition : object(definition, `${plugin.name}.${key}`).default;
      if (typeof target !== 'string' || !target.startsWith('./lib/') || !target.endsWith('.js')) continue;
      const local = sourceRelativePath(target.slice(2));
      entryPoints[`packages/${plugin.entryId}/${local.slice(0, -3)}`] = runtimePath(plugin, key === '.' ? plugin.name : plugin.name + key.slice(1));
      packagedExports[key] = definition;
    }
    if (entryPoints[`packages/${plugin.entryId}/lib/index`] === undefined) fail('selected Host package has no compiled root entry');
    const pkg = join(out, 'packages', plugin.entryId);
    mkdirSync(pkg, { recursive: true });
    const packaged: Record<string, unknown> = { ...value, type: 'module', exports: packagedExports, peerDependencies: { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh': manifest.upstream.version } };
    for (const key of ['scripts', 'devDependencies', 'dependencies', 'files']) delete packaged[key];
    writeFileSync(join(pkg, 'package.json'), JSON.stringify(packaged, null, 2) + '\n');
    for (const file of ['LICENSE', 'README.md']) {
      const source = join(sdk, plugin.path, file);
      if (existsSync(source) && lstatSync(source).isFile()) writeFileSync(join(pkg, file), readFileSync(source));
    }
    if (!existsSync(join(pkg, 'LICENSE')) && existsSync(join(sdk, 'LICENSE'))) writeFileSync(join(pkg, 'LICENSE'), readFileSync(join(sdk, 'LICENSE')));
    const types = join(sdk, plugin.path, 'lib/types');
    if (existsSync(types)) for (const file of snapshotFiles(sdk, types).filter(file => file.path.endsWith('.d.ts'))) {
      const target = join(pkg, relative(join(sdk, plugin.path), join(sdk, file.path)));
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(join(sdk, file.path)));
    }
  }
  const esbuild = createSdkRequire(sdk)('esbuild');
  await esbuild.build({ entryPoints, outdir: out, bundle: true, splitting: true, format: 'esm', platform: 'node', target: 'es2024',
    chunkNames: 'chunks/[name]-[hash]', banner: { js: "import { createRequire as buildrSourceRequire } from 'node:module'; const require = buildrSourceRequire(import.meta.url);" },
    plugins: [{ name: 'selected-host-closure', setup(build: { onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => unknown): void }) {
      build.onResolve({ filter: /^@deepseek-ai\// }, args => {
        const plugin = plugins.find(plugin => args.path === plugin.name || args.path.startsWith(plugin.name + '/'));
        return plugin === undefined ? { path: args.path, external: true } : { path: runtimePath(plugin, args.path) };
      });
    } }], metafile: true,
  });
  const entries = plugins.map(plugin => ({ packagePath: plugin.path, name: plugin.name, entryId: plugin.entryId, entry: hostEntry(plugin.path) }));
  return parseSourceHostArtifacts({ directory: HOST_ARTIFACT_DIRECTORY, entries, files: snapshotFiles(sdk, out) });
}

/** Run focused Host codegen, Client declarations and the existing trajectory bundle build; never launch an app. */
export async function prepareSourceSdk(sourceRoot: string, manifestFile: string, node: string): Promise<{ sdk: string; receipt: SourceSdkReceipt }> {
  if (!isAbsolute(node) || !lstatSync(node).isFile()) fail('an explicit Node executable path is required');
  const prepared = stageSourceSdk(sourceRoot, resolve(manifestFile));
  const { sdk } = prepared;
  const req = createSdkRequire(sdk);
  const ts = req('typescript');
  const { tsImport } = req('tsx/esm/api');
  const { WorkspaceTypertGenerator } = await tsImport(pathToFileURL(join(sdk, 'packages/typert/generator/src/index.ts')).href, import.meta.url);
  const remoteSource = ts.createSourceFile('remotes.ts', readFileSync(join(sdk, 'packages/api/remotes/src/client/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const remotePackages: string[] = [...new Set<string>(remoteSource.statements.flatMap((statement: { moduleSpecifier?: { text?: string } }) => typeof statement.moduleSpecifier?.text === 'string' && statement.moduleSpecifier.text.endsWith('/remote') ? [statement.moduleSpecifier.text.slice(0, -'/remote'.length)] : []))].sort();
  if (remotePackages.length === 0) fail('the actual Remote assembly selected no Host contributors');
  const generator = new WorkspaceTypertGenerator(sdk);
  const contributors = generator.discover(['host']);
  const roots = remotePackages.map(name => {
    const contributor = contributors.find((item: { package: string }) => item.package === name);
    if (contributor === undefined) fail(`Host reflection provider not found: ${name}`);
    return join(sdk, contributor.root);
  });
  const hostConfigs = roots.map(root => existsSync(join(root, 'tsconfig.host.json')) ? join(root, 'tsconfig.host.json') : join(root, 'tsconfig.json'));
  const capture = prepared.manifest.schemaVersion === 'buildr.dsh-source-patch/v2';
  if (capture) for (const path of prepared.manifest.hostPackages!) hostConfigs.push(join(sdk, path, 'tsconfig.json'));
  const run = (args: string[]) => execFileSync(node, args, { cwd: sdk, stdio: 'inherit', env: { ...process.env, PATH: `${dirname(node)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` } });
  const tsc = req.resolve('typescript/bin/tsc');
  run(['--max-old-space-size=6144', tsc, '-b', ...hostConfigs]);
  // The Host projects passed tsc in this same orchestration, matching the SDK's own tsdown plugin.
  const artifacts = new WorkspaceTypertGenerator(sdk, { checkDiagnostics: false }).generate(remotePackages, ['host']);
  const generated: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.remote === undefined) fail(`selected Host package emitted no Remote reflection: ${artifact.package}`);
    const output = contained(sdk, join(sdk, artifact.packageRoot, 'lib'));
    mkdirSync(output, { recursive: true });
    for (const [name, content] of Object.entries({ 'typert.host.js': artifact.js, 'typert.host.d.ts': artifact.dts, 'typert.remote-client.js': artifact.remote.js, 'typert.remote-client.d.ts': artifact.remote.dts })) {
      const file = join(output, name);
      writeFileSync(file, String(content));
      generated.push(relative(sdk, file).split(sep).join('/'));
    }
    if (artifact.remote.dtsMap !== undefined) writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap);
  }
  run([tsc, '-b', ...CLIENT_PROJECTS, ...(prepared.manifest.clientPackages ?? []).map(path => `${path}/tsconfig.json`)]);
  verifySourceSdkApi(sdk, capture);
  execFileSync(node, [trajectoryBundleTool(sdk)], { cwd: join(sdk, TRAJECTORY), stdio: 'inherit', env: { ...process.env, PATH: `${dirname(node)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` } });
  for (const packagePath of prepared.manifest.clientPackages ?? []) execFileSync(node, [sourceBundleTool(sdk, packagePath)], { cwd: join(sdk, packagePath), stdio: 'inherit', env: { ...process.env, PATH: `${dirname(node)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` } });
  const hostArtifacts = capture ? await buildSourceHostArtifacts(sdk, prepared.manifest) : undefined;
  const emitted = generatedFiles(sdk, prepared.sourceFiles);
  const declarations = emitted.filter(file => file.path.endsWith('.d.ts'));
  const artifactFiles = emitted.filter(file => file.path.endsWith('.js'));
  const receipt: SourceSdkReceipt = {
    schemaVersion: capture ? 'buildr.dsh-source-sdk/v2' : 'buildr.dsh-source-sdk/v1', status: 'ready', baseline: prepared.manifest.upstream,
    sourceManifest: { path: realpathSync(manifestFile), sha256: fileHash(manifestFile) }, patchSha256: prepared.manifest.patch.sha256,
    sourceCheckout: realpathSync(sourceRoot), upstreamArchiveSha256: fileHash(join(prepared.stage, 'upstream.tar')),
    sourceFiles: prepared.sourceFiles, declarations, artifacts: artifactFiles, remotePackages,
    ...(hostArtifacts === undefined ? {} : { hostArtifacts }),
    ...(prepared.manifest.clientPackages === undefined ? {} : { clientPackages: prepared.manifest.clientPackages }),
    contracts: { slots: SOURCE_SDK_SLOTS, recordContext: 'TrajectoryRecordContext', recordContexts: 'TrajectorySnapshot.recordContexts', rawEventRefs: true, idEncoding: SOURCE_RECORD_ID_ENCODING, ...(capture ? { eventSources: SOURCE_EVENT_CONTRACT } : {}) },
  };
  verifyPreparedSourceReceipt(sdk, receipt, SERVICE_ROOT);
  const pending = join(sdk, `${SOURCE_SDK_RECEIPT}.pending-${randomUUID()}`);
  const ready = join(sdk, SOURCE_SDK_RECEIPT);
  writeFileSync(pending, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', flush: true });
  if (realpathSync(dirname(pending)) !== sdk || realpathSync(dirname(ready)) !== sdk || !lstatSync(pending).isFile() || existsSync(ready)) fail('ready publication paths are not the exclusive prepared SDK');
  // Hard-link publication is atomic and refuses an existing destination; retain pending bytes as evidence.
  linkSync(pending, ready);
  return { sdk, receipt };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string): string => { const index = args.indexOf(name), value = args[index + 1]; if (index < 0 || !value || value.startsWith('--')) fail(`required option ${name}`); return value; };
  for (let index = 0; index < args.length; index += 2) { const name = args[index]; if (name === undefined || !['--source', '--manifest', '--node'].includes(name)) fail(`unknown option ${name}`); }
  const result = await prepareSourceSdk(option('--source'), option('--manifest'), option('--node'));
  console.log(JSON.stringify({ status: 'prepared', sdk: result.sdk, baseline: result.receipt.baseline, patchSha256: result.receipt.patchSha256, contracts: result.receipt.contracts, runtimeActivated: false, desktopValidated: false }));
}
