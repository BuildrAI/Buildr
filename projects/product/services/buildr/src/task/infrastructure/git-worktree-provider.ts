import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { normalizeGitWorktreeCleanupDelivery, type GitWorktreeCleanupDeliveryInput, type GitWorktreeReviewedDelivery } from '../domain/git-worktree.ts';
import { spawnSync } from '../../infrastructure/process.mjs';
import { sameFilesystemPath } from '../../infrastructure/git/checkout-identity.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';
import { controlMetadataPath } from '../../infrastructure/git/control-metadata-path.mjs';

export const GIT_WORKTREE_PROVIDER_CAPABILITY = 'buildr.git-worktree-provider/v1';
export const GIT_WORKTREE_EVIDENCE_SCHEMA = 'buildr.git-worktree-evidence/v1';
export const TASK_WORKTREE_PROVIDER = 'task-worktree.provider';

type EntityType = 'workspace' | 'project' | 'service';
type RepositoryState = 'created' | 'reused' | 'ready' | 'blocked';
type OperationStatus = 'ready' | 'blocked' | 'cleaned';
type PreflightState = 'create' | 'reused';
type CommandResult = { status: number | null; stdout: string; stderr: string };
type WorktreeListEntry = { path: string; branch: string | null; head: string | null };
type WorktreeIdentity = { repository: string; branch: string; head: string; clean: boolean; registered: boolean };
type GitSource = {
  type?: string;
  path?: string;
  git?: { remote?: string; url?: string; integrationBranch?: string };
};
type RegisteredEntity = { source: GitSource };
type ProjectRegistry = {
  registry: { migrationRequired: boolean };
  projects: Record<string, RegisteredEntity>;
};
type ServiceRegistry = { services: Record<string, RegisteredEntity> };
type GitWorktreeRuntime = {
  assertCanonicalTaskWorkspace(root: string): string;
  readProjectRegistryRecord(root: string): ProjectRegistry;
  readServiceRegistryRecord(root: string, project: string): ServiceRegistry;
  sameGitIdentity(left: string, right: string | null): boolean;
  atomicWriteJson(file: string, value: unknown): void;
  removePath(file: string): void;
};
export type GitWorktreeProviderRuntime = GitWorktreeRuntime & {
  gitWorktreeEvidencePath(workspaceRoot: string, taskId: string): string;
  readGitWorktreeEvidence: typeof readGitWorktreeEvidencePlaceholder;
  writeGitWorktreeEvidence: typeof writeGitWorktreeEvidencePlaceholder;
  planGitWorktrees: typeof planGitWorktreesPlaceholder;
  prepareGitWorktrees: typeof prepareGitWorktreesPlaceholder;
  inspectGitWorktrees: typeof inspectGitWorktreesPlaceholder;
  cleanupGitWorktrees: typeof cleanupGitWorktreesPlaceholder;
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
type RepositoryEvidence = RepositoryDescriptor & {
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
};
type PrepareInput = { workspaceRoot: string; taskId: string; branch: string | null; startPoint?: string; includes?: string[] };
type InspectInput = { workspaceRoot: string; taskId: string };
type CleanupInput = {
  workspaceRoot: string;
  taskId: string;
  integratedRefs?: Record<string, string>;
  allowDirty?: boolean;
  allowNoChange?: boolean;
  allowCompleted?: boolean;
  cleanupDelivery?: GitWorktreeCleanupDeliveryInput;
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
  }
  if (current) entries.push(current);
  return entries;
}

export function registerGitWorktreeProvider(runtime: GitWorktreeRuntime): GitWorktreeProviderRuntime {
  function git(cwd: string, args: readonly string[], options: Record<string, unknown> = {}): CommandResult {
    return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', ...options });
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
    return path.resolve(repository, value);
  }

  function gitWorktreeEvidencePath(workspaceRoot: string, taskId: string): string {
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    return path.join(sharedGitDir(fs.realpathSync(workspaceRoot)), 'buildr', 'task-worktrees', `${taskId}.json`);
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
    const file = gitWorktreeEvidencePath(workspaceRoot, taskId);
    if (!fs.existsSync(file)) {
      if (optional) return null;
      throw new Error(`Git worktree evidence was not found: ${taskId}`);
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Git worktree evidence is not a regular file: ${file}`);
    return { file, evidence: validateEvidence(JSON.parse(fs.readFileSync(file, 'utf8')), workspaceRoot, taskId) };
  }

  function writeGitWorktreeEvidence(workspaceRoot: string, evidence: GitWorktreeEvidence): { file: string; evidence: GitWorktreeEvidence } {
    const normalized = validateEvidence(evidence, workspaceRoot, evidence.taskId);
    const file = gitWorktreeEvidencePath(workspaceRoot, evidence.taskId);
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
  }): RepositoryDescriptor {
    const sourceRepository = fs.realpathSync(path.resolve(input.workspaceRoot, input.sourcePath));
    const actualRoot = gitText(sourceRepository, ['rev-parse', '--show-toplevel']);
    if (!actualRoot || !sameFilesystemPath(actualRoot, sourceRepository)) throw new Error(`${input.selector} source is not an independent Git repository: ${input.sourcePath}`);
    const remote = input.source.git?.remote ?? null;
    const remoteUrl = remote ? gitText(sourceRepository, ['remote', 'get-url', remote]) : null;
    if (remote && !remoteUrl) throw new Error(`${input.selector} declared remote is missing: ${remote}`);
    if (input.source.git?.url && !runtime.sameGitIdentity(input.source.git.url, remoteUrl)) throw new Error(`${input.selector} remote identity conflicts with its registry declaration.`);
    let resolvedStart = input.startPoint ?? input.source.git?.integrationBranch ?? 'HEAD';
    if (git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0 && remote) {
      const remoteStart = `${remote}/${resolvedStart}`;
      if (git(sourceRepository, ['rev-parse', '--verify', `${remoteStart}^{commit}`]).status === 0) resolvedStart = remoteStart;
    }
    if (git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0) throw new Error(`${input.selector} start point is unavailable: ${resolvedStart}`);
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

  function planGitWorktrees({ workspaceRoot, taskId, branch, startPoint = 'HEAD', includes = [] }: PrepareInput): GitWorktreePlan {
    const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    if (!branch) throw new Error('Git worktree plan requires branch.');
    if (git(root, ['check-ref-format', `refs/heads/${branch}`]).status !== 0) throw new Error(`Invalid task branch: ${branch}`);
    const checkoutRoot = path.join(root, '.worktrees', taskId);
    const repositories: RepositoryDescriptor[] = [sourceDescriptor({ selector: 'workspace', entityType: 'workspace', sourcePath: '.', source: { type: 'git' }, workspaceRoot: root, checkoutRoot, branch, startPoint })];
    const seen = new Set(['workspace']);
    const projects = runtime.readProjectRegistryRecord(root);
    if (projects.registry.migrationRequired) throw new Error('Project registry migration is required before creating Git worktrees.');
    for (const selector of includes) {
      if (seen.has(selector)) continue;
      seen.add(selector);
      if (selector.startsWith('project:')) {
        const code = selector.slice('project:'.length);
        const project = projects.projects[code];
        if (!project) throw new Error(`Unknown Git worktree selector: ${selector}`);
        if (project.source.type !== 'git') continue;
        repositories.push(sourceDescriptor({ selector, entityType: 'project', sourcePath: requiredString(project.source.path, 'project.source.path'), source: project.source, workspaceRoot: root, checkoutRoot, branch }));
        continue;
      }
      if (selector.startsWith('service:')) {
        const [projectCode, serviceCode, ...extra] = selector.slice('service:'.length).split('/');
        if (!projectCode || !serviceCode || extra.length) throw new Error(`Invalid Service selector: ${selector}`);
        const project = projects.projects[projectCode];
        if (!project) throw new Error(`Unknown Project in selector: ${selector}`);
        if (project.source.type === 'git' && !seen.has(`project:${projectCode}`)) throw new Error(`${selector} requires explicit selector project:${projectCode}.`);
        const service = runtime.readServiceRegistryRecord(root, projectCode).services[serviceCode];
        if (!service) throw new Error(`Unknown Git worktree selector: ${selector}`);
        if (service.source.type !== 'git') continue;
        repositories.push(sourceDescriptor({ selector, entityType: 'service', sourcePath: requiredString(service.source.path, 'service.source.path'), source: service.source, workspaceRoot: root, checkoutRoot, branch }));
        continue;
      }
      throw new Error(`Unsupported Git worktree selector: ${selector}`);
    }
    repositories.sort((left, right) => left.sourcePath.split('/').length - right.sourcePath.split('/').length || left.sourcePath.localeCompare(right.sourcePath));
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
    for (const item of plan.repositories) {
      const listed = git(item.sourceRepository, ['worktree', 'list', '--porcelain']);
      if (listed.status !== 0) throw new Error(`Unable to inspect Git worktrees: ${item.selector}`);
      const worktrees = parseGitWorktreeList(listed.stdout);
      const atTarget = worktrees.find((entry) => sameFilesystemPath(entry.path, item.checkoutPath));
      const branchOwner = worktrees.find((entry) => entry.branch === item.branch);
      if (atTarget && atTarget.branch !== item.branch) throw new Error(`${item.selector} target is registered to branch ${atTarget.branch || '(detached)'}.`);
      if (!atTarget && branchOwner) throw new Error(`${item.selector} branch is already checked out at ${branchOwner.path}.`);
      if (!atTarget && fs.existsSync(item.checkoutPath)) throw new Error(`${item.selector} target is occupied but not registered: ${item.checkoutPath}`);
      item.preflightState = atTarget ? 'reused' : 'create';
    }
    const existing = readGitWorktreeEvidence(plan.workspaceRoot, plan.taskId, { optional: true });
    if (existing && existing.evidence.planDigest !== plan.digest) throw new Error('Git worktree evidence exists with a different repository plan.');
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
    let plan: GitWorktreePlan | null = null;
    const effects: WorktreeEffect[] = [];
    const repositories: RepositoryEvidence[] = [];
    try {
      plan = planGitWorktrees(input);
      preflight(plan);
      for (const item of plan.repositories) {
        const plannedState = item.preflightState;
        let state: RepositoryState = plannedState === 'reused' ? 'reused' : 'blocked';
        if (plannedState === 'create') {
          fs.mkdirSync(path.dirname(item.checkoutPath), { recursive: true });
          const branchExists = git(item.sourceRepository, ['show-ref', '--verify', '--quiet', `refs/heads/${item.branch}`]).status === 0;
          const args = branchExists ? ['worktree', 'add', item.checkoutPath, item.branch] : ['worktree', 'add', '-b', item.branch, item.checkoutPath, item.startPoint];
          const added: CommandResult = process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR === item.selector
            ? { status: 1, stdout: '', stderr: `Injected worktree add failure: ${item.selector}` }
            : git(item.sourceRepository, args);
          if (added.status !== 0) {
            repositories.push(repositoryEvidence(item, 'blocked', null, (added.stderr || added.stdout || 'git worktree add failed').trim()));
            const evidence: GitWorktreeEvidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'blocked', repositories, effects: effects.filter((effect): effect is PersistedEffect => effect.type === 'worktree-created'), updatedAt: new Date().toISOString() };
            const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
            return result('create', 'blocked', plan.taskId, written.file, repositories, effects, { code: 'git_worktree_partial_create_failed', message: repositories.at(-1)?.diagnostic ?? 'git worktree add failed' }, [`检查 ${item.checkoutPath} 后重试同一计划。`]);
          }
          effects.push({ type: 'worktree-created', selector: item.selector, checkoutPath: item.checkoutPath, branch: item.branch });
          state = 'created';
        }
        const identity = worktreeIdentity(item.checkoutPath);
        if (!identity || !sameFilesystemPath(identity.repository, item.checkoutPath) || identity.branch !== item.branch || !identity.registered) {
          repositories.push(repositoryEvidence(item, 'blocked', identity, 'Checkout identity does not match the Git worktree plan.'));
          const evidence: GitWorktreeEvidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'blocked', repositories, effects: effects.filter((effect): effect is PersistedEffect => effect.type === 'worktree-created'), updatedAt: new Date().toISOString() };
          const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
          return result('create', 'blocked', plan.taskId, written.file, repositories, effects, { code: 'git_worktree_identity_mismatch', message: `${item.selector} checkout identity is invalid.` }, [`检查 ${item.checkoutPath}。`]);
        }
        repositories.push(repositoryEvidence(item, state, identity));
      }
      const evidence: GitWorktreeEvidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'ready', repositories, effects: effects.filter((effect): effect is PersistedEffect => effect.type === 'worktree-created'), updatedAt: new Date().toISOString() };
      const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
      return result('create', 'ready', plan.taskId, written.file, repositories, effects);
    } catch (error) {
      return result('create', 'blocked', input.taskId, plan ? gitWorktreeEvidencePath(plan.workspaceRoot, plan.taskId) : null, repositories, effects, { code: 'git_worktree_preflight_failed', message: errorMessage(error) }, ['修正 Git plan 后重试；preflight 失败时未执行新的 Git mutation。']);
    }
  }

  function inspectGitWorktrees({ workspaceRoot, taskId }: InspectInput): WorktreeResult {
    try {
      const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
      const stored = readGitWorktreeEvidence(root, taskId, { optional: true });
      if (!stored) return result('inspect', 'blocked', taskId, gitWorktreeEvidencePath(root, taskId), [], [], { code: 'git_worktree_evidence_missing', message: 'Git worktree evidence was not found.' });
      const repositories = stored.evidence.repositories.map((record) => {
        const identity = fs.existsSync(record.checkoutPath) ? worktreeIdentity(record.checkoutPath) : null;
        const matches = Boolean(identity && sameFilesystemPath(identity.repository, record.checkoutPath) && identity.branch === record.branch && identity.registered);
        return { ...record, head: identity?.head ?? null, clean: identity?.clean ?? null, registered: identity?.registered ?? false, state: matches ? 'ready' : 'blocked', diagnostic: matches ? null : 'Current Git identity does not match evidence.' };
      });
      const ready = stored.evidence.status === 'ready' && repositories.every((item) => item.state === 'ready');
      return result('inspect', ready ? 'ready' : 'blocked', taskId, stored.file, repositories, [], ready ? null : { code: 'git_worktree_identity_drift', message: 'One or more Git worktree identities drifted.' }, ready ? [] : ['检查 Git worktree registration、branch 和 checkout path。']);
    } catch (error) {
      return result('inspect', 'blocked', taskId, null, [], [], { code: 'git_worktree_inspect_failed', message: errorMessage(error) });
    }
  }

  function cleanupGitWorktrees({ workspaceRoot, taskId, integratedRefs = {}, allowDirty = false, allowNoChange = false, allowCompleted = false, cleanupDelivery = {} }: CleanupInput): WorktreeResult {
    const effects: WorktreeEffect[] = [];
    try {
      const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
      const stored = readGitWorktreeEvidence(root, taskId, { optional: true });
      if (!stored) return result('cleanup', 'cleaned', taskId, gitWorktreeEvidencePath(root, taskId), [], []);
      const reviewedDeliveries = normalizeGitWorktreeCleanupDelivery(cleanupDelivery, stored.evidence.repositories.map((record) => record.selector));
      if (Object.keys(reviewedDeliveries).length && !allowCompleted) return result('cleanup', 'blocked', taskId, stored.file, [], [], { code: 'git_worktree_cleanup_unauthorized', message: '已核验交付输入需要调用方明确允许completed cleanup。' });
      const checks: CleanupCheck[] = [];
      const controlMetadataOnly = new Set<string>();
      const retainedTargets = new Map<string, { kind: 'refs'; targetHead: string; refs: string[] } | { kind: 'worktree'; branch: string; head: string }>();
      for (const record of stored.evidence.repositories) {
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
          const branchRemoval: CommandResult = process.env.BUILDR_FAULT_WORKTREE_BRANCH_REMOVE_SELECTOR === record.selector
            ? { status: 1, stdout: '', stderr: `Injected branch removal failure: ${record.selector}` }
            : git(record.sourceRepository, ['update-ref', '-d', branchRef, record.head]);
          if (branchRemoval.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_branch_remove_failed', message: (branchRemoval.stderr || branchRemoval.stdout).trim() });
          effects.push({ type: 'local-branch-removed', selector: record.selector, branch: record.branch, head: record.head });
        }
      }
      runtime.removePath(stored.file);
      effects.push({ type: 'provider-evidence-removed', path: stored.file });
      return result('cleanup', 'cleaned', taskId, stored.file, removed, effects);
    } catch (error) {
      const code = error instanceof Error && typeof Reflect.get(error, 'code') === 'string' ? String(Reflect.get(error, 'code')) : 'git_worktree_cleanup_failed';
      return result('cleanup', 'blocked', taskId, null, [], effects, { code, message: errorMessage(error) }, ['保留现场并检查 Git provider evidence。']);
    }
  }

  return Object.assign(runtime, {
    gitWorktreeEvidencePath,
    readGitWorktreeEvidence,
    writeGitWorktreeEvidence,
    planGitWorktrees,
    prepareGitWorktrees,
    inspectGitWorktrees,
    cleanupGitWorktrees,
  });
}
