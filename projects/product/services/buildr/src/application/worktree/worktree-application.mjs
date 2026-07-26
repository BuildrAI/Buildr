import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';
import { checkRuntimeAdapter } from '../../infrastructure/runtime/check-runtime.mjs';

const TASK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RECEIPT_SCHEMA = 'buildr.task-environment-receipt/v1';
const ADOPTION_RECEIPT_SCHEMA = 'buildr.task-environment-adoption-receipt/v1';
const ADOPTION_MODES = new Set(['new-session', 'reentered', 'reload']);
const ROOT_EVIDENCE_SOURCES = new Set(['host-context', 'runtime-host']);

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolveExecutionCliSource({ workspaceRoot, environmentRoot, productRoot: activeProductRoot }) {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedEnvironmentRoot = path.resolve(environmentRoot);
  const resolvedProductRoot = path.resolve(activeProductRoot);
  if (inside(resolvedEnvironmentRoot, resolvedProductRoot)) {
    return { sourceRoot: resolvedProductRoot, sourceKind: 'environment-local' };
  }
  if (!inside(resolvedWorkspaceRoot, resolvedProductRoot)) {
    return { sourceRoot: resolvedProductRoot, sourceKind: 'external-product' };
  }
  return {
    sourceRoot: path.resolve(resolvedEnvironmentRoot, path.relative(resolvedWorkspaceRoot, resolvedProductRoot)),
    sourceKind: 'environment-local',
  };
}

function optionValues(args, option) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== option) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    values.push(value);
    index += 1;
  }
  return values;
}

function stablePlan(plan) {
  return plan.map((item) => ({
    selector: item.selector,
    sourcePath: item.sourcePath,
    sourceRepository: item.sourceRepository,
    checkoutPath: item.checkoutPath,
    branch: item.branch,
    startPoint: item.startPoint,
    remote: item.remote || null,
    remoteUrl: item.remoteUrl || null,
  }));
}

function planDigest(plan) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(stablePlan(plan))).digest('hex')}`;
}

export function parseWorktreeList(text) {
  return text.trim().split(/\n\n+/).filter(Boolean).map((block) => {
    const entry = { path: null, head: null, branchRef: null, branch: null };
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) {
        entry.branchRef = line.slice('branch '.length);
        entry.branch = entry.branchRef.replace(/^refs\/heads\//, '');
      }
    }
    return entry;
  });
}

export function isSafeRuntimeStaleOnly({ report, agent, identity, expectedBranch, expectedHead, allowedCodes = [] }) {
  const actionable = (report?.findings || []).filter((finding) => finding.userActionRequired === true);
  const staleCode = `runtime.${agent.replaceAll('-', '_')}_stale`;
  const disallowedErrors = (report?.findings || []).filter((finding) => finding.status === 'error' && finding.code !== staleCode && !allowedCodes.includes(finding.code));
  return (report?.ok === true || (allowedCodes.length > 0 && disallowedErrors.length === 0))
    && report.health?.workspaceValid === true
    && report.mutations?.blocked !== true
    && actionable.length > 0
    && actionable.every((finding) => finding.code === staleCode || allowedCodes.includes(finding.code))
    && identity?.clean === true
    && identity.branch === expectedBranch
    && identity.head === expectedHead;
}

function doctorSummary(report) {
  if (!report) return null;
  return {
    ok: report.ok,
    health: report.health,
    findings: (report.findings || []).map((finding) => ({
      status: finding.status,
      code: finding.code,
      message: finding.message,
      path: finding.path || null,
    })),
  };
}

export function registerWorktreeApplication(runtime) {
  const optionValue = (...args) => runtime.optionValue(...args);
  const positionalArgs = (...args) => runtime.positionalArgs(...args);
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const isSupportedAgent = (...args) => runtime.isSupportedAgent(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const atomicWriteJson = (...args) => runtime.atomicWriteJson(...args);

  function git(cwd, args, options = {}) {
    return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', ...options });
  }

  function gitText(cwd, args) {
    const result = git(cwd, args);
    return result.status === 0 ? result.stdout.trim() : null;
  }

  function buildr(args, options = {}) {
    return spawnSync(process.execPath, [path.join(productRoot(), 'bin', 'buildr.mjs'), ...args], {
      cwd: productRoot(),
      encoding: 'utf8',
      ...options,
    });
  }

  function readDoctor(agent, targetRoot) {
    const result = buildr(['doctor', '--agent', agent, '--target', targetRoot, '--json']);
    let report = null;
    try { report = JSON.parse(result.stdout); } catch { /* reported by caller */ }
    return { result, report };
  }

  function worktreeIdentity(targetRoot) {
    const root = git(targetRoot, ['rev-parse', '--show-toplevel']);
    const branch = git(targetRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const head = git(targetRoot, ['rev-parse', 'HEAD']);
    const status = git(targetRoot, ['status', '--porcelain']);
    if ([root, branch, head, status].some((item) => item.status !== 0)) return null;
    return {
      repository: path.resolve(root.stdout.trim()),
      branch: branch.stdout.trim(),
      head: head.stdout.trim(),
      clean: status.stdout.trim() === '',
    };
  }

  function sharedGitDir(repository) {
    const value = gitText(repository, ['rev-parse', '--git-common-dir']);
    if (!value) throw new Error(`Unable to resolve shared Git metadata: ${repository}`);
    return path.resolve(repository, value);
  }

  function receiptsDir(workspaceRoot) {
    return path.join(sharedGitDir(workspaceRoot), 'buildr', 'task-environments');
  }

  function receiptPath(workspaceRoot, taskId) {
    return path.join(receiptsDir(workspaceRoot), `${taskId}.json`);
  }

  function adoptionReceiptPath(workspaceRoot, taskId) {
    return path.join(receiptsDir(workspaceRoot), 'adoptions', `${taskId}.json`);
  }

  function readReceipt(workspaceRoot, taskId) {
    const file = receiptPath(workspaceRoot, taskId);
    if (!fs.existsSync(file)) return null;
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.taskId !== taskId) throw new Error(`Invalid task environment receipt: ${file}`);
    return receipt;
  }

  function writeReceipt(workspaceRoot, receipt) {
    const directory = receiptsDir(workspaceRoot);
    fs.mkdirSync(directory, { recursive: true });
    const file = receiptPath(workspaceRoot, receipt.taskId);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
    fs.renameSync(temporary, file);
    return file;
  }

  function readAdoptionReceipt(workspaceRoot, taskId) {
    const file = adoptionReceiptPath(workspaceRoot, taskId);
    if (!fs.existsSync(file)) return null;
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (receipt.schemaVersion !== ADOPTION_RECEIPT_SCHEMA || receipt.taskId !== taskId) throw new Error(`Invalid task environment adoption receipt: ${file}`);
    return receipt;
  }

  function writeAdoptionReceipt(workspaceRoot, receipt) {
    const file = adoptionReceiptPath(workspaceRoot, receipt.taskId);
    atomicWriteJson(file, receipt);
    return file;
  }

  function runtimeExpectation(environmentRoot, agent) {
    const checked = checkRuntimeAdapter(['--target', environmentRoot, '--scope', '.'], { repoRoot: environmentRoot, adapterId: agent, command: `buildr runtime check ${agent}` });
    return {
      ...checked.runtimeSourceEvidence,
      environmentRoot,
      activationVerification: 'conditional',
      requiresSessionAdoption: false,
    };
  }

  function executionCliEvidence(sourceRoot = productRoot(), sourceKind = 'external-product') {
    const source = path.join(sourceRoot, 'bin', 'buildr.mjs');
    const files = [];
    const visit = (target) => {
      if (!fs.existsSync(target)) return;
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(target).sort()) visit(path.join(target, name));
      } else if (stat.isFile()) files.push(target);
    };
    visit(path.join(sourceRoot, 'bin'));
    visit(path.join(sourceRoot, 'src'));
    visit(path.join(sourceRoot, 'package.json'));
    const hash = crypto.createHash('sha256');
    for (const file of files.sort()) {
      hash.update(path.relative(sourceRoot, file).split(path.sep).join('/'));
      hash.update('\0');
      hash.update(fs.readFileSync(file));
      hash.update('\0');
    }
    return { source, sourceKind, identity: `sha256-${hash.digest('hex')}` };
  }

  function expectedExecutionCliEvidence(workspaceRoot, environmentRoot) {
    const expected = resolveExecutionCliSource({ workspaceRoot, environmentRoot, productRoot: productRoot() });
    return executionCliEvidence(expected.sourceRoot, expected.sourceKind);
  }

  function currentExecutionCliEvidence(receipt) {
    const activeProductRoot = path.resolve(productRoot());
    const sourceKind = inside(receipt.environmentRoot, activeProductRoot) ? 'environment-local' : 'external-product';
    return executionCliEvidence(activeProductRoot, sourceKind);
  }

  function executionCliMatches(receipt, currentCli) {
    if (!receipt.executionCli) return currentCli.sourceKind === 'environment-local';
    const expectedKind = receipt.executionCli.sourceKind
      || (inside(receipt.environmentRoot, path.dirname(path.dirname(receipt.executionCli.source))) ? 'environment-local' : 'external-product');
    return expectedKind === currentCli.sourceKind
      && receipt.executionCli.source === currentCli.source
      && receipt.executionCli.identity === currentCli.identity;
  }

  function handoffAction(receipt) {
    return `If specialty acceptance requires proving a changed runtime discovery, loading, or activation mechanism, start, reload, or re-enter the ${receipt.agent} session and record host-visible activation evidence for ${receipt.environmentRoot}.`;
  }

  function isolation() {
    return {
      source: 'isolated',
      gitMetadata: 'shared',
      localRuntime: 'namespaced-or-declared',
      externalSystems: 'project-owned',
      notes: [
        'Git working trees and indexes are isolated; objects, refs, and worktree metadata are shared by each repository.',
        'External dependencies keep their Project-defined environment; only shared mutable state needs an existing tenant, account, data prefix, serialization, or explicit authorization boundary.',
      ],
    };
  }

  function sourceDescriptor({ selector, entityType, sourcePath, source, workspaceRoot, environmentRoot, branch, startPoint }) {
    const sourceRepository = fs.realpathSync(path.resolve(workspaceRoot, sourcePath));
    const actualRoot = gitText(sourceRepository, ['rev-parse', '--show-toplevel']);
    if (!actualRoot || path.resolve(actualRoot) !== sourceRepository) throw new Error(`${selector} source is not an independent Git repository: ${sourcePath}`);
    const remote = source.git?.remote || null;
    const remoteUrl = remote ? gitText(sourceRepository, ['remote', 'get-url', remote]) : null;
    if (remote && !remoteUrl) throw new Error(`${selector} declared remote is missing: ${remote}`);
    if (source.git?.url && !runtime.sameGitIdentity(source.git.url, remoteUrl)) {
      throw new Error(`${selector} remote identity conflicts with its registry declaration.`);
    }
    let resolvedStart = startPoint || source.git?.integrationBranch || 'HEAD';
    if (git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0 && remote) {
      const remoteStart = `${remote}/${resolvedStart}`;
      if (git(sourceRepository, ['rev-parse', '--verify', `${remoteStart}^{commit}`]).status === 0) resolvedStart = remoteStart;
    }
    if (git(sourceRepository, ['rev-parse', '--verify', `${resolvedStart}^{commit}`]).status !== 0) {
      throw new Error(`${selector} start point is unavailable: ${resolvedStart}`);
    }
    return {
      selector,
      entityType,
      sourcePath: sourcePath.split(path.sep).join('/'),
      sourceRepository,
      checkoutPath: path.resolve(environmentRoot, sourcePath),
      branch,
      startPoint: resolvedStart,
      remote,
      remoteUrl,
    };
  }

  function resolvePlan({ workspaceRoot, taskId, agent, branch, rootStartPoint, includes }) {
    const environmentRoot = path.join(workspaceRoot, '.worktrees', taskId);
    const root = sourceDescriptor({
      selector: 'workspace', entityType: 'workspace', sourcePath: '.',
      source: { type: 'git' }, workspaceRoot, environmentRoot, branch, startPoint: rootStartPoint,
    });
    const plan = [root];
    const seen = new Set(['workspace']);
    const projects = runtime.readProjectRegistryRecord(workspaceRoot);
    if (projects.registry.migrationRequired) throw new Error('Project registry migration is required before creating a task environment.');
    for (const selector of includes) {
      if (seen.has(selector)) continue;
      seen.add(selector);
      if (selector.startsWith('project:')) {
        const code = selector.slice('project:'.length);
        const project = projects.projects[code];
        if (!project) throw new Error(`Unknown task environment selector: ${selector}`);
        if (project.source.type !== 'git') throw new Error(`${selector} is not an independent Git Project.`);
        plan.push(sourceDescriptor({
          selector, entityType: 'project', sourcePath: project.source.path, source: project.source,
          workspaceRoot, environmentRoot, branch,
        }));
        continue;
      }
      if (selector.startsWith('service:')) {
        const ref = selector.slice('service:'.length);
        const [projectCode, serviceCode, ...extra] = ref.split('/');
        if (!projectCode || !serviceCode || extra.length) throw new Error(`Invalid Service selector: ${selector}`);
        const project = projects.projects[projectCode];
        if (!project) throw new Error(`Unknown Project in selector: ${selector}`);
        if (project.source.type === 'git' && !seen.has(`project:${projectCode}`)) {
          throw new Error(`${selector} requires explicit selector project:${projectCode} because its Project is an independent Git repository.`);
        }
        const services = runtime.readServiceRegistryRecord(workspaceRoot, projectCode);
        if (services.registry.migrationRequired) throw new Error(`Service registry migration is required: ${projectCode}`);
        const service = services.services[serviceCode];
        if (!service) throw new Error(`Unknown task environment selector: ${selector}`);
        if (service.source.type !== 'git') throw new Error(`${selector} is not an independent Git Service.`);
        plan.push(sourceDescriptor({
          selector, entityType: 'service', sourcePath: service.source.path, source: service.source,
          workspaceRoot, environmentRoot, branch,
        }));
        continue;
      }
      throw new Error(`Unsupported task environment selector: ${selector}`);
    }
    plan.sort((left, right) => left.sourcePath.split('/').length - right.sourcePath.split('/').length || left.sourcePath.localeCompare(right.sourcePath));
    for (const item of plan) {
      if (!inside(workspaceRoot, item.sourceRepository)) throw new Error(`${item.selector} source escapes the Workspace.`);
      if (!inside(environmentRoot, item.checkoutPath)) throw new Error(`${item.selector} checkout escapes the task environment.`);
      const parent = [...plan]
        .filter((candidate) => candidate !== item && inside(candidate.checkoutPath, item.checkoutPath))
        .sort((left, right) => right.checkoutPath.length - left.checkoutPath.length)[0];
      if (!parent) continue;
      const relative = path.relative(parent.checkoutPath, item.checkoutPath).split(path.sep).join('/');
      if (git(parent.sourceRepository, ['ls-files', '--error-unmatch', '--', relative]).status === 0) {
        throw new Error(`${item.selector} target is tracked by parent repository ${parent.selector}: ${relative}`);
      }
    }
    return { workspaceRoot, taskId, agent, branch, environmentRoot, repositories: plan, digest: planDigest(plan) };
  }

  function preflightPlan(plan) {
    const branchCheck = git(plan.workspaceRoot, ['check-ref-format', `refs/heads/${plan.branch}`]);
    if (branchCheck.status !== 0) throw new Error(`Invalid task branch: ${plan.branch}`);
    for (const item of plan.repositories) {
      const listed = git(item.sourceRepository, ['worktree', 'list', '--porcelain']);
      if (listed.status !== 0) throw new Error(`Unable to inspect Git worktrees: ${item.selector}`);
      const worktrees = parseWorktreeList(listed.stdout);
      const atTarget = worktrees.find((entry) => path.resolve(entry.path) === item.checkoutPath);
      const branchOwner = worktrees.find((entry) => entry.branch === item.branch);
      if (atTarget && atTarget.branch !== item.branch) throw new Error(`${item.selector} target is registered to branch ${atTarget.branch || '(detached)'}.`);
      if (!atTarget && branchOwner) throw new Error(`${item.selector} task branch is already checked out at ${branchOwner.path}`);
      if (!atTarget && fs.existsSync(item.checkoutPath)) throw new Error(`${item.selector} target is occupied but not registered: ${item.checkoutPath}`);
      item.preflightState = atTarget ? 'reused' : 'create';
    }
    const existing = readReceipt(plan.workspaceRoot, plan.taskId);
    if (existing && existing.planDigest !== plan.digest) throw new Error('Task environment exists with a different repository plan.');
    return existing;
  }

  function publicRepository(item, state, identity = null, blocked = null) {
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
      remote: item.remote,
      remoteUrl: item.remoteUrl,
      state,
      blocked,
    };
  }

  function baseResult({ workspaceRoot, taskId = null, agent = null, branch = null, environmentRoot = null }) {
    return {
      workspaceRoot,
      repository: null,
      taskId,
      agent,
      environment: { root: environmentRoot, owner: agent, state: 'blocked', isolation: isolation() },
      repositories: [],
      worktree: { path: environmentRoot, branch, head: null },
      state: 'blocked',
      treeChanged: false,
      ready: false,
      bootstrap: { doctorBefore: null, sync: { status: 'skipped', reason: 'not-created' }, doctorAfter: null },
      runtimeExpectation: null,
      adoption: { status: 'blocked', receipt: null },
      blocked: null,
      nextActions: [],
    };
  }

  function blockedResult(base, code, message, nextActions = []) {
    return {
      ...base,
      state: 'blocked',
      ready: false,
      environment: { ...base.environment, state: 'blocked' },
      blocked: { code, message },
      nextActions,
    };
  }

  function printCreateResult(result, json) {
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.worktreeCreate, result);
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      console.log(`Task environment ${result.state}: ${result.environment.root}`);
      console.log(`Branch: ${result.worktree.branch}`);
      console.log(`Repositories: ${result.repositories.map((item) => `${item.selector}=${item.state}`).join(', ') || 'none'}`);
      console.log(`Bootstrap: doctor=${result.bootstrap.doctorBefore ? 'checked' : 'skipped'} sync=${result.bootstrap.sync.status} ready=${result.ready}`);
      for (const action of result.nextActions) console.log(`Next: ${action}`);
    }
    if (!result.ready) process.exitCode = 1;
    return payload;
  }

  function bootstrapRoot(base, plan, rootIdentity) {
    const before = readDoctor(plan.agent, plan.environmentRoot);
    base.bootstrap.doctorBefore = doctorSummary(before.report);
    if (!before.report) return blockedResult(base, 'worktree.doctor_failed', (before.result.stderr || 'Doctor did not return valid JSON.').trim(), [`Inspect ${plan.environmentRoot}`]);
    if (before.report.health?.ready === true) {
      base.bootstrap.sync = { status: 'skipped', reason: 'doctor-ready' };
      base.bootstrap.doctorAfter = doctorSummary(before.report);
      return base;
    }
    const expectedTaskDrift = new Set(['project.git_branch_drift', 'service.branch_mismatch']);
    const actionable = before.report.findings || [];
    if (plan.repositories.length > 1 && actionable.length > 0 && actionable.every((finding) => expectedTaskDrift.has(finding.code)) && !(before.report.findings || []).some((finding) => finding.status === 'error')) {
      base.bootstrap.sync = { status: 'skipped', reason: 'task-environment-branch-drift' };
      base.bootstrap.doctorAfter = doctorSummary(before.report);
      return base;
    }
    const identity = worktreeIdentity(plan.environmentRoot);
    if (!isSafeRuntimeStaleOnly({
      report: before.report,
      agent: plan.agent,
      identity,
      expectedBranch: plan.branch,
      expectedHead: rootIdentity.head,
      allowedCodes: plan.repositories.length > 1 ? [...expectedTaskDrift] : [],
    })) {
      base.bootstrap.sync = { status: 'blocked', reason: 'doctor-findings-not-safe-for-automatic-sync' };
      return blockedResult(base, 'worktree.auto_sync_unsafe', 'Doctor findings are not limited to the selected Agent runtime stale allowlist.', before.report.nextSteps?.flatMap((step) => step.commands || step.command || []) || []);
    }
    const synced = buildr(['sync', plan.agent, '--target', plan.environmentRoot]);
    if (synced.status !== 0) {
      base.bootstrap.sync = { status: 'blocked', reason: 'sync-failed' };
      return blockedResult(base, 'worktree.sync_failed', (synced.stderr || synced.stdout || 'buildr sync failed').trim(), [`Inspect ${plan.environmentRoot}`]);
    }
    base.bootstrap.sync = { status: 'applied', reason: 'runtime-stale-only' };
    const finalIdentity = worktreeIdentity(plan.environmentRoot);
    if (!finalIdentity || !finalIdentity.clean || finalIdentity.branch !== plan.branch || finalIdentity.head !== rootIdentity.head) {
      return blockedResult(base, 'worktree.post_sync_identity_changed', 'Workspace sync changed Git identity or left tracked changes; task environment was retained.', [`Inspect ${plan.environmentRoot}`]);
    }
    const after = readDoctor(plan.agent, plan.environmentRoot);
    base.bootstrap.doctorAfter = doctorSummary(after.report);
    if (!after.report || after.report.health?.ready !== true) return blockedResult(base, 'worktree.post_sync_doctor_failed', 'Final doctor did not report a ready Workspace; task environment was retained.', [`Inspect ${plan.environmentRoot}`]);
    return base;
  }

  function createTaskWorktree(args) {
    const json = args.includes('--json');
    const allowed = new Set(['--agent', '--branch', '--start-point', '--include', '--target', '--json']);
    const requested = path.resolve(optionValue(args, '--target', process.cwd()));
    const workspaceRoot = fs.existsSync(requested) ? fs.realpathSync(requested) : requested;
    let base = baseResult({ workspaceRoot });
    let receipt = null;
    try {
      assertNoUnknownOptions(args, allowed, new Set(['--json']));
      const positions = positionalArgs(args);
      if (positions.length !== 1) throw new Error('worktree create requires exactly one <task-id>.');
      const taskId = positions[0];
      const agent = optionValue(args, '--agent', null);
      const branch = optionValue(args, '--branch', null);
      const rootStartPoint = optionValue(args, '--start-point', 'HEAD');
      const includes = optionValues(args, '--include');
      const environmentRoot = path.join(workspaceRoot, '.worktrees', taskId);
      base = baseResult({ workspaceRoot, taskId, agent, branch, environmentRoot });
      if (!TASK_ID_PATTERN.test(taskId)) throw new Error('Task id must use lowercase letters, numbers, dots, underscores, or hyphens without path separators.');
      if (!agent || !isSupportedAgent(agent)) throw new Error(`Unsupported or missing Agent runtime: ${agent || '(missing)'}.`);
      if (!branch) throw new Error('Missing value for --branch');
      if (!fs.existsSync(path.join(workspaceRoot, '.buildr', 'workspace.yml'))) throw new Error(`Buildr Workspace is not initialized: ${workspaceRoot}`);
      const repository = gitText(workspaceRoot, ['rev-parse', '--show-toplevel']);
      if (!repository || path.resolve(repository) !== workspaceRoot) throw new Error('worktree create currently requires --target to be the Workspace root Git repository.');
      const plan = resolvePlan({ workspaceRoot, taskId, agent, branch, rootStartPoint, includes });
      base.repository = workspaceRoot;
      receipt = preflightPlan(plan);
      let treeChanged = false;
      const repositoryResults = [];
      for (const item of plan.repositories) {
        let state = item.preflightState;
        if (state === 'create') {
          fs.mkdirSync(path.dirname(item.checkoutPath), { recursive: true });
          const branchExists = git(item.sourceRepository, ['show-ref', '--verify', '--quiet', `refs/heads/${item.branch}`]).status === 0;
          const addArgs = branchExists
            ? ['worktree', 'add', item.checkoutPath, item.branch]
            : ['worktree', 'add', '-b', item.branch, item.checkoutPath, item.startPoint];
          const added = process.env.BUILDR_FAULT_WORKTREE_ADD_SELECTOR === item.selector
            ? { status: 1, stdout: '', stderr: `Injected worktree add failure: ${item.selector}` }
            : git(item.sourceRepository, addArgs);
          if (added.status !== 0) {
            const message = (added.stderr || added.stdout || 'git worktree add failed').trim();
            repositoryResults.push(publicRepository(item, 'blocked', null, { code: 'worktree.add_failed', message }));
            base = blockedResult({ ...base, treeChanged, repositories: repositoryResults }, 'worktree.partial_create_failed', message, [`Inspect ${item.checkoutPath}`]);
            receipt = {
              schemaVersion: RECEIPT_SCHEMA, taskId, agent, workspaceRoot, environmentRoot,
              planDigest: plan.digest, state: 'blocked', repositories: repositoryResults, isolation: isolation(), updatedAt: new Date().toISOString(),
            };
            writeReceipt(workspaceRoot, receipt);
            return printCreateResult(base, json);
          }
          treeChanged = true;
          state = 'created';
        }
        const identity = worktreeIdentity(item.checkoutPath);
        if (!identity || identity.repository !== item.checkoutPath || identity.branch !== item.branch) {
          repositoryResults.push(publicRepository(item, 'blocked', identity, { code: 'worktree.identity_changed', message: 'Checkout identity does not match the repository plan.' }));
          base = blockedResult({ ...base, treeChanged, repositories: repositoryResults }, 'worktree.identity_changed', `${item.selector} checkout identity is invalid.`, [`Inspect ${item.checkoutPath}`]);
          writeReceipt(workspaceRoot, {
            schemaVersion: RECEIPT_SCHEMA, taskId, agent, workspaceRoot, environmentRoot,
            planDigest: plan.digest, state: 'blocked', repositories: repositoryResults, isolation: isolation(), updatedAt: new Date().toISOString(),
          });
          return printCreateResult(base, json);
        }
        if (item.entityType === 'project') {
          for (const relative of ['openspec/specs', 'openspec/knowledge', 'openspec/changes', 'services']) {
            fs.mkdirSync(path.join(item.checkoutPath, relative), { recursive: true });
          }
        }
        repositoryResults.push(publicRepository(item, state, identity));
        if (item.selector === 'workspace') {
          base = { ...base, treeChanged, repositories: repositoryResults, worktree: { path: environmentRoot, branch, head: identity.head } };
        }
      }
      const rootIdentity = repositoryResults[0];
      base = plan.repositories[0].preflightState === 'create'
        ? bootstrapRoot({ ...base, repositories: repositoryResults }, plan, worktreeIdentity(environmentRoot))
        : { ...base, repositories: repositoryResults, bootstrap: { doctorBefore: null, sync: { status: 'skipped', reason: 'reused-without-tree-transition' }, doctorAfter: null } };
      if (base.blocked) {
        writeReceipt(workspaceRoot, {
          schemaVersion: RECEIPT_SCHEMA, taskId, agent, workspaceRoot, environmentRoot,
          planDigest: plan.digest, state: 'blocked', repositories: repositoryResults, isolation: isolation(), updatedAt: new Date().toISOString(),
        });
        return printCreateResult(base, json);
      }
      const expectedRuntime = runtimeExpectation(environmentRoot, agent);
      if (!expectedRuntime.projectionReady) {
        return printCreateResult(blockedResult(base, 'worktree.runtime_projection_not_ready', 'Checkout-local runtime projection is not ready for task execution.', [`Run buildr doctor --agent ${agent} --target ${environmentRoot} --json`]), json);
      }
      receipt = {
        schemaVersion: RECEIPT_SCHEMA,
        taskId,
        agent,
        workspaceRoot,
        environmentRoot,
        planDigest: plan.digest,
        state: 'ready',
        repositories: repositoryResults,
        runtimeExpectation: expectedRuntime,
        executionCli: expectedExecutionCliEvidence(workspaceRoot, environmentRoot),
        isolation: isolation(),
        updatedAt: new Date().toISOString(),
      };
      writeReceipt(workspaceRoot, receipt);
      return printCreateResult({
        ...base,
        repository: workspaceRoot,
        repositories: repositoryResults,
        worktree: { path: environmentRoot, branch, head: rootIdentity.head },
        environment: { root: environmentRoot, owner: agent, state: 'ready', isolation: isolation() },
        state: treeChanged ? 'created' : 'reused',
        treeChanged,
        ready: true,
        runtimeExpectation: expectedRuntime,
        adoption: { status: 'not-required', receipt: null, currentSessionMatch: null },
        blocked: null,
        nextActions: [],
      }, json);
    } catch (error) {
      return printCreateResult(blockedResult(base, 'worktree.preflight_failed', error.message), json);
    }
  }

  function findEnvironmentReceipt(requestedPath) {
    const start = fs.realpathSync(requestedPath);
    let cursor = fs.statSync(start).isDirectory() ? start : path.dirname(start);
    while (true) {
      if (fs.existsSync(path.join(cursor, '.buildr', 'workspace.yml'))) {
        const common = gitText(cursor, ['rev-parse', '--git-common-dir']);
        if (common) {
          const directory = path.join(path.resolve(cursor, common), 'buildr', 'task-environments');
          if (fs.existsSync(directory)) {
            for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json')).sort()) {
              try {
                const receipt = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
                if (receipt.schemaVersion === RECEIPT_SCHEMA && path.resolve(receipt.environmentRoot) === cursor) return receipt;
              } catch { /* ignore unrelated invalid local state */ }
            }
          }
        }
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    return null;
  }

  function adoptionState(receipt, expectedRuntime, session = {}) {
    const saved = readAdoptionReceipt(receipt.workspaceRoot, receipt.taskId);
    if (!expectedRuntime.projectionReady) {
      return { status: 'stale', receipt: saved, currentSessionMatch: false, assurance: saved?.sessionEvidence?.assurance || null, missingEvidence: [], blocked: { code: 'worktree.adoption_runtime_not_ready', message: 'Checkout-local runtime projection is missing, stale, orphaned, or conflicting.' }, nextActions: [`Run buildr doctor --agent ${receipt.agent} --target ${receipt.environmentRoot} --json`, handoffAction(receipt)] };
    }
    if (!receipt.runtimeExpectation) {
      return { status: 'legacy-activation-unverified', receipt: null, currentSessionMatch: false, assurance: null, missingEvidence: ['runtimeExpectation'], nextActions: [handoffAction(receipt)] };
    }
    if (receipt.runtimeExpectation.projectionIdentity !== expectedRuntime.projectionIdentity) {
      return { status: 'stale', receipt: saved, currentSessionMatch: false, assurance: saved?.sessionEvidence?.assurance || null, missingEvidence: [], blocked: { code: 'worktree.adoption_runtime_stale', message: 'Checkout-local runtime projection identity changed after environment creation or adoption.' }, nextActions: [handoffAction(receipt)] };
    }
    if (!saved) return { status: 'not-verified', receipt: null, currentSessionMatch: null, assurance: null, missingEvidence: [], nextActions: [] };
    const receiptMatches = saved.agent === receipt.agent
      && saved.environmentRoot === receipt.environmentRoot
      && saved.planDigest === receipt.planDigest
      && saved.runtimeProjectionIdentity === expectedRuntime.projectionIdentity;
    if (!receiptMatches) return { status: 'stale', receipt: saved, currentSessionMatch: false, assurance: saved.sessionEvidence?.assurance || null, missingEvidence: [], blocked: { code: 'worktree.adoption_receipt_stale', message: 'Session adoption receipt does not match the current task environment identity.' }, nextActions: [handoffAction(receipt)] };
    const supplied = Boolean(session.root || session.handle);
    const currentSessionMatch = supplied
      && Boolean(session.root && session.handle)
      && session.root === saved.sessionEvidence.sessionRoot
      && session.handle === saved.sessionEvidence.sessionHandle;
    if (supplied && !currentSessionMatch) return { status: 'activation-evidence-mismatch', receipt: saved, currentSessionMatch: false, assurance: saved.sessionEvidence.assurance, missingEvidence: [], blocked: { code: 'worktree.activation_session_mismatch', message: 'Supplied session evidence does not match the optional runtime activation receipt.' }, nextActions: [] };
    return { status: 'activation-verified', receipt: saved, currentSessionMatch: supplied ? true : 'recorded-not-rechecked', assurance: saved.sessionEvidence.assurance, missingEvidence: [], nextActions: [] };
  }

  function contextFromReceipt(receipt, requestedPath = receipt.environmentRoot, session = {}) {
    const requestPath = fs.realpathSync(requestedPath);
    const repositories = receipt.repositories.map((record) => {
      const identity = fs.existsSync(record.checkoutPath) ? worktreeIdentity(record.checkoutPath) : null;
      return { ...record, head: identity?.head || null, clean: identity?.clean ?? null, currentBranch: identity?.branch || null, identityMatches: Boolean(identity && identity.repository === record.checkoutPath && identity.branch === record.branch) };
    });
    const membership = [...repositories]
      .filter((item) => inside(item.checkoutPath, requestPath))
      .sort((left, right) => right.checkoutPath.length - left.checkoutPath.length)[0] || null;
    const ready = receipt.state === 'ready' && repositories.every((item) => item.identityMatches) && Boolean(membership);
    const expectedRuntime = fs.existsSync(receipt.environmentRoot) ? runtimeExpectation(receipt.environmentRoot, receipt.agent) : receipt.runtimeExpectation || null;
    const adoption = ready && expectedRuntime ? adoptionState(receipt, expectedRuntime, session) : { status: 'blocked', receipt: null, currentSessionMatch: false, assurance: null, missingEvidence: [], nextActions: [] };
    const currentCli = currentExecutionCliEvidence(receipt);
    const cliSource = currentCli.source;
    const cliWithinEnvironment = currentCli.sourceKind === 'environment-local';
    const cliIdentityMatches = executionCliMatches(receipt, currentCli);
    const runtimeIdentityMatches = Boolean(expectedRuntime && (!receipt.runtimeExpectation
      || receipt.runtimeExpectation.projectionIdentity === expectedRuntime.projectionIdentity));
    const executionReady = ready && expectedRuntime?.projectionReady === true && runtimeIdentityMatches && cliIdentityMatches;
    const receiptCliSourceMatches = receipt.executionCli?.source === currentCli.source;
    const rootRepository = receipt.repositories.find((item) => item.selector === 'workspace') || receipt.repositories[0];
    const refreshCliBindingAction = receiptCliSourceMatches && rootRepository
      ? `Reuse task environment ${receipt.taskId} with the receipt-bound CLI to refresh its changed CLI identity before execution.`
      : null;
    return {
      taskId: receipt.taskId,
      owner: receipt.agent,
      workspaceRoot: receipt.workspaceRoot,
      environmentRoot: receipt.environmentRoot,
      requestedPath: requestPath,
      membership: membership ? { selector: membership.selector, checkoutPath: membership.checkoutPath } : null,
      repositories,
      allowedExecutionRoots: repositories.map((item) => item.checkoutPath),
      cliSource,
      cliWithinEnvironment,
      cliIdentityMatches,
      runtimeIdentityMatches,
      state: ready ? 'ready' : 'blocked',
      ready,
      executionReady,
      executionBinding: executionReady ? { assurance: 'buildr-verified', target: requestPath, workdir: membership.checkoutPath, membership: membership.selector, cliSource, cliSourceKind: currentCli.sourceKind, cliIdentity: currentCli.identity, checkoutLocal: cliWithinEnvironment, runtimeProjectionIdentity: expectedRuntime.projectionIdentity } : null,
      environmentEvidence: expectedRuntime ? { assurance: 'buildr-verified', planDigest: receipt.planDigest, runtimeExpectation: expectedRuntime } : null,
      sessionEvidence: adoption.receipt?.sessionEvidence || null,
      adoption,
      isolation: receipt.isolation || isolation(),
      blocked: !ready
        ? { code: membership ? 'worktree.context_identity_mismatch' : 'worktree.context_path_mismatch', message: membership ? 'One or more task environment repository identities do not match the receipt.' : 'Requested path is outside the task environment repository set.' }
        : !runtimeIdentityMatches
          ? { code: 'worktree.execution_runtime_stale', message: 'Checkout-local runtime projection identity no longer matches the task environment receipt.' }
          : !cliIdentityMatches
            ? { code: 'worktree.execution_cli_mismatch', message: 'The current Buildr CLI identity does not match the task environment receipt.' }
            : null,
      nextActions: ready && runtimeIdentityMatches && cliIdentityMatches
        ? []
        : [refreshCliBindingAction || `Run buildr worktree inspect ${receipt.taskId} --target ${receipt.workspaceRoot} --json`],
    };
  }

  function printContext(result, json, requireExecutionReady = false) {
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskEnvironmentContext, result);
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      console.log(`Task environment ${result.state}: ${result.environmentRoot}`);
      console.log(`Task: ${result.taskId}; owner: ${result.owner}`);
      console.log(`Current repository: ${result.membership?.selector || 'outside environment'}`);
      console.log(`Repositories: ${result.repositories.map((item) => `${item.selector}:${item.identityMatches ? 'ready' : 'mismatch'}`).join(', ')}`);
      console.log(`Session adoption: ${result.adoption?.status || 'unknown'}`);
    }
    if (!result.ready || (requireExecutionReady && !result.executionReady)) process.exitCode = 1;
    return payload;
  }

  function inspectTaskEnvironment(args) {
    const json = args.includes('--json');
    assertNoUnknownOptions(args, new Set(['--target', '--json']), new Set(['--json']));
    const positions = positionalArgs(args);
    if (positions.length !== 1) throw new Error('worktree inspect requires exactly one <task-id>.');
    const workspaceRoot = fs.realpathSync(path.resolve(optionValue(args, '--target', process.cwd())));
    const receipt = readReceipt(workspaceRoot, positions[0]);
    if (!receipt) return printContext({
      taskId: positions[0], owner: null, workspaceRoot, environmentRoot: null, requestedPath: workspaceRoot,
      membership: null, repositories: [], allowedExecutionRoots: [], cliSource: path.join(productRoot(), 'bin', 'buildr.mjs'), cliWithinEnvironment: false,
      state: 'blocked', ready: false, isolation: isolation(), blocked: { code: 'worktree.receipt_missing', message: 'Task environment receipt was not found.' }, nextActions: [],
    }, json);
    return printContext(contextFromReceipt(receipt), json, false);
  }

  function adoptTaskEnvironment(args) {
    const json = args.includes('--json');
    const allowed = new Set(['--agent', '--target', '--session-root', '--session-handle', '--root-evidence-source', '--mode', '--started-at', '--json']);
    assertNoUnknownOptions(args, allowed, new Set(['--json']));
    if (positionalArgs(args).length) throw new Error('worktree adopt does not accept positional arguments.');
    const requestedPath = path.resolve(optionValue(args, '--target', process.cwd()));
    if (!fs.existsSync(requestedPath)) throw new Error(`Adoption target does not exist: ${requestedPath}`);
    const receipt = findEnvironmentReceipt(requestedPath);
    if (!receipt) throw new Error('Adoption target is not owned by a task environment receipt.');
    const agent = optionValue(args, '--agent', null);
    const sessionRootValue = optionValue(args, '--session-root', null);
    const sessionHandle = optionValue(args, '--session-handle', null);
    const rootEvidenceSource = optionValue(args, '--root-evidence-source', null);
    const mode = optionValue(args, '--mode', null);
    const startedAt = optionValue(args, '--started-at', null);
    if (agent !== receipt.agent) throw new Error(`Adoption Agent does not match environment owner: ${agent || '(missing)'}.`);
    if (!sessionRootValue || !fs.existsSync(sessionRootValue)) throw new Error('A valid --session-root from host-visible session context is required.');
    const sessionRoot = fs.realpathSync(sessionRootValue);
    if (!sessionHandle || sessionHandle.length > 256 || /[\r\n]/.test(sessionHandle)) throw new Error('A stable --session-handle without newlines is required.');
    if (!ROOT_EVIDENCE_SOURCES.has(rootEvidenceSource)) throw new Error('--root-evidence-source must be host-context or runtime-host.');
    if (!ADOPTION_MODES.has(mode)) throw new Error('--mode must be new-session, reentered, or reload.');
    if (!startedAt || !Number.isFinite(Date.parse(startedAt))) throw new Error('A valid ISO timestamp is required for --started-at.');
    const expectedRuntime = runtimeExpectation(receipt.environmentRoot, receipt.agent);
    if (!expectedRuntime.projectionReady) throw new Error('Checkout-local runtime projection is not ready.');
    if (!expectedRuntime.adoptionModes.includes(mode)) throw new Error(`Runtime ${agent} does not allow adoption mode ${mode}.`);
    const currentCli = currentExecutionCliEvidence(receipt);
    if (!executionCliMatches(receipt, currentCli)) throw new Error('The current Buildr CLI identity does not match the task environment receipt.');
    const cliSource = currentCli.source;
    const cliWithinEnvironment = currentCli.sourceKind === 'environment-local';
    const normalizedReceipt = { ...receipt, runtimeExpectation: expectedRuntime, updatedAt: new Date().toISOString() };
    if (!receipt.runtimeExpectation || receipt.runtimeExpectation.projectionIdentity !== expectedRuntime.projectionIdentity) writeReceipt(receipt.workspaceRoot, normalizedReceipt);
    const adoptionReceipt = {
      schemaVersion: ADOPTION_RECEIPT_SCHEMA,
      taskId: receipt.taskId,
      agent,
      workspaceRoot: receipt.workspaceRoot,
      environmentRoot: receipt.environmentRoot,
      planDigest: receipt.planDigest,
      runtimeProjectionIdentity: expectedRuntime.projectionIdentity,
      environmentEvidence: { assurance: 'buildr-verified', cliSource, cliWithinEnvironment, runtimeExpectation: expectedRuntime },
      sessionEvidence: { assurance: 'agent-attested', sessionRoot, sessionHandle, rootEvidenceSource, adoptionMode: mode, startedOrReenteredAt: new Date(startedAt).toISOString() },
      adoptedAt: new Date().toISOString(),
    };
    const file = writeAdoptionReceipt(receipt.workspaceRoot, adoptionReceipt);
    const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskEnvironmentAdoption, { taskId: receipt.taskId, state: 'activation-verified', ready: true, executionReady: true, receipt: file, environmentEvidence: adoptionReceipt.environmentEvidence, sessionEvidence: adoptionReceipt.sessionEvidence, limitation: 'agent-attested; Buildr does not introspect or start the Agent host', nextActions: [] });
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else console.log(`Task environment activation evidence recorded: ${receipt.environmentRoot}`);
    return payload;
  }

  function taskEnvironmentContext(args) {
    const json = args.includes('--json');
    assertNoUnknownOptions(args, new Set(['--target', '--session-root', '--session-handle', '--json']), new Set(['--json']));
    if (positionalArgs(args).length) throw new Error('worktree context does not accept positional arguments.');
    const requestedPath = path.resolve(optionValue(args, '--target', process.cwd()));
    if (!fs.existsSync(requestedPath)) throw new Error(`Context target does not exist: ${requestedPath}`);
    const receipt = findEnvironmentReceipt(requestedPath);
    if (!receipt) return printContext({
      taskId: null, owner: null, workspaceRoot: null, environmentRoot: null, requestedPath,
      membership: null, repositories: [], allowedExecutionRoots: [], cliSource: path.join(productRoot(), 'bin', 'buildr.mjs'), cliWithinEnvironment: false,
      state: 'blocked', ready: false, isolation: isolation(), blocked: { code: 'worktree.not_task_environment', message: 'Requested path is not owned by a task environment receipt.' }, nextActions: [],
    }, json);
    const sessionRootValue = optionValue(args, '--session-root', null);
    const session = {
      root: sessionRootValue && fs.existsSync(sessionRootValue) ? fs.realpathSync(sessionRootValue) : null,
      handle: optionValue(args, '--session-handle', null),
    };
    return printContext(contextFromReceipt(receipt, requestedPath, session), json, true);
  }

  Object.assign(runtime, {
    createTaskWorktree,
    inspectTaskEnvironment,
    taskEnvironmentContext,
    adoptTaskEnvironment,
    parseWorktreeList,
  });
  return runtime;
}
