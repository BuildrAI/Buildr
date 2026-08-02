import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { TASK_ENVIRONMENT_RECEIPT_SCHEMA, taskEnvironmentError, taskEnvironmentReadModel } from '../../domain/task-environment/task-environment.mjs';
import { observeGitCheckoutIdentity } from '../../infrastructure/git/checkout-identity.mjs';
import { checkRuntimeAdapter } from '../../infrastructure/runtime/check-runtime.mjs';
import { spawnSync } from '../../infrastructure/process.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

const GIT_PROVIDER = 'buildr.git-worktree-provider/v1';
const ENVIRONMENT_MANAGER_SOURCE_PATHS = ['bin', 'src', 'package', 'package.json', 'package-lock.json'];

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function now() {
  return new Date().toISOString();
}

function digestFiles(root) {
  const hash = crypto.createHash('sha256');
  const visit = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      hash.update(`symlink:${path.relative(root, target)}:${fs.readlinkSync(target)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry));
      return;
    }
    if (stat.isFile()) {
      hash.update(path.relative(root, target).split(path.sep).join('/'));
      hash.update('\0');
      hash.update(fs.readFileSync(target));
      hash.update('\0');
    }
  };
  for (const relative of ENVIRONMENT_MANAGER_SOURCE_PATHS) visit(path.join(root, relative));
  return `sha256-${hash.digest('hex')}`;
}

function probe(status, identity = null, diagnostic = null, observedAt = now()) {
  return { status, identity, observedAt, diagnostic };
}

export function registerTaskEnvironmentApplication(runtime) {
  function candidateController(sourceCheckout, workspaceCheckout) {
    return Boolean(sourceCheckout?.linkedWorktree && workspaceCheckout && sourceCheckout.gitCommonDirectory === workspaceCheckout.gitCommonDirectory);
  }

  function currentEnvironmentManager(workspaceRoot, adapter) {
    const sourceRoot = path.resolve(runtime.productRoot());
    const sourceCheckout = observeGitCheckoutIdentity(sourceRoot);
    const workspaceCheckout = observeGitCheckoutIdentity(workspaceRoot);
    if (candidateController(sourceCheckout, workspaceCheckout)) {
      throw taskEnvironmentError('task_environment_candidate_controller_forbidden', '候选 Product checkout 不能创建、恢复、认领、释放或清理自己的 Task Environment。', 409, { sourceRoot, workspaceRoot }, '从 canonical retained Workspace 的 Buildr CLI 重试。');
    }
    return {
      sourceRoot,
      cliSource: path.join(sourceRoot, 'bin', 'buildr.mjs'),
      identity: digestFiles(sourceRoot),
      adapter,
      sourceCheckout,
      workspaceCheckout,
    };
  }

  function assertEnvironmentManagerSourceClean(manager) {
    const checkout = manager.sourceCheckout;
    if (!checkout) return manager;
    const relativeSource = path.relative(checkout.checkoutRoot, manager.sourceRoot);
    if (path.isAbsolute(relativeSource) || relativeSource === '..' || relativeSource.startsWith(`..${path.sep}`)) {
      throw taskEnvironmentError('task_environment_manager_source_untrusted', '无法证明当前 Environment Manager source 属于其 Git checkout。', 409, {
        sourceRoot: manager.sourceRoot,
        checkoutRoot: checkout.checkoutRoot,
      }, '从可信 retained Buildr source 重试。');
    }
    const pathspecs = ENVIRONMENT_MANAGER_SOURCE_PATHS.map((relative) => (relativeSource ? path.join(relativeSource, relative) : relative).split(path.sep).join('/'));
    const observed = spawnSync('git', ['-C', checkout.checkoutRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...pathspecs], { encoding: 'utf8', timeout: 5000 });
    if (observed.status !== 0) {
      throw taskEnvironmentError('task_environment_manager_source_untrusted', '无法取得当前 Environment Manager source 的 Git clean evidence。', 409, {
        sourceRoot: manager.sourceRoot,
        checkoutRoot: checkout.checkoutRoot,
        diagnostic: (observed.stderr || observed.stdout || 'git status failed').trim().slice(0, 2000),
      }, '修复 Git checkout 后从可信 retained Buildr source 重试。');
    }
    const changes = (observed.stdout || '').split('\0').filter(Boolean);
    if (changes.length) {
      throw taskEnvironmentError('task_environment_manager_dirty', '当前 Environment Manager source 存在未提交变化。', 409, {
        sourceRoot: manager.sourceRoot,
        changes,
      }, '提交或清理 bin/src/package/package metadata 的变化后，从 retained Buildr 重试。');
    }
    return manager;
  }

  function receiptController(receipt) {
    const sourceRoot = path.resolve(receipt.controller.sourceRoot);
    return {
      sourceRoot,
      cliSource: path.resolve(receipt.controller.cliSource),
      identity: receipt.controller.identity,
      adapter: receipt.controller.adapter,
      sourceCheckout: observeGitCheckoutIdentity(sourceRoot),
      workspaceCheckout: observeGitCheckoutIdentity(receipt.workspace.root),
    };
  }

  function assertEnvironmentManager(workspaceRoot, receipt = null, adapter = null) {
    const expectedAdapter = receipt?.controller.adapter || adapter || 'codex';
    const current = currentEnvironmentManager(workspaceRoot, expectedAdapter);
    if (receipt && (path.resolve(receipt.controller.sourceRoot) !== current.sourceRoot || receipt.controller.adapter !== current.adapter)) {
      throw taskEnvironmentError('task_environment_manager_mismatch', '当前 Buildr 不是该 Environment Receipt 登记的 retained Environment Manager。', 409, {
        expected: { sourceRoot: receipt.controller.sourceRoot, adapter: receipt.controller.adapter },
        actual: { sourceRoot: current.sourceRoot, adapter: current.adapter },
      }, '回到登记该 Environment 的 canonical retained Buildr source 后重试。');
    }
    return assertEnvironmentManagerSourceClean(current);
  }

  function environmentInspector(workspaceRoot, receipt) {
    const sourceRoot = path.resolve(runtime.productRoot());
    const sourceCheckout = observeGitCheckoutIdentity(sourceRoot);
    const workspaceCheckout = observeGitCheckoutIdentity(workspaceRoot);
    if (candidateController(sourceCheckout, workspaceCheckout)) return receiptController(receipt);
    return assertEnvironmentManager(workspaceRoot, receipt);
  }

  function candidateCli(controller, workspaceRoot, executionRoot) {
    const controllerCheckout = controller.sourceCheckout;
    const workspaceCheckout = controller.workspaceCheckout;
    if (controllerCheckout && workspaceCheckout && controllerCheckout.checkoutRoot === workspaceCheckout.checkoutRoot && inside(workspaceRoot, controller.sourceRoot)) {
      const sourceRoot = path.resolve(executionRoot, path.relative(workspaceRoot, controller.sourceRoot));
      return {
        sourceRoot,
        source: path.join(sourceRoot, 'bin', 'buildr.mjs'),
        command: path.resolve(sourceRoot, '..', '..', 'buildr'),
        argsPrefix: [],
        kind: 'task-environment-candidate',
      };
    }
    return { sourceRoot: controller.sourceRoot, source: controller.cliSource, command: process.execPath, argsPrefix: [controller.cliSource], kind: 'stable-controller' };
  }

  function workspaceHasRootGit(workspaceRoot) {
    const result = spawnSync('git', ['-C', workspaceRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return result.status === 0 && path.resolve(result.stdout.trim()) === fs.realpathSync(workspaceRoot);
  }

  function taskScopes(workspaceRoot, task) {
    const projects = runtime.readProjectRegistryRecord(workspaceRoot);
    if (projects.registry.migrationRequired) throw taskEnvironmentError('task_environment_project_registry_migration_required', 'Project registry 需要先完成 canonical 迁移。', 409, undefined, '从 retained Workspace 运行 buildr sync。');
    const scopes = [{ selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', sourceType: workspaceHasRootGit(workspaceRoot) ? 'git' : 'workspace' }];
    const seen = new Set(['workspace']);
    for (const projectCode of new Set([...task.scope.projects, ...task.changes.map((reference) => reference.project)])) {
      const project = projects.projects[projectCode];
      if (!project) throw taskEnvironmentError('task_environment_project_not_found', `Project 不存在：${projectCode}。`, 409, { project: projectCode });
      const selector = `project:${projectCode}`;
      if (!seen.has(selector)) scopes.push({ selector, kind: 'project', project: projectCode, service: null, sourcePath: project.source.path, sourceType: project.source.type });
      seen.add(selector);
    }
    for (const reference of task.scope.services) {
      const project = projects.projects[reference.project];
      if (!project) throw taskEnvironmentError('task_environment_project_not_found', `Project 不存在：${reference.project}。`, 409, reference);
      const projectSelector = `project:${reference.project}`;
      if (project.source.type === 'git' && !seen.has(projectSelector)) {
        scopes.push({ selector: projectSelector, kind: 'project', project: reference.project, service: null, sourcePath: project.source.path, sourceType: project.source.type });
        seen.add(projectSelector);
      }
      const services = runtime.readServiceRegistryRecord(workspaceRoot, reference.project);
      const service = services.services[reference.service];
      if (!service) throw taskEnvironmentError('task_environment_service_not_found', `Service 不存在：${reference.project}/${reference.service}。`, 409, reference);
      const selector = `service:${reference.project}/${reference.service}`;
      if (!seen.has(selector)) scopes.push({ selector, kind: 'service', project: reference.project, service: reference.service, sourcePath: service.source.path, sourceType: service.source.type });
      seen.add(selector);
    }
    return scopes;
  }

  function providerIncludes(scopes) {
    return scopes.filter((scope) => scope.selector !== 'workspace' && scope.sourceType === 'git').map((scope) => scope.selector);
  }

  function executionScopes(scopes, workspaceRoot, checkoutRoot, providerResult, observedAt) {
    const repositories = new Map((providerResult?.repositories || []).map((item) => [item.selector, item]));
    return scopes.map((scope) => {
      const repository = repositories.get(scope.selector);
      const root = repository?.checkoutPath || path.resolve(checkoutRoot || workspaceRoot, scope.sourcePath);
      const provider = repository ? { capability: GIT_PROVIDER, selector: scope.selector, evidence: providerResult.evidencePath } : null;
      return {
        selector: scope.selector,
        kind: scope.kind,
        project: scope.project,
        service: scope.service,
        sourcePath: scope.sourcePath,
        executionRoot: root,
        validationRoot: checkoutRoot || workspaceRoot,
        shared: !checkoutRoot,
        provider,
        runtime: probe('blocked', null, '尚未探测 Runtime。', observedAt),
        cli: probe('blocked', null, '尚未探测 Workspace CLI。', observedAt),
        dependencies: probe('blocked', null, '尚未探测依赖。', observedAt),
        projection: probe('blocked', null, '尚未探测 Agent runtime projection。', observedAt),
      };
    });
  }

  function assertSharedScopesAvailable(workspaceRoot, taskId, scopes) {
    const requested = scopes.filter((scope) => scope.shared);
    if (!requested.length) return;
    const tasksRoot = path.join(workspaceRoot, '.buildr', 'tasks');
    if (!fs.existsSync(tasksRoot)) return;
    for (const entry of fs.readdirSync(tasksRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === taskId) continue;
      const environmentFile = path.join(tasksRoot, entry.name, 'environment.json');
      if (!fs.existsSync(environmentFile)) continue;
      let other;
      try { other = runtime.readTaskEnvironmentPersistence(workspaceRoot, entry.name, { optional: true }); } catch (error) {
        throw taskEnvironmentError('task_environment_shared_occupancy_unreadable', `无法确认共享执行根是否被 Task ${entry.name} 占用：${error.message}`, 409, { taskId: entry.name, path: environmentFile }, '先修复该 Task 的 Environment Receipt，再重试。');
      }
      if (!other || other.receipt.status === 'cleaned') continue;
      for (const ownScope of requested) {
        const conflict = other.receipt.scopes.find((candidate) => candidate.shared && (inside(candidate.executionRoot, ownScope.executionRoot) || inside(ownScope.executionRoot, candidate.executionRoot)));
        if (conflict) {
          throw taskEnvironmentError('task_environment_shared_occupancy_conflict', `共享执行根已由 Task ${entry.name} 占用。`, 409, {
            requested: { taskId, selector: ownScope.selector, executionRoot: ownScope.executionRoot },
            occupied: { taskId: entry.name, selector: conflict.selector, executionRoot: conflict.executionRoot },
          }, `先完成或放弃 Task ${entry.name} 并清理其 Environment。`);
        }
      }
    }
  }

  function ensureCandidateDependencies(cli, workspaceNode, effects) {
    if (cli.kind !== 'task-environment-candidate') return probe('not-applicable', 'stable-controller', null);
    const lockfile = path.join(cli.sourceRoot, 'package-lock.json');
    if (!fs.existsSync(lockfile)) return probe('blocked', null, `Candidate CLI lockfile 不存在：${lockfile}`);
    const packageFile = path.join(cli.sourceRoot, 'package.json');
    const lockIdentity = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(lockfile)).digest('hex')}`;
    const dependencyReady = fs.existsSync(path.join(cli.sourceRoot, 'node_modules')) && fs.existsSync(packageFile);
    if (!dependencyReady) {
      if (!workspaceNode?.ready) return probe('blocked', lockIdentity, 'Workspace Node/npm 未就绪，不能准备 candidate 依赖。');
      const installed = spawnSync(workspaceNode.npmExecutable, ['ci'], { cwd: cli.sourceRoot, encoding: 'utf8', env: workspaceNode.environment, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
      if (installed.status !== 0) return probe('blocked', lockIdentity, (installed.stderr || installed.stdout || 'npm ci failed').trim().slice(0, 2000));
      effects.push({ type: 'dependencies-prepared', root: cli.sourceRoot, manager: 'npm', lockfile });
    }
    return fs.existsSync(path.join(cli.sourceRoot, 'node_modules')) ? probe('ready', lockIdentity) : probe('blocked', lockIdentity, 'npm ci 完成后 node_modules 仍不存在。');
  }

  function probeCli(cli, executionRoot, workspaceNode) {
    const identity = fs.existsSync(cli.sourceRoot) ? digestFiles(cli.sourceRoot) : null;
    if (!fs.existsSync(cli.command) || !identity) return probe('blocked', identity, `执行 CLI 不存在：${cli.command}`);
    const result = spawnSync(cli.command, [...cli.argsPrefix, 'version', '--json'], { cwd: executionRoot, encoding: 'utf8', env: workspaceNode?.environment || process.env, maxBuffer: 1024 * 1024 });
    let payload = null;
    try { payload = JSON.parse(result.stdout || ''); } catch { /* diagnostic below */ }
    if (result.status !== 0 || !payload?.version) return probe('blocked', identity, (result.stderr || '执行 CLI 未返回有效 version JSON。').trim().slice(0, 2000));
    return probe('ready', `${identity}:${payload.version}`);
  }

  function prepareProjection(adapter, validationRoot, cli, workspaceNode, effects) {
    const check = runtime.checkRuntimeAdapter || checkRuntimeAdapter;
    let checked = check(['--target', validationRoot, '--scope', '.'], { repoRoot: validationRoot, adapterId: adapter, command: `buildr runtime check ${adapter}` });
    if (cli.kind === 'task-environment-candidate' || !checked.runtimeSourceEvidence?.projectionReady) {
      try {
        if (cli.kind === 'task-environment-candidate') {
          const rendered = spawnSync(cli.command, [...cli.argsPrefix, 'render', adapter, '--target', validationRoot], { cwd: validationRoot, encoding: 'utf8', env: workspaceNode?.environment || process.env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
          if (rendered.status !== 0) return probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, (rendered.stderr || rendered.stdout || 'Candidate runtime projection failed.').trim().slice(0, 2000));
        } else runtime.renderRuntime(adapter, ['--target', validationRoot], { productSkill: true });
        effects.push({ type: 'runtime-projected', adapter, target: validationRoot, source: cli.kind });
        checked = check(['--target', validationRoot, '--scope', '.'], { repoRoot: validationRoot, adapterId: adapter, command: `buildr runtime check ${adapter}` });
      } catch (error) {
        return probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, error.message);
      }
    }
    return checked.runtimeSourceEvidence?.projectionReady ? probe('ready', checked.runtimeSourceEvidence.projectionIdentity) : probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, 'Agent runtime projection 未就绪。');
  }

  function observeProjection(adapter, validationRoot) {
    try {
      const check = runtime.checkRuntimeAdapter || checkRuntimeAdapter;
      const checked = check(['--target', validationRoot, '--scope', '.'], { repoRoot: validationRoot, adapterId: adapter, command: `buildr runtime check ${adapter}` });
      return checked.runtimeSourceEvidence?.projectionReady ? probe('ready', checked.runtimeSourceEvidence.projectionIdentity) : probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, 'Agent runtime projection 已漂移或不完整。');
    } catch (error) {
      return probe('blocked', null, error.message);
    }
  }

  function prepareFoundations(receipt, controller, effects, { mutate }) {
    const validationRoot = receipt.scopes[0].validationRoot;
    const workspaceNode = runtime.workspaceNodeExecution(validationRoot);
    const runtimeProbe = workspaceNode.ready ? probe('ready', workspaceNode.identity.digest) : probe('blocked', workspaceNode.identity?.digest || null, workspaceNode.diagnostic || 'Workspace Node 未就绪。');
    const cli = candidateCli(controller, receipt.workspace.root, validationRoot);
    const dependencies = mutate ? ensureCandidateDependencies(cli, workspaceNode, effects) : (() => {
      if (cli.kind !== 'task-environment-candidate') return probe('not-applicable', 'stable-controller');
      const lockfile = path.join(cli.sourceRoot, 'package-lock.json');
      const lockIdentity = fs.existsSync(lockfile) ? `sha256-${crypto.createHash('sha256').update(fs.readFileSync(lockfile)).digest('hex')}` : null;
      return fs.existsSync(path.join(cli.sourceRoot, 'node_modules')) ? probe('ready', lockIdentity) : probe('blocked', lockIdentity, 'Candidate dependencies 不可用。');
    })();
    const cliProbe = dependencies.status === 'blocked' ? probe('blocked', null, '依赖未就绪，跳过 CLI probe。') : probeCli(cli, validationRoot, workspaceNode);
    const projection = dependencies.status === 'blocked'
      ? probe('blocked', null, '依赖未就绪，跳过 runtime projection。')
      : mutate
        ? prepareProjection(controller.adapter, validationRoot, cli, workspaceNode, effects)
        : observeProjection(controller.adapter, validationRoot);
    const scopes = receipt.scopes.map((scope) => ({ ...scope, runtime: runtimeProbe, cli: cliProbe, dependencies, projection }));
    const ready = scopes.every((scope) => [scope.runtime, scope.cli, scope.dependencies, scope.projection].every((item) => item.status !== 'blocked'));
    const diagnostic = ready ? null : scopes.flatMap((scope) => [scope.runtime, scope.cli, scope.dependencies, scope.projection].filter((item) => item.status === 'blocked').map((item) => `${scope.selector}: ${item.diagnostic}`))[0];
    return { scopes, ready, diagnostic, cli };
  }

  function observeResources(receipt) {
    return receipt.resources.map((resource) => {
      if (resource.status === 'released') return resource;
      try {
        const observed = runtime.probeTaskEnvironmentResource(resource, {
          taskId: receipt.taskId,
          workspaceRoot: receipt.workspace.root,
          environmentRoot: receipt.scopes[0].validationRoot,
        });
        return { ...resource, status: observed.status === 'ready' ? 'running' : 'stale', probe: observed, updatedAt: observed.observedAt };
      } catch (error) {
        const observedAt = now();
        return { ...resource, status: 'stale', probe: probe('blocked', resource.identity.providerIdentity, error.message, observedAt), updatedAt: observedAt };
      }
    });
  }

  function environmentResult(operation, status, targetRoot, taskId, persistence = null, environment = null, diagnostic = null, effects = [], nextActions = [], observedAt = now()) {
    let execution = null;
    if (status === 'ready' && persistence && environment) {
      const controller = receiptController(persistence.receipt);
      const cli = candidateCli(controller, environment.workspace.root, environment.scopes[0].validationRoot);
      execution = {
        ready: true,
        workdir: environment.scopes[0].validationRoot,
        executionRoots: environment.scopes.map((scope) => scope.executionRoot),
        allowedExecutionRoots: [...new Set(environment.scopes.flatMap((scope) => [scope.executionRoot, scope.validationRoot]))],
        controller: { identity: environment.controller.identity, adapter: environment.controller.adapter },
        cliInvocation: { command: cli.command, argsPrefix: cli.argsPrefix, sourceRoot: cli.sourceRoot, kind: cli.kind },
      };
    }
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskEnvironmentResult, {
      operation,
      status,
      taskId,
      receipt: { path: path.join(path.resolve(targetRoot), '.buildr', 'tasks', taskId, 'environment.json'), available: Boolean(persistence) },
      observedAt,
      source: 'current-machine',
      environment,
      execution,
      diagnostic,
      effects,
      nextActions,
    });
  }

  function blocked(operation, targetRoot, taskId, error, persistence = null, effects = []) {
    const message = error.message || String(error);
    return environmentResult(operation, 'blocked', targetRoot, taskId, persistence, persistence ? taskEnvironmentReadModel(persistence.receipt) : null, { code: error.code || 'task_environment_blocked', message, details: error.details }, effects, [error.nextAction || '修正诊断后按同一 Task ID 重试。']);
  }

  function prepareTaskEnvironment(targetRoot, taskId, options = {}) {
    const effects = [];
    let persistence = null;
    let receiptMutationStarted = false;
    let root = path.resolve(targetRoot);
    try {
      root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(root));
      const taskPersistence = runtime.readTaskRecordPersistence(root, taskId);
      if (taskPersistence.record.status !== 'active') throw taskEnvironmentError('task_environment_task_terminal', `Task ${taskId} 已是 ${taskPersistence.record.status}，不能准备新环境效果。`, 409, { status: taskPersistence.record.status }, `运行 buildr task environment inspect ${taskId} 查看最终环境事实。`);
      persistence = runtime.readTaskEnvironmentPersistence(root, taskId, { optional: true });
      if (persistence?.receipt.status === 'cleaned') throw taskEnvironmentError('task_environment_already_cleaned', `Task Environment 已清理：${taskId}。`, 409, undefined, '新范围请创建新的正式 Task。');
      const adapter = persistence?.receipt.controller.adapter || options.adapter || 'codex';
      if (persistence && options.adapter && options.adapter !== persistence.receipt.controller.adapter) throw taskEnvironmentError('task_environment_manager_mismatch', '恢复参数中的 adapter 与 Environment Receipt 登记值不一致。', 409, { expected: persistence.receipt.controller.adapter, actual: options.adapter });
      if (!runtime.isSupportedAgent(adapter)) throw taskEnvironmentError('task_environment_adapter_unsupported', `Agent runtime 不受支持：${adapter}。`, 409);
      const controller = assertEnvironmentManager(root, persistence?.receipt || null, adapter);
      const scopes = taskScopes(root, taskPersistence.record);
      const createdAt = persistence?.receipt.createdAt || now();
      const existingUsesGit = Boolean(persistence?.receipt.scopes.some((scope) => scope.provider?.capability === GIT_PROVIDER));
      if (persistence && options.useGit === false && existingUsesGit) throw taskEnvironmentError('task_environment_plan_mismatch', '现有 Task Environment 使用 Git provider，恢复时不能切换为共享根。', 409, undefined, '按原计划重试 prepare；新放置方式请创建新的正式 Task。');
      if (persistence && options.useGit === true && !existingUsesGit) throw taskEnvironmentError('task_environment_plan_mismatch', '现有 Task Environment 使用共享根，恢复时不能切换为 Git provider。', 409, undefined, '按原计划重试 prepare；新放置方式请创建新的正式 Task。');
      const useGit = persistence ? existingUsesGit : options.useGit !== false && workspaceHasRootGit(root);
      let providerResult = null;
      const storedProvider = useGit ? runtime.readGitWorktreeEvidence(root, taskId, { optional: true }) : null;
      const storedWorkspaceRepository = storedProvider?.evidence.repositories.find((item) => item.selector === 'workspace') || null;
      if (storedProvider && options.branch && options.branch !== storedProvider.evidence.branch) throw taskEnvironmentError('task_environment_plan_mismatch', '恢复参数中的 branch 与现有 Git provider evidence 不一致。', 409);
      if (storedWorkspaceRepository && options.startPoint && options.startPoint !== storedWorkspaceRepository.startPoint) throw taskEnvironmentError('task_environment_plan_mismatch', '恢复参数中的 start point 与现有 Git provider evidence 不一致。', 409);
      const branch = storedProvider?.evidence.branch || options.branch || `codex/${taskId}`;
      const startPoint = storedWorkspaceRepository?.startPoint || options.startPoint || 'HEAD';
      const checkoutRoot = useGit ? path.join(root, '.worktrees', taskId) : null;
      const providerPlan = useGit ? runtime.planGitWorktrees({ workspaceRoot: root, taskId, branch, startPoint, includes: providerIncludes(scopes) }) : null;
      const plannedProvider = providerPlan ? { repositories: providerPlan.repositories, evidencePath: runtime.gitWorktreeEvidencePath(root, taskId) } : null;
      const initialScopes = executionScopes(scopes, root, checkoutRoot, plannedProvider, now());
      assertSharedScopesAvailable(root, taskId, initialScopes);
      const initial = {
        schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
        taskId,
        workspace: { id: runtime.readWorkspaceRecord(root).workspace.id, root },
        controller: persistence?.receipt.controller || { sourceRoot: controller.sourceRoot, cliSource: controller.cliSource, identity: controller.identity, adapter },
        status: 'blocked',
        scopes: initialScopes,
        resources: persistence?.receipt.resources || [],
        latest: { ready: { status: 'blocked', observedAt: now(), diagnostic: '环境准备尚未完成。' }, cleanup: persistence?.receipt.latest.cleanup || null },
        createdAt,
        updatedAt: now(),
      };
      persistence = runtime.writeTaskEnvironmentPersistence(root, initial);
      receiptMutationStarted = true;
      effects.push({ type: persistence.receipt.createdAt === persistence.receipt.updatedAt ? 'receipt-created' : 'receipt-updated', path: persistence.file });
      if (useGit) {
        providerResult = runtime.prepareGitWorktrees({ workspaceRoot: root, taskId, branch, startPoint, includes: providerIncludes(scopes) });
        effects.push(...providerResult.effects.map((effect) => ({ ...effect, provider: GIT_PROVIDER })));
        if (providerResult.status === 'blocked') throw taskEnvironmentError(providerResult.diagnostic?.code || 'task_environment_provider_blocked', providerResult.diagnostic?.message || 'Git worktree provider blocked.', 409, providerResult.diagnostic);
      }
      const withLocations = { ...persistence.receipt, scopes: executionScopes(scopes, root, checkoutRoot, providerResult, now()), updatedAt: now() };
      const foundations = prepareFoundations(withLocations, controller, effects, { mutate: true });
      const resources = observeResources(withLocations);
      const resourcesReady = resources.every((resource) => resource.status !== 'stale');
      const ready = foundations.ready && resourcesReady;
      const diagnostic = foundations.diagnostic || resources.find((resource) => resource.status === 'stale')?.probe.diagnostic || null;
      const finalReceipt = {
        ...withLocations,
        status: ready ? 'ready' : 'blocked',
        scopes: foundations.scopes,
        resources,
        latest: { ...withLocations.latest, ready: { status: ready ? 'ready' : 'blocked', observedAt: now(), diagnostic } },
        updatedAt: now(),
      };
      persistence = runtime.writeTaskEnvironmentPersistence(root, finalReceipt);
      effects.push({ type: 'receipt-updated', path: persistence.file });
      if (!ready) return environmentResult('prepare', 'blocked', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt), { code: 'task_environment_probe_blocked', message: diagnostic }, effects, ['按诊断修复执行基础或 Task-owned 资源后重新运行 prepare。']);
      return environmentResult('prepare', 'ready', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt), null, effects, []);
    } catch (error) {
      if (receiptMutationStarted && persistence && persistence.receipt.status !== 'cleaned') {
        try {
          persistence = runtime.writeTaskEnvironmentPersistence(root, { ...persistence.receipt, status: 'blocked', latest: { ...persistence.receipt.latest, ready: { status: 'blocked', observedAt: now(), diagnostic: error.message } }, updatedAt: now() });
        } catch { /* original error remains authoritative */ }
      }
      return blocked('prepare', root, taskId, error, persistence, effects);
    }
  }

  function inspectTaskEnvironment(targetRoot, taskId) {
    let root = path.resolve(targetRoot);
    let persistence = null;
    try {
      root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(root));
      runtime.readTaskRecordPersistence(root, taskId);
      persistence = runtime.readTaskEnvironmentPersistence(root, taskId, { optional: true });
      if (!persistence) return environmentResult('inspect', 'unavailable', root, taskId, null, null, { code: 'task_environment_no_receipt', message: '当前机器没有该 Task 的 Environment Receipt。' }, [], [`运行 buildr task environment prepare ${taskId}。`]);
      if (persistence.receipt.status === 'cleaned') return environmentResult('inspect', 'cleaned', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt));
      const providerScopes = persistence.receipt.scopes.filter((scope) => scope.provider);
      let providerReady = true;
      let providerDiagnostic = null;
      if (providerScopes.length) {
        const provider = runtime.inspectGitWorktrees({ workspaceRoot: root, taskId });
        providerReady = provider.status === 'ready';
        providerDiagnostic = provider.diagnostic?.message || null;
      }
      const controller = environmentInspector(root, persistence.receipt);
      const foundations = prepareFoundations(persistence.receipt, controller, [], { mutate: false });
      const scopes = foundations.scopes.map((scope) => ({ ...scope }));
      const resources = observeResources(persistence.receipt);
      const resourcesReady = resources.every((resource) => resource.status !== 'stale');
      const observedReceipt = { ...persistence.receipt, scopes, resources };
      const ready = persistence.receipt.status === 'ready' && providerReady && foundations.ready && resourcesReady;
      const resourceDiagnostic = resources.find((resource) => resource.status === 'stale')?.probe.diagnostic || null;
      const diagnostic = ready ? null : {
        code: providerReady ? 'task_environment_drift' : 'task_environment_provider_drift',
        message: providerDiagnostic || foundations.diagnostic || resourceDiagnostic || persistence.receipt.latest.ready.diagnostic || 'Environment 当前不可执行。',
      };
      return environmentResult('inspect', ready ? 'ready' : 'blocked', root, taskId, persistence, taskEnvironmentReadModel(observedReceipt), diagnostic, [], ready ? [] : ['重新运行 prepare 以恢复可确定修复的执行基础。']);
    } catch (error) {
      return blocked('inspect', root, taskId, error, persistence);
    }
  }

  function registerTaskEnvironmentResource(targetRoot, taskId, input) {
    const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(targetRoot));
    const persistence = runtime.readTaskEnvironmentPersistence(root, taskId);
    assertEnvironmentManager(root, persistence.receipt);
    if (persistence.receipt.status !== 'ready') throw taskEnvironmentError('task_environment_not_ready', 'Environment 未 ready，不能登记持久资源。', 409);
    const allowed = new Set(['id', 'kind', 'scope', 'provider', 'identity', 'handle', 'probe']);
    for (const key of Object.keys(input || {})) if (!allowed.has(key)) throw taskEnvironmentError('task_environment_resource_field_forbidden', `资源登记不支持字段：${key}。`, 400, { field: key });
    if (persistence.receipt.resources.some((item) => item.id === input.id)) throw taskEnvironmentError('task_environment_resource_duplicate', `Environment resource 已存在：${input.id}。`, 409);
    if (process.env.BUILDR_FAULT_TASK_ENVIRONMENT_RESOURCE_REGISTER === '1') throw taskEnvironmentError('task_environment_resource_register_injected_failure', 'Injected Task Environment resource registration failure.', 500);
    const timestamp = now();
    const resource = { ...input, status: 'running', registeredAt: timestamp, updatedAt: timestamp };
    const written = runtime.writeTaskEnvironmentPersistence(root, { ...persistence.receipt, resources: [...persistence.receipt.resources, resource], updatedAt: timestamp });
    return { resource: written.receipt.resources.find((item) => item.id === input.id), path: written.file };
  }

  function releaseTaskEnvironmentResource(targetRoot, taskId, input) {
    const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(targetRoot));
    const persistence = runtime.readTaskEnvironmentPersistence(root, taskId);
    assertEnvironmentManager(root, persistence.receipt);
    const allowed = new Set(['id', 'provider', 'probe']);
    for (const key of Object.keys(input || {})) if (!allowed.has(key)) throw taskEnvironmentError('task_environment_resource_field_forbidden', `资源释放不支持字段：${key}。`, 400, { field: key });
    const current = persistence.receipt.resources.find((item) => item.id === input.id);
    if (!current) throw taskEnvironmentError('task_environment_resource_not_found', `Environment resource 不存在：${input.id}。`, 404);
    if (current.provider !== input.provider) throw taskEnvironmentError('task_environment_resource_owner_mismatch', 'Environment resource provider 不匹配。', 409);
    const timestamp = now();
    const resources = persistence.receipt.resources.map((item) => item.id === input.id ? { ...item, status: 'released', probe: input.probe, updatedAt: timestamp } : item);
    const written = runtime.writeTaskEnvironmentPersistence(root, { ...persistence.receipt, resources, updatedAt: timestamp });
    return { resource: written.receipt.resources.find((item) => item.id === input.id), path: written.file };
  }

  async function cleanupTaskEnvironment(targetRoot, taskId, authorization = null) {
    let root = path.resolve(targetRoot);
    let persistence = null;
    let cleanupAuthorized = false;
    let managerAuthorized = false;
    const effects = [];
    try {
      root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(root));
      const task = runtime.readTaskRecordPersistence(root, taskId).record;
      persistence = runtime.readTaskEnvironmentPersistence(root, taskId, { optional: true });
      if (!persistence) return environmentResult('cleanup', 'unavailable', root, taskId, null, null, { code: 'task_environment_no_receipt', message: '当前机器没有可清理的 Environment Receipt。' });
      if (persistence.receipt.status === 'cleaned') return environmentResult('cleanup', 'cleaned', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt));
      const abandon = authorization?.type === 'abandon' || (authorization === null && task.status === 'abandoned');
      const finish = authorization?.type === 'finish' && authorization.deliveries && typeof authorization.deliveries === 'object';
      if (!abandon && !finish) throw taskEnvironmentError('task_environment_cleanup_unauthorized', 'Environment cleanup 需要 Task Finish handoff 或已持久化的明确 abandon 终态。', 409, undefined, '先完成 Task Finish 交付，或明确 abandon Task。');
      cleanupAuthorized = true;
      assertEnvironmentManager(root, persistence.receipt);
      managerAuthorized = true;
      const activeResources = persistence.receipt.resources.filter((resource) => resource.status !== 'released').sort((left, right) => left.id.localeCompare(right.id));
      for (const resource of activeResources) {
        const providerResult = await runtime.cleanupTaskEnvironmentResource(resource, {
          taskId,
          workspaceRoot: root,
          environmentRoot: persistence.receipt.scopes[0].validationRoot,
        });
        const releasedAt = now();
        const resources = persistence.receipt.resources.map((item) => item.id === resource.id ? { ...item, status: 'released', probe: providerResult.probe, updatedAt: releasedAt } : item);
        persistence = runtime.writeTaskEnvironmentPersistence(root, { ...persistence.receipt, resources, updatedAt: releasedAt });
        effects.push({ type: 'resource-released', id: resource.id, provider: resource.provider });
      }
      const hasGit = persistence.receipt.scopes.some((scope) => scope.provider?.capability === GIT_PROVIDER);
      if (hasGit) {
        const provider = runtime.cleanupGitWorktrees({ workspaceRoot: root, taskId, integratedRefs: finish ? authorization.deliveries : {}, allowDirty: abandon });
        effects.push(...provider.effects.map((effect) => ({ ...effect, provider: GIT_PROVIDER })));
        if (provider.status === 'blocked') throw taskEnvironmentError(provider.diagnostic?.code || 'task_environment_provider_cleanup_blocked', provider.diagnostic?.message || 'Git provider cleanup blocked.', 409, provider.diagnostic);
      }
      const retainedSharedScopes = persistence.receipt.scopes.filter((scope) => scope.shared);
      for (const scope of retainedSharedScopes) {
        effects.push({ type: 'shared-scope-retained', selector: scope.selector, executionRoot: scope.executionRoot, reason: 'Task Environment 只解除占用，不推断或回滚共享执行根中的源码归属。' });
      }
      const completedAt = now();
      const retainedSummary = retainedSharedScopes.length ? `共享执行根已保留（${retainedSharedScopes.map((scope) => scope.selector).join('、')}），仅解除 Environment 占用。` : '';
      const summary = `${abandon ? '明确放弃授权下，已清理可证明属于该 Task 的环境资源。' : 'Task Finish handoff 已交付，环境资源已清理或按决定保留。'}${retainedSummary}`;
      persistence = runtime.writeTaskEnvironmentPersistence(root, { ...persistence.receipt, status: 'cleaned', resources: persistence.receipt.resources.map((item) => ({ ...item, status: 'released', updatedAt: completedAt })), latest: { ...persistence.receipt.latest, cleanup: { status: 'cleaned', completedAt, summary } }, updatedAt: completedAt });
      effects.push({ type: 'receipt-finalized', path: persistence.file });
      return environmentResult('cleanup', 'cleaned', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt), null, effects);
    } catch (error) {
      if (persistence && (!cleanupAuthorized || managerAuthorized)) {
        try {
          const completedAt = now();
          persistence = runtime.writeTaskEnvironmentPersistence(root, { ...persistence.receipt, latest: { ...persistence.receipt.latest, cleanup: { status: 'blocked', completedAt, summary: error.message } }, updatedAt: completedAt });
        } catch { /* preserve original diagnostic */ }
      }
      return blocked('cleanup', root, taskId, error, persistence, effects);
    }
  }

  function resolveTaskEnvironmentExecution(targetRoot, taskId) {
    const inspected = inspectTaskEnvironment(targetRoot, taskId);
    if (inspected.status !== 'ready') return { ready: false, blocked: inspected.diagnostic, taskId, environment: inspected.environment, observedAt: inspected.observedAt };
    const persistence = runtime.readTaskEnvironmentPersistence(inspected.environment.workspace.root, taskId);
    const handles = new Map(persistence.receipt.resources.map((resource) => [resource.id, resource.handle]));
    const controller = receiptController(persistence.receipt);
    const candidate = candidateCli(controller, inspected.environment.workspace.root, inspected.environment.scopes[0].validationRoot);
    const providerResult = inspected.environment.scopes.some((scope) => scope.provider) ? runtime.inspectGitWorktrees({ workspaceRoot: inspected.environment.workspace.root, taskId }) : null;
    return {
      ready: true,
      taskId,
      workspaceRoot: inspected.environment.workspace.root,
      environmentRoot: inspected.environment.scopes[0].validationRoot,
      executionRoots: inspected.environment.scopes.map((scope) => scope.executionRoot),
      allowedExecutionRoots: [...new Set(inspected.environment.scopes.flatMap((scope) => [scope.executionRoot, scope.validationRoot]))],
      validationRoot: inspected.environment.scopes[0].validationRoot,
      controller: inspected.environment.controller,
      controllerInvocation: { command: process.execPath, argsPrefix: [persistence.receipt.controller.cliSource], kind: 'stable-controller' },
      cliInvocation: { command: candidate.command, argsPrefix: candidate.argsPrefix, sourceRoot: candidate.sourceRoot, kind: candidate.kind },
      repositories: providerResult?.repositories || [],
      scopes: inspected.environment.scopes,
      resources: inspected.environment.resources.map((resource) => ({ ...resource, handle: handles.get(resource.id) })),
      observedAt: inspected.observedAt,
    };
  }

  function assertTaskEnvironmentController(targetRoot, taskId) {
    const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(targetRoot));
    const persistence = runtime.readTaskEnvironmentPersistence(root, taskId);
    return assertEnvironmentManager(root, persistence.receipt);
  }

  Object.assign(runtime, {
    prepareTaskEnvironment,
    inspectTaskEnvironment,
    cleanupTaskEnvironment,
    registerTaskEnvironmentResource,
    releaseTaskEnvironmentResource,
    resolveTaskEnvironmentExecution,
    assertTaskEnvironmentController,
  });
  return runtime;
}
