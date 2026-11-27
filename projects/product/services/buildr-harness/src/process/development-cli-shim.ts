import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readYamlTopLevelScalars } from '../application/local-workspaces.ts';
import { defaultHarnessDataRoot } from '../profile.ts';

export const DEVELOPMENT_SOURCE_SCHEMA = 'buildr.development-source/v1';
export const DEVELOPMENT_SOURCE_FILENAME = 'development-source.json';

const LAUNCHER_IDENTITY_SCHEMA = 'buildr.launcher-identity/v1';
const WORKSPACE_SCHEMA_V1 = 'buildr.workspace/v1';
const WORKSPACE_MANAGEMENT_SCHEMA = 'buildr.workspace-web-management/v1';
const OWNER_SCHEMA = 'buildr.workspace-web-management-owner/v1';
const WORKSPACE_REGISTRY_SCHEMA = 'buildr.local-workspace-registry/v1';
const WEB_PROFILE_SCHEMA = 'buildr.web-profile/v1';
const PROTOCOL_IDENTITY = 'buildr.web-protocol/v1';
const ROUTED_ENTRY = 'BUILDR_WORKSPACE_CLI_ROUTED_ENTRY';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_NAMES = ['released', 'development'] as const;

type ProfileName = typeof PROFILE_NAMES[number];

export type DevelopmentSessionCliPlan =
  | { kind: 'development'; command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string; sourceRoot: string }
  | { kind: 'downstream'; command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string };

export interface DevelopmentSessionCliOptions {
  dataRoot: string;
  shimDir: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  defaultDevelopmentDataRoot?: string;
  developmentLauncherRoot?: string;
  releasedDataRoot?: string;
}

interface ManagementClaim {
  workspaceId: string;
  canonicalRoot: string;
  owner: {
    profile: ProfileName;
    channel: string;
    runtimeRole: string;
    profileIdentity: string;
  };
}

interface WorkspaceObservation {
  root: string;
  id: string;
  claim: { status: 'ready' | 'absent' | 'invalid'; record: ManagementClaim | null; reason: string | null };
}

interface RegistryObservation {
  file: string;
  status: 'ready' | 'absent' | 'invalid';
  roots: string[];
  reason: string | null;
}

function routingError(code: string, message: string, details?: unknown, nextAction?: string): Error & { code: string; details?: unknown; nextAction: string } {
  return Object.assign(new Error(message), {
    code: `workspace_cli.${code}`,
    ...(details === undefined ? {} : { details }),
    nextAction: nextAction ?? '核对目标工作空间的现有管理登记或开发来源；开发来源不可用时恢复已登记源码或重新安装 Buildr Dev。不要直接改写本机归属或 SQLite。',
  });
}

function sha256(value: string): string {
  return `sha256-${createHash('sha256').update(value).digest('hex')}`;
}

function resolvePathForPlatform(value: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? path.win32.resolve(value) : path.resolve(value);
}

function isConfirmedMissingPath(value: string): boolean {
  let current = path.resolve(value);
  while (true) {
    try {
      fs.lstatSync(current);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      const parent = path.dirname(current);
      if (parent === current) return false;
      current = parent;
    }
  }
}

function sameFilesystemPath(left: string, right: string): boolean {
  const canonical = (value: string) => {
    try { return fs.realpathSync(path.resolve(value)); }
    catch { return path.resolve(value); }
  };
  return canonical(left) === canonical(right);
}

function existing(value: string): boolean {
  try { return Boolean(fs.lstatSync(value, { throwIfNoEntry: false })); }
  catch (error) { throw routingError('path_unreadable', `无法读取选版所需路径：${value}。`, String(error)); }
}

function realDirectory(value: string): string | null {
  try {
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
    return resolved;
  } catch (error) {
    if (isConfirmedMissingPath(value)) return null;
    throw routingError('target_unreadable', `无法确认命令目标目录：${value}。`, String(error));
  }
}

export function developmentLauncherCandidates(platform: NodeJS.Platform = process.platform, options: { env?: NodeJS.ProcessEnv; home?: string } = {}): string[] {
  const env = options.env ?? process.env;
  if (platform === 'darwin') {
    return ['/Applications/Buildr Dev.app', '/Applications/Buildr Development Dev.app', '/Applications/Buildr Web Dev.app'];
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.win32.join(options.home ?? os.homedir(), 'AppData', 'Local');
    return [
      path.win32.join(localAppData, 'Programs', 'Buildr Dev'),
      path.win32.join(localAppData, 'Programs', 'Buildr Development Dev'),
      path.win32.join(localAppData, 'Programs', 'Buildr Web Dev'),
    ];
  }
  return [];
}

function launcherIdentityFile(launcherRoot: string, platform: NodeJS.Platform): string {
  return platform === 'darwin'
    ? path.join(launcherRoot, 'Contents', 'Resources', 'launcher-identity.json')
    : path.join(launcherRoot, 'launcher-identity.json');
}

function resolveDefaultLauncherRoot(platform: NodeJS.Platform, options: { env?: NodeJS.ProcessEnv; home?: string }): string | null {
  const candidates = developmentLauncherCandidates(platform, options);
  for (const candidate of candidates) {
    if (fs.existsSync(launcherIdentityFile(candidate, platform)) || fs.existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? null;
}

function hostHomeFor(options: { home?: string }, env: NodeJS.ProcessEnv): string | undefined {
  if (options.home) return options.home;
  const host = env.BUILDR_HOST_HOME?.trim();
  return host && path.isAbsolute(host) ? host : undefined;
}

/** True only when this exact dataRoot declares a development source, or is the default development root with a platform launcher. */
export function hasDevelopmentCliRegistration(
  dataRoot: string,
  options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; home?: string; defaultDevelopmentDataRoot?: string; developmentLauncherRoot?: string } = {},
): boolean {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const resolvedDataRoot = path.resolve(dataRoot);
  if (fs.lstatSync(path.join(resolvedDataRoot, DEVELOPMENT_SOURCE_FILENAME), { throwIfNoEntry: false })) {
    return true;
  }
  const hostHome = hostHomeFor(options, env);
  const defaultDevRoot = options.defaultDevelopmentDataRoot
    ? path.resolve(options.defaultDevelopmentDataRoot)
    : path.resolve(defaultHarnessDataRoot('development', { platform, env, home: hostHome }));
  if (!sameFilesystemPath(resolvedDataRoot, defaultDevRoot)) return false;
  if (options.developmentLauncherRoot) {
    return Boolean(fs.lstatSync(launcherIdentityFile(options.developmentLauncherRoot, platform), { throwIfNoEntry: false }));
  }
  return developmentLauncherCandidates(platform, { env, home: hostHome }).some(candidate =>
    Boolean(fs.lstatSync(launcherIdentityFile(candidate, platform), { throwIfNoEntry: false })),
  );
}

function stripShimDirectory(rawPath: string | undefined, shimDir: string, platform: NodeJS.Platform): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  return (rawPath ?? '')
    .split(delimiter)
    .filter(entry => entry && !sameFilesystemPath(entry, shimDir))
    .join(delimiter);
}

function findDownstreamBuildr(strippedPath: string, shimDir: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | null {
  const delimiter = platform === 'win32' ? ';' : ':';
  const names = platform === 'win32'
    ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean).map(ext => `buildr${ext.toLowerCase()}`)
    : ['buildr'];
  const candidates = platform === 'win32'
    ? [...new Set(['buildr.cmd', 'buildr.exe', 'buildr.bat', ...names, 'buildr'])]
    : names;
  for (const directory of strippedPath.split(delimiter)) {
    if (!directory || !path.isAbsolute(directory) || sameFilesystemPath(directory, shimDir)) continue;
    for (const name of candidates) {
      const candidate = path.join(directory, name);
      try {
        const stat = fs.statSync(candidate);
        if (!stat.isFile()) continue;
        if (platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Continue checking remaining PATH entries.
      }
    }
  }
  return null;
}

function isGlobalInstallationCommand(args: readonly string[]): boolean {
  const [domain, action] = args;
  return ['update', 'installation', '__internal'].includes(domain ?? '')
    || (domain === 'web' && action === 'launcher')
    || (domain === 'web' && !args.includes('--target'));
}

function targetArgument(args: readonly string[]): string | null {
  const end = args.indexOf('--');
  const flags = end < 0 ? args : args.slice(0, end);
  const indexes = flags.flatMap((value, index) => value === '--target' ? [index] : []);
  if (indexes.length > 1) throw routingError('target_invalid', '选版目标 --target 只能出现一次。');
  if (!indexes.length) return null;
  const value = flags[indexes[0]! + 1];
  if (!value || value.startsWith('--')) throw routingError('target_invalid', '--target 缺少目标目录。');
  return value;
}

function findWorkspaceRoot(start: string): string | null {
  let current = start;
  while (true) {
    if (existing(path.join(current, '.buildr', 'workspace.yml')) || existing(path.join(current, '.buildr', 'local', 'web-management.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseWorkspaceMetadata(file: string): { canonical: boolean; id: string | null } {
  const scalars = readYamlTopLevelScalars(fs.readFileSync(file, 'utf8'));
  const schema = scalars.schemaVersion;
  if (schema === WORKSPACE_SCHEMA_V1) {
    const id = scalars.id;
    const name = scalars.name;
    if (!id || !UUID_PATTERN.test(id) || !name) {
      throw new Error(`${file} lacks a valid canonical id or name.`);
    }
    return { canonical: true, id };
  }
  if (schema === undefined || schema === '1') {
    if (!scalars.name) throw new Error(`${file}.name must be a non-empty string.`);
    return { canonical: false, id: null };
  }
  throw new Error(`${file}.schemaVersion is unsupported.`);
}

function readManagementClaim(file: string): { status: 'ready' | 'absent' | 'invalid'; record: ManagementClaim | null; reason: string | null } {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, any>;
    const fields = ['canonicalRoot', 'claimedAt', 'owner', 'schemaVersion', 'workspaceId'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields.sort().join(',')) {
      throw new Error('management record fields are invalid');
    }
    if (value.schemaVersion !== WORKSPACE_MANAGEMENT_SCHEMA) throw new Error('management record schema is unsupported');
    if (typeof value.workspaceId !== 'string' || !UUID_PATTERN.test(value.workspaceId)) throw new Error('management record Workspace UUID is invalid');
    if (typeof value.canonicalRoot !== 'string' || !path.isAbsolute(value.canonicalRoot)) throw new Error('management record canonical root is invalid');
    if (typeof value.claimedAt !== 'string' || !Number.isFinite(Date.parse(value.claimedAt))) throw new Error('management record claimedAt is invalid');
    const owner = value.owner as Record<string, any>;
    const ownerFields = ['channel', 'profile', 'profileIdentity', 'runtimeRole', 'schemaVersion'];
    if (!owner || typeof owner !== 'object' || Array.isArray(owner) || Object.keys(owner).sort().join(',') !== ownerFields.sort().join(',')) {
      throw new Error('management owner fields are invalid');
    }
    if (owner.schemaVersion !== OWNER_SCHEMA) throw new Error('management owner schema is unsupported');
    if (owner.profile !== 'released' && owner.profile !== 'development') throw new Error('management owner profile is unsupported');
    if ((owner.profile === 'released') !== (owner.channel === 'npm' && owner.runtimeRole === 'host')) throw new Error('management owner released identity is inconsistent');
    if ((owner.profile === 'development') !== (owner.channel === 'development' && owner.runtimeRole === 'development')) throw new Error('management owner development identity is inconsistent');
    if (typeof owner.profileIdentity !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(owner.profileIdentity)) throw new Error('management owner profile identity is invalid');
    return {
      status: 'ready',
      record: {
        workspaceId: value.workspaceId,
        canonicalRoot: path.resolve(value.canonicalRoot),
        owner: {
          profile: owner.profile,
          channel: owner.channel,
          runtimeRole: owner.runtimeRole,
          profileIdentity: owner.profileIdentity,
        },
      },
      reason: null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && isConfirmedMissingPath(file)) {
      return { status: 'absent', record: null, reason: null };
    }
    return { status: 'invalid', record: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

function observeWorkspace(root: string): WorkspaceObservation {
  const file = path.join(root, '.buildr', 'workspace.yml');
  let metadata: { canonical: boolean; id: string | null };
  try { metadata = parseWorkspaceMetadata(file); }
  catch (error) { throw routingError('workspace_identity_invalid', `无法核对工作空间身份：${file}。`, String(error)); }
  if (!metadata.canonical || !metadata.id) {
    throw routingError('workspace_identity_invalid', `工作空间缺少可核验的正式身份：${file}。`);
  }
  const claim = readManagementClaim(path.join(root, '.buildr', 'local', 'web-management.json'));
  if (claim.status === 'invalid') throw routingError('management_record_invalid', `工作空间管理归属损坏：${root}。`, claim.reason);
  return { root, id: metadata.id, claim };
}

function readRegistry(file: string): RegistryObservation {
  const resolved = path.resolve(file);
  let content: string;
  try { content = fs.readFileSync(resolved, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && isConfirmedMissingPath(resolved)) {
      return { file: resolved, status: 'absent', roots: [], reason: null };
    }
    return { file: resolved, status: 'invalid', roots: [], reason: `workspace-registry.json cannot be read: ${String(error)}` };
  }
  let value: Record<string, any>;
  try { value = JSON.parse(content) as Record<string, any>; }
  catch (error) {
    return { file: resolved, status: 'invalid', roots: [], reason: `workspace-registry.json is invalid JSON: ${String(error)}` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { file: resolved, status: 'invalid', roots: [], reason: 'workspace-registry.json must be a JSON object.' };
  }
  const supported = new Set(['schemaVersion', 'roots', 'lastOpenedRoot']);
  for (const field of Object.keys(value)) {
    if (!supported.has(field)) return { file: resolved, status: 'invalid', roots: [], reason: `workspace-registry.json.${field} is not supported.` };
  }
  if (value.schemaVersion !== WORKSPACE_REGISTRY_SCHEMA) {
    return { file: resolved, status: 'invalid', roots: [], reason: `workspace-registry.json.schemaVersion must be ${WORKSPACE_REGISTRY_SCHEMA}.` };
  }
  if (!Array.isArray(value.roots) || value.roots.some((root: unknown) => typeof root !== 'string' || !path.isAbsolute(root))) {
    return { file: resolved, status: 'invalid', roots: [], reason: 'workspace-registry.json.roots must contain absolute paths.' };
  }
  const roots = [...new Set<string>(value.roots.map((root: string) => path.resolve(root)))];
  const lastOpenedRoot = value.lastOpenedRoot === null || value.lastOpenedRoot === undefined ? null : path.resolve(String(value.lastOpenedRoot));
  if (lastOpenedRoot !== null && !roots.includes(lastOpenedRoot)) {
    return { file: resolved, status: 'invalid', roots: [], reason: 'workspace-registry.json.lastOpenedRoot must reference a registered root.' };
  }
  return { file: resolved, status: 'ready', roots, reason: null };
}

function registryHasRoot(observation: RegistryObservation, root: string): boolean {
  return observation.roots.some(candidate => sameFilesystemPath(candidate, root));
}

function gitText(directory: string, args: string[], env: NodeJS.ProcessEnv): string | null {
  try {
    return execFileSync('git', ['-C', directory, ...args], {
      env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000, maxBuffer: 1024 * 1024,
    }).trimEnd();
  } catch { return null; }
}

function linkedWorkspace(start: string, local: WorkspaceObservation | null, env: NodeJS.ProcessEnv, registeredRoots: string[]): WorkspaceObservation | null {
  const common = gitText(start, ['rev-parse', '--git-common-dir'], env);
  const own = gitText(start, ['rev-parse', '--git-dir'], env);
  if (!common || !own || sameFilesystemPath(path.resolve(start, common), path.resolve(start, own))) return null;
  const listing = gitText(start, ['worktree', 'list', '--porcelain', '-z'], env);
  const main = listing?.split('\0').find(item => item.startsWith('worktree '))?.slice('worktree '.length);
  const mainRoot = main ? realDirectory(main) : null;
  const workspaceRoot = mainRoot ? findWorkspaceRoot(mainRoot) : null;
  let primary: WorkspaceObservation | null = null;
  if (workspaceRoot) {
    try { primary = observeWorkspace(workspaceRoot); }
    catch (error) { if (!local) throw error; }
  }
  if (local && primary?.id !== local.id) primary = null;
  const workspaceId = local?.id ?? primary?.id;
  const matches: WorkspaceObservation[] = [];
  if (workspaceId) {
    for (const registeredRoot of registeredRoots) {
      let root: string | null;
      let metadata: { canonical: boolean; id: string | null };
      try {
        root = realDirectory(registeredRoot);
        if (!root || matches.some(item => sameFilesystemPath(item.root, root!))) continue;
        metadata = parseWorkspaceMetadata(path.join(root, '.buildr', 'workspace.yml'));
      } catch { continue; }
      if (!metadata.canonical || metadata.id !== workspaceId) continue;
      const topLevel = gitText(root, ['rev-parse', '--show-toplevel'], env);
      const candidateCommon = gitText(root, ['rev-parse', '--git-common-dir'], env);
      if (!topLevel || !sameFilesystemPath(root, topLevel) || !candidateCommon
          || !sameFilesystemPath(path.resolve(root, candidateCommon), path.resolve(start, common))) continue;
      matches.push(observeWorkspace(root));
    }
  }
  if (matches.length > 1) {
    throw routingError('workspace_identity_conflict', '同一代码库的工作树对应多个已登记工作空间根，无法确定唯一管理归属。', matches.map(item => item.root));
  }
  return matches[0] ?? primary;
}

function profileIdentityFor(profile: ProfileName, dataRoot: string, platform: NodeJS.Platform): string {
  const channel = profile === 'released' ? 'npm' : 'development';
  const runtimeRole = profile === 'released' ? 'host' : 'development';
  const rootIdentity = sha256(resolvePathForPlatform(dataRoot, platform));
  return sha256(JSON.stringify({ schemaVersion: WEB_PROFILE_SCHEMA, profile, channel, runtimeRole, rootIdentity }));
}

function assertClaim(workspace: WorkspaceObservation, owner: ProfileName, dataRoot: string, platform: NodeJS.Platform, canonicalRoot = workspace.root): void {
  const record = workspace.claim.record;
  if (!record) return;
  const expectedChannel = owner === 'released' ? 'npm' : 'development';
  const expectedRole = owner === 'released' ? 'host' : 'development';
  const expectedIdentity = profileIdentityFor(owner, dataRoot, platform);
  if (record.workspaceId !== workspace.id || !sameFilesystemPath(record.canonicalRoot, canonicalRoot)
      || record.owner.profile !== owner || record.owner.channel !== expectedChannel
      || record.owner.runtimeRole !== expectedRole || record.owner.profileIdentity !== expectedIdentity) {
    throw routingError('management_conflict', `工作空间管理归属与当前真实身份或登记不一致：${workspace.root}。`, { record, expectedProfile: owner, canonicalRoot });
  }
}

function resolveWorkspaceOwner(
  start: string,
  args: readonly string[],
  dataRoots: Record<ProfileName, string>,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): ProfileName | 'unregistered' {
  const localRoot = args[0] === 'init'
    ? (existing(path.join(start, '.buildr', 'workspace.yml')) ? start : null)
    : findWorkspaceRoot(start);
  if (args[0] === 'init' && !localRoot) return 'unregistered';
  const registries: Record<ProfileName, RegistryObservation> = {
    released: readRegistry(path.join(dataRoots.released, 'workspace-registry.json')),
    development: readRegistry(path.join(dataRoots.development, 'workspace-registry.json')),
  };
  let local: WorkspaceObservation | null = null;
  if (localRoot) {
    try { local = observeWorkspace(localRoot); }
    catch (error) {
      const claim = readManagementClaim(path.join(localRoot, '.buildr', 'local', 'web-management.json'));
      if ((error as { code?: string }).code !== 'workspace_cli.workspace_identity_invalid'
          || claim.status !== 'absent' || PROFILE_NAMES.some(name => registryHasRoot(registries[name], localRoot))) {
        throw error;
      }
      return 'unregistered';
    }
  }
  let workspace = local;
  let memberships = workspace ? PROFILE_NAMES.filter(name => registryHasRoot(registries[name], workspace!.root)) : [];
  if (!memberships.length && args[0] !== 'init') {
    const linked = linkedWorkspace(start, local, env, PROFILE_NAMES.flatMap(name => registries[name].roots));
    if (linked) {
      workspace = linked;
      memberships = PROFILE_NAMES.filter(name => registryHasRoot(registries[name], linked.root));
    }
  }
  if (!workspace) return 'unregistered';
  if (memberships.length > 1) throw routingError('management_conflict', `同一工作空间同时登记在开发版和发布版：${workspace.root}。`);
  if (!memberships.length) {
    if (workspace.claim.record || local?.claim.record) {
      throw routingError('management_registry_mismatch', `工作空间留有管理归属，但找不到匹配的有效登记：${workspace.root}。`);
    }
    for (const name of PROFILE_NAMES) {
      if (registries[name].status === 'invalid') throw routingError('registry_invalid', `无法核对 ${name} 工作空间登记：${registries[name].file}。`, registries[name].reason);
    }
    return 'unregistered';
  }
  const owner = memberships[0]!;
  assertClaim(workspace, owner, dataRoots[owner], platform);
  if (local && local.root !== workspace.root) assertClaim(local, owner, dataRoots[owner], platform, workspace.root);
  const peer = registries[owner === 'released' ? 'development' : 'released'];
  if (peer.status === 'invalid' && workspace.claim.status !== 'ready') {
    throw routingError('registry_invalid', `无法核对另一版本的工作空间登记：${peer.file}。`, peer.reason);
  }
  for (const name of PROFILE_NAMES) {
    for (const registeredRoot of registries[name].roots) {
      if (sameFilesystemPath(registeredRoot, workspace.root)) continue;
      let otherId: string | null = null;
      try { otherId = parseWorkspaceMetadata(path.join(registeredRoot, '.buildr', 'workspace.yml')).id; }
      catch { continue; }
      if (otherId === workspace.id) {
        throw routingError('workspace_identity_conflict', `同一工作空间身份对应另一登记目录：${registeredRoot}。`, { workspaceRoot: workspace.root, profile: name });
      }
    }
  }
  return owner;
}

function cleanSourceEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env };
  const fields = new Set([
    'BUILDR_NPM_ENTRY_PATH', 'BUILDR_APPLICATION_PAYLOAD_ROOT', 'BUILDR_INSTALLATION_IDENTITY',
    'BUILDR_SOURCE_ROOT', 'BUILDR_DEVELOPMENT_ENTRY', 'BUILDR_INTERNAL_PRODUCT_REENTRY',
    'BUILDR_LAUNCHER_IDENTITY', 'BUILDR_LOCAL_APP_PREVIEW', ROUTED_ENTRY,
  ]);
  for (const field of Object.keys(clean)) {
    if (fields.has(field) || field.startsWith('BUILDR_HOST_RUNTIME') || field.startsWith('BUILDR_CURRENT_PRODUCT')) delete clean[field];
  }
  return clean;
}

function assertMinimumNodeVersion(version: string, minimumVersion: string): void {
  const parse = (value: string): number[] | null => {
    if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  };
  const required = parse(minimumVersion);
  const actual = parse(version);
  if (!required) throw new Error(`Invalid minimum Node version: ${minimumVersion}.`);
  if (!actual) throw new Error(`Invalid Node version: ${version}.`);
  const [reqMajor, reqMinor, reqPatch] = required as [number, number, number];
  const [actMajor, actMinor, actPatch] = actual as [number, number, number];
  if (actMajor < reqMajor || (actMajor === reqMajor && (actMinor < reqMinor || (actMinor === reqMinor && actPatch < reqPatch)))) {
    throw new Error(`Buildr requires Node >= ${minimumVersion}, current ${version}.`);
  }
}

function verifyDevelopmentCheckout(sourceRoot: string, env: NodeJS.ProcessEnv): void {
  let metadata: { name?: unknown; version?: unknown } | null = null;
  try { metadata = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown }; }
  catch { metadata = null; }
  if (metadata?.name !== '@buildr-ai/buildr' || typeof metadata.version !== 'string' || !metadata.version) {
    throw routingError('development_identity_invalid', `无法核验开发源码包身份：${sourceRoot}。`);
  }
  const gitRoot = gitText(sourceRoot, ['rev-parse', '--show-toplevel'], env);
  const head = gitText(sourceRoot, ['rev-parse', 'HEAD'], env);
  if (!gitRoot || !head || !sameFilesystemPath(sourceRoot, path.join(gitRoot, 'projects', 'product', 'services', 'buildr'))) {
    throw routingError('development_identity_invalid', `无法核验已登记开发源码的 Git 检出身份：${sourceRoot}。`);
  }
}

function resolveDevelopmentSourceInvocation(
  options: DevelopmentSessionCliOptions,
  developmentRoot: string,
  defaultDevRoot: string,
  strippedPath: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): { command: string; entry: string; env: NodeJS.ProcessEnv; sourceRoot: string } {
  const sourceRecordFile = path.join(developmentRoot, DEVELOPMENT_SOURCE_FILENAME);
  const usingSourceRecord = existing(sourceRecordFile);
  let identityFile = sourceRecordFile;
  if (!usingSourceRecord) {
    if (!sameFilesystemPath(developmentRoot, defaultDevRoot)) {
      throw routingError('development_unavailable', `无法读取已登记的开发来源：${sourceRecordFile}。`);
    }
    const launcherRoot = options.developmentLauncherRoot ?? resolveDefaultLauncherRoot(platform, { env, home: options.home });
    if (!launcherRoot) {
      throw routingError('development_unavailable', `无法读取已登记的开发来源：${sourceRecordFile}。`);
    }
    identityFile = launcherIdentityFile(launcherRoot, platform);
  }
  let identity: Record<string, any>;
  try { identity = JSON.parse(fs.readFileSync(identityFile, 'utf8')) as Record<string, any>; }
  catch (error) {
    throw routingError('development_unavailable', usingSourceRecord ? `无法读取已登记的开发来源：${identityFile}。` : `无法读取已登记的 Buildr Dev 来源：${identityFile}。`, String(error));
  }
  const expectedSchema = usingSourceRecord ? DEVELOPMENT_SOURCE_SCHEMA : LAUNCHER_IDENTITY_SCHEMA;
  if (identity?.schemaVersion !== expectedSchema || identity.channel !== 'development'
      || identity.runtimeRole !== 'development' || identity.source !== 'checkout' || identity.platform !== platform
      || identity.protocolIdentity !== PROTOCOL_IDENTITY
      || typeof identity.sourceRoot !== 'string' || !path.isAbsolute(identity.sourceRoot)) {
    throw routingError('development_identity_invalid', usingSourceRecord ? `开发来源登记无效：${identityFile}。` : `Buildr Dev 的来源登记无效：${identityFile}。`);
  }
  const clean = cleanSourceEnvironment(env);
  const sourceRoot = realDirectory(identity.sourceRoot);
  if (!sourceRoot) {
    throw routingError('development_unavailable', `开发来源已登记源码目录不可用：${identity.sourceRoot}。`);
  }
  verifyDevelopmentCheckout(sourceRoot, clean);
  let entry: string;
  let command: string;
  const runtime = identity.developmentRuntime as { executable?: unknown; version?: unknown; identity?: unknown } | undefined;
  try {
    entry = fs.realpathSync(path.join(sourceRoot, 'bin', 'buildr.mjs'));
    const rel = path.relative(sourceRoot, entry);
    if (rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('source CLI entry escapes its checkout');
    for (const [relative, directory] of [['src', true], ['resources/manifest.yml', false], ['bin/buildr.mjs', false]] as const) {
      const stat = fs.statSync(path.join(sourceRoot, relative));
      if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`invalid source path ${relative}`);
    }
    if (!runtime || typeof runtime.executable !== 'string' || !path.isAbsolute(runtime.executable)) throw new Error('development Node executable is not absolute');
    command = fs.realpathSync(runtime.executable);
    if (!fs.statSync(command).isFile()) throw new Error('development Node is not a file');
    if (platform !== 'win32') fs.accessSync(command, fs.constants.X_OK);
    const version = execFileSync(command, ['-p', 'process.versions.node'], { env: clean, encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (version !== runtime.version || runtime.identity !== `development-host:${command}:${version}`) throw new Error('development Node differs from its registered runtime identity');
    const minimum = fs.readFileSync(path.resolve(sourceRoot, '..', '..', '.node-version'), 'utf8').trim();
    assertMinimumNodeVersion(version, minimum);
  } catch (error) {
    throw routingError('development_unavailable', `开发来源的已登记程序或 Node 不可用：${sourceRoot}。`, String(error));
  }
  if (sameFilesystemPath(developmentRoot, defaultHarnessDataRoot('development', { platform, env: clean }))) {
    delete clean.BUILDR_APP_DATA_DIR;
  } else {
    clean.BUILDR_APP_DATA_DIR = developmentRoot;
  }
  clean.BUILDR_NODE = command;
  clean[ROUTED_ENTRY] = entry;
  clean.PATH = [path.join(sourceRoot, 'tools', 'development', 'programs'), path.dirname(command), strippedPath].filter(Boolean).join(path.delimiter);
  return { command, entry, env: clean, sourceRoot };
}

function downstreamPlan(
  userArgs: readonly string[],
  cwd: string,
  strippedPath: string,
  shimDir: string,
  developmentRoot: string,
  releasedRoot: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): DevelopmentSessionCliPlan {
  const executable = findDownstreamBuildr(strippedPath, shimDir, platform, env);
  if (!executable) {
    throw routingError(
      'npm_cli_unavailable',
      '当前命令需要全局 npm Buildr 入口，但未在环境 PATH 中找到可用的外部 `buildr` 程序。',
      { path: strippedPath },
      '请先安装 `@buildr-ai/buildr` npm 包，或在终端中确认默认 `buildr` 命令可用后重试。',
    );
  }
  const downstreamEnv: NodeJS.ProcessEnv = { ...env, PATH: strippedPath };
  if (downstreamEnv.BUILDR_APP_DATA_DIR && sameFilesystemPath(downstreamEnv.BUILDR_APP_DATA_DIR, developmentRoot)) {
    if (sameFilesystemPath(releasedRoot, defaultHarnessDataRoot('released', { platform, env: downstreamEnv }))) {
      delete downstreamEnv.BUILDR_APP_DATA_DIR;
    } else {
      downstreamEnv.BUILDR_APP_DATA_DIR = releasedRoot;
    }
  }
  return {
    kind: 'downstream',
    command: executable,
    args: [...userArgs],
    env: downstreamEnv,
    cwd,
  };
}

export function planDevelopmentSessionCli(userArgs: readonly string[], options: DevelopmentSessionCliOptions): DevelopmentSessionCliPlan {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const hostHome = hostHomeFor(options, env);
  const developmentRoot = path.resolve(options.dataRoot);
  const defaultDevRoot = options.defaultDevelopmentDataRoot
    ? path.resolve(options.defaultDevelopmentDataRoot)
    : path.resolve(defaultHarnessDataRoot('development', { platform, env, home: hostHome }));
  const releasedRoot = options.releasedDataRoot
    ? path.resolve(options.releasedDataRoot)
    : sameFilesystemPath(developmentRoot, defaultDevRoot)
      ? path.resolve(defaultHarnessDataRoot('released', { platform, env, home: hostHome }))
      : path.join(developmentRoot, '.peer', 'released');
  const strippedPath = stripShimDirectory(env.PATH, options.shimDir, platform);

  // Reject malformed --target before deciding downstream/development routing.
  const explicitTarget = targetArgument(userArgs);
  if (isGlobalInstallationCommand(userArgs)) {
    return downstreamPlan(userArgs, cwd, strippedPath, options.shimDir, developmentRoot, releasedRoot, platform, env);
  }
  const selectedTarget = path.resolve(cwd, explicitTarget ?? '.');
  const start = realDirectory(selectedTarget);
  const owner = start ? resolveWorkspaceOwner(start, userArgs, { released: releasedRoot, development: developmentRoot }, platform, env) : 'unregistered';
  if (owner === 'released') {
    return downstreamPlan(userArgs, cwd, strippedPath, options.shimDir, developmentRoot, releasedRoot, platform, env);
  }
  const invocation = resolveDevelopmentSourceInvocation(options, developmentRoot, defaultDevRoot, strippedPath, platform, env);
  return {
    kind: 'development',
    command: invocation.command,
    args: [invocation.entry, ...userArgs],
    env: invocation.env,
    cwd,
    sourceRoot: invocation.sourceRoot,
  };
}

function quoteWindowsArgument(value: string): string {
  if (value.length === 0) return '""';
  if (!/[\s"&|<>^()]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, '$1$1')}"`;
}

export async function runDevelopmentSessionCli(userArgs: readonly string[], options: DevelopmentSessionCliOptions): Promise<void> {
  const plan = planDevelopmentSessionCli(userArgs, options);
  const platform = options.platform ?? process.platform;
  const windowsShim = platform === 'win32' && /\.(?:cmd|bat)$/i.test(plan.command);
  const executable = windowsShim ? quoteWindowsArgument(plan.command) : plan.command;
  const spawnArgs = windowsShim ? plan.args.map(quoteWindowsArgument) : plan.args;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, spawnArgs, { cwd: plan.cwd, env: plan.env, stdio: 'inherit', shell: windowsShim });
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const handlers = signals.map(signal => ({
      signal,
      handler: () => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); },
    }));
    for (const { signal, handler } of handlers) process.on(signal, handler);
    const cleanup = () => { for (const { signal, handler } of handlers) process.off(signal, handler); };
    child.once('error', error => {
      cleanup();
      reject(routingError('forward_failed', `无法启动选定的 Buildr CLI：${plan.command}。`, String(error)));
    });
    child.once('close', (code, signal) => {
      cleanup();
      if (signal) {
        try { process.kill(process.pid, signal); }
        catch { process.exitCode = 128 + (os.constants.signals[signal] ?? 1); }
      } else {
        process.exitCode = code ?? 1;
      }
      resolve();
    });
  });
}

function parseShimCliArgs(argv: readonly string[]): { dataRoot: string; shimDir: string; userArgs: string[] } {
  let dataRoot = '';
  let shimDir = '';
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index]!;
    if (arg === '--') {
      index++;
      break;
    }
    if (arg === '--data-root') {
      dataRoot = argv[++index] ?? '';
      index++;
      continue;
    }
    if (arg === '--shim-dir') {
      shimDir = argv[++index] ?? '';
      index++;
      continue;
    }
    throw routingError('shim_arguments_invalid', `开发会话 Buildr 入口参数无效：${arg}。`);
  }
  if (!dataRoot || !shimDir) {
    throw routingError('shim_arguments_invalid', '开发会话 Buildr 入口缺少 --data-root 或 --shim-dir。');
  }
  return { dataRoot, shimDir, userArgs: argv.slice(index) };
}

async function main(): Promise<void> {
  try {
    const parsed = parseShimCliArgs(process.argv.slice(2));
    await runDevelopmentSessionCli(parsed.userArgs, { dataRoot: parsed.dataRoot, shimDir: parsed.shimDir });
  } catch (error: any) {
    console.error(`[${error?.code || 'workspace_cli.failed'}] ${error?.message || String(error)}`);
    if (error?.nextAction) console.error(error.nextAction);
    process.exitCode = 1;
  }
}

// Keep the shared module synchronous for public package consumers that use require().
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
