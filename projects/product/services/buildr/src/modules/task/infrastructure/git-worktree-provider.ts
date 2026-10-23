import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { normalizeGitWorktreeCleanupDelivery, normalizeGitWorktreeObservedCheckouts, type GitWorktreeCleanupDeliveryInput, type GitWorktreeReviewedDelivery } from '../domain/git-worktree.ts';
import { assertCurrentCheckoutIdentity, assertLiteralWorktreePath, assertNoUnlistedNestedRepositories, assertObservedCheckoutSet } from './git-worktree-observation.ts';
import { spawnSync } from '../../../infrastructure/process.ts';
import { sameFilesystemPath } from '../../../infrastructure/git/checkout-identity.ts';
import { insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { observeGitRepositoryRoot as sourceGitRoot } from '../../../infrastructure/git/repository-boundary.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import { controlMetadataPath } from '../../../infrastructure/git/control-metadata-path.ts';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';

export const GIT_WORKTREE_PROVIDER_CAPABILITY = 'buildr.git-worktree-provider/v1';
export const GIT_WORKTREE_EVIDENCE_SCHEMA = 'buildr.git-worktree-evidence/v1';
export const TASK_WORKTREE_PROVIDER = 'task-worktree.provider';

type EntityType = 'workspace' | 'project' | 'service';
type RepositoryState = 'created' | 'reused' | 'ready' | 'blocked';
type OperationStatus = 'ready' | 'blocked' | 'cleaned';
type PreflightState = 'create' | 'reused';
type CommandResult = { status: number | null; stdout: string; stderr: string };
type WorktreeListEntry = { path: string; branch: string | null; head: string | null; locked?: boolean };
type WorktreeIdentity = { repository: string; branch: string; head: string; clean: boolean; registered: boolean };
type GitSource = {
  type?: string;
  path?: string;
  integrationBranch?: string;
  git?: { remote?: string; url?: string; integrationBranch?: string };
};
type RegisteredEntity = { source: GitSource; repositorySource?: GitSource };
type ProjectRegistry = {
  registry: { migrationRequired: boolean };
  projects: Record<string, RegisteredEntity>;
};
type ServiceRegistry = { services: Record<string, RegisteredEntity> };
export type GitWorktreeRuntime = {
  assertCanonicalTaskWorkspace(root: string): string;
  readProjectRegistryRecord(root: string): ProjectRegistry;
  readServiceRegistryRecord(root: string, project: string): ServiceRegistry;
  sameGitIdentity(left: string, right: string | null): boolean;
  atomicWriteJson(file: string, value: unknown): void;
  removePath(file: string): void;
};
export type GitWorktreeProviderRuntime = GitWorktreeRuntime & {
  gitWorktreeEvidenceDirectories(workspaceRoot: string, options?: { requireComplete?: boolean }): string[];
  createGitWorktreeEvidenceReader(workspaceRoot: string, options?: { requireComplete?: boolean }): GitWorktreeEvidenceReader;
  gitWorktreeEvidencePath(workspaceRoot: string, taskId: string): string;
  readGitWorktreeEvidence: typeof readGitWorktreeEvidencePlaceholder;
  writeGitWorktreeEvidence: typeof writeGitWorktreeEvidencePlaceholder;
  listGitWorktreeEvidence(workspaceRoot: string): Array<{ file: string; evidence: GitWorktreeEvidence }>;
  probeGitWorktreeCheckoutFs(record: { sourceRepository: string; checkoutPath: string; branch: string }): boolean;
  planGitWorktrees: typeof planGitWorktreesPlaceholder;
  prepareGitWorktrees: typeof prepareGitWorktreesPlaceholder;
  inspectGitWorktrees: typeof inspectGitWorktreesPlaceholder;
  cleanupGitWorktrees: typeof cleanupGitWorktreesPlaceholder;
};
export type GitWorktreeEvidenceReader = {
  readonly directories: readonly string[];
  read(taskId: string, options?: { optional?: boolean }): ReturnType<typeof readGitWorktreeEvidencePlaceholder>;
};
type RepositoryDescriptor = {
  selector: string;
  entityType: EntityType;
  sourcePath: string;
  sourceRepository: string;
  checkoutPath: string;
  branch: string;
  startPoint: string;
  remote: string | null;
  remoteUrl: string | null;
  preflightState?: PreflightState;
};
type RepositoryEvidence = Omit<RepositoryDescriptor, 'startPoint'> & {
  startPoint: string | null;
  head: string | null;
  clean: boolean | null;
  registered: boolean;
  state: RepositoryState;
  diagnostic: string | null;
};
type PersistedEffect =
  | { type: 'worktree-created'; selector: string; checkoutPath: string; branch: string }
  | { type: 'legacy-provider-evidence-migrated'; taskId: string };
type WorktreeEffect = {
  type: string;
  selector?: string;
  checkoutPath?: string;
  branch?: string;
  head?: string | null;
  path?: string;
};
type GitWorktreeEvidence = {
  schemaVersion: typeof GIT_WORKTREE_EVIDENCE_SCHEMA;
  taskId: string;
  workspaceRoot: string;
  branch: string;
  planDigest: string;
  status: 'ready' | 'blocked';
  repositories: RepositoryEvidence[];
  effects: PersistedEffect[];
  updatedAt: string;
};
type GitWorktreePlan = {
  workspaceRoot: string;
  taskId: string;
  branch: string;
  checkoutRoot: string;
  repositories: RepositoryDescriptor[];
  digest: string;
};
type WorktreeDiagnostic = { code: string; message: string };
type WorktreeResult = {
  operation: string;
  status: OperationStatus;
  taskId: string;
  evidencePath: string | null;
  repositories: Array<Record<string, unknown>>;
  effects: WorktreeEffect[];
  diagnostic: WorktreeDiagnostic | null;
  nextActions: string[];
  evidenceSource?: 'stored' | 'observed' | 'none';
};
type PrepareInput = { workspaceRoot: string; taskId: string; branch: string | null; startPoint?: string; includes?: string[] };
type InspectInput = { workspaceRoot: string; taskId: string; observedCheckouts?: unknown };
type CleanupInput = {
  workspaceRoot: string;
  taskId: string;
  integratedRefs?: Record<string, string>;
  allowDirty?: boolean;
  allowNoChange?: boolean;
  allowCompleted?: boolean;
  cleanupDelivery?: GitWorktreeCleanupDeliveryInput;
  observedCheckouts?: unknown;
};
type CleanupCheck = RepositoryEvidence & WorktreeIdentity & {
  reviewedDelivery: GitWorktreeReviewedDelivery | null;
  integratedRef: string | null;
  checkoutExists: boolean;
};

const TASK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const EVIDENCE_EFFECT_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  'worktree-created': new Set(['type', 'selector', 'checkoutPath', 'branch']),
  'legacy-provider-evidence-migrated': new Set(['type', 'taskId']),
});

function readGitWorktreeEvidencePlaceholder(_workspaceRoot: string, _taskId: string, _options?: { optional?: boolean }): { file: string; evidence: GitWorktreeEvidence } | null {
  throw new Error('not installed');
}
function writeGitWorktreeEvidencePlaceholder(_workspaceRoot: string, _evidence: GitWorktreeEvidence): { file: string; evidence: GitWorktreeEvidence } {
  throw new Error('not installed');
}
function planGitWorktreesPlaceholder(_input: PrepareInput): GitWorktreePlan {
  throw new Error('not installed');
}
function prepareGitWorktreesPlaceholder(_input: PrepareInput): WorktreeResult {
  throw new Error('not installed');
}
function inspectGitWorktreesPlaceholder(_input: InspectInput): WorktreeResult {
  throw new Error('not installed');
}
function cleanupGitWorktreesPlaceholder(_input: CleanupInput): WorktreeResult {
  throw new Error('not installed');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, label);
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function repositorySourceOrder(left: { sourcePath: string }, right: { sourcePath: string }): number {
  return left.sourcePath.split('/').length - right.sourcePath.split('/').length || left.sourcePath.localeCompare(right.sourcePath);
}

function planDigest(plan: Pick<GitWorktreePlan, 'repositories'>): string {
  const portable = plan.repositories.map(({ selector, entityType, sourcePath, sourceRepository, checkoutPath, branch, startPoint, remote, remoteUrl }) => ({
    selector, entityType, sourcePath, sourceRepository, checkoutPath, branch, startPoint, remote, remoteUrl,
  }));
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(portable)).digest('hex')}`;
}

export function parseGitWorktreeList(text: string): WorktreeListEntry[] {
  const entries: WorktreeListEntry[] = [];
  let current: WorktreeListEntry | null = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length), branch: null, head: null };
    } else if (current && line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
    else if (current && line.startsWith('branch refs/heads/')) current.branch = line.slice('branch refs/heads/'.length);
    else if (current && (line === 'locked' || line.startsWith('locked '))) current.locked = true;
  }
  if (current) entries.push(current);
  return entries;
}

export function registerGitWorktreeProvider(runtime: GitWorktreeRuntime): GitWorktreeProviderRuntime {
  function git(cwd: string, args: readonly string[], options: Record<string, unknown> = {}): CommandResult {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
    return spawnSync('git', ['--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', cwd, ...args], {
      encoding: 'utf8', ...options, env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
    });
  }

  function gitText(cwd: string, args: readonly string[]): string | null {
    const command = git(cwd, args);
    return command.status === 0 ? command.stdout.trim() : null;
  }

  function changedWorktreePaths(targetRoot: string): { controlMetadata: string[]; source: string[] } | null {
    const observations = [
      git(targetRoot, ['diff', '--name-only', '--no-renames', '-z']),
      git(targetRoot, ['diff', '--cached', '--name-only', '--no-renames', '-z']),
      git(targetRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
    ];
    if (observations.some((item) => item.status !== 0)) return null;
    const paths = [...new Set(observations.flatMap((item) => item.stdout.split('\0').filter(Boolean)))].sort();
    return { controlMetadata: paths.filter(controlMetadataPath), source: paths.filter((entry) => !controlMetadataPath(entry)) };
  }

  function worktreeIdentity(targetRoot: string): WorktreeIdentity | null {
    const root = git(targetRoot, ['rev-parse', '--show-toplevel']);
    const branch = git(targetRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const head = git(targetRoot, ['rev-parse', 'HEAD']);
    const status = git(targetRoot, ['status', '--porcelain']);
    if ([root, branch, head, status].some((item) => item.status !== 0)) return null;
    const listed = git(targetRoot, ['worktree', 'list', '--porcelain']);
    const repository = path.resolve(root.stdout.trim());
    const branchName = branch.stdout.trim();
    const registered = listed.status === 0 && parseGitWorktreeList(listed.stdout).some((item) => sameFilesystemPath(item.path, repository) && item.branch === branchName);
    return { repository, branch: branchName, head: head.stdout.trim(), clean: status.stdout.trim() === '', registered };
  }

  function retainedDeliveryRefs(repository: string, targetHead: string, taskBranch: string): string[] | null {
    const command = git(repository, ['for-each-ref', '--contains', targetHead, '--format=%(refname)', 'refs/heads', 'refs/remotes']);
    if (command.status !== 0) return null;
    const excluded = new Set([`refs/heads/${taskBranch}`, `refs/remotes/origin/${taskBranch}`]);
    return command.stdout.split(/\r?\n/u).map((item) => item.trim()).filter((item) => item && !excluded.has(item)).sort();
  }

  function sharedGitDir(repository: string): string {
    const value = gitText(repository, ['rev-parse', '--git-common-dir']);
    if (!value) throw new Error(`Unable to resolve shared Git metadata: ${repository}`);
    return fs.realpathSync(path.resolve(repository, value));
  }

  function createEvidenceReadObservations() {
    const roots = new Map<string, string | null>(), commons = new Map<string, string>();
    return {
      root(location: string): string | null {
        const actual = fs.realpathSync(location);
        if (!roots.has(actual)) roots.set(actual, sourceGitRoot(actual));
        return roots.get(actual) ?? null;
      },
      common(location: string) {
        const actual = fs.realpathSync(location);
        if (!commons.has(actual)) commons.set(actual, sharedGitDir(actual));
        return commons.get(actual)!;
      },
    };
  }

  function workspaceGitRoot(root: string, observed?: ReturnType<typeof createEvidenceReadObservations>): string | null {
    const actual = observed ? observed.root(root) : sourceGitRoot(root);
    if (actual && !sameFilesystemPath(actual, root)) throw new Error(`Workspace root belongs to a different Git repository: ${actual}`);
    return actual;
  }

  // Evidence 登记的 workspaceRoot 是 canonical checkout；linked task worktree 作为 target 时
  // 归一到同一身份，否则 realpath 直接指向 worktree 目录会报身份不匹配。
  function canonicalEvidenceWorkspaceRoot(root: string, observed?: ReturnType<typeof createEvidenceReadObservations>): string {
    const resolved = fs.realpathSync(root);
    const actual = observed ? observed.root(resolved) : sourceGitRoot(resolved);
    if (!actual || !sameFilesystemPath(actual, resolved)) return resolved;
    const gitDirectory = gitText(resolved, ['rev-parse', '--git-dir']);
    const commonDirectory = observed ? observed.common(resolved) : sharedGitDir(resolved);
    if (!gitDirectory || sameFilesystemPath(path.resolve(resolved, gitDirectory), commonDirectory)) return resolved;
    const listed = git(resolved, ['worktree', 'list', '--porcelain']);
    const main = listed.status === 0 ? parseGitWorktreeList(listed.stdout)[0]?.path : null;
    const candidate = main || path.dirname(commonDirectory);
    try { return fs.realpathSync(candidate); } catch { return resolved; }
  }

  function gitWorktreeEvidenceDirectories(workspaceRoot: string, { requireComplete = false }: { requireComplete?: boolean } = {}): string[] {
    return discoverEvidenceDirectories(workspaceRoot, requireComplete, createEvidenceReadObservations());
  }

  function discoverEvidenceDirectories(workspaceRoot: string, requireComplete: boolean, observed: ReturnType<typeof createEvidenceReadObservations>): string[] {
    const root = canonicalEvidenceWorkspaceRoot(workspaceRoot, observed);
    const rootRepository = workspaceGitRoot(root, observed);
    const repositories = new Set<string>(rootRepository ? [rootRepository] : []);
    const incomplete = (error: unknown): never => {
      throw Object.assign(new Error(`工作树证据来源发现尚未完整：${errorMessage(error)}`), { code: 'git_worktree_evidence_discovery_incomplete' });
    };
    const add = (source: GitSource): void => {
      try {
        if (!source.path) return;
        const location = fs.realpathSync(path.resolve(root, source.path));
        if (!insideFilesystemPath(root, location)) return;
        const actual = observed.root(location);
        if (source.type === 'git' && (!actual || !sameFilesystemPath(actual, location))) throw new Error(`已登记 Git 来源没有对应独立根：${source.path}。`);
        if (actual) {
          if (!insideFilesystemPath(root, actual)) throw new Error(`来源实际 Git 根越出工作空间：${source.path}。`);
          repositories.add(actual);
        }
      } catch (error) { if (requireComplete) incomplete(error); }
    };
    let projects: ProjectRegistry;
    try {
      projects = runtime.readProjectRegistryRecord(root);
      if (projects.registry.migrationRequired) throw new Error('Project registry migration is required.');
    } catch (error) {
      if (requireComplete || !rootRepository) incomplete(error);
      projects = { registry: { migrationRequired: false }, projects: {} };
    }
    for (const [code, project] of Object.entries(projects.projects)) {
      add(project.source);
      try {
        for (const service of Object.values(runtime.readServiceRegistryRecord(root, code).services)) add(service.repositorySource || service.source);
      } catch (error) { if (requireComplete) incomplete(error); }
    }
    const directories: string[] = [];
    for (const repository of repositories) {
      try {
        const directory = path.join(observed.common(repository), 'buildr', 'task-worktrees');
        if (!directories.some((candidate) => sameFilesystemPath(candidate, directory))) directories.push(directory);
      } catch (error) { if (requireComplete) incomplete(error); }
    }
    return directories;
  }

  function evidencePathForRepositories(taskId: string, repositories: Pick<RepositoryDescriptor, 'selector' | 'sourcePath' | 'sourceRepository'>[]): string {
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    const anchor = repositories.find((item) => item.selector === 'workspace')
      || [...repositories].sort(repositorySourceOrder)[0];
    if (!anchor) throw Object.assign(new Error('没有已核对的 Git 来源可保存工作树证据。'), { code: 'git_worktree_evidence_missing' });
    return path.join(sharedGitDir(anchor.sourceRepository), 'buildr', 'task-worktrees', `${taskId}.json`);
  }

  function findGitWorktreeEvidenceFile(root: string, taskId: string, reading?: { directories: readonly string[]; rootDirectory: string | null; observed: ReturnType<typeof createEvidenceReadObservations> }): string | null {
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    const directories = reading ? [...reading.directories] : gitWorktreeEvidenceDirectories(root);
    if (reading ? reading.rootDirectory !== null : workspaceGitRoot(root)) {
      const rootFile = reading ? path.join(reading.rootDirectory!, `${taskId}.json`) : evidencePathForRepositories(taskId, [{ selector: 'workspace', sourcePath: '.', sourceRepository: root }]);
      if (fs.lstatSync(rootFile, { throwIfNoEntry: false })) {
        const recorded = readEvidenceFile(rootFile, root, taskId);
        // A complete existing root record can discover its own group even when
        // unrelated current registries are unavailable.
        for (const item of recorded.evidence.repositories) {
          try {
            const directory = path.join(reading ? reading.observed.common(item.sourceRepository) : sharedGitDir(item.sourceRepository), 'buildr', 'task-worktrees');
            if (!directories.some((candidate) => sameFilesystemPath(candidate, directory))) directories.push(directory);
          } catch {
            // Preserve the valid root record. This does not prove uniqueness:
            // strict discovery reports gaps, and actions still check each source.
          }
        }
      }
    }
    const files = directories.map((directory) => path.join(directory, `${taskId}.json`)).filter((file) => fs.lstatSync(file, { throwIfNoEntry: false }));
    if (files.length > 1) throw Object.assign(new Error(`同一任务存在多份工作树证据，不能选择或覆盖：${taskId}。`), { code: 'git_worktree_evidence_conflict' });
    return files[0] || null;
  }

  function gitWorktreeEvidencePath(workspaceRoot: string, taskId: string): string {
    const root = canonicalEvidenceWorkspaceRoot(workspaceRoot);
    const existing = findGitWorktreeEvidenceFile(root, taskId);
    if (existing) return existing;
    if (workspaceGitRoot(root)) return evidencePathForRepositories(taskId, [{ selector: 'workspace', sourcePath: '.', sourceRepository: root }]);
    throw Object.assign(new Error(`Git worktree evidence was not found: ${taskId}`), { code: 'git_worktree_evidence_missing' });
  }

  function validateRepository(value: unknown, index: number): RepositoryEvidence {
    const record = object(value, `Git worktree evidence repository ${index}`);
    const entityType = requiredString(record.entityType, 'entityType');
    if (!['workspace', 'project', 'service'].includes(entityType)) throw new Error(`Git worktree evidence entity type is invalid: ${entityType}`);
    const sourcePath = requiredString(record.sourcePath, 'sourcePath');
    if (path.posix.isAbsolute(sourcePath) || path.posix.normalize(sourcePath) !== sourcePath || sourcePath.startsWith('../')) throw new Error(`Git worktree evidence sourcePath is invalid: ${sourcePath}`);
    const sourceRepository = requiredString(record.sourceRepository, 'sourceRepository');
    const checkoutPath = requiredString(record.checkoutPath, 'checkoutPath');
    for (const [label, candidate] of [['sourceRepository', sourceRepository], ['checkoutPath', checkoutPath]]) {
      if (!path.isAbsolute(candidate) || path.normalize(candidate) !== candidate) throw new Error(`Git worktree evidence ${label} must be a normalized absolute path.`);
    }
    const state = requiredString(record.state, 'state');
    if (!['created', 'reused', 'ready', 'blocked'].includes(state)) throw new Error('Git worktree evidence repository state is invalid.');
    const head = nullableString(record.head, 'head');
    if (head && !/^[a-f0-9]{40,64}$/.test(head)) throw new Error('Git worktree evidence head is invalid.');
    const clean = record.clean === null || record.clean === undefined ? null : record.clean;
    if (clean !== null && typeof clean !== 'boolean') throw new Error('Git worktree evidence clean must be boolean or null.');
    if (typeof record.registered !== 'boolean') throw new Error('Git worktree evidence registered must be boolean.');
    return {
      selector: requiredString(record.selector, 'selector'),
      entityType: entityType === 'workspace' ? 'workspace' : entityType === 'project' ? 'project' : 'service',
      sourcePath,
      sourceRepository,
      checkoutPath,
      branch: requiredString(record.branch, 'branch'),
      startPoint: requiredString(record.startPoint, 'startPoint'),
      head,
      clean,
      registered: record.registered,
      remote: nullableString(record.remote, 'remote'),
      remoteUrl: nullableString(record.remoteUrl, 'remoteUrl'),
      state: state === 'created' ? 'created' : state === 'reused' ? 'reused' : state === 'ready' ? 'ready' : 'blocked',
      diagnostic: nullableString(record.diagnostic, 'diagnostic'),
    };
  }

  function validateEffect(value: unknown, index: number): PersistedEffect {
    const effect = object(value, `Git worktree evidence effect ${index}`);
    const type = requiredString(effect.type, 'effect.type');
    const fields = EVIDENCE_EFFECT_FIELDS[type];
    if (!fields) throw new Error(`Git worktree evidence effect ${index} is unsupported.`);
    for (const key of Object.keys(effect)) if (!fields.has(key)) throw new Error(`Git worktree evidence effect field is unsupported: ${key}`);
    if (type === 'worktree-created') {
      return {
        type,
        selector: requiredString(effect.selector, 'effect.selector'),
        checkoutPath: requiredString(effect.checkoutPath, 'effect.checkoutPath'),
        branch: requiredString(effect.branch, 'effect.branch'),
      };
    }
    return { type: 'legacy-provider-evidence-migrated', taskId: requiredString(effect.taskId, 'effect.taskId') };
  }

  function validateEvidence(value: unknown, workspaceRoot: string, taskId: string): GitWorktreeEvidence {
    const evidence = object(value, 'Git worktree evidence');
    if (evidence.schemaVersion !== GIT_WORKTREE_EVIDENCE_SCHEMA || evidence.taskId !== taskId || typeof evidence.workspaceRoot !== 'string' || !sameFilesystemPath(evidence.workspaceRoot, workspaceRoot)) {
      throw new Error('Git worktree evidence identity does not match the requested Workspace/Task.');
    }
    if (!Array.isArray(evidence.repositories) || !Array.isArray(evidence.effects)) throw new Error('Git worktree evidence shape is invalid.');
    const repositories = evidence.repositories.map(validateRepository);
    const selectors = repositories.map((item) => item.selector);
    if (new Set(selectors).size !== selectors.length) throw new Error('Git worktree evidence repository selector is duplicated.');
    const status = evidence.status === 'ready' ? 'ready' : evidence.status === 'blocked' ? 'blocked' : null;
    if (!status) throw new Error('Git worktree evidence status is invalid.');
    const planIdentity = requiredString(evidence.planDigest, 'planDigest');
    if (!/^sha256-[a-f0-9]{64}$/.test(planIdentity)) throw new Error('Git worktree evidence planDigest is invalid.');
    const updatedAt = requiredString(evidence.updatedAt, 'updatedAt');
    if (Number.isNaN(Date.parse(updatedAt))) throw new Error('Git worktree evidence updatedAt is invalid.');
    return {
      schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA,
      taskId,
      workspaceRoot: fs.realpathSync(workspaceRoot),
      branch: requiredString(evidence.branch, 'branch'),
      planDigest: planIdentity,
      status,
      repositories,
      effects: evidence.effects.map(validateEffect),
      updatedAt: new Date(updatedAt).toISOString(),
    };
  }

  function readGitWorktreeEvidence(workspaceRoot: string, taskId: string, { optional = false }: { optional?: boolean } = {}): { file: string; evidence: GitWorktreeEvidence } | null {
    const canonicalRoot = canonicalEvidenceWorkspaceRoot(workspaceRoot);
    const file = findGitWorktreeEvidenceFile(canonicalRoot, taskId);
    if (!file) {
      if (optional) return null;
      throw Object.assign(new Error(`Git worktree evidence was not found: ${taskId}`), { code: 'git_worktree_evidence_missing' });
    }
    return readEvidenceFile(file, canonicalRoot, taskId);
  }

  /** Provider-owned discovery and observations are shared only by this reader, never across requests. */
  function createGitWorktreeEvidenceReader(workspaceRoot: string, { requireComplete = false }: { requireComplete?: boolean } = {}): GitWorktreeEvidenceReader {
    const observed = createEvidenceReadObservations();
    const canonicalRoot = canonicalEvidenceWorkspaceRoot(workspaceRoot, observed);
    const directories = Object.freeze(discoverEvidenceDirectories(canonicalRoot, requireComplete, observed));
    const rootDirectory = workspaceGitRoot(canonicalRoot, observed) ? path.join(observed.common(canonicalRoot), 'buildr', 'task-worktrees') : null;
    const reading = { directories, rootDirectory, observed };
    return Object.freeze({
      directories,
      read(taskId: string, { optional = false }: { optional?: boolean } = {}) {
        const file = findGitWorktreeEvidenceFile(canonicalRoot, taskId, reading);
        if (!file) {
          if (optional) return null;
          throw Object.assign(new Error(`Git worktree evidence was not found: ${taskId}`), { code: 'git_worktree_evidence_missing' });
        }
        return readEvidenceFile(file, canonicalRoot, taskId);
      },
    });
  }

  function readEvidenceFile(file: string, root: string, taskId: string): { file: string; evidence: GitWorktreeEvidence } {
    assertLiteralWorktreePath(file);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Git worktree evidence is not a regular file: ${file}`);
    return { file, evidence: validateEvidence(JSON.parse(fs.readFileSync(file, 'utf8')), root, taskId) };
  }

  // Filesystem-only Git layout probes below exist for evidence discovery, never identity proof.
  // They parse `.git` markers instead of spawning Git; unresolvable layouts read as "no evidence".

  function fsGitdirTarget(location: string): string | null {
    const marker = path.join(location, '.git');
    const stat = fs.lstatSync(marker, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink()) return null;
    const match = /^gitdir:[ \t]*(.+?)[ \t\r]*$/m.exec(fs.readFileSync(marker, 'utf8'));
    if (!match) return null;
    const target = path.resolve(location, match[1]);
    return fs.lstatSync(target, { throwIfNoEntry: false })?.isDirectory() ? target : null;
  }

  function fsCommonDirectory(repository: string): string | null {
    const resolved = fs.realpathSync(repository);
    const marker = path.join(resolved, '.git');
    const stat = fs.lstatSync(marker, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink()) return null;
    if (stat.isDirectory()) return fs.realpathSync(marker);
    const gitdir = fsGitdirTarget(resolved);
    if (!gitdir) return null;
    const commondirFile = path.join(gitdir, 'commondir');
    const commondirStat = fs.lstatSync(commondirFile, { throwIfNoEntry: false });
    if (!commondirStat?.isFile() || commondirStat.isSymbolicLink()) return fs.realpathSync(gitdir);
    const target = path.resolve(gitdir, fs.readFileSync(commondirFile, 'utf8').trim());
    return fs.lstatSync(target, { throwIfNoEntry: false })?.isDirectory() ? fs.realpathSync(target) : null;
  }

  function fsRepositoryRoot(root: string, location: string): string | null {
    let current = fs.realpathSync(location);
    if (!insideFilesystemPath(root, current)) return null;
    while (true) {
      const marker = fs.lstatSync(path.join(current, '.git'), { throwIfNoEntry: false });
      if (marker && !marker.isSymbolicLink()) return current;
      if (sameFilesystemPath(current, root)) return null;
      current = path.dirname(current);
    }
  }

  function canonicalEvidenceWorkspaceRootFs(root: string): string {
    const resolved = fs.realpathSync(root);
    const marker = fs.lstatSync(path.join(resolved, '.git'), { throwIfNoEntry: false });
    if (marker?.isFile() && !marker.isSymbolicLink()) {
      const gitdir = fsGitdirTarget(resolved);
      if (gitdir) {
        const commondirFile = path.join(gitdir, 'commondir');
        const commondirStat = fs.lstatSync(commondirFile, { throwIfNoEntry: false });
        if (commondirStat?.isFile() && !commondirStat.isSymbolicLink()) {
          const common = path.resolve(gitdir, fs.readFileSync(commondirFile, 'utf8').trim());
          try { return fs.realpathSync(path.dirname(common)); } catch { /* keep resolved root */ }
        }
      }
    }
    return resolved;
  }

  /** Filesystem evidence enumeration for readers; proof still belongs to inspect/prepare/cleanup. */
  function listGitWorktreeEvidence(workspaceRoot: string): Array<{ file: string; evidence: GitWorktreeEvidence }> {
    const root = canonicalEvidenceWorkspaceRootFs(workspaceRoot);
    const directories: string[] = [];
    const addRepository = (repository: string | null) => {
      if (!repository) return;
      const common = fsCommonDirectory(repository);
      if (!common) return;
      const directory = path.join(common, 'buildr', 'task-worktrees');
      if (!directories.some((candidate) => sameFilesystemPath(candidate, directory))) directories.push(directory);
    };
    const addLocation = (sourcePath: string | undefined) => {
      try {
        if (!sourcePath) return;
        const location = fs.realpathSync(path.resolve(root, sourcePath));
        if (!insideFilesystemPath(root, location)) return;
        addRepository(fsRepositoryRoot(root, location));
      } catch { /* A single unavailable source cannot block evidence held by other repositories. */ }
    };
    addLocation('.');
    // Mirrors discoverEvidenceDirectories: an unreadable registry is tolerated only
    // while the workspace root itself is a Git repository that can anchor evidence.
    const rootIsGit = fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false }) && !fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false })!.isSymbolicLink();
    try {
      const projects = runtime.readProjectRegistryRecord(root);
      if (projects.registry.migrationRequired) throw new Error('Project registry migration is required.');
      for (const [code, project] of Object.entries(projects.projects)) {
        addLocation(project.source?.path);
        try {
          for (const service of Object.values(runtime.readServiceRegistryRecord(root, code).services)) addLocation((service.repositorySource || service.source)?.path);
        } catch { /* Unreadable service registry only narrows discovery for that project. */ }
      }
    } catch (error) {
      if (!rootIsGit) throw Object.assign(new Error(`工作树证据来源发现尚未完整：${errorMessage(error)}`), { code: 'git_worktree_evidence_discovery_incomplete' });
    }
    const found = new Map<string, { file: string; evidence: GitWorktreeEvidence }>();
    const scanned = new Set<string>();
    const scan = (directory: string) => {
      const key = path.resolve(directory);
      if (scanned.has(key)) return;
      scanned.add(key);
      const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
      if (!stat) return;
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw Object.assign(new Error(`工作树证据目录必须是普通目录：${directory}`), { code: 'git_worktree_evidence_discovery_incomplete' });
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !TASK_ID_PATTERN.test(entry.name.slice(0, -5)) || !entry.name.endsWith('.json')) continue;
        const taskId = entry.name.slice(0, -5);
        if (found.has(taskId)) throw Object.assign(new Error(`同一任务存在多份工作树证据，不能选择或覆盖：${taskId}。`), { code: 'git_worktree_evidence_conflict' });
        found.set(taskId, readEvidenceFile(path.join(directory, entry.name), root, taskId));
      }
    };
    for (const directory of directories) scan(directory);
    // Evidence recorded under repositories outside current registries is still reachable
    // through the group members it declares, mirroring findGitWorktreeEvidenceFile.
    for (const { evidence } of [...found.values()]) {
      for (const repository of evidence.repositories) {
        try {
          const common = fsCommonDirectory(repository.sourceRepository);
          if (common) scan(path.join(common, 'buildr', 'task-worktrees'));
        } catch { /* Recorded sources that no longer resolve narrow only their own evidence. */ }
      }
    }
    return [...found.values()];
  }

  /**
   * Filesystem checkout probe for discovery: the checkout exists without symlinks,
   * its `.git` file resolves into the recorded source repository's common directory,
   * and HEAD still names the recorded branch. Failure is "drifted", never "usable".
   */
  function probeGitWorktreeCheckoutFs(record: { sourceRepository: string; checkoutPath: string; branch: string }): boolean {
    try {
      const stat = fs.lstatSync(record.checkoutPath, { throwIfNoEntry: false });
      if (!stat?.isDirectory() || stat.isSymbolicLink()) return false;
      const checkout = fs.realpathSync(record.checkoutPath);
      const gitdir = fsGitdirTarget(checkout);
      if (!gitdir) return false;
      const common = fsCommonDirectory(record.sourceRepository);
      if (!common || !insideFilesystemPath(common, fs.realpathSync(gitdir))) return false;
      return fs.readFileSync(path.join(gitdir, 'HEAD'), 'utf8').trim() === `ref: refs/heads/${record.branch}`;
    } catch { return false; }
  }

  function writeGitWorktreeEvidence(workspaceRoot: string, evidence: GitWorktreeEvidence): { file: string; evidence: GitWorktreeEvidence } {
    const canonicalRoot = canonicalEvidenceWorkspaceRoot(workspaceRoot);
    const normalized = validateEvidence(evidence, canonicalRoot, evidence.taskId);
    const current = readGitWorktreeEvidence(canonicalRoot, evidence.taskId, { optional: true });
    const file = current?.file ?? evidencePathForRepositories(evidence.taskId, normalized.repositories);
    if (current && !normalized.repositories.some((item) => sameFilesystemPath(path.dirname(file), path.join(sharedGitDir(item.sourceRepository), 'buildr', 'task-worktrees')))) throw Object.assign(new Error('工作树证据锚点与当前组来源不符，不能迁移或覆盖。'), { code: 'git_worktree_evidence_conflict' });
    assertLiteralWorktreePath(file);
    runtime.atomicWriteJson(file, normalized);
    return { file, evidence: normalized };
  }

  function sourceDescriptor(input: {
    selector: string;
    entityType: EntityType;
    sourcePath: string;
    source: GitSource;
    workspaceRoot: string;
    checkoutRoot: string;
    branch: string;
    startPoint?: string;
    existingRepositories?: RepositoryEvidence[];
  }): RepositoryDescriptor {
    const sourceRepository = fs.realpathSync(path.resolve(input.workspaceRoot, input.sourcePath));
    const actualRoot = sourceGitRoot(sourceRepository);
    if (!actualRoot || !sameFilesystemPath(actualRoot, sourceRepository)) throw new Error(`${input.selector} source is not an independent Git repository: ${input.sourcePath}`);
    const previous = input.existingRepositories?.find((item) => sameFilesystemPath(item.sourceRepository, sourceRepository));
    const selected = input.existingRepositories?.find((item) => item.selector === input.selector);
    if (selected && (!sameFilesystemPath(selected.sourceRepository, sourceRepository) || selected.sourcePath !== input.sourcePath.split(path.sep).join('/'))) throw Object.assign(new Error(`${input.selector} 来源与已有登记不符。`), { code: 'git_worktree_identity_mismatch' });
    const remote = input.source.git?.remote ?? null;
    const remoteUrl = remote ? gitText(sourceRepository, ['remote', 'get-url', remote]) : null;
    if (remote && !remoteUrl) throw new Error(`${input.selector} declared remote is missing: ${remote}`);
    if (input.source.git?.url && !runtime.sameGitIdentity(input.source.git.url, remoteUrl)) throw new Error(`${input.selector} remote identity conflicts with its registry declaration.`);
    let resolvedStart = previous?.startPoint ?? input.startPoint ?? input.source.integrationBranch ?? input.source.git?.integrationBranch ?? 'HEAD';
    if (!previous && git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0 && remote) {
      const remoteStart = `${remote}/${resolvedStart}`;
      if (git(sourceRepository, ['rev-parse', '--verify', `${remoteStart}^{commit}`]).status === 0) resolvedStart = remoteStart;
    }
    if (!previous && git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0) throw new Error(`${input.selector} start point is unavailable: ${resolvedStart}`);
    return {
      selector: input.selector,
      entityType: input.entityType,
      sourcePath: input.sourcePath.split(path.sep).join('/'),
      sourceRepository,
      checkoutPath: path.resolve(input.checkoutRoot, input.sourcePath),
      branch: input.branch,
      startPoint: resolvedStart,
      remote,
      remoteUrl,
    };
  }

  function selectedSourceHasGit(selector: string, source: GitSource, root: string, repositories: RepositoryDescriptor[]): boolean {
    const location = fs.realpathSync(path.resolve(root, requiredString(source.path, 'source.path')));
    const actual = sourceGitRoot(location);
    if (source.type === 'git') {
      if (!actual || !sameFilesystemPath(actual, location)) throw new Error(`${selector} source is not an independent Git repository: ${source.path}`);
      return true;
    }
    if (!actual) return false;
    if (sameFilesystemPath(actual, location)) return true;
    if (repositories.some((item) => sameFilesystemPath(item.sourceRepository, actual))) return false;
    throw new Error(`${selector} belongs to an unselected Git repository: ${actual}`);
  }

  function planGitWorktrees({ workspaceRoot, taskId, branch, startPoint, includes = [] }: PrepareInput): GitWorktreePlan {
    const root = canonicalEvidenceWorkspaceRoot(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    if (!branch) throw new Error('Git worktree plan requires branch.');
    if (git(root, ['check-ref-format', `refs/heads/${branch}`]).status !== 0) throw new Error(`Invalid task branch: ${branch}`);
    const existing = readGitWorktreeEvidence(root, taskId, { optional: true });
    const existingRepositories = existing?.evidence.repositories ?? [];
    if (existing && existing.evidence.branch !== branch) throw Object.assign(new Error(`任务分支与已有登记不符：${existing.evidence.branch} → ${branch}。`), { code: 'git_worktree_identity_mismatch' });
    includes = [...new Set([...existingRepositories.filter((item) => item.selector !== 'workspace').map((item) => item.selector), ...includes])];
    const checkoutRoot = path.join(root, '.worktrees', taskId);
    const repositories: RepositoryDescriptor[] = workspaceGitRoot(root)
      ? [sourceDescriptor({ selector: 'workspace', entityType: 'workspace', sourcePath: '.', source: { type: 'git' }, workspaceRoot: root, checkoutRoot, branch, startPoint, existingRepositories })]
      : [];
    const seen = new Set(repositories.map((item) => item.selector));
    const projects = runtime.readProjectRegistryRecord(root);
    if (projects.registry.migrationRequired) throw new Error('Project registry migration is required before creating Git worktrees.');
    const addDescriptor = (descriptor: RepositoryDescriptor, source: GitSource): void => {
      const shared = repositories.find((item) => sameFilesystemPath(item.sourceRepository, descriptor.sourceRepository));
      if (!shared) { repositories.push(descriptor); return; }
      if (shared.entityType === 'workspace') {
        if (startPoint === undefined && (source.integrationBranch || source.git?.integrationBranch)) shared.startPoint = descriptor.startPoint;
        return;
      }
      if (shared.startPoint !== descriptor.startPoint || shared.remoteUrl !== descriptor.remoteUrl) throw new Error(`${descriptor.selector} declares conflicting integration identity for a shared repository.`);
      // Keep the complete Project meaning when a service and its Project
      // explicitly select the same checkout, regardless of argument order.
      if (shared.entityType === 'service' && descriptor.entityType === 'project') repositories[repositories.indexOf(shared)] = descriptor;
    };
    for (const selector of includes) {
      if (seen.has(selector)) continue;
      seen.add(selector);
      if (selector.startsWith('project:')) {
        const code = selector.slice('project:'.length);
        const project = projects.projects[code];
        if (!project) throw new Error(`Unknown Git worktree selector: ${selector}`);
        if (!selectedSourceHasGit(selector, project.source, root, repositories)) continue;
        addDescriptor(sourceDescriptor({ selector, entityType: 'project', sourcePath: requiredString(project.source.path, 'project.source.path'), source: project.source, workspaceRoot: root, checkoutRoot, branch, existingRepositories }), project.source);
        continue;
      }
      if (selector.startsWith('service:')) {
        const [projectCode, serviceCode, ...extra] = selector.slice('service:'.length).split('/');
        if (!projectCode || !serviceCode || extra.length) throw new Error(`Invalid Service selector: ${selector}`);
        const project = projects.projects[projectCode];
        if (!project) throw new Error(`Unknown Project in selector: ${selector}`);
        if (project.source.type === 'git' && !includes.includes(`project:${projectCode}`) && !fs.existsSync(path.join(root, 'services', 'manifest.yml'))) throw new Error(`${selector} requires explicit selector project:${projectCode}.`);
        const service = runtime.readServiceRegistryRecord(root, projectCode).services[serviceCode];
        if (!service) throw new Error(`Unknown Git worktree selector: ${selector}`);
        const source = service.repositorySource || service.source;
        if (!selectedSourceHasGit(selector, source, root, repositories)) continue;
        const descriptor = sourceDescriptor({ selector, entityType: 'service', sourcePath: requiredString(source.path, 'service.source.path'), source, workspaceRoot: root, checkoutRoot, branch, startPoint: sameFilesystemPath(path.resolve(root, source.path!), root) ? startPoint : undefined, existingRepositories });
        addDescriptor(descriptor, source);
        continue;
      }
      throw new Error(`Unsupported Git worktree selector: ${selector}`);
    }
    for (const previous of existingRepositories) {
      const index = repositories.findIndex((item) => sameFilesystemPath(item.sourceRepository, previous.sourceRepository));
      const current = repositories[index];
      if (!current || !sameFilesystemPath(current.checkoutPath, previous.checkoutPath) || current.sourcePath !== previous.sourcePath || current.branch !== previous.branch) throw Object.assign(new Error(`${previous.selector} 路径或分支与已有登记不符。`), { code: 'git_worktree_identity_mismatch' });
      if (previous.remote) {
        const observedUrl = gitText(previous.sourceRepository, ['remote', 'get-url', previous.remote]);
        if (!observedUrl || !runtime.sameGitIdentity(observedUrl, previous.remoteUrl)) throw Object.assign(new Error(`${previous.selector} 远端身份与已有登记不符。`), { code: 'git_worktree_identity_mismatch' });
      }
      if (previous.remoteUrl && current.remoteUrl && !runtime.sameGitIdentity(previous.remoteUrl, current.remoteUrl)) throw Object.assign(new Error(`${previous.selector} 远端声明与已有登记不符。`), { code: 'git_worktree_identity_mismatch' });
      const promoteProject = previous.entityType === 'service' && current.entityType === 'project';
      repositories[index] = { ...current, selector: promoteProject ? current.selector : previous.selector, entityType: promoteProject ? current.entityType : previous.entityType, startPoint: previous.startPoint!, remote: previous.remote, remoteUrl: previous.remoteUrl };
    }
    if (!repositories.length) throw Object.assign(new Error('工作空间根没有 Git；请明确选择实际独立 Git 项目或服务来源。'), { code: 'git_worktree_repository_selection_required' });
    repositories.sort(repositorySourceOrder);
    for (const item of repositories) {
      if (!inside(root, item.sourceRepository)) throw new Error(`${item.selector} source escapes the Workspace.`);
      if (!inside(checkoutRoot, item.checkoutPath)) throw new Error(`${item.selector} checkout escapes the task checkout root.`);
      const parent = repositories.filter((candidate) => candidate !== item && inside(candidate.checkoutPath, item.checkoutPath)).sort((left, right) => right.checkoutPath.length - left.checkoutPath.length)[0];
      if (!parent) continue;
      const relative = path.relative(parent.checkoutPath, item.checkoutPath).split(path.sep).join('/');
      if (git(parent.sourceRepository, ['ls-files', '--error-unmatch', '--', relative]).status === 0) throw new Error(`${item.selector} target is tracked by parent repository ${parent.selector}: ${relative}`);
    }
    const plan = { workspaceRoot: root, taskId, branch, checkoutRoot, repositories };
    return { ...plan, digest: planDigest(plan) };
  }

  function preflight(plan: GitWorktreePlan): void {
    assertLiteralWorktreePath(plan.checkoutRoot);
    for (const item of plan.repositories) {
      assertLiteralWorktreePath(item.checkoutPath);
      const parent = plan.repositories.filter((candidate) => candidate !== item && inside(candidate.checkoutPath, item.checkoutPath)).sort((left, right) => right.checkoutPath.length - left.checkoutPath.length)[0];
      if (parent && fs.existsSync(parent.checkoutPath)) {
        const relative = path.relative(parent.checkoutPath, item.checkoutPath).split(path.sep).join('/');
        if (git(parent.checkoutPath, ['ls-files', '--error-unmatch', '--', relative]).status === 0) throw new Error(`${item.selector} target is tracked by task repository ${parent.selector}: ${relative}`);
      }
      const listed = git(item.sourceRepository, ['worktree', 'list', '--porcelain']);
      if (listed.status !== 0) throw new Error(`Unable to inspect Git worktrees: ${item.selector}`);
      const worktrees = parseGitWorktreeList(listed.stdout);
      const atTarget = worktrees.find((entry) => sameFilesystemPath(entry.path, item.checkoutPath));
      const branchOwner = worktrees.find((entry) => entry.branch === item.branch);
      if (atTarget && atTarget.branch !== item.branch) throw new Error(`${item.selector} target is registered to branch ${atTarget.branch || '(detached)'}.`);
      if (!atTarget && branchOwner) throw new Error(`${item.selector} branch is already checked out at ${branchOwner.path}.`);
      if (!atTarget && fs.existsSync(item.checkoutPath)) throw new Error(`${item.selector} target is occupied but not registered: ${item.checkoutPath}`);
      assertCurrentCheckoutIdentity(item, git, parseGitWorktreeList);
      item.preflightState = atTarget ? 'reused' : 'create';
    }
  }

  function withTaskWorktreeLock<T>(workspaceRoot: string, taskId: string, action: () => T): T {
    const root = canonicalEvidenceWorkspaceRoot(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    const file = path.join(root, '.buildr', 'local', 'task-worktree-locks', `${taskId}.lock`);
    return withExclusiveFileLock(file, root, action, { assertSafe: () => assertLiteralWorktreePath(file) });
  }

  function repositoryEvidence(item: RepositoryDescriptor, state: RepositoryState, identity: WorktreeIdentity | null = null, diagnostic: string | null = null): RepositoryEvidence {
    return {
      selector: item.selector, entityType: item.entityType, sourcePath: item.sourcePath,
      sourceRepository: item.sourceRepository, checkoutPath: item.checkoutPath, branch: item.branch,
      startPoint: item.startPoint, head: identity?.head ?? null, clean: identity?.clean ?? null,
      registered: identity?.registered ?? false, remote: item.remote, remoteUrl: item.remoteUrl, state, diagnostic,
    };
  }

  function result(operation: string, status: OperationStatus, taskId: string, evidencePath: string | null, repositories: Array<Record<string, unknown>>, effects: WorktreeEffect[] = [], diagnostic: WorktreeDiagnostic | null = null, nextActions: string[] = []): WorktreeResult {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.gitWorktreeResult, { operation, status, taskId, evidencePath, repositories, effects, diagnostic, nextActions });
  }

  function prepareGitWorktrees(input: PrepareInput): WorktreeResult {
    const planning: { plan?: GitWorktreePlan } = {};
    const effects: WorktreeEffect[] = [];
    const repositories: RepositoryEvidence[] = [];
    try {
      return withTaskWorktreeLock(input.workspaceRoot, input.taskId, () => {
        const plan = planGitWorktrees(input);
        planning.plan = plan;
        preflight(plan);
        const currentPlan = plan;
        for (const item of currentPlan.repositories) {
          const identity = item.preflightState === 'reused' ? worktreeIdentity(item.checkoutPath) : null;
          if (item.preflightState === 'reused' && !identity) throw Object.assign(new Error(`${item.selector} 已有检出身份不可读取。`), { code: 'git_worktree_identity_mismatch' });
          repositories.push(repositoryEvidence(item, identity ? 'reused' : 'blocked', identity, identity ? null : '尚未创建。'));
        }
        for (const [index, item] of currentPlan.repositories.entries()) {
          const plannedState = item.preflightState;
          let state: RepositoryState = plannedState === 'reused' ? 'reused' : 'blocked';
          if (plannedState === 'create') {
            assertLiteralWorktreePath(item.checkoutPath);
            fs.mkdirSync(path.dirname(item.checkoutPath), { recursive: true });
            assertLiteralWorktreePath(item.checkoutPath);
            const branchExists = git(item.sourceRepository, ['show-ref', '--verify', '--quiet', `refs/heads/${item.branch}`]).status === 0;
            const args = branchExists ? ['worktree', 'add', item.checkoutPath, item.branch] : ['worktree', 'add', '-b', item.branch, item.checkoutPath, item.startPoint];
            const added: CommandResult = process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR === item.selector
              ? { status: 1, stdout: '', stderr: `Injected worktree add failure: ${item.selector}` }
              : git(item.sourceRepository, args);
            if (added.status !== 0) {
              repositories[index] = repositoryEvidence(item, 'blocked', null, (added.stderr || added.stdout || 'git worktree add failed').trim());
              const evidence: GitWorktreeEvidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'blocked', repositories, effects: effects.filter((effect): effect is PersistedEffect => effect.type === 'worktree-created'), updatedAt: new Date().toISOString() };
              const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
              return result('create', 'blocked', plan.taskId, written.file, repositories, effects, { code: 'git_worktree_partial_create_failed', message: repositories[index].diagnostic ?? 'git worktree add failed' }, [`检查 ${item.checkoutPath} 后重试，已有成员继续保留。`]);
            }
            effects.push({ type: 'worktree-created', selector: item.selector, checkoutPath: item.checkoutPath, branch: item.branch });
            state = 'created';
          }
          const identity = worktreeIdentity(item.checkoutPath);
          if (!identity || !sameFilesystemPath(identity.repository, item.checkoutPath) || identity.branch !== item.branch || !identity.registered) {
            repositories[index] = repositoryEvidence(item, 'blocked', identity, 'Checkout identity does not match the Git worktree plan.');
            const evidence: GitWorktreeEvidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'blocked', repositories, effects: effects.filter((effect): effect is PersistedEffect => effect.type === 'worktree-created'), updatedAt: new Date().toISOString() };
            const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
            return result('create', 'blocked', plan.taskId, written.file, repositories, effects, { code: 'git_worktree_identity_mismatch', message: `${item.selector} checkout identity is invalid.` }, [`检查 ${item.checkoutPath}。`]);
          }
          repositories[index] = repositoryEvidence(item, state, identity);
        }
        const evidence: GitWorktreeEvidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'ready', repositories, effects: effects.filter((effect): effect is PersistedEffect => effect.type === 'worktree-created'), updatedAt: new Date().toISOString() };
        const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
        return result('create', 'ready', plan.taskId, written.file, repositories, effects);
      });
    } catch (error) {
      let file: string | null = null;
      try { if (planning.plan) file = findGitWorktreeEvidenceFile(planning.plan.workspaceRoot, planning.plan.taskId) ?? evidencePathForRepositories(planning.plan.taskId, planning.plan.repositories); } catch { /* Preserve the original failure and any completed effects. */ }
      const code = error instanceof Error && typeof Reflect.get(error, 'code') === 'string' ? String(Reflect.get(error, 'code')) : effects.length ? 'git_worktree_create_failed' : 'git_worktree_preflight_failed';
      return result('create', 'blocked', input.taskId, file, repositories, effects, { code, message: errorMessage(error) }, [effects.length ? '保留已完成的 Git 效果，核对来源与证据后重试同一计划。' : '修正 Git plan 后重试；preflight 失败时未执行新的 Git mutation。']);
    }
  }

  function currentRepositories(root: string, taskId: string, observedCheckouts?: unknown): { file: string; repositories: RepositoryEvidence[]; evidenceSource: 'stored' | 'observed'; status: 'ready' | 'blocked' } {
    // A conflicting or invalid stored record is never overridden by caller input.
    const stored = readGitWorktreeEvidence(root, taskId, { optional: true });
    const observed = observedCheckouts === undefined ? null : normalizeGitWorktreeObservedCheckouts(observedCheckouts);
    if (stored) {
      if (observed && (observed.length !== stored.evidence.repositories.length || observed.some((item) => {
        const record = stored.evidence.repositories.find((entry) => entry.selector === item.selector);
        return !record || item.branch !== record.branch || !sameFilesystemPath(item.sourceRepository, record.sourceRepository) || !sameFilesystemPath(item.checkoutPath, record.checkoutPath);
      }))) throw Object.assign(new Error('当前对象与已有登记冲突，不能覆盖历史身份。'), { code: 'git_worktree_identity_mismatch' });
      return { file: stored.file, repositories: stored.evidence.repositories, evidenceSource: 'stored', status: stored.evidence.status };
    }
    if (!observed) throw Object.assign(new Error('缺少历史登记。请核对任务归属、实际 Git 路径与分支，并通过 --observed-checkouts <json-file> 提供当前对象；不能据此认定已清理。'), { code: 'git_worktree_evidence_missing' });
    const branch = observed[0].branch;
    const plan = planGitWorktrees({ workspaceRoot: root, taskId, branch, includes: observed.filter((item) => item.selector !== 'workspace').map((item) => item.selector) });
    const groupRoot = assertObservedCheckoutSet(observed, plan.repositories);
    const repositories = plan.repositories.map((descriptor): RepositoryEvidence => {
      const item = observed.find((entry) => entry.selector === descriptor.selector)!;
      const record = { ...descriptor, ...item };
      assertCurrentCheckoutIdentity(record, git, parseGitWorktreeList);
      const identity = fs.existsSync(item.checkoutPath) ? worktreeIdentity(item.checkoutPath) : null;
      return { ...record, startPoint: null, head: identity?.head ?? gitText(item.sourceRepository, ['rev-parse', '--verify', `refs/heads/${item.branch}^{commit}`]), clean: identity?.clean ?? null, registered: identity?.registered ?? false, state: identity ? 'ready' : 'blocked', diagnostic: identity ? null : '当前检出位置不存在。' };
    });
    assertNoUnlistedNestedRepositories(repositories, git, { groupRoot });
    return { file: evidencePathForRepositories(taskId, plan.repositories), repositories, evidenceSource: 'observed', status: 'ready' };
  }

  function inspectGitWorktrees({ workspaceRoot, taskId, observedCheckouts }: InspectInput): WorktreeResult {
    try {
      const root = canonicalEvidenceWorkspaceRoot(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
      const stored = currentRepositories(root, taskId, observedCheckouts);
      const repositories = stored.repositories.map((record) => {
        try {
          assertCurrentCheckoutIdentity(record, git, parseGitWorktreeList);
          const identity = fs.existsSync(record.checkoutPath) ? worktreeIdentity(record.checkoutPath) : null;
          const matches = Boolean(identity && sameFilesystemPath(identity.repository, record.checkoutPath) && identity.branch === record.branch && identity.registered);
          return { ...record, head: identity?.head ?? null, clean: identity?.clean ?? null, registered: identity?.registered ?? false, state: matches ? 'ready' : 'blocked', diagnostic: matches ? null : 'Current Git identity does not match evidence.' };
        } catch (error) {
          return { ...record, head: null, clean: null, registered: false, state: 'blocked', diagnostic: errorMessage(error) };
        }
      });
      const ready = stored.status === 'ready' && repositories.every((item) => item.state === 'ready');
      return { ...result('inspect', ready ? 'ready' : 'blocked', taskId, stored.file, repositories, [], ready ? null : { code: 'git_worktree_identity_drift', message: 'One or more Git worktree identities drifted.' }, ready ? [] : ['检查 Git worktree registration、branch 和 checkout path。']), evidenceSource: stored.evidenceSource };
    } catch (error) {
      const code = error instanceof Error && typeof Reflect.get(error, 'code') === 'string' ? String(Reflect.get(error, 'code')) : 'git_worktree_inspect_failed';
      return { ...result('inspect', 'blocked', taskId, null, [], [], { code, message: errorMessage(error) }), evidenceSource: 'none' };
    }
  }

  function cleanupGitWorktrees({ workspaceRoot, taskId, integratedRefs = {}, allowDirty = false, allowNoChange = false, allowCompleted = false, cleanupDelivery = {}, observedCheckouts }: CleanupInput): WorktreeResult {
    const effects: WorktreeEffect[] = [];
    try {
      return withTaskWorktreeLock(workspaceRoot, taskId, () => {
        const root = canonicalEvidenceWorkspaceRoot(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
        const stored = currentRepositories(root, taskId, observedCheckouts);
        const reviewedDeliveries = normalizeGitWorktreeCleanupDelivery(cleanupDelivery, stored.repositories.map((record) => record.selector));
        if (stored.evidenceSource === 'observed' && (!Object.keys(reviewedDeliveries).length || allowDirty || allowNoChange)) throw Object.assign(new Error('依据当前对象清理必须提供完整源与交付提交，不能绕过未保存内容保护。'), { code: 'git_worktree_cleanup_delivery_invalid' });
        if (Object.keys(reviewedDeliveries).length && !allowCompleted) return result('cleanup', 'blocked', taskId, stored.file, [], [], { code: 'git_worktree_cleanup_unauthorized', message: '已核验交付输入需要调用方明确允许completed cleanup。' });
        const checks: CleanupCheck[] = [];
        const controlMetadataOnly = new Set<string>();
        const retainedTargets = new Map<string, { kind: 'refs'; targetHead: string; refs: string[] } | { kind: 'worktree'; branch: string; head: string }>();
        assertNoUnlistedNestedRepositories(stored.repositories, git);
        for (const record of stored.repositories) {
          assertCurrentCheckoutIdentity(record, git, parseGitWorktreeList, { cleanup: true });
          const reviewedDelivery = reviewedDeliveries[record.selector] ?? null;
          const checkoutExists = fs.existsSync(record.checkoutPath);
          const identity = checkoutExists ? worktreeIdentity(record.checkoutPath) : null;
          if (checkoutExists && (!identity || !sameFilesystemPath(identity.repository, record.checkoutPath) || identity.branch !== record.branch || !identity.registered)) {
            return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_identity_mismatch', message: `Checkout identity does not match evidence: ${record.selector}.` }, ['核对 ownership 后重试。']);
          }
          if (!checkoutExists) {
            const listed = git(record.sourceRepository, ['worktree', 'list', '--porcelain']);
            const registration = listed.status === 0 ? parseGitWorktreeList(listed.stdout).find((item) => sameFilesystemPath(item.path, record.checkoutPath)) : null;
            if (registration) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_checkout_missing_registered', message: `Task checkout 路径缺失但仍保留 Git registration：${record.selector}。` });
            const branchHead = gitText(record.sourceRepository, ['rev-parse', '--verify', `refs/heads/${record.branch}^{commit}`]);
            if (branchHead && branchHead !== (reviewedDelivery?.sourceHead ?? record.head)) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_branch_drift', message: `Task checkout 已缺失，且本地任务分支已漂移：${record.selector}。` });
          }
          if (reviewedDelivery && identity && (identity.head !== reviewedDelivery.sourceHead || !identity.clean)) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_source_changed', message: `交付核验后源提交或未保存内容已变化：${record.selector}。` });
          if (allowNoChange && identity?.head !== record.head) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_no_change_head_drift', message: `Task声明no-change，但checkout HEAD已偏离evidence：${record.selector}。` });
          let retainedRef: string | null = null;
          if (reviewedDelivery) {
            const refs = retainedDeliveryRefs(record.sourceRepository, reviewedDelivery.targetHead, record.branch);
            if (!refs?.length) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_delivery_target_mismatch', message: `已核验的交付提交没有由非任务分支持有：${record.selector}。` });
            retainedRef = reviewedDelivery.targetHead;
            retainedTargets.set(record.selector, { kind: 'refs', targetHead: reviewedDelivery.targetHead, refs });
          } else if (allowCompleted) {
            const retained = worktreeIdentity(record.sourceRepository);
            if (!retained || retained.branch === record.branch || !retained.branch) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_retained_target_unavailable', message: `Retained repository needs a non-task branch: ${record.selector}.` });
            retainedRef = retained.head;
            retainedTargets.set(record.selector, { kind: 'worktree', branch: retained.branch, head: retained.head });
          }
          const integratedRef = allowNoChange ? record.head : retainedRef ?? integratedRefs[record.selector] ?? null;
          if (!allowDirty && identity && !identity.clean) {
            const changed = changedWorktreePaths(record.checkoutPath);
            if (!changed || changed.source.length > 0) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_dirty', message: `Task checkout source is dirty: ${record.selector}.` });
            controlMetadataOnly.add(path.resolve(record.checkoutPath));
          }
          if (!allowDirty) {
            if (!integratedRef) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_integrated_ref_missing', message: `Missing integrated ref: ${record.selector}.` });
            const target = gitText(record.sourceRepository, ['rev-parse', '--verify', `${integratedRef}^{commit}`]);
            const taskHead = identity?.head ?? record.head;
            const ancestor = !reviewedDelivery && Boolean(target && taskHead && git(record.sourceRepository, ['merge-base', '--is-ancestor', taskHead, target]).status === 0);
            if (!reviewedDelivery && !ancestor) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_not_integrated', message: `${record.selector} HEAD is not contained by ${integratedRef}.` });
          }
          const currentIdentity: WorktreeIdentity = identity ?? {
            repository: record.checkoutPath,
            branch: record.branch,
            head: reviewedDelivery?.sourceHead ?? record.head ?? '',
            clean: record.clean ?? false,
            registered: false,
          };
          checks.push({ ...record, ...currentIdentity, reviewedDelivery, integratedRef, checkoutExists, state: 'ready', diagnostic: null });
        }
        const removed: Array<Record<string, unknown>> = [];
        for (const record of [...checks].sort((left, right) => right.checkoutPath.split(path.sep).length - left.checkoutPath.split(path.sep).length)) {
          assertCurrentCheckoutIdentity(record, git, parseGitWorktreeList, { cleanup: true });
          assertNoUnlistedNestedRepositories(checks.filter((item) => item.checkoutPath === record.checkoutPath || inside(record.checkoutPath, item.checkoutPath)), git);
          const retainedTarget = retainedTargets.get(record.selector);
          if (retainedTarget?.kind === 'refs') {
            const currentRefs = retainedDeliveryRefs(record.sourceRepository, retainedTarget.targetHead, record.branch);
            if (!currentRefs || !retainedTarget.refs.some((ref) => currentRefs.includes(ref))) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_retained_target_drift', message: `Delivered target lost its retained ref before cleanup: ${record.selector}.` });
          } else if (retainedTarget?.kind === 'worktree') {
            const currentTarget = worktreeIdentity(record.sourceRepository);
            if (!currentTarget || currentTarget.branch !== retainedTarget.branch || currentTarget.head !== retainedTarget.head) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_retained_target_drift', message: `Retained repository changed before cleanup: ${record.selector}.` });
          }
          if (record.reviewedDelivery && record.checkoutExists) {
            const currentSource = worktreeIdentity(record.checkoutPath);
            if (!currentSource || currentSource.head !== record.head || currentSource.branch !== record.branch || !currentSource.clean || !currentSource.registered) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_source_changed', message: `删除前源版本或工作树状态已变化：${record.selector}。` });
          }
          if (record.checkoutExists) {
            const args = ['worktree', 'remove', ...(allowDirty || controlMetadataOnly.has(path.resolve(record.checkoutPath)) ? ['--force'] : []), record.checkoutPath];
            const removal = git(record.sourceRepository, args);
            if (removal.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_remove_failed', message: (removal.stderr || removal.stdout).trim() });
            effects.push({ type: 'worktree-removed', selector: record.selector, checkoutPath: record.checkoutPath });
          } else effects.push({ type: 'worktree-absence-confirmed', selector: record.selector, checkoutPath: record.checkoutPath });
          removed.push({ ...record, state: 'removed' });
          const branchRef = `refs/heads/${record.branch}`;
          const branchPresence = git(record.sourceRepository, ['show-ref', '--verify', '--quiet', branchRef]);
          if (branchPresence.status === 1) effects.push({ type: 'local-branch-absence-confirmed', selector: record.selector, branch: record.branch, head: record.head });
          else if (branchPresence.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_branch_inspect_failed', message: (branchPresence.stderr || branchPresence.stdout).trim() });
          else {
            assertCurrentCheckoutIdentity(record, git, parseGitWorktreeList, { cleanup: true });
            const branchRemoval: CommandResult = process.env.BUILDR_FAULT_WORKTREE_BRANCH_REMOVE_SELECTOR === record.selector
              ? { status: 1, stdout: '', stderr: `Injected branch removal failure: ${record.selector}` }
              : git(record.sourceRepository, ['update-ref', '-d', branchRef, record.head]);
            if (branchRemoval.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_branch_remove_failed', message: (branchRemoval.stderr || branchRemoval.stdout).trim() });
            effects.push({ type: 'local-branch-removed', selector: record.selector, branch: record.branch, head: record.head });
          }
        }
        if (stored.evidenceSource === 'stored') {
          runtime.removePath(stored.file);
          effects.push({ type: 'provider-evidence-removed', path: stored.file });
        }
        return { ...result('cleanup', 'cleaned', taskId, stored.file, removed, effects), evidenceSource: stored.evidenceSource };
      });
    } catch (error) {
      const code = error instanceof Error && typeof Reflect.get(error, 'code') === 'string' ? String(Reflect.get(error, 'code')) : 'git_worktree_cleanup_failed';
      return result('cleanup', 'blocked', taskId, null, [], effects, { code, message: errorMessage(error) }, ['重新核对当前 Git 身份、交付版本与占用；缺少历史登记时显式提供 --observed-checkouts。']);
    }
  }

  return Object.assign(runtime, {
    gitWorktreeEvidenceDirectories,
    createGitWorktreeEvidenceReader,
    gitWorktreeEvidencePath,
    readGitWorktreeEvidence,
    writeGitWorktreeEvidence,
    listGitWorktreeEvidence,
    probeGitWorktreeCheckoutFs,
    planGitWorktrees,
    prepareGitWorktrees,
    inspectGitWorktrees,
    cleanupGitWorktrees,
  });
}
