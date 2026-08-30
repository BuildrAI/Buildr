import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { spawnSync } from '../../infrastructure/process.mjs';
import { sameFilesystemPath } from '../../infrastructure/git/checkout-identity.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';
import {
  verifyDeliveredGitTaskContribution,
  verifyGitNoContributionProof,
  verifyGitTaskContributionContainmentProof,
} from '../../task/application/finish/git-task-contribution.mjs';
import { controlMetadataPath } from '../../infrastructure/git/control-metadata-path.mjs';

export const GIT_WORKTREE_PROVIDER_CAPABILITY = 'buildr.git-worktree-provider/v1';
export const GIT_WORKTREE_EVIDENCE_SCHEMA = 'buildr.git-worktree-evidence/v1';

const TASK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const EVIDENCE_REPOSITORY_FIELDS = new Set(['selector', 'entityType', 'sourcePath', 'sourceRepository', 'checkoutPath', 'branch', 'startPoint', 'head', 'clean', 'registered', 'remote', 'remoteUrl', 'state', 'diagnostic']);
const EVIDENCE_REPOSITORY_STATES = new Set(['created', 'reused', 'ready', 'blocked']);
const EVIDENCE_EFFECT_FIELDS = Object.freeze({
  'worktree-created': new Set(['type', 'selector', 'checkoutPath', 'branch']),
  'legacy-provider-evidence-migrated': new Set(['type', 'taskId']),
});

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function planDigest(plan) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(plan.repositories.map((item) => ({
    selector: item.selector,
    entityType: item.entityType,
    sourcePath: item.sourcePath,
    sourceRepository: item.sourceRepository,
    checkoutPath: item.checkoutPath,
    branch: item.branch,
    startPoint: item.startPoint,
    remote: item.remote,
    remoteUrl: item.remoteUrl,
  })))).digest('hex')}`;
}

export function parseGitWorktreeList(text) {
  const entries = [];
  let current = null;
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

export function registerGitWorktreeProvider(runtime) {
  function git(cwd, args, options = {}) {
    return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', ...options });
  }

  function gitText(cwd, args) {
    const result = git(cwd, args);
    return result.status === 0 ? result.stdout.trim() : null;
  }

  function changedWorktreePaths(targetRoot) {
    const observations = [
      git(targetRoot, ['diff', '--name-only', '--no-renames', '-z']),
      git(targetRoot, ['diff', '--cached', '--name-only', '--no-renames', '-z']),
      git(targetRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
    ];
    if (observations.some((item) => item.status !== 0)) return null;
    const paths = [...new Set(observations.flatMap((item) => item.stdout.split('\0').filter(Boolean)))].sort();
    return {
      controlMetadata: paths.filter(controlMetadataPath),
      source: paths.filter((entry) => !controlMetadataPath(entry)),
    };
  }

  function worktreeIdentity(targetRoot) {
    const root = git(targetRoot, ['rev-parse', '--show-toplevel']);
    const branch = git(targetRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const head = git(targetRoot, ['rev-parse', 'HEAD']);
    const status = git(targetRoot, ['status', '--porcelain']);
    if ([root, branch, head, status].some((item) => item.status !== 0)) return null;
    const listed = git(targetRoot, ['worktree', 'list', '--porcelain']);
    const registered = listed.status === 0 && parseGitWorktreeList(listed.stdout).some((item) => sameFilesystemPath(item.path, root.stdout.trim()) && item.branch === branch.stdout.trim());
    return { repository: path.resolve(root.stdout.trim()), branch: branch.stdout.trim(), head: head.stdout.trim(), clean: status.stdout.trim() === '', registered };
  }

  function sharedGitDir(repository) {
    const value = gitText(repository, ['rev-parse', '--git-common-dir']);
    if (!value) throw new Error(`Unable to resolve shared Git metadata: ${repository}`);
    return path.resolve(repository, value);
  }

  function gitWorktreeEvidencePath(workspaceRoot, taskId) {
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    const root = fs.realpathSync(workspaceRoot);
    return path.join(sharedGitDir(root), 'buildr', 'task-worktrees', `${taskId}.json`);
  }

  function validateEvidence(value, workspaceRoot, taskId) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Git worktree evidence must be an object.');
    const allowed = new Set(['schemaVersion', 'taskId', 'workspaceRoot', 'branch', 'planDigest', 'status', 'repositories', 'effects', 'updatedAt']);
    for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Git worktree evidence field is unsupported: ${key}`);
    if (value.schemaVersion !== GIT_WORKTREE_EVIDENCE_SCHEMA || value.taskId !== taskId || typeof value.workspaceRoot !== 'string' || !sameFilesystemPath(value.workspaceRoot, workspaceRoot)) throw new Error('Git worktree evidence identity does not match the requested Workspace/Task.');
    if (!['ready', 'blocked'].includes(value.status) || !Array.isArray(value.repositories) || !Array.isArray(value.effects)) throw new Error('Git worktree evidence shape is invalid.');
    if (typeof value.branch !== 'string' || !value.branch || typeof value.planDigest !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value.planDigest) || Number.isNaN(Date.parse(value.updatedAt))) throw new Error('Git worktree evidence metadata is invalid.');
    const selectors = new Set();
    const repositories = value.repositories.map((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Git worktree evidence repository ${index} must be an object.`);
      for (const key of Object.keys(record)) if (!EVIDENCE_REPOSITORY_FIELDS.has(key)) throw new Error(`Git worktree evidence repository field is unsupported: ${key}`);
      if (typeof record.selector !== 'string' || !record.selector || selectors.has(record.selector)) throw new Error(`Git worktree evidence repository selector is invalid or duplicated: ${record.selector}`);
      selectors.add(record.selector);
      if (!['workspace', 'project', 'service'].includes(record.entityType)) throw new Error(`Git worktree evidence entity type is invalid: ${record.entityType}`);
      if (typeof record.sourcePath !== 'string' || path.posix.isAbsolute(record.sourcePath) || path.posix.normalize(record.sourcePath) !== record.sourcePath || record.sourcePath.startsWith('../')) throw new Error(`Git worktree evidence sourcePath is invalid: ${record.sourcePath}`);
      for (const field of ['sourceRepository', 'checkoutPath']) if (typeof record[field] !== 'string' || !path.isAbsolute(record[field]) || path.normalize(record[field]) !== record[field]) throw new Error(`Git worktree evidence ${field} must be a normalized absolute path.`);
      for (const field of ['branch', 'startPoint']) if (typeof record[field] !== 'string' || !record[field]) throw new Error(`Git worktree evidence ${field} must be a non-empty string.`);
      if (record.head !== null && record.head !== undefined && (typeof record.head !== 'string' || !/^[a-f0-9]{40,64}$/.test(record.head))) throw new Error('Git worktree evidence head is invalid.');
      if (record.clean !== null && record.clean !== undefined && typeof record.clean !== 'boolean') throw new Error('Git worktree evidence clean must be boolean or null.');
      if (typeof record.registered !== 'boolean' || !EVIDENCE_REPOSITORY_STATES.has(record.state)) throw new Error('Git worktree evidence repository state is invalid.');
      for (const field of ['remote', 'remoteUrl', 'diagnostic']) if (record[field] !== null && record[field] !== undefined && typeof record[field] !== 'string') throw new Error(`Git worktree evidence ${field} must be string or null.`);
      return {
        selector: record.selector,
        entityType: record.entityType,
        sourcePath: record.sourcePath,
        sourceRepository: record.sourceRepository,
        checkoutPath: record.checkoutPath,
        branch: record.branch,
        startPoint: record.startPoint,
        head: record.head ?? null,
        clean: record.clean ?? null,
        registered: record.registered,
        remote: record.remote ?? null,
        remoteUrl: record.remoteUrl ?? null,
        state: record.state,
        diagnostic: record.diagnostic ?? null,
      };
    });
    const effects = value.effects.map((effect, index) => {
      if (!effect || typeof effect !== 'object' || Array.isArray(effect) || !EVIDENCE_EFFECT_FIELDS[effect.type]) throw new Error(`Git worktree evidence effect ${index} is unsupported.`);
      for (const key of Object.keys(effect)) if (!EVIDENCE_EFFECT_FIELDS[effect.type].has(key)) throw new Error(`Git worktree evidence effect field is unsupported: ${key}`);
      for (const [key, entry] of Object.entries(effect)) if (typeof entry !== 'string' || !entry) throw new Error(`Git worktree evidence effect ${key} must be a non-empty string.`);
      return { ...effect };
    });
    return {
      schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA,
      taskId,
      workspaceRoot: fs.realpathSync(workspaceRoot),
      branch: value.branch,
      planDigest: value.planDigest,
      status: value.status,
      repositories,
      effects,
      updatedAt: new Date(value.updatedAt).toISOString(),
    };
  }

  function readGitWorktreeEvidence(workspaceRoot, taskId, { optional = false } = {}) {
    const file = gitWorktreeEvidencePath(workspaceRoot, taskId);
    if (!fs.existsSync(file)) {
      if (optional) return null;
      throw new Error(`Git worktree evidence was not found: ${taskId}`);
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Git worktree evidence is not a regular file: ${file}`);
    return { file, evidence: validateEvidence(JSON.parse(fs.readFileSync(file, 'utf8')), workspaceRoot, taskId) };
  }

  function writeGitWorktreeEvidence(workspaceRoot, evidence) {
    const normalized = validateEvidence(evidence, workspaceRoot, evidence.taskId);
    const file = gitWorktreeEvidencePath(workspaceRoot, evidence.taskId);
    runtime.atomicWriteJson(file, normalized);
    return { file, evidence: normalized };
  }

  function sourceDescriptor({ selector, entityType, sourcePath, source, workspaceRoot, checkoutRoot, branch, startPoint }) {
    const sourceRepository = fs.realpathSync(path.resolve(workspaceRoot, sourcePath));
    const actualRoot = gitText(sourceRepository, ['rev-parse', '--show-toplevel']);
    if (!actualRoot || !sameFilesystemPath(actualRoot, sourceRepository)) throw new Error(`${selector} source is not an independent Git repository: ${sourcePath}`);
    const remote = source.git?.remote || null;
    const remoteUrl = remote ? gitText(sourceRepository, ['remote', 'get-url', remote]) : null;
    if (remote && !remoteUrl) throw new Error(`${selector} declared remote is missing: ${remote}`);
    if (source.git?.url && !runtime.sameGitIdentity(source.git.url, remoteUrl)) throw new Error(`${selector} remote identity conflicts with its registry declaration.`);
    let resolvedStart = startPoint || source.git?.integrationBranch || 'HEAD';
    if (git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0 && remote) {
      const remoteStart = `${remote}/${resolvedStart}`;
      if (git(sourceRepository, ['rev-parse', '--verify', `${remoteStart}^{commit}`]).status === 0) resolvedStart = remoteStart;
    }
    if (git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0) throw new Error(`${selector} start point is unavailable: ${resolvedStart}`);
    return {
      selector,
      entityType,
      sourcePath: sourcePath.split(path.sep).join('/'),
      sourceRepository,
      checkoutPath: path.resolve(checkoutRoot, sourcePath),
      branch,
      startPoint: resolvedStart,
      remote,
      remoteUrl,
    };
  }

  function planGitWorktrees({ workspaceRoot, taskId, branch, startPoint = 'HEAD', includes = [] }) {
    const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`Invalid task id: ${taskId}`);
    if (!branch) throw new Error('Git worktree plan requires branch.');
    if (git(root, ['check-ref-format', `refs/heads/${branch}`]).status !== 0) throw new Error(`Invalid task branch: ${branch}`);
    const checkoutRoot = path.join(root, '.worktrees', taskId);
    const repositories = [sourceDescriptor({ selector: 'workspace', entityType: 'workspace', sourcePath: '.', source: { type: 'git' }, workspaceRoot: root, checkoutRoot, branch, startPoint })];
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
        repositories.push(sourceDescriptor({ selector, entityType: 'project', sourcePath: project.source.path, source: project.source, workspaceRoot: root, checkoutRoot, branch }));
        continue;
      }
      if (selector.startsWith('service:')) {
        const ref = selector.slice('service:'.length);
        const [projectCode, serviceCode, ...extra] = ref.split('/');
        if (!projectCode || !serviceCode || extra.length) throw new Error(`Invalid Service selector: ${selector}`);
        const project = projects.projects[projectCode];
        if (!project) throw new Error(`Unknown Project in selector: ${selector}`);
        if (project.source.type === 'git' && !seen.has(`project:${projectCode}`)) throw new Error(`${selector} requires explicit selector project:${projectCode}.`);
        const services = runtime.readServiceRegistryRecord(root, projectCode);
        const service = services.services[serviceCode];
        if (!service) throw new Error(`Unknown Git worktree selector: ${selector}`);
        if (service.source.type !== 'git') continue;
        repositories.push(sourceDescriptor({ selector, entityType: 'service', sourcePath: service.source.path, source: service.source, workspaceRoot: root, checkoutRoot, branch }));
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

  function preflight(plan) {
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

  function repositoryEvidence(item, state, identity = null, diagnostic = null) {
    return {
      selector: item.selector,
      entityType: item.entityType,
      sourcePath: item.sourcePath,
      sourceRepository: item.sourceRepository,
      checkoutPath: item.checkoutPath,
      branch: item.branch,
      startPoint: item.startPoint,
      head: identity?.head || null,
      clean: identity?.clean ?? null,
      registered: identity?.registered ?? false,
      remote: item.remote,
      remoteUrl: item.remoteUrl,
      state,
      diagnostic,
    };
  }

  function result(operation, status, taskId, evidencePath, repositories, effects = [], diagnostic = null, nextActions = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.gitWorktreeResult, { operation, status, taskId, evidencePath, repositories, effects, diagnostic, nextActions });
  }

  function prepareGitWorktrees(input) {
    let plan = null;
    const effects = [];
    const repositories = [];
    try {
      plan = planGitWorktrees(input);
      preflight(plan);
      for (const item of plan.repositories) {
        let state = item.preflightState;
        if (state === 'create') {
          fs.mkdirSync(path.dirname(item.checkoutPath), { recursive: true });
          const branchExists = git(item.sourceRepository, ['show-ref', '--verify', '--quiet', `refs/heads/${item.branch}`]).status === 0;
          const args = branchExists ? ['worktree', 'add', item.checkoutPath, item.branch] : ['worktree', 'add', '-b', item.branch, item.checkoutPath, item.startPoint];
          const added = process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR === item.selector ? { status: 1, stdout: '', stderr: `Injected worktree add failure: ${item.selector}` } : git(item.sourceRepository, args);
          if (added.status !== 0) {
            repositories.push(repositoryEvidence(item, 'blocked', null, (added.stderr || added.stdout || 'git worktree add failed').trim()));
            const evidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'blocked', repositories, effects, updatedAt: new Date().toISOString() };
            const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
            return result('create', 'blocked', plan.taskId, written.file, repositories, effects, { code: 'git_worktree_partial_create_failed', message: repositories.at(-1).diagnostic }, [`检查 ${item.checkoutPath} 后重试同一计划。`]);
          }
          effects.push({ type: 'worktree-created', selector: item.selector, checkoutPath: item.checkoutPath, branch: item.branch });
          state = 'created';
        }
        const identity = worktreeIdentity(item.checkoutPath);
        if (!identity || !sameFilesystemPath(identity.repository, item.checkoutPath) || identity.branch !== item.branch || !identity.registered) {
          repositories.push(repositoryEvidence(item, 'blocked', identity, 'Checkout identity does not match the Git worktree plan.'));
          const evidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'blocked', repositories, effects, updatedAt: new Date().toISOString() };
          const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
          return result('create', 'blocked', plan.taskId, written.file, repositories, effects, { code: 'git_worktree_identity_mismatch', message: `${item.selector} checkout identity is invalid.` }, [`检查 ${item.checkoutPath}。`]);
        }
        repositories.push(repositoryEvidence(item, state, identity));
      }
      const evidence = { schemaVersion: GIT_WORKTREE_EVIDENCE_SCHEMA, taskId: plan.taskId, workspaceRoot: plan.workspaceRoot, branch: plan.branch, planDigest: plan.digest, status: 'ready', repositories, effects, updatedAt: new Date().toISOString() };
      const written = writeGitWorktreeEvidence(plan.workspaceRoot, evidence);
      return result('create', 'ready', plan.taskId, written.file, repositories, effects);
    } catch (error) {
      return result('create', 'blocked', input.taskId, plan ? gitWorktreeEvidencePath(plan.workspaceRoot, plan.taskId) : null, repositories, effects, { code: 'git_worktree_preflight_failed', message: error.message }, ['修正 Git plan 后重试；preflight 失败时未执行新的 Git mutation。']);
    }
  }

  function inspectGitWorktrees({ workspaceRoot, taskId }) {
    try {
      const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
      const stored = readGitWorktreeEvidence(root, taskId, { optional: true });
      if (!stored) return result('inspect', 'blocked', taskId, gitWorktreeEvidencePath(root, taskId), [], [], { code: 'git_worktree_evidence_missing', message: 'Git worktree evidence was not found.' }, []);
      const repositories = stored.evidence.repositories.map((record) => {
        const identity = fs.existsSync(record.checkoutPath) ? worktreeIdentity(record.checkoutPath) : null;
        const matches = Boolean(identity && sameFilesystemPath(identity.repository, record.checkoutPath) && identity.branch === record.branch && identity.registered);
        return { ...record, head: identity?.head || null, clean: identity?.clean ?? null, registered: identity?.registered ?? false, state: matches ? 'ready' : 'blocked', diagnostic: matches ? null : 'Current Git identity does not match evidence.' };
      });
      const ready = stored.evidence.status === 'ready' && repositories.every((item) => item.state === 'ready');
      return result('inspect', ready ? 'ready' : 'blocked', taskId, stored.file, repositories, [], ready ? null : { code: 'git_worktree_identity_drift', message: 'One or more Git worktree identities drifted.' }, ready ? [] : ['检查 Git worktree registration、branch 和 checkout path。']);
    } catch (error) {
      return result('inspect', 'blocked', taskId, null, [], [], { code: 'git_worktree_inspect_failed', message: error.message }, []);
    }
  }

  function cleanupGitWorktrees({ workspaceRoot, taskId, integratedRefs = {}, integratedContributions = {}, allowDirty = false, allowNoChange = false, allowCompleted = false }) {
    const effects = [];
    try {
      const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(workspaceRoot));
      const stored = readGitWorktreeEvidence(root, taskId, { optional: true });
      if (!stored) return result('cleanup', 'cleaned', taskId, gitWorktreeEvidencePath(root, taskId), [], [], null, []);
      const checks = [];
      const controlMetadataOnly = new Set();
      const contributionEquivalent = new Set();
      const retainedTargets = new Map();
      for (const record of stored.evidence.repositories) {
        const checkoutExists = fs.existsSync(record.checkoutPath);
        const identity = checkoutExists ? worktreeIdentity(record.checkoutPath) : null;
        if (checkoutExists && (!identity || !sameFilesystemPath(identity.repository, record.checkoutPath) || identity.branch !== record.branch || !identity.registered)) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_identity_mismatch', message: `Checkout identity does not match evidence: ${record.selector}.` }, ['核对 ownership 后重试。']);
        if (!checkoutExists) {
          const listed = git(record.sourceRepository, ['worktree', 'list', '--porcelain']);
          const registration = listed.status === 0 ? parseGitWorktreeList(listed.stdout).find((item) => sameFilesystemPath(item.path, record.checkoutPath)) : null;
          if (registration) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_checkout_missing_registered', message: `Task checkout 路径缺失但仍保留 Git registration：${record.selector}。` }, ['先恢复或清理悬空 Git worktree registration。']);
          const branchHead = gitText(record.sourceRepository, ['rev-parse', '--verify', `refs/heads/${record.branch}^{commit}`]);
          if (branchHead && branchHead !== record.head) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_branch_drift', message: `Task checkout 已缺失，且本地任务分支已漂移：${record.selector}。` }, ['保留 evidence 并人工核对 branch ownership。']);
        }
        if (allowNoChange && identity?.head !== record.head) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_no_change_head_drift', message: `Task 声明 no-change，但 checkout HEAD 已偏离 Environment evidence：${record.selector}。` }, ['保留 checkout，并交付或处置新增提交后重试。']);
        // Completion permits checking disposal, not trusting a claimed delivery. Keep all
        // commits reachable from the actual retained checkout, without guessing a remote.
        let retainedRef = null;
        if (allowCompleted) {
          const retained = worktreeIdentity(record.sourceRepository);
          if (!retained || retained.branch === record.branch || !retained.branch) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_retained_target_unavailable', message: `Retained repository needs a non-task branch: ${record.selector}.` }, ['保留工作树，先确认承载成果的保留分支。']);
          retainedRef = retained.head;
          retainedTargets.set(record.selector, retained);
        }
        const integratedRef = allowNoChange ? record.head : retainedRef || integratedRefs[record.selector] || null;
        const contributionProof = integratedContributions[record.selector] || null;
        const contribution = !allowDirty && integratedRef && contributionProof && checkoutExists
          ? contributionProof.kind === 'no-contribution'
            ? verifyGitNoContributionProof({ taskRoot: record.checkoutPath, targetRef: integratedRef, proof: contributionProof })
            : contributionProof.schemaVersion === 'buildr.task-delivery-containment-proof/v1'
              ? verifyGitTaskContributionContainmentProof({ taskRoot: record.checkoutPath, targetRef: integratedRef, proof: contributionProof })
              : verifyDeliveredGitTaskContribution({ taskRoot: record.checkoutPath, targetRef: integratedRef, proof: contributionProof })
          : null;
        if (contribution?.status === 'equivalent') contributionEquivalent.add(path.resolve(record.checkoutPath));
        if (!allowDirty && identity && !identity.clean) {
          const changed = changedWorktreePaths(record.checkoutPath);
          if (!changed || (changed.source.length > 0 && contribution?.status !== 'equivalent')) return result('cleanup', 'blocked', taskId, stored.file, [...checks, { ...record, ...identity, state: 'blocked', contribution }], effects, { code: contribution?.code || 'git_worktree_dirty', message: `Task checkout source is dirty without equivalent delivered contribution evidence: ${record.selector}.` }, ['先完成交付或由明确 abandon authorization 处理 Task-owned 内容。']);
          controlMetadataOnly.add(path.resolve(record.checkoutPath));
        }
        if (!allowDirty) {
          if (!integratedRef) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_integrated_ref_missing', message: `Missing integrated ref: ${record.selector}.` }, ['提供每个 repository 的 delivery identity。']);
          const target = gitText(record.sourceRepository, ['rev-parse', '--verify', `${integratedRef}^{commit}`]);
          const taskHead = identity?.head || record.head;
          const ancestor = Boolean(target && taskHead && git(record.sourceRepository, ['merge-base', '--is-ancestor', taskHead, target]).status === 0);
          if (!ancestor && contribution?.status !== 'equivalent') return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: contribution?.code || 'git_worktree_not_integrated', message: `${record.selector} HEAD is neither contained by ${integratedRef} nor covered by equivalent Task Contribution evidence.`, contribution }, ['完成交付或修复 contribution evidence 后重试。']);
        }
        checks.push({ ...record, head: identity?.head || record.head, clean: identity?.clean ?? record.clean, registered: Boolean(identity?.registered), integratedRef, contribution: contribution?.status === 'equivalent' ? contribution : null, checkoutExists, state: 'ready' });
      }
      const removed = [];
      for (const record of [...checks].sort((left, right) => right.checkoutPath.split(path.sep).length - left.checkoutPath.split(path.sep).length)) {
        const retainedTarget = retainedTargets.get(record.selector);
        if (retainedTarget) {
          const currentTarget = worktreeIdentity(record.sourceRepository);
          if (!currentTarget || currentTarget.branch !== retainedTarget.branch || currentTarget.head !== retainedTarget.head) return result('cleanup', 'blocked', taskId, stored.file, checks, effects, { code: 'git_worktree_retained_target_drift', message: `Retained repository changed before cleanup: ${record.selector}.` }, ['重新核对保留分支和内容包含关系后重试。']);
        }
        if (record.checkoutExists) {
          const discardControlMetadata = controlMetadataOnly.has(path.resolve(record.checkoutPath));
          const args = ['worktree', 'remove', ...(allowDirty || discardControlMetadata || contributionEquivalent.has(path.resolve(record.checkoutPath)) ? ['--force'] : []), record.checkoutPath];
          const removal = git(record.sourceRepository, args);
          if (removal.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, [...removed, { ...record, state: 'remove-failed' }], effects, { code: 'git_worktree_remove_failed', message: (removal.stderr || removal.stdout).trim() }, ['保留剩余 evidence 并从当前步骤重试。']);
          effects.push({ type: 'worktree-removed', selector: record.selector, checkoutPath: record.checkoutPath });
        } else effects.push({ type: 'worktree-absence-confirmed', selector: record.selector, checkoutPath: record.checkoutPath });
        removed.push({ ...record, state: 'removed' });
        const branchRef = `refs/heads/${record.branch}`;
        const branchPresence = git(record.sourceRepository, ['show-ref', '--verify', '--quiet', branchRef]);
        if (branchPresence.status === 1) effects.push({ type: 'local-branch-absence-confirmed', selector: record.selector, branch: record.branch, head: record.head });
        else if (branchPresence.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_branch_inspect_failed', message: (branchPresence.stderr || branchPresence.stdout).trim() }, ['保留 evidence 并检查本地 branch ref。']);
        else {
          const branchRemoval = process.env.BUILDR_FAULT_WORKTREE_BRANCH_REMOVE_SELECTOR === record.selector
            ? { status: 1, stdout: '', stderr: `Injected branch removal failure: ${record.selector}` }
            : git(record.sourceRepository, ['update-ref', '-d', branchRef, record.head]);
          if (branchRemoval.status !== 0) return result('cleanup', 'blocked', taskId, stored.file, removed, effects, { code: 'git_worktree_branch_remove_failed', message: (branchRemoval.stderr || branchRemoval.stdout).trim() }, ['人工核对本地 branch 后重试。']);
          effects.push({ type: 'local-branch-removed', selector: record.selector, branch: record.branch, head: record.head });
        }
      }
      runtime.removePath(stored.file);
      effects.push({ type: 'provider-evidence-removed', path: stored.file });
      return result('cleanup', 'cleaned', taskId, stored.file, removed, effects);
    } catch (error) {
      return result('cleanup', 'blocked', taskId, null, [], effects, { code: 'git_worktree_cleanup_failed', message: error.message }, ['保留现场并检查 Git provider evidence。']);
    }
  }

  Object.assign(runtime, {
    gitWorktreeEvidencePath,
    readGitWorktreeEvidence,
    writeGitWorktreeEvidence,
    planGitWorktrees,
    prepareGitWorktrees,
    inspectGitWorktrees,
    cleanupGitWorktrees,
  });
  return runtime;
}
