import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';

import { defaultWebDataRoot, resolveWebProfile } from '../contracts/web-profile.ts';
import { readCurrentInstallationOrigin } from '../infrastructure/installation-origin.ts';
import { assertMinimumNodeVersion } from '../../../infrastructure/process.ts';
import { isConfirmedMissingPath, sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { parseWorkspaceManifest } from '../../workspace/persistence/workspace-manifest-repository.ts';
import { readWorkspaceRegistryFile } from '../../workspace/persistence/workspace-registry-repository.ts';
import { readWorkspaceManagementRecord } from '../../workspace/infrastructure/workspace-management-fence.ts';

type ProfileName = 'released' | 'development';
type WebProfile = ReturnType<typeof resolveWebProfile>;
type RegistryObservation = ReturnType<typeof readWorkspaceRegistryFile>;
type WorkspaceObservation = { root: string; id: string; claim: ReturnType<typeof readWorkspaceManagementRecord> };

export type WorkspaceCliRoutingOptions = {
  entryPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  dataRoots?: Partial<Record<ProfileName, string>>;
  developmentLauncherRoot?: string;
};

export type WorkspaceCliRoutingPlan =
  | { kind: 'local'; reason: string }
  | { kind: 'forward'; workspaceRoot: string; profile: 'development'; command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string };

const ROUTED_ENTRY = 'BUILDR_WORKSPACE_CLI_ROUTED_ENTRY';
const PROFILE_NAMES: ProfileName[] = ['released', 'development'];

function routingError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown; nextAction: string } {
  return Object.assign(new Error(message), {
    code: `workspace_cli.${code}`,
    ...(details === undefined ? {} : { details }),
    nextAction: '核对目标工作空间的现有管理登记；开发来源不可用时恢复已登记源码或重新安装 Buildr Web Dev。不要直接改写本机归属或 SQLite。',
  });
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

function findWorkspaceRoot(start: string): string | null {
  let current = start;
  while (true) {
    if (existing(path.join(current, '.buildr', 'workspace.yml')) || existing(path.join(current, '.buildr', 'local', 'web-management.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function observeWorkspace(root: string): WorkspaceObservation {
  const file = path.join(root, '.buildr', 'workspace.yml');
  let metadata;
  try { metadata = parseWorkspaceManifest(fs.readFileSync(file, 'utf8'), file); }
  catch (error) { throw routingError('workspace_identity_invalid', `无法核对工作空间身份：${file}。`, String(error)); }
  if (!metadata.canonical || !metadata.workspace.id) throw routingError('workspace_identity_invalid', `工作空间缺少可核验的正式身份：${file}。`);
  const claim = readWorkspaceManagementRecord(path.join(root, '.buildr', 'local', 'web-management.json'));
  if (claim.status === 'invalid') throw routingError('management_record_invalid', `工作空间管理归属损坏：${root}。`, claim.reason);
  return { root, id: metadata.workspace.id, claim };
}

function gitText(directory: string, args: string[], env: NodeJS.ProcessEnv): string | null {
  try {
    return execFileSync('git', ['-C', directory, ...args], {
      env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000, maxBuffer: 1024 * 1024,
    }).trimEnd();
  } catch { return null; }
}

/** Git proves linked checkouts; a copied UUID alone never establishes this relationship. */
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
      let metadata;
      try {
        root = realDirectory(registeredRoot);
        if (!root || matches.some(item => sameFilesystemPath(item.root, root))) continue;
        metadata = parseWorkspaceManifest(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'));
      } catch { continue; }
      if (!metadata.canonical || metadata.workspace.id !== workspaceId) continue;
      const topLevel = gitText(root, ['rev-parse', '--show-toplevel'], env);
      const candidateCommon = gitText(root, ['rev-parse', '--git-common-dir'], env);
      if (!topLevel || !sameFilesystemPath(root, topLevel) || !candidateCommon
          || !sameFilesystemPath(path.resolve(root, candidateCommon), path.resolve(start, common))) continue;
      // Read ownership only after proving this is the same Workspace in the same Git family.
      matches.push(observeWorkspace(root));
    }
  }
  if (matches.length > 1) throw routingError('workspace_identity_conflict', '同一代码库的工作树对应多个已登记工作空间根，无法确定唯一管理归属。', matches.map(item => item.root));
  return matches[0] ?? primary;
}

function profilesFor(options: WorkspaceCliRoutingOptions, env: NodeJS.ProcessEnv, claimOwner?: { profile: ProfileName; profileIdentity: string }): Record<ProfileName, WebProfile> {
  const platform = options.platform ?? process.platform;
  const parameters = { platform, env, home: options.home ?? os.homedir() };
  const isolatedRoot = env.BUILDR_APP_DATA_DIR;
  const defaults = { released: defaultWebDataRoot('released', parameters), development: defaultWebDataRoot('development', parameters) };
  let overrideProfile: ProfileName = 'released';
  let inheritedDefault = false;
  if (isolatedRoot && claimOwner) {
    // A child of a GUI process can inherit its profile's data root. Only the target's
    // valid existing claim may identify that override; unclaimed objects keep npm semantics.
    inheritedDefault = PROFILE_NAMES.some(name => path.resolve(isolatedRoot) === path.resolve(defaults[name]) || sameFilesystemPath(isolatedRoot, defaults[name]));
    const claimedOverride = resolveWebProfile({ channel: claimOwner.profile === 'released' ? 'npm' : 'development', runtime: { role: claimOwner.profile === 'released' ? 'host' : 'development' } }, { ...parameters, dataRoot: isolatedRoot });
    if (claimedOverride.identity === claimOwner.profileIdentity) overrideProfile = claimOwner.profile;
  }
  const root = (profile: ProfileName) => options.dataRoots?.[profile]
    ?? (isolatedRoot && !inheritedDefault ? profile === overrideProfile ? isolatedRoot : path.join(isolatedRoot, '.peer', profile) : defaults[profile]);
  return {
    released: resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, { ...parameters, dataRoot: root('released') }),
    development: resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { ...parameters, dataRoot: root('development') }),
  };
}

function registryHasRoot(observation: RegistryObservation, root: string): boolean {
  return observation.registry?.roots.some((candidate: string) => sameFilesystemPath(candidate, root)) ?? false;
}

function assertClaim(workspace: WorkspaceObservation, profile: WebProfile, canonicalRoot = workspace.root): void {
  const record = workspace.claim.record;
  if (!record) return;
  if (record.workspaceId !== workspace.id || !sameFilesystemPath(record.canonicalRoot, canonicalRoot)
      || record.owner.profile !== profile.profile || record.owner.channel !== profile.channel
      || record.owner.runtimeRole !== profile.runtimeRole || record.owner.profileIdentity !== profile.identity) {
    throw routingError('management_conflict', `工作空间管理归属与当前真实身份或登记不一致：${workspace.root}。`, { record, expectedProfile: profile.profile, canonicalRoot });
  }
}

function chooseWorkspace(start: string, args: readonly string[], options: WorkspaceCliRoutingOptions, env: NodeJS.ProcessEnv): { workspace: WorkspaceObservation; profile: WebProfile; profiles: Record<ProfileName, WebProfile> } | null {
  const localRoot = args[0] === 'init'
    ? existing(path.join(start, '.buildr', 'workspace.yml')) ? start : null
    : findWorkspaceRoot(start);
  // init creates a new object at its exact target; it must not inherit a parent's registration.
  if (args[0] === 'init' && !localRoot) return null;
  const localClaim = localRoot ? readWorkspaceManagementRecord(path.join(localRoot, '.buildr', 'local', 'web-management.json')) : null;
  let profiles = profilesFor(options, env, localClaim?.record?.owner);
  const readRegistries = (): Record<ProfileName, RegistryObservation> => ({
    released: readWorkspaceRegistryFile(path.join(profiles.released.dataRoot, 'workspace-registry.json')),
    development: readWorkspaceRegistryFile(path.join(profiles.development.dataRoot, 'workspace-registry.json')),
  });
  let registries = readRegistries();
  let local: WorkspaceObservation | null = null;
  if (localRoot) {
    try { local = observeWorkspace(localRoot); }
    catch (error) {
      const claim = readWorkspaceManagementRecord(path.join(localRoot, '.buildr', 'local', 'web-management.json'));
      if ((error as { code?: string }).code !== 'workspace_cli.workspace_identity_invalid'
          || claim.status !== 'absent' || PROFILE_NAMES.some(name => registryHasRoot(registries[name], localRoot))) throw error;
      // An unmanaged legacy Workspace still needs the npm migration/diagnostic commands.
      // The selector must not add canonical-metadata requirements to that existing path.
      return null;
    }
  }
  let workspace = local;
  let memberships = workspace ? PROFILE_NAMES.filter(profile => registryHasRoot(registries[profile], workspace!.root)) : [];
  if (!memberships.length && args[0] !== 'init') {
    const linked = linkedWorkspace(start, local, env, PROFILE_NAMES.flatMap(name => registries[name].registry?.roots ?? []));
    if (linked) {
      workspace = linked;
      profiles = profilesFor(options, env, linked.claim.record?.owner);
      registries = readRegistries();
      memberships = PROFILE_NAMES.filter(profile => registryHasRoot(registries[profile], linked.root));
    }
  }
  if (!workspace) return null;
  if (memberships.length > 1) throw routingError('management_conflict', `同一工作空间同时登记在开发版和发布版：${workspace.root}。`);
  if (!memberships.length) {
    if (workspace.claim.record || local?.claim.record) {
      throw routingError('management_registry_mismatch', `工作空间留有管理归属，但找不到匹配的有效登记：${workspace.root}。`);
    }
    // A broken registry can contain this object; do not misreport it as definitely unregistered.
    for (const profile of PROFILE_NAMES) {
      if (registries[profile].status === 'invalid') throw routingError('registry_invalid', `无法核对 ${profile} 工作空间登记：${registries[profile].file}。`, registries[profile].reason);
    }
    return null;
  }
  const owner = memberships[0];
  const profile = profiles[owner];
  assertClaim(workspace, profile);
  if (local && local.root !== workspace.root) assertClaim(local, profile, workspace.root);
  const peer = registries[owner === 'released' ? 'development' : 'released'];
  if (peer.status === 'invalid' && workspace.claim.status !== 'ready') {
    throw routingError('registry_invalid', `无法核对另一版本的工作空间登记：${peer.file}。`, peer.reason);
  }
  // Check readable identities even with a matching claim, so a later real conflict is never hidden.
  for (const name of PROFILE_NAMES) {
    for (const registeredRoot of registries[name].registry?.roots ?? []) {
      if (sameFilesystemPath(registeredRoot, workspace.root)) continue;
      let otherId: string | null = null;
      try { otherId = parseWorkspaceManifest(fs.readFileSync(path.join(registeredRoot, '.buildr', 'workspace.yml'), 'utf8')).workspace.id; }
      catch { continue; } // Unrelated dead or unreadable roots cannot negate this object's valid claim.
      if (otherId === workspace.id) throw routingError('workspace_identity_conflict', `同一工作空间身份对应另一登记目录：${registeredRoot}。`, { workspaceRoot: workspace.root, profile: name });
    }
  }
  return { workspace, profile, profiles };
}

function targetArgument(args: readonly string[]): string | null {
  const end = args.indexOf('--');
  const flags = end < 0 ? args : args.slice(0, end);
  const indexes = flags.flatMap((value, index) => value === '--target' ? [index] : []);
  if (indexes.length > 1) throw routingError('target_invalid', '选版目标 --target 只能出现一次。');
  if (!indexes.length) return null;
  const value = flags[indexes[0] + 1];
  if (!value || value.startsWith('--')) throw routingError('target_invalid', '--target 缺少目标目录。');
  return value;
}

function cleanSourceEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env };
  const fields = new Set(['BUILDR_NPM_ENTRY_PATH', 'BUILDR_APPLICATION_PAYLOAD_ROOT', 'BUILDR_INSTALLATION_IDENTITY', 'BUILDR_SOURCE_ROOT', 'BUILDR_DEVELOPMENT_ENTRY', 'BUILDR_INTERNAL_PRODUCT_REENTRY', 'BUILDR_LAUNCHER_IDENTITY', 'BUILDR_LOCAL_APP_PREVIEW', ROUTED_ENTRY]);
  for (const field of Object.keys(clean)) {
    if (fields.has(field) || field.startsWith('BUILDR_HOST_RUNTIME') || field.startsWith('BUILDR_CURRENT_PRODUCT')) delete clean[field];
  }
  return clean;
}

function developmentInvocation(options: WorkspaceCliRoutingOptions, profiles: Record<ProfileName, WebProfile>, env: NodeJS.ProcessEnv): { command: string; entry: string; env: NodeJS.ProcessEnv } {
  const platform = options.platform ?? process.platform;
  const launcherRoot = options.developmentLauncherRoot ?? (platform === 'darwin' ? '/Applications/Buildr Web Dev.app'
    : path.join(env.LOCALAPPDATA || path.join(options.home ?? os.homedir(), 'AppData', 'Local'), 'Programs', 'Buildr Web Dev'));
  const identityFile = platform === 'darwin' ? path.join(launcherRoot, 'Contents', 'Resources', 'launcher-identity.json') : path.join(launcherRoot, 'launcher-identity.json');
  let identity;
  try { identity = JSON.parse(fs.readFileSync(identityFile, 'utf8')); }
  catch (error) { throw routingError('development_unavailable', `无法读取已登记的 Buildr Web Dev 来源：${identityFile}。`, String(error)); }
  if (identity?.schemaVersion !== 'buildr.launcher-identity/v1' || identity.channel !== 'development'
      || identity.runtimeRole !== 'development' || identity.source !== 'checkout' || identity.platform !== platform
      || typeof identity.sourceRoot !== 'string' || !path.isAbsolute(identity.sourceRoot)) {
    throw routingError('development_identity_invalid', `Buildr Web Dev 的来源登记无效：${identityFile}。`);
  }
  const clean = cleanSourceEnvironment(env);
  const sourceRoot = realDirectory(identity.sourceRoot);
  if (!sourceRoot) throw routingError('development_unavailable', `Buildr Web Dev 已登记源码目录不可用：${identity.sourceRoot}。`);
  const origin = readCurrentInstallationOrigin(sourceRoot, { includeWorkingTree: false, env: { ...clean, BUILDR_INSTALLATION_IDENTITY: '' } });
  if (origin.channel !== 'development' || origin.runtimeRole !== 'development' || origin.protocolIdentity !== identity.protocolIdentity) {
    throw routingError('development_identity_invalid', `无法核验 Buildr Web Dev 的当前源码身份：${sourceRoot}。`, origin.blockingReasons);
  }
  let entry: string;
  let command: string;
  const runtime = identity.developmentRuntime;
  try {
    entry = fs.realpathSync(path.join(sourceRoot, 'bin', 'buildr.mjs'));
    if (path.relative(sourceRoot, entry).startsWith(`..${path.sep}`) || path.isAbsolute(path.relative(sourceRoot, entry))) throw new Error('source CLI entry escapes its checkout');
    for (const [relative, directory] of [['src', true], ['resources/manifest.yml', false], ['bin/buildr.mjs', false]] as const) {
      const stat = fs.statSync(path.join(sourceRoot, relative));
      if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`invalid source path ${relative}`);
    }
    if (!runtime || typeof runtime.executable !== 'string' || !path.isAbsolute(runtime.executable)) throw new Error('development Node executable is not absolute');
    command = fs.realpathSync(runtime.executable);
    if (!fs.statSync(command).isFile()) throw new Error('development Node is not a file');
    fs.accessSync(command, fs.constants.X_OK);
    const version = execFileSync(command, ['-p', 'process.versions.node'], { env: clean, encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (version !== runtime.version || runtime.identity !== `development-host:${command}:${version}`) throw new Error('development Node differs from its registered runtime identity');
    const minimum = fs.readFileSync(path.resolve(sourceRoot, '..', '..', '.node-version'), 'utf8').trim();
    assertMinimumNodeVersion(version, minimum);
  } catch (error) { throw routingError('development_unavailable', `Buildr Web Dev 的已登记程序或 Node 不可用：${sourceRoot}。`, String(error)); }
  const sameRoot = (left: string, right: string) => path.resolve(left) === path.resolve(right) || sameFilesystemPath(left, right);
  const parameters = { platform, env: clean, home: options.home ?? os.homedir() };
  if (sameRoot(profiles.development.dataRoot, defaultWebDataRoot('development', parameters))
      && sameRoot(profiles.released.dataRoot, defaultWebDataRoot('released', parameters))) {
    delete clean.BUILDR_APP_DATA_DIR;
  } else if (sameRoot(profiles.released.dataRoot, path.join(profiles.development.dataRoot, '.peer', 'released'))) {
    clean.BUILDR_APP_DATA_DIR = profiles.development.dataRoot;
  } else {
    throw routingError('profile_roots_unrepresentable', '当前自定义网页数据目录无法在开发来源中保持相同的双版本管理范围；请从登记该工作空间的显式开发入口继续，或恢复默认网页数据目录后重试。', {
      releasedRoot: profiles.released.dataRoot, developmentRoot: profiles.development.dataRoot,
    });
  }
  clean.BUILDR_NODE = command;
  clean[ROUTED_ENTRY] = entry;
  clean.PATH = [path.join(sourceRoot, 'tools', 'development', 'programs'), path.dirname(command), ...(clean.PATH ? [clean.PATH] : [])].join(path.delimiter);
  return { command, entry, env: clean };
}

/** This entry is bundled independently for Node 18; never import a module/runtime composition here. */
export function inspectWorkspaceCliRouting(argv: readonly string[], options: WorkspaceCliRoutingOptions): WorkspaceCliRoutingPlan {
  const env = options.env ?? process.env;
  const args = argv.slice(2);
  const [domain, action] = args;
  if (env[ROUTED_ENTRY] && sameFilesystemPath(env[ROUTED_ENTRY], options.entryPath)) return { kind: 'local', reason: 'selected-entry' };
  if (domain === 'web' && (env.BUILDR_LAUNCHER_IDENTITY || env.BUILDR_LOCAL_APP_PREVIEW)) return { kind: 'local', reason: 'explicit-runtime' };
  if (['update', 'installation', '__internal'].includes(domain) || domain === 'web' && action === 'launcher') return { kind: 'local', reason: 'installation-command' };
  if (domain === 'web' && !args.includes('--target')) return { kind: 'local', reason: 'web-directory' };
  // Product/source entries are explicit bindings. Do not let target discovery reinterpret them,
  // including when that target's registration is damaged. npm packages have an origin envelope.
  let callerRoot: string | null = null;
  try { callerRoot = path.dirname(path.dirname(fs.realpathSync(options.entryPath))); } catch { /* a routed invocation reports this below */ }
  if (callerRoot && !existing(path.join(callerRoot, 'installation-origin.json')) && existing(path.join(callerRoot, 'src'))) {
    const explicit = readCurrentInstallationOrigin(callerRoot, { includeWorkingTree: false, env: { ...cleanSourceEnvironment(env), BUILDR_INSTALLATION_IDENTITY: '' } });
    if (explicit.channel === 'development') return { kind: 'local', reason: 'explicit-development-entry' };
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const selectedTarget = path.resolve(cwd, targetArgument(args) ?? '.');
  const start = realDirectory(selectedTarget);
  if (!start) return { kind: 'local', reason: 'uninitialized-target' };
  const selection = chooseWorkspace(start, args, options, env);
  if (!selection) return { kind: 'local', reason: 'unregistered-workspace' };
  if (selection.profile.profile === 'released') return { kind: 'local', reason: 'released-workspace' };
  if (!callerRoot) throw routingError('entry_invalid', `无法核验默认 Buildr 入口：${options.entryPath}。`);
  const caller = readCurrentInstallationOrigin(callerRoot, { payloadRoot: callerRoot, includeWorkingTree: false, env: { ...cleanSourceEnvironment(env), BUILDR_INSTALLATION_IDENTITY: '' } });
  if (caller.channel === 'development') return { kind: 'local', reason: 'explicit-development-entry' };
  if (caller.channel !== 'npm' || caller.runtimeRole !== 'host') throw routingError('entry_invalid', `默认 Buildr 入口缺少可信的 npm 安装身份：${options.entryPath}。`, caller.blockingReasons);
  const invocation = developmentInvocation(options, selection.profiles, env);
  return { kind: 'forward', workspaceRoot: selection.workspace.root, profile: 'development', command: invocation.command, args: [invocation.entry, ...args], env: invocation.env, cwd };
}

export async function dispatchWorkspaceCli(argv: readonly string[], options: WorkspaceCliRoutingOptions): Promise<boolean> {
  const plan = inspectWorkspaceCliRouting(argv, options);
  if (plan.kind === 'local') return false;
  return new Promise<boolean>((resolve, reject) => {
    const child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: 'inherit' });
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const forward = (signal: NodeJS.Signals) => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); };
    const handlers = signals.map(signal => ({ signal, handler: () => forward(signal) }));
    for (const { signal, handler } of handlers) process.on(signal, handler);
    const cleanup = () => { for (const { signal, handler } of handlers) process.off(signal, handler); };
    child.once('error', error => {
      cleanup();
      reject(routingError('forward_failed', `无法启动已选择的 Buildr Web Dev：${plan.args[0]}。`, String(error)));
    });
    child.once('close', (code, signal) => {
      cleanup();
      if (signal) {
        try { process.kill(process.pid, signal); }
        catch { process.exitCode = 128 + (os.constants.signals[signal] ?? 1); }
      } else process.exitCode = code ?? 1;
      resolve(true);
    });
  });
}
