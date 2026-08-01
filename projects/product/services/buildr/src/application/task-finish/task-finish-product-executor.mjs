import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

import { classifyRetainedConvergencePaths } from './task-finish-impact.mjs';
import { acquireFinishTargetLease, releaseFinishTargetLease, writeFinishCompletion } from './task-finish-run.mjs';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function boundedText(value, limit = 2000) {
  const text = String(value || '');
  return { preview: text.slice(0, limit), bytes: Buffer.byteLength(text), digest: digest(text), truncated: text.length > limit };
}

function commandObservation(id, command, args, cwd, result, startedAt, durationMs) {
  return {
    kind: 'command',
    id,
    command,
    args,
    cwd,
    status: result.status,
    signal: result.signal || null,
    startedAt,
    durationMs,
    stdout: boundedText(result.stdout),
    stderr: boundedText(result.stderr),
  };
}

function runCommand(id, command, args, cwd, options = {}) {
  const started = process.hrtime.bigint();
  const startedAt = new Date().toISOString();
  const runtimePath = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    env: options.env || { ...process.env, PATH: runtimePath },
  });
  const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  return {
    result: {
      status: Number.isInteger(result.status) ? result.status : 1,
      signal: result.signal || null,
      stdout: result.stdout || '',
      stderr: result.stderr || result.error?.message || '',
    },
    observation: commandObservation(id, command, args, cwd, {
      status: Number.isInteger(result.status) ? result.status : 1,
      signal: result.signal || null,
      stdout: result.stdout || '',
      stderr: result.stderr || result.error?.message || '',
    }, startedAt, durationMs),
  };
}

function runJsonCommand(id, command, args, cwd, options = {}) {
  const executed = runCommand(id, command, args, cwd, options);
  let payload = null;
  try { payload = JSON.parse(executed.result.stdout); } catch { /* caller receives structured failure */ }
  return { ...executed, payload };
}

function git(root, id, args) {
  return runCommand(id, 'git', args, root);
}

function gitText(root, args) {
  const value = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  return value.status === 0 ? value.stdout.trim() : null;
}

function branchName(value) {
  return String(value || '').replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/[^/]+\//, '');
}

function invocationArgs(invocation, args) {
  return [...(invocation.argsPrefix || []), ...args];
}

function projectRecord(runtime, workspaceRoot, executionRoot, projectCode) {
  const registry = runtime.readProjectRegistryPersistence(workspaceRoot).registry.projects;
  const project = registry[projectCode];
  if (!project) throw new Error(`Project is not registered: ${projectCode}`);
  const root = path.resolve(executionRoot, project.source.path);
  if (!inside(executionRoot, root)) throw new Error(`Project source escapes execution root: ${project.source.path}`);
  return { project, root };
}

function finishChangeRoot(projectRoot, change) {
  if (!change || path.basename(change) !== change) throw new Error(`Invalid OpenSpec change identity: ${change}`);
  const changesRoot = path.join(projectRoot, 'openspec', 'changes');
  const activeRoot = path.join(changesRoot, change);
  if (fs.existsSync(activeRoot)) return { root: activeRoot, archived: false };
  const archiveRoot = path.join(changesRoot, 'archive');
  const matches = fs.existsSync(archiveRoot)
    ? fs.readdirSync(archiveRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${change}`) && fs.existsSync(path.join(archiveRoot, entry.name, '.openspec.yaml')))
      .map((entry) => path.join(archiveRoot, entry.name))
    : [];
  if (matches.length !== 1) return null;
  return { root: matches[0], archived: true };
}

function addFinding(findings, check, severity, code, message, extra = {}) {
  findings.push({ check, severity, code, message, ...extra });
}

function phaseFailure(findings, fallbackClass = 'upstream-candidate-defect') {
  const errors = findings.filter((item) => item.severity === 'error');
  const primary = errors[0] || findings[0];
  return {
    operation: primary?.check || null,
    check: primary?.check || null,
    failureClass: fallbackClass,
    code: primary?.code || 'task-finish.preflight-failed',
    status: 'failed',
    exitCode: primary?.exitCode ?? null,
    message: primary?.message || 'Task Finish preflight failed.',
    findings: errors,
    diagnostic: { digest: digest(errors), preview: errors.slice(0, 10) },
  };
}

function checkKnowledgeImpact(changeRoot, findings) {
  const file = path.join(changeRoot, '.buildr', 'knowledge-impact.yml');
  if (!fs.existsSync(file)) {
    addFinding(findings, 'current-knowledge', 'error', 'task-finish.knowledge-impact-missing', 'Change knowledge impact evidence is missing.');
    return;
  }
  try {
    const value = YAML.parse(fs.readFileSync(file, 'utf8'));
    const unresolved = Array.isArray(value?.unresolvedItems) ? value.unresolvedItems : [];
    const pending = (value?.impacts || []).filter((item) => ['pending', 'unresolved'].includes(item?.status));
    if (unresolved.length || pending.length) {
      addFinding(findings, 'current-knowledge', 'error', 'task-finish.knowledge-impact-unresolved', 'Current knowledge impacts are not reconciled.', { unresolvedItems: unresolved, pending: pending.map((item) => item.target) });
    } else addFinding(findings, 'current-knowledge', 'ok', 'task-finish.knowledge-impact-aligned', 'Current knowledge impacts are reconciled.');
  } catch (error) {
    addFinding(findings, 'current-knowledge', 'error', 'task-finish.knowledge-impact-invalid', error.message);
  }
}

function checkChangeTasks(changeRoot, findings) {
  const file = path.join(changeRoot, 'tasks.md');
  if (!fs.existsSync(file)) {
    addFinding(findings, 'change-tasks', 'error', 'task-finish.tasks-missing', 'Change tasks.md is missing.');
    return;
  }
  const pending = fs.readFileSync(file, 'utf8').split('\n').filter((line) => /^\s*- \[ \]/.test(line));
  if (pending.length) addFinding(findings, 'change-tasks', 'error', 'task-finish.tasks-incomplete', `${pending.length} Change task(s) are incomplete.`, { pending: pending.slice(0, 20) });
  else addFinding(findings, 'change-tasks', 'ok', 'task-finish.tasks-complete', 'All Change tasks are complete.');
}

function currentGitIdentity(root) {
  const head = gitText(root, ['rev-parse', 'HEAD']);
  const tree = gitText(root, ['rev-parse', 'HEAD^{tree}']);
  const branch = gitText(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const status = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  return {
    head,
    tree,
    branch,
    status: status.status === 0 ? status.stdout : null,
    clean: status.status === 0 && status.stdout.length === 0,
  };
}

function observeFrozen(root, frozen) {
  const current = currentGitIdentity(root);
  return {
    matches: Boolean(frozen && current.clean && current.head === frozen.head && current.tree === frozen.tree && current.branch === frozen.branch),
    current,
  };
}

function targetLeasePath(root, targetBranch) {
  const common = gitText(root, ['rev-parse', '--git-common-dir']);
  if (!common) throw new Error('Unable to resolve Git common directory for Task Finish target lease.');
  return path.join(path.resolve(root, common), 'buildr', 'task-finish', 'leases', `${targetBranch.replaceAll('/', '_')}.json`);
}

export function createTaskFinishProductHandlers({ runtime, root, existingVerificationSummary = null, openspecCommand = 'openspec' }) {
  const environmentRoot = path.resolve(root);

  function taskEnvironment(run) {
    return runtime.resolveTaskEnvironmentExecution(run.identity.workspaceRoot, run.identity.task);
  }

  function currentWorkspaceNode(run) {
    const observed = runtime.workspaceNodeExecution(environmentRoot);
    return { ...observed, matches: Boolean(observed.ready && run.identity.workspaceNodeIdentity && observed.identity?.digest === run.identity.workspaceNodeIdentity) };
  }

  return {
    async preflight({ run }) {
      const findings = [];
      const operations = [];
      const context = taskEnvironment(run);
      if (!context?.ready) {
        addFinding(findings, 'environment-context', 'error', context?.blocked?.code || 'task-finish.not-task-environment', context?.blocked?.message || 'Task Finish requires a ready Task Environment.');
        addFinding(findings, 'environment-cli-probe', 'error', 'task-finish.environment-cli-missing', 'Task Environment has no executable CLI binding.');
      } else {
        addFinding(findings, 'environment-context', 'ok', 'task-finish.environment-ready', 'Task Environment binding is ready.');
        const invocation = context.cliInvocation;
        if (invocation?.command) {
          const probe = runJsonCommand('preflight-cli-probe', invocation.command, invocationArgs(invocation, ['version', '--json']), environmentRoot);
          operations.push(probe.observation);
          if (probe.result.status !== 0 || !probe.payload?.version) {
            addFinding(findings, 'environment-cli-probe', 'error', 'task-finish.environment-cli-unexecutable', 'Receipt-bound CLI executable probe failed.', { exitCode: probe.result.status, diagnostic: probe.observation.stderr });
          } else addFinding(findings, 'environment-cli-probe', 'ok', 'task-finish.environment-cli-executable', `Receipt-bound CLI ${probe.payload.version} is executable.`);
        } else addFinding(findings, 'environment-cli-probe', 'error', 'task-finish.environment-cli-missing', 'Task environment has no receipt-bound CLI invocation.');
      }
      const workspaceNode = currentWorkspaceNode(run);
      if (!workspaceNode.matches) addFinding(findings, 'workspace-node', 'error', 'task-finish.workspace-node-drift', 'Workspace Node identity does not match the Task Finish run.', { expected: run.identity.workspaceNodeIdentity, actual: workspaceNode.identity?.digest || null, status: workspaceNode.status });
      else addFinding(findings, 'workspace-node', 'ok', 'task-finish.workspace-node-ready', `Workspace Node ${workspaceNode.identity.version} is ready.`);

      let projectRoot = null;
      let changeRoot = null;
      try {
        ({ root: projectRoot } = projectRecord(runtime, run.identity.workspaceRoot, environmentRoot, run.identity.project));
        if (run.identity.candidateKind === 'change') {
          const resolvedChange = finishChangeRoot(projectRoot, run.identity.change);
          changeRoot = resolvedChange?.root || null;
          if (!changeRoot) addFinding(findings, 'change', 'error', 'task-finish.change-unavailable', `Active or uniquely archived Change is unavailable: ${run.identity.change}`);
          else {
            addFinding(findings, 'change', 'ok', 'task-finish.change-ready', `Change ${run.identity.change} is available.`);
            checkChangeTasks(changeRoot, findings);
            checkKnowledgeImpact(changeRoot, findings);
            const invocation = context?.cliInvocation;
            const validated = resolvedChange.archived
              ? runJsonCommand('preflight-openspec-audit', invocation.command, invocationArgs(invocation, ['openspec', 'audit', run.identity.change, '--project', run.identity.project, '--target', environmentRoot, '--json']), environmentRoot)
              : runJsonCommand('preflight-openspec-validate', openspecCommand, ['validate', run.identity.change, '--strict', '--json'], projectRoot);
            operations.push(validated.observation);
            const validationFailed = validated.result.status !== 0 || (resolvedChange.archived ? validated.payload?.status !== 'passed' : validated.payload?.summary?.failed > 0);
            if (validationFailed) addFinding(findings, 'openspec-validation', 'error', 'task-finish.openspec-invalid', resolvedChange.archived ? 'Archived OpenSpec convergence audit failed.' : 'OpenSpec strict validation failed.', { exitCode: validated.result.status, diagnostic: validated.payload?.diagnostic || validated.observation.stderr });
            else addFinding(findings, 'openspec-validation', 'ok', 'task-finish.openspec-valid', resolvedChange.archived ? 'Archived OpenSpec convergence audit passed.' : 'OpenSpec strict validation passed.');
            try {
              const delta = runtime.parseOpenSpecChangeDelta(changeRoot);
              const proposal = runtime.parseOpenSpecProposalCapabilities(changeRoot);
              const result = runtime.createOpenSpecContractResult('preflight', run.identity.change, run.identity.project, 'current');
              if (!resolvedChange.archived) runtime.detectOpenSpecActiveConflicts(projectRoot, run.identity.change, delta, result);
              runtime.validateOpenSpecProposalAlignment(projectRoot, changeRoot, delta, null, result);
              if (!runtime.finishOpenSpecContractResult(result).ok) addFinding(findings, 'openspec-plan', 'error', 'task-finish.openspec-plan-blocked', 'OpenSpec convergence pure plan is blocked.', { conflicts: result.conflicts, findings: result.findings });
              else addFinding(findings, 'openspec-plan', 'ok', 'task-finish.openspec-plan-ready', `OpenSpec delta declares ${proposal.modified.size + proposal.new.size} capability change(s).`);
            } catch (error) {
              addFinding(findings, 'openspec-plan', 'error', 'task-finish.openspec-plan-invalid', error.message);
            }
          }
        } else {
          for (const [check, code, message] of [
            ['change', 'task-finish.change-not-applicable', 'Code-only candidate has no OpenSpec Change.'],
            ['change-tasks', 'task-finish.change-tasks-not-applicable', 'Change tasks are not applicable to a code-only candidate.'],
            ['current-knowledge', 'task-finish.knowledge-impact-not-applicable', 'Change knowledge impact evidence is not applicable to a code-only candidate.'],
            ['openspec-validation', 'task-finish.openspec-validation-not-applicable', 'OpenSpec validation is not applicable to a code-only candidate.'],
            ['openspec-plan', 'task-finish.openspec-plan-not-applicable', 'OpenSpec convergence planning is not applicable to a code-only candidate.'],
          ]) addFinding(findings, check, 'ok', code, message, { status: 'not-applicable' });
        }
        const verificationFile = path.join(projectRoot, 'verification.yml');
        if (!fs.existsSync(verificationFile)) addFinding(findings, 'verification-policy', 'error', 'task-finish.verification-policy-missing', 'Project verification policy is missing.');
        else {
          try {
            const declaration = YAML.parse(fs.readFileSync(verificationFile, 'utf8'));
            if (!declaration || !Array.isArray(declaration.capabilities) || declaration.capabilities.length === 0) throw new Error('verification.yml has no capabilities.');
            addFinding(findings, 'verification-policy', 'ok', 'task-finish.verification-policy-ready', 'Project verification policy is parseable.');
          } catch (error) { addFinding(findings, 'verification-policy', 'error', 'task-finish.verification-policy-invalid', error.message); }
        }
      } catch (error) {
        addFinding(findings, 'project', 'error', 'task-finish.project-invalid', error.message);
      }

      const taskIdentity = currentGitIdentity(environmentRoot);
      if (!taskIdentity.head || !taskIdentity.tree || !taskIdentity.branch) addFinding(findings, 'git-task', 'error', 'task-finish.task-git-invalid', 'Task checkout Git identity is unavailable.');
      else if (context?.repositories?.[0]?.branch && taskIdentity.branch !== context.repositories[0].branch) addFinding(findings, 'git-task', 'error', 'task-finish.task-branch-mismatch', 'Task branch does not match environment receipt.');
      else addFinding(findings, 'git-task', 'ok', 'task-finish.task-git-ready', `Task branch ${taskIdentity.branch} is ready for prepare.`);

      const retained = run.identity.workspaceRoot;
      const retainedIdentity = currentGitIdentity(retained);
      if (!retainedIdentity.head || retainedIdentity.branch !== run.identity.targetBranch) addFinding(findings, 'retained-workspace', 'error', 'task-finish.retained-target-mismatch', `Retained Workspace must be on target branch ${run.identity.targetBranch}.`, { failureClass: 'transient-external-condition' });
      else if (!retainedIdentity.clean) addFinding(findings, 'retained-workspace', 'error', 'task-finish.retained-workspace-dirty', 'Retained Workspace has unrelated uncommitted changes.', { failureClass: 'transient-external-condition' });
      else addFinding(findings, 'retained-workspace', 'ok', 'task-finish.retained-workspace-ready', 'Retained Workspace is clean and on the target branch.');

      const errors = findings.filter((item) => item.severity === 'error');
      if (errors.length) {
        const transientOnly = errors.every((item) => item.failureClass === 'transient-external-condition');
        return { status: transientOnly ? 'blocked' : 'failed', checks: findings, operations, failure: phaseFailure(findings, transientOnly ? 'transient-external-condition' : 'upstream-candidate-defect') };
      }
      return {
        status: 'passed',
        checks: findings,
        operations,
        inputIdentity: digest({ context: context ? { taskId: context.taskId, controller: context.controller, scopes: context.scopes } : null, workspaceNode: workspaceNode.identity, task: taskIdentity, retained: retainedIdentity }),
        outputIdentity: digest(findings),
        output: { context, projectRoot, changeRoot, taskIdentity, retainedRoot: retained, retainedIdentity },
      };
    },

    async prepare({ run }) {
      const operations = [];
      const workspaceNode = currentWorkspaceNode(run);
      if (!workspaceNode.matches) return { status: 'failed', failure: { operation: 'workspace-node', failureClass: 'upstream-candidate-defect', code: 'task-finish.workspace-node-drift', message: 'Workspace Node identity changed before candidate preparation.' } };
      const context = taskEnvironment(run);
      if (!context?.ready) return { status: 'blocked', failure: { operation: 'environment-context', failureClass: 'transient-external-condition', code: context?.blocked?.code || 'task-finish.environment-not-ready', message: context?.blocked?.message || 'Task environment is not execution-ready.' } };
      const invocation = context.cliInvocation;
      let convergence = { status: 'not-applicable', receipt: null };
      if (run.identity.candidateKind === 'change') {
        const converge = runJsonCommand('prepare-openspec-converge', invocation.command, invocationArgs(invocation, ['openspec', 'converge', run.identity.change, '--project', run.identity.project, '--target', environmentRoot, '--json']), environmentRoot);
        operations.push(converge.observation);
        if (converge.result.status !== 0 || converge.payload?.status !== 'passed') {
          return { status: 'failed', operations, failure: { operation: 'openspec-converge', failureClass: 'upstream-candidate-defect', code: converge.payload?.diagnostic?.code || 'task-finish.openspec-convergence-failed', exitCode: converge.result.status, message: converge.payload?.diagnostic?.message || 'OpenSpec convergence failed.', diagnostic: converge.payload?.diagnostic || converge.observation.stderr } };
        }
        convergence = { status: converge.payload.status, receipt: converge.payload.receipt || null };
      }

      const sync = runCommand('prepare-runtime-sync', invocation.command, invocationArgs(invocation, ['sync', run.identity.agent, '--target', environmentRoot]), environmentRoot);
      operations.push(sync.observation);
      if (sync.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'runtime-sync', failureClass: 'upstream-candidate-defect', code: 'task-finish.runtime-sync-failed', exitCode: sync.result.status, message: 'Task runtime sync failed.', diagnostic: sync.observation.stderr } };

      const add = git(environmentRoot, 'prepare-git-add', ['add', '-A']);
      operations.push(add.observation);
      if (add.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'candidate-commit', failureClass: 'product-execution-failure', code: 'task-finish.git-add-failed', exitCode: add.result.status, message: 'Unable to stage candidate.', diagnostic: add.observation.stderr } };
      const staged = gitText(environmentRoot, ['diff', '--cached', '--name-only']);
      if (staged) {
        const commit = git(environmentRoot, 'prepare-candidate-commit', ['commit', '-m', `收尾 ${run.identity.change || run.identity.task}`]);
        operations.push(commit.observation);
        if (commit.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'candidate-commit', failureClass: 'product-execution-failure', code: 'task-finish.commit-failed', exitCode: commit.result.status, message: 'Unable to commit converged candidate.', diagnostic: commit.observation.stderr } };
      }

      let expectedTargetRef = null;
      let targetRef = run.identity.targetBranch;
      if (run.identity.remote) {
        const fetched = git(environmentRoot, 'prepare-target-fetch', ['fetch', run.identity.remote, run.identity.targetBranch]);
        operations.push(fetched.observation);
        if (fetched.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-fetch', failureClass: 'transient-external-condition', code: 'task-finish.target-fetch-failed', exitCode: fetched.result.status, message: 'Unable to fetch target branch.', diagnostic: fetched.observation.stderr } };
        targetRef = `${run.identity.remote}/${run.identity.targetBranch}`;
      }
      expectedTargetRef = gitText(environmentRoot, ['rev-parse', `${targetRef}^{commit}`]);
      if (!expectedTargetRef) return { status: 'blocked', operations, failure: { operation: 'target-observation', failureClass: 'transient-external-condition', code: 'task-finish.target-ref-missing', message: `Target ref is unavailable: ${targetRef}` } };

      const rebased = git(environmentRoot, 'prepare-target-rebase', ['rebase', targetRef]);
      operations.push(rebased.observation);
      if (rebased.result.status !== 0) {
        const aborted = git(environmentRoot, 'prepare-target-rebase-abort', ['rebase', '--abort']);
        operations.push(aborted.observation);
        return { status: 'failed', operations, failure: { operation: 'target-rebase', failureClass: 'upstream-candidate-defect', code: 'task-finish.target-content-conflict', exitCode: rebased.result.status, message: 'Target convergence requires content resolution in a new development revision.', diagnostic: rebased.observation.stderr } };
      }

      const resync = runCommand('prepare-runtime-resync', invocation.command, invocationArgs(invocation, ['sync', run.identity.agent, '--target', environmentRoot]), environmentRoot);
      operations.push(resync.observation);
      if (resync.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'runtime-fixed-point', failureClass: 'upstream-candidate-defect', code: 'task-finish.runtime-resync-failed', exitCode: resync.result.status, message: 'Runtime did not converge after target rebase.', diagnostic: resync.observation.stderr } };
      const postSyncStatus = currentGitIdentity(environmentRoot);
      if (!postSyncStatus.clean) {
        const stagedAgain = git(environmentRoot, 'prepare-fixed-point-add', ['add', '-A']);
        operations.push(stagedAgain.observation);
        const committedAgain = git(environmentRoot, 'prepare-fixed-point-commit', ['commit', '-m', `收敛 ${run.identity.change || run.identity.task} 生成资产`]);
        operations.push(committedAgain.observation);
        if (stagedAgain.result.status !== 0 || committedAgain.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'runtime-fixed-point', failureClass: 'product-execution-failure', code: 'task-finish.fixed-point-commit-failed', message: 'Unable to commit mechanical fixed-point assets.', diagnostic: committedAgain.observation.stderr } };
        const verifyFixedPoint = runCommand('prepare-runtime-fixed-point-check', invocation.command, invocationArgs(invocation, ['sync', run.identity.agent, '--target', environmentRoot]), environmentRoot);
        operations.push(verifyFixedPoint.observation);
        if (verifyFixedPoint.result.status !== 0 || !currentGitIdentity(environmentRoot).clean) return { status: 'failed', operations, failure: { operation: 'runtime-fixed-point', failureClass: 'upstream-candidate-defect', code: 'task-finish.fixed-point-unstable', message: 'Runtime generation is not stable after the mechanical fixed-point commit.', diagnostic: verifyFixedPoint.observation.stderr } };
      }

      const rebound = runtime.prepareTaskEnvironment(run.identity.workspaceRoot, run.identity.task, { adapter: run.identity.agent });
      operations.push({ operation: 'prepare-environment-refresh', status: rebound.status, effects: rebound.effects, diagnostic: rebound.diagnostic });
      if (rebound.status !== 'ready') return { status: 'failed', operations, failure: { operation: 'environment-refresh', failureClass: 'product-execution-failure', code: rebound.diagnostic?.code || 'task-finish.environment-refresh-failed', message: rebound.diagnostic?.message || 'Task Environment did not refresh the prepared candidate identity.', diagnostic: rebound.diagnostic } };

      const identity = currentGitIdentity(environmentRoot);
      if (!identity.clean || !identity.head || !identity.tree) return { status: 'failed', operations, failure: { operation: 'candidate-freeze', failureClass: 'upstream-candidate-defect', code: 'task-finish.candidate-not-clean', message: 'Candidate must be clean before freeze.' } };
      const changedPathsText = gitText(environmentRoot, ['diff', '--name-only', `${targetRef}...HEAD`]) || '';
      const changedPaths = changedPathsText.split('\n').filter(Boolean).sort();
      const frozenCandidate = {
        identity: digest({ ...identity, expectedTargetRef, changedPaths, task: run.identity.task, candidateKind: run.identity.candidateKind, change: run.identity.change, workspaceNodeIdentity: run.identity.workspaceNodeIdentity }),
        task: run.identity.task,
        candidateKind: run.identity.candidateKind,
        change: run.identity.change,
        head: identity.head,
        tree: identity.tree,
        branch: identity.branch,
        expectedTargetRef,
        targetRef,
        changedPaths,
        workspaceNodeIdentity: run.identity.workspaceNodeIdentity,
        frozenAt: new Date().toISOString(),
      };
      return { status: 'passed', operations, inputIdentity: run.identityDigest, outputIdentity: frozenCandidate.identity, output: { frozenCandidate, convergence } };
    },

    async verify({ run }) {
      const operations = [];
      const workspaceNode = currentWorkspaceNode(run);
      if (!workspaceNode.matches || run.frozenCandidate?.workspaceNodeIdentity !== run.identity.workspaceNodeIdentity) return { status: 'failed', failure: { operation: 'workspace-node', failureClass: 'upstream-candidate-defect', code: 'task-finish.workspace-node-drift', message: 'Workspace Node identity changed after candidate freeze.' } };
      const observed = observeFrozen(environmentRoot, run.frozenCandidate);
      if (!observed.matches) return { status: 'failed', failure: { operation: 'candidate-freeze', failureClass: 'upstream-candidate-defect', code: 'task-finish.candidate-changed-after-freeze', message: 'Candidate identity changed after freeze.', findings: [observed.current] } };

      if (existingVerificationSummary && fs.existsSync(existingVerificationSummary)) {
        try {
          const evidence = JSON.parse(fs.readFileSync(existingVerificationSummary, 'utf8'));
          if (evidence.status === 'passed' && evidence.requiredAssurance === run.identity.requiredAssurance && evidence.source?.candidateFingerprint === run.frozenCandidate.identity && evidence.workspaceNode?.identity?.digest === run.identity.workspaceNodeIdentity) {
            return { status: 'passed', inputIdentity: run.frozenCandidate.identity, outputIdentity: evidence.evidenceIdentity, output: { verification: { executions: 0, reused: true, status: 'passed', evidenceIdentity: evidence.evidenceIdentity, summaryPath: existingVerificationSummary, durationMs: evidence.durationMs ?? evidence.totalDurationMs ?? 0 } } };
          }
        } catch { /* execute fresh assurance */ }
      }

      const context = taskEnvironment(run);
      if (!context?.ready) return { status: 'failed', failure: { operation: 'verification-context', failureClass: 'upstream-candidate-defect', code: 'task-finish.candidate-context-invalid', message: context?.blocked?.message || 'Verification context is not executable.' } };
      const invocation = context.cliInvocation;
      const verified = runJsonCommand('verify-required-assurance', invocation.command, invocationArgs(invocation, [
        'verification', 'run', '--project', run.identity.project, '--level', run.identity.requiredAssurance,
        '--target', environmentRoot, '--environment', run.identity.task, '--workspace', run.identity.workspaceRoot,
        '--candidate-fingerprint', run.frozenCandidate.identity, '--json',
      ]), environmentRoot);
      operations.push(verified.observation);
      const payload = verified.payload;
      const after = observeFrozen(environmentRoot, run.frozenCandidate);
      if (!after.matches) return { status: 'failed', operations, failure: { operation: 'verification', failureClass: 'upstream-candidate-defect', code: 'task-finish.candidate-changed-after-freeze', message: 'Formal verification changed the frozen candidate.', findings: [after.current] } };
      if (verified.result.status !== 0 || payload?.status !== 'passed') {
        const primary = payload?.checks?.find((check) => check.status === 'failed') || null;
        return {
          status: 'failed',
          operations,
          inputIdentity: run.frozenCandidate.identity,
          output: { verification: { executions: 1, reused: false, status: 'failed', evidenceIdentity: payload?.evidenceIdentity || null, summaryPath: payload?.evidenceReference || null, durationMs: payload?.durationMs ?? payload?.totalDurationMs ?? verified.observation.durationMs } },
          failure: {
            operation: 'verification', check: primary?.id || null, failureClass: 'upstream-candidate-defect',
            code: primary ? 'task-finish.verification-check-failed' : payload?.error?.code || 'task-finish.verification-failed',
            exitCode: primary?.exitCode ?? verified.result.status,
            message: primary ? `Formal verification check failed: ${primary.id}` : payload?.error?.message || 'Formal verification failed.',
            findings: primary ? [{ id: primary.id, status: primary.status, exitCode: primary.exitCode, stderr: boundedText(primary.stderr), stdout: boundedText(primary.stdout) }] : [],
            diagnostic: { digest: digest(payload || verified.observation), preview: primary || payload?.error || verified.observation.stderr },
          },
        };
      }
      if (payload?.workspaceNode?.identity?.digest !== run.identity.workspaceNodeIdentity) {
        return { status: 'failed', operations, failure: { operation: 'verification', failureClass: 'upstream-candidate-defect', code: 'task-finish.verification-node-identity-mismatch', message: 'Formal verification evidence does not match the frozen Workspace Node identity.', diagnostic: { expected: run.identity.workspaceNodeIdentity, actual: payload?.workspaceNode?.identity?.digest || null } } };
      }
      return { status: 'passed', operations, inputIdentity: run.frozenCandidate.identity, outputIdentity: payload.evidenceIdentity, output: { verification: { executions: 1, reused: false, status: 'passed', evidenceIdentity: payload.evidenceIdentity, summaryPath: payload.evidenceReference, durationMs: payload.durationMs ?? payload.totalDurationMs ?? verified.observation.durationMs } } };
    },

    async deliver({ run }) {
      const operations = [];
      const workspaceNode = currentWorkspaceNode(run);
      if (!workspaceNode.matches || run.frozenCandidate?.workspaceNodeIdentity !== run.identity.workspaceNodeIdentity) return { status: 'failed', failure: { operation: 'workspace-node', failureClass: 'upstream-candidate-defect', code: 'task-finish.workspace-node-drift', message: 'Workspace Node identity changed before delivery.' } };
      const observed = observeFrozen(environmentRoot, run.frozenCandidate);
      if (!observed.matches) return { status: 'failed', failure: { operation: 'candidate-freeze', failureClass: 'upstream-candidate-defect', code: 'task-finish.candidate-changed-after-freeze', message: 'Candidate identity changed before delivery.', findings: [observed.current] } };
      const retainedRoot = run.identity.workspaceRoot;
      const lease = acquireFinishTargetLease({ file: targetLeasePath(retainedRoot, run.identity.targetBranch), run });
      if (lease.blocked) return { status: 'blocked', failure: { operation: 'target-lease', failureClass: 'transient-external-condition', code: 'task-finish.target-lease-held', message: 'Target branch lease is held by another Finish run.', findings: [lease.existing] } };
      try {
        let observedTargetRef = null;
        if (run.identity.remote) {
          const remote = git(retainedRoot, 'deliver-target-observe', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
          operations.push(remote.observation);
          if (remote.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-observation', failureClass: 'transient-external-condition', code: 'task-finish.target-observation-failed', exitCode: remote.result.status, message: 'Unable to observe remote target ref.', diagnostic: remote.observation.stderr } };
          observedTargetRef = remote.result.stdout.trim().split(/\s+/)[0] || null;
        } else observedTargetRef = gitText(retainedRoot, ['rev-parse', `${run.identity.targetBranch}^{commit}`]);
        const alreadyDelivered = observedTargetRef === run.frozenCandidate.head;
        if (!alreadyDelivered && observedTargetRef !== run.frozenCandidate.expectedTargetRef) {
          return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target ref changed after candidate freeze.', findings: [{ expected: run.frozenCandidate.expectedTargetRef, observed: observedTargetRef }] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.frozenCandidate.expectedTargetRef, observedTargetRef, candidateRef: run.frozenCandidate.head } } };
        }
        if (!alreadyDelivered) {
          const retainedIdentity = currentGitIdentity(retainedRoot);
          if (retainedIdentity.branch !== run.identity.targetBranch || !retainedIdentity.clean || retainedIdentity.head !== observedTargetRef) {
            return { status: 'blocked', operations, failure: { operation: 'retained-workspace', failureClass: 'transient-external-condition', code: 'task-finish.retained-workspace-not-ready', message: 'Retained Workspace is not clean at the observed target ref.', findings: [retainedIdentity] } };
          }
          const merged = git(retainedRoot, 'deliver-fast-forward', ['merge', '--ff-only', run.frozenCandidate.head]);
          operations.push(merged.observation);
          if (merged.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'target-transition', failureClass: 'upstream-candidate-defect', code: 'task-finish.fast-forward-failed', exitCode: merged.result.status, message: 'Frozen candidate is not a fast-forward delivery.', diagnostic: merged.observation.stderr } };
          if (run.identity.remote) {
            const pushed = git(retainedRoot, 'deliver-push', ['push', run.identity.remote, `${run.identity.targetBranch}:${run.identity.targetBranch}`]);
            operations.push(pushed.observation);
            if (pushed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-push', failureClass: 'transient-external-condition', code: 'task-finish.push-failed', exitCode: pushed.result.status, message: 'Target push failed.', diagnostic: pushed.observation.stderr }, output: { delivery: { status: 'push-blocked', expectedTargetRef: observedTargetRef, candidateRef: run.frozenCandidate.head } } };
          }
        }

        const retainedCli = path.join(retainedRoot, 'projects', 'product', 'buildr');
        const impact = classifyRetainedConvergencePaths(run.frozenCandidate.changedPaths || []);
        if (impact.requiresRuntimeSync) {
          const synced = runCommand('deliver-retained-sync', retainedCli, ['sync', run.identity.agent, '--target', retainedRoot], retainedRoot);
          operations.push(synced.observation);
          if (synced.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'retained-sync', failureClass: 'transient-external-condition', code: 'task-finish.retained-sync-failed', exitCode: synced.result.status, message: 'Retained Workspace sync failed.', diagnostic: synced.observation.stderr }, output: { delivery: { status: 'delivered-retained-blocked', candidateRef: run.frozenCandidate.head } } };
        }
        const doctor = runJsonCommand('deliver-retained-doctor', retainedCli, ['doctor', '--agent', run.identity.agent, '--target', retainedRoot, '--json'], retainedRoot);
        operations.push(doctor.observation);
        if (doctor.result.status !== 0 || doctor.payload?.health?.ready !== true) return { status: 'blocked', operations, failure: { operation: 'retained-doctor', failureClass: 'transient-external-condition', code: 'task-finish.retained-doctor-failed', exitCode: doctor.result.status, message: 'Retained Workspace doctor is not ready.', diagnostic: doctor.payload?.findings || doctor.observation.stderr }, output: { delivery: { status: 'delivered-retained-blocked', candidateRef: run.frozenCandidate.head } } };
        if (impact.requiresCliInstall || impact.requiresLocalAppInstall) {
          const nodeExecutable = process.execPath;
          const installer = path.join(retainedRoot, 'projects', 'product', 'services', 'buildr', 'scripts', 'install-buildr-cli');
          const installed = runCommand('deliver-cli-install', installer, ['--node-executable', nodeExecutable], retainedRoot);
          operations.push(installed.observation);
          if (installed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'runtime-install', failureClass: 'transient-external-condition', code: 'task-finish.cli-install-failed', exitCode: installed.result.status, message: 'Default Buildr CLI installation failed.', diagnostic: installed.observation.stderr }, output: { delivery: { status: 'delivered-install-blocked', candidateRef: run.frozenCandidate.head } } };
          const cliSource = path.join(retainedRoot, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
          const checked = runJsonCommand('deliver-cli-install-check', nodeExecutable, [cliSource, 'version', '--json'], retainedRoot);
          operations.push(checked.observation);
          if (checked.result.status !== 0 || !checked.payload?.version) return { status: 'blocked', operations, failure: { operation: 'runtime-install', failureClass: 'transient-external-condition', code: 'task-finish.cli-install-check-failed', exitCode: checked.result.status, message: 'Installed Buildr runtime version check failed.', diagnostic: checked.observation.stderr }, output: { delivery: { status: 'delivered-install-blocked', candidateRef: run.frozenCandidate.head } } };
        }
        return { status: 'passed', operations, inputIdentity: run.frozenCandidate.identity, outputIdentity: run.frozenCandidate.head, output: { delivery: { status: 'delivered', expectedTargetRef: run.frozenCandidate.expectedTargetRef, observedTargetRef, candidateRef: run.frozenCandidate.head, remoteAfterRef: run.frozenCandidate.head, impact, retainedDoctor: 'passed', runtimeInstall: impact.requiresCliInstall || impact.requiresLocalAppInstall ? 'passed' : 'not-applicable', localAppDelivery: impact.requiresLocalAppInstall ? 'bundled-with-cli-runtime' : 'not-applicable' } } };
      } finally {
        releaseFinishTargetLease(lease);
      }
    },

    async cleanup({ run }) {
      const operations = [];
      if (run.delivery?.candidateRef !== run.frozenCandidate?.head) return { status: 'blocked', failure: { operation: 'cleanup-readiness', failureClass: 'transient-external-condition', code: 'task-finish.delivery-not-complete', message: 'Cleanup requires completed delivery evidence.' } };
      const retainedRoot = run.identity.workspaceRoot;
      const prepared = {
        schemaVersion: 'buildr.task-finish-completion/v1',
        runId: run.runId,
        task: run.identity.task,
        candidateKind: run.identity.candidateKind,
        change: run.identity.change,
        candidateIdentity: run.frozenCandidate.identity,
        candidateRef: run.frozenCandidate.head,
        targetBranch: run.identity.targetBranch,
        workspaceNodeIdentity: run.identity.workspaceNodeIdentity,
        status: 'prepared',
        preparedAt: new Date().toISOString(),
      };
      const completionFile = writeFinishCompletion({ root: retainedRoot, runId: run.runId, completion: prepared });
      if (run.verification?.summaryPath) {
        const retainedCli = path.join(retainedRoot, 'projects', 'product', 'buildr');
        const cleaned = runJsonCommand('cleanup-verification-evidence', retainedCli, ['verification', 'cleanup', '--summary', run.verification.summaryPath, '--json'], retainedRoot);
        operations.push(cleaned.observation);
        if (cleaned.result.status !== 0 && cleaned.payload?.status !== 'already-absent') {
          return { status: 'blocked', operations, failure: { operation: 'verification-cleanup', failureClass: 'transient-external-condition', code: 'task-finish.verification-cleanup-failed', exitCode: cleaned.result.status, message: 'Verification evidence cleanup failed.', diagnostic: cleaned.payload || cleaned.observation.stderr } };
        }
      }
      const context = taskEnvironment(run);
      const deliveries = Object.fromEntries((context.repositories || []).map((repository) => [repository.selector, repository.selector === 'workspace' ? run.identity.targetBranch : repository.startPoint]));
      const cleanedEnvironment = await runtime.cleanupTaskEnvironment(retainedRoot, run.identity.task, { type: 'finish', deliveries });
      operations.push({ operation: 'cleanup-task-environment', status: cleanedEnvironment.status, effects: cleanedEnvironment.effects, diagnostic: cleanedEnvironment.diagnostic });
      if (cleanedEnvironment.status !== 'cleaned') {
        return { status: 'blocked', operations, failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: cleanedEnvironment.diagnostic?.code || 'task-finish.environment-cleanup-failed', message: cleanedEnvironment.diagnostic?.message || 'Task Environment cleanup failed.', diagnostic: cleanedEnvironment } };
      }
      const complete = { ...prepared, status: 'complete', completedAt: new Date().toISOString(), cleanup: cleanedEnvironment };
      writeFinishCompletion({ root: retainedRoot, runId: run.runId, completion: complete });
      return { status: 'passed', operations, inputIdentity: run.delivery.candidateRef, outputIdentity: digest(complete), output: { completion: { status: 'complete', receipt: completionFile, cleanup: cleanedEnvironment } } };
    },
  };
}
