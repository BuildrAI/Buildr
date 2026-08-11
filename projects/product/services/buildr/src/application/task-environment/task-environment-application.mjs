import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  TASK_ENVIRONMENT_RECEIPT_SCHEMA,
  taskEnvironmentError,
  taskEnvironmentReadModel,
} from '../../domain/task-environment/task-environment.mjs';
import {
  LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA,
  TASK_ENVIRONMENT_PLAN_REQUEST_SCHEMA,
  normalizeTaskEnvironmentPlan,
  normalizeTaskEnvironmentPlanRequest,
  taskEnvironmentPlanDigest,
} from '../../domain/task-environment/task-environment-plan.mjs';
import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
} from '../../domain/task-environment/project-environment-preparation.mjs';
import { observeGitCheckoutIdentity, sameFilesystemPath, sameGitCheckoutIdentity } from '../../infrastructure/git/checkout-identity.mjs';
import { checkRuntimeAdapter } from '../../infrastructure/runtime/check-runtime.mjs';
import { spawnCommandSync, spawnSync } from '../../infrastructure/process.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';
import { declarationIntakeGapNextAction } from '../declaration-intake/declaration-intake-trigger.mjs';

const GIT_PROVIDER = 'buildr.git-worktree-provider/v1';
const ENVIRONMENT_MANAGER_SOURCE_PATHS = ['bin', 'src', 'package', 'package.json', 'package-lock.json'];

function inside(parent, child) {
  const canonical = (value) => {
    try { return fs.realpathSync(value); } catch { return path.resolve(value); }
  };
  const relative = path.relative(canonical(parent), canonical(child));
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

function fileIdentity(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile()
    ? `sha256-${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
    : null;
}

export function registerTaskEnvironmentApplication(runtime) {
  function candidateController(sourceCheckout, workspaceCheckout) {
    return Boolean(sourceCheckout?.linkedWorktree && workspaceCheckout
      && sameFilesystemPath(sourceCheckout.gitCommonDirectory, workspaceCheckout.gitCommonDirectory));
  }

  function currentEnvironmentManager(workspaceRoot, adapter) {
    const sourceRoot = fs.realpathSync(path.resolve(runtime.productRoot()));
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
    const sourceOutsideCheckout = path.isAbsolute(relativeSource) || relativeSource === '..' || relativeSource.startsWith(`..${path.sep}`);
    const sourceCheckout = sourceOutsideCheckout ? observeGitCheckoutIdentity(manager.sourceRoot) : checkout;
    const sameCheckout = sameGitCheckoutIdentity(sourceCheckout, checkout);
    if (!sourceCheckout || (sourceOutsideCheckout && !sameCheckout)) {
      throw taskEnvironmentError('task_environment_manager_source_untrusted', '无法证明当前 Environment Manager source 属于其 Git checkout。', 409, {
        sourceRoot: manager.sourceRoot,
        checkoutRoot: checkout.checkoutRoot,
      }, '从可信 retained Buildr source 重试。');
    }
    const observed = spawnSync('git', ['-C', manager.sourceRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...ENVIRONMENT_MANAGER_SOURCE_PATHS], { encoding: 'utf8', timeout: 5000 });
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
    if (receipt && (!sameFilesystemPath(receipt.controller.sourceRoot, current.sourceRoot) || receipt.controller.adapter !== current.adapter)) {
      throw taskEnvironmentError('task_environment_manager_mismatch', '当前 Buildr 不是该 Environment Receipt 登记的 retained Environment Manager。', 409, {
        expected: { sourceRoot: receipt.controller.sourceRoot, adapter: receipt.controller.adapter },
        actual: { sourceRoot: current.sourceRoot, adapter: current.adapter },
      }, '回到登记该 Environment 的 canonical retained Buildr source 后重试。');
    }
    return assertEnvironmentManagerSourceClean(current);
  }

  function environmentInspector(_workspaceRoot, receipt) {
    return receiptController(receipt);
  }

  function candidateCli(controller, workspaceRoot, executionRoot, enabled = true) {
    const controllerCheckout = controller.sourceCheckout;
    const workspaceCheckout = controller.workspaceCheckout;
    if (enabled && controllerCheckout && workspaceCheckout && sameFilesystemPath(controllerCheckout.checkoutRoot, workspaceCheckout.checkoutRoot) && inside(workspaceRoot, controller.sourceRoot)) {
      const sourceRoot = path.resolve(executionRoot, path.relative(workspaceRoot, controller.sourceRoot));
      const source = path.join(sourceRoot, 'bin', 'buildr.mjs');
      return {
        sourceRoot,
        source,
        command: process.platform === 'win32' ? process.execPath : path.resolve(sourceRoot, '..', '..', 'buildr'),
        argsPrefix: process.platform === 'win32' ? [source] : [],
        kind: 'task-environment-candidate',
      };
    }
    return { sourceRoot: controller.sourceRoot, source: controller.cliSource, command: process.execPath, argsPrefix: [controller.cliSource], kind: 'stable-controller' };
  }

  function workspaceHasRootGit(workspaceRoot) {
    const result = spawnSync('git', ['-C', workspaceRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return result.status === 0 && sameFilesystemPath(result.stdout.trim(), workspaceRoot);
  }

  function taskScopes(workspaceRoot, task) {
    const projects = runtime.readProjectRegistryRecord(workspaceRoot);
    if (projects.registry.migrationRequired) throw taskEnvironmentError('task_environment_project_registry_migration_required', 'Project registry 需要先完成 canonical 迁移。', 409, undefined, '从 retained Workspace 运行 buildr sync。');
    const scopes = [{ selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', sourceType: workspaceHasRootGit(workspaceRoot) ? 'git' : 'workspace' }];
    const seen = new Set(['workspace']);
    const serviceRegistries = new Map();
    const serviceRegistry = (projectCode) => {
      if (!serviceRegistries.has(projectCode)) serviceRegistries.set(projectCode, runtime.readServiceRegistryRecord(workspaceRoot, projectCode));
      return serviceRegistries.get(projectCode);
    };
    const addProject = (projectCode) => {
      const project = projects.projects[projectCode];
      if (!project) throw taskEnvironmentError('task_environment_project_not_found', `Project 不存在：${projectCode}。`, 409, { project: projectCode });
      const selector = `project:${projectCode}`;
      if (!seen.has(selector)) scopes.push({ selector, kind: 'project', project: projectCode, service: null, sourcePath: project.source.path, sourceType: project.source.type });
      seen.add(selector);
      return project;
    };
    const addService = (projectCode, serviceCode) => {
      const project = addProject(projectCode);
      const services = serviceRegistry(projectCode);
      const service = services.services[serviceCode];
      if (!service) throw taskEnvironmentError('task_environment_service_not_found', `Service 不存在：${projectCode}/${serviceCode}。`, 409, { project: projectCode, service: serviceCode });
      const selector = `service:${projectCode}/${serviceCode}`;
      if (!seen.has(selector)) scopes.push({ selector, kind: 'service', project: projectCode, service: serviceCode, sourcePath: service.source.path, sourceType: service.source.type || project.source.type });
      seen.add(selector);
    };
    for (const projectCode of new Set([...task.scope.projects, ...task.changes.map((reference) => reference.project)])) {
      addProject(projectCode);
    }
    for (const reference of task.scope.services) {
      addService(reference.project, reference.service);
    }
    return { scopes };
  }

  function preparationScopeSelectors(scopes) {
    return scopes.filter((scope) => scope.kind === 'project' || scope.kind === 'service').map((scope) => scope.selector);
  }

  function legacyPlanRequest(input, scopes) {
    const serviceSelectors = scopes.filter((scope) => scope.kind === 'service').map((scope) => scope.selector);
    const legacy = normalizeTaskEnvironmentPlan(input, { serviceSelectors });
    const byProject = new Map();
    for (const scope of scopes.filter((item) => item.kind === 'project' || item.kind === 'service')) {
      const project = scope.project;
      if (!byProject.has(project)) byProject.set(project, { project, source: { kind: 'task-inline' }, scopes: [] });
      if (scope.kind === 'project') {
        byProject.get(project).scopes.push({ selector: scope.selector, disposition: 'not-applicable', reason: legacy.notApplicableReason || 'Legacy inline Plan did not declare Project-wide preparation.' });
        continue;
      }
      const service = legacy.services.find((item) => item.selector === scope.selector);
      byProject.get(project).scopes.push(service?.disposition === 'required'
        ? { selector: scope.selector, disposition: 'required', reason: 'Explicit legacy Task inline Plan.', recipes: [{ id: `task-inline-${scope.service}`, title: null, required: true, steps: service.steps }] }
        : { selector: scope.selector, disposition: 'not-applicable', reason: service?.reason || 'Legacy inline Plan declared no Service preparation.' });
    }
    const projects = [...byProject.values()];
    return { schemaVersion: TASK_ENVIRONMENT_PLAN_REQUEST_SCHEMA, ...(projects.length ? {} : { notApplicableReason: legacy.notApplicableReason }), projects };
  }

  function resolveTaskEnvironmentPlanRequest(input, scopePlan, currentScopes, workspaceRoot) {
    if (!input) return null;
    const requestInput = input.schemaVersion === LEGACY_TASK_ENVIRONMENT_PLAN_SCHEMA ? legacyPlanRequest(input, scopePlan.scopes) : input;
    const selectors = preparationScopeSelectors(scopePlan.scopes);
    const request = normalizeTaskEnvironmentPlanRequest(requestInput, { scopeSelectors: selectors });
    const execution = new Map(currentScopes.map((scope) => [scope.selector, scope]));
    const projects = request.projects.map((requested) => {
      const projectServices = scopePlan.scopes
        .filter((scope) => scope.kind === 'service' && scope.project === requested.project)
        .map((scope) => scope.service);
      const intakeNextAction = declarationIntakeGapNextAction({ kind: 'environment', project: requested.project, services: projectServices });
      const projectScope = execution.get(`project:${requested.project}`);
      if (!projectScope) throw taskEnvironmentError('task_environment_plan_scope_incomplete', `Plan Project不属于Task：${requested.project}。`, 409, { project: requested.project });
      let declaration = null;
      let source;
      if (requested.source.kind === 'project-declaration') {
        const declarationFile = path.join(projectScope.executionRoot, 'preparation.yml');
        if (!fs.existsSync(declarationFile)) throw taskEnvironmentError('project_environment_preparation_missing', `Project ${requested.project} 缺少preparation.yml。`, 409, { project: requested.project, path: path.join(projectScope.sourcePath, 'preparation.yml') }, `${intakeNextAction} 当前Task也可由Agent显式提交task-inline Plan。`);
        const serviceRegistry = runtime.readServiceRegistryRecord(workspaceRoot, requested.project);
        try {
          declaration = normalizeProjectEnvironmentPreparation(parseProjectEnvironmentPreparation(fs.readFileSync(declarationFile, 'utf8'), path.join(projectScope.sourcePath, 'preparation.yml')), {
            projectCode: requested.project,
            services: Object.keys(serviceRegistry.services || {}),
          });
        } catch (error) {
          if (!error.nextAction) error.nextAction = intakeNextAction;
          throw error;
        }
        if (requested.source.identity && requested.source.identity !== declaration.identity) throw taskEnvironmentError('project_environment_preparation_stale', `Project ${requested.project} Preparation Declaration identity已漂移。`, 409, { expected: requested.source.identity, actual: declaration.identity, project: requested.project }, intakeNextAction);
        source = { kind: 'project-declaration', path: path.join(projectScope.sourcePath, 'preparation.yml').split(path.sep).join('/'), identity: declaration.identity };
      } else source = { kind: 'task-inline', path: null, identity: null };
      const scopes = requested.scopes.map((scopeRequest) => {
        if (scopeRequest.disposition === 'not-applicable') return { selector: scopeRequest.selector, disposition: scopeRequest.disposition, reason: scopeRequest.reason, recipes: [] };
        let recipes;
        if (declaration) {
          recipes = scopeRequest.recipeIds.map((recipeId) => {
            const recipe = declaration.recipes.find((candidate) => candidate.id === recipeId);
            if (!recipe) throw taskEnvironmentError('project_environment_preparation_recipe_missing', `Preparation Recipe不存在：${requested.project}/${recipeId}。`, 409, { project: requested.project, recipe: recipeId }, intakeNextAction);
            const selector = projectEnvironmentPreparationScopeSelector(requested.project, recipe);
            if (selector !== scopeRequest.selector) throw taskEnvironmentError('project_environment_preparation_recipe_scope_mismatch', `Recipe ${recipeId}不适用于${scopeRequest.selector}。`, 409, { recipe: recipeId, expected: selector, actual: scopeRequest.selector }, intakeNextAction);
            return { id: recipe.id, title: recipe.title, required: recipe.required, steps: recipe.steps, identity: recipe.identity };
          });
        } else {
          const inlineValues = scopeRequest.recipes.map((recipe, index) => {
            const allowed = new Set(['id', 'title', 'required', 'steps']);
            for (const key of Object.keys(recipe || {})) if (!allowed.has(key)) throw taskEnvironmentError('task_environment_plan_field_forbidden', `Inline Recipe不支持字段：${key}。`, 409, { field: `recipes[${index}].${key}` });
            const match = /^(project|service):([^/]+)(?:\/(.+))?$/.exec(scopeRequest.selector);
            return { ...recipe, scope: match[1] === 'project' ? { kind: 'project' } : { kind: 'service', service: match[3] } };
          });
          const services = scopePlan.scopes.filter((scope) => scope.project === requested.project && scope.kind === 'service').map((scope) => scope.service);
          const normalizedInline = normalizeProjectEnvironmentPreparation({ schemaVersion: 'buildr.project-environment-preparation/v1', recipes: inlineValues }, { projectCode: requested.project, services });
          recipes = normalizedInline.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title, required: recipe.required, steps: recipe.steps, identity: recipe.identity }));
        }
        return { selector: scopeRequest.selector, disposition: scopeRequest.disposition, reason: scopeRequest.reason, recipes };
      });
      return { project: requested.project, source, scopes };
    });
    const payload = { schemaVersion: 'buildr.task-environment-plan/v2', ...(request.notApplicableReason ? { notApplicableReason: request.notApplicableReason } : {}), projects };
    return normalizeTaskEnvironmentPlan({ ...payload, identity: taskEnvironmentPlanDigest(payload) }, { scopeSelectors: selectors });
  }

  function providerIncludes(scopes) {
    return scopes.filter((scope) => scope.selector !== 'workspace' && scope.sourceType === 'git').map((scope) => scope.selector);
  }

  function executionScopes(scopes, workspaceRoot, checkoutRoot, providerResult, observedAt, currentScopes = []) {
    const repositories = new Map((providerResult?.repositories || []).map((item) => [item.selector, item]));
    const current = new Map(currentScopes.map((scope) => [scope.selector, scope]));
    return scopes.map((scope) => {
      const repository = repositories.get(scope.selector);
      const saved = current.get(scope.selector);
      const root = repository?.checkoutPath || saved?.executionRoot || path.resolve(checkoutRoot || workspaceRoot, scope.sourcePath);
      const validationRoot = checkoutRoot || saved?.validationRoot || workspaceRoot;
      const provider = repository ? { capability: GIT_PROVIDER, selector: scope.selector, evidence: providerResult.evidencePath } : null;
      return {
        selector: scope.selector,
        kind: scope.kind,
        project: scope.project,
        service: scope.service,
        sourcePath: scope.sourcePath,
        executionRoot: root,
        validationRoot,
        shared: repository ? false : saved?.shared ?? !checkoutRoot,
        provider: provider || saved?.provider || null,
        runtime: probe('blocked', null, '尚未探测 Runtime。', observedAt),
        cli: probe('blocked', null, '尚未探测 Workspace CLI。', observedAt),
        preparation: probe('blocked', null, '尚未探测环境准备计划。', observedAt),
        projection: probe('blocked', null, '尚未探测 Agent runtime projection。', observedAt),
      };
    });
  }

  function assertSharedScopesAvailable(workspaceRoot, taskId, scopes) {
    const requested = scopes.filter((scope) => scope.shared);
    if (!requested.length) return;
    if (typeof runtime.openWorkspaceStructuredStore !== 'function') return;
    let opened;
    try {
      opened = runtime.openWorkspaceStructuredStore(workspaceRoot, { writable: false });
      if (!opened.present || opened.version < 8) return;
      const taskIds = opened.database.prepare('SELECT task_id FROM task_environment_current WHERE task_id <> ? ORDER BY task_id').all(taskId).map((entry) => entry.task_id);
      for (const otherTaskId of taskIds) {
      let other;
      try { other = runtime.readTaskEnvironmentPersistence(workspaceRoot, otherTaskId, { optional: true }); } catch (error) {
        throw taskEnvironmentError('task_environment_shared_occupancy_unreadable', `无法确认共享执行根是否被 Task ${otherTaskId} 占用：${error.message}`, 409, { taskId: otherTaskId, locator: runtime.taskEnvironmentPath(workspaceRoot, otherTaskId) }, '先修复该 Task 的 Environment current，再重试。');
      }
      if (!other || other.receipt.status === 'cleaned') continue;
      for (const ownScope of requested) {
        const conflict = other.receipt.scopes.find((candidate) => candidate.shared && (inside(candidate.executionRoot, ownScope.executionRoot) || inside(ownScope.executionRoot, candidate.executionRoot)));
        if (conflict) {
          throw taskEnvironmentError('task_environment_shared_occupancy_conflict', `共享执行根已由 Task ${otherTaskId} 占用。`, 409, {
            requested: { taskId, selector: ownScope.selector, executionRoot: ownScope.executionRoot },
            occupied: { taskId: otherTaskId, selector: conflict.selector, executionRoot: conflict.executionRoot },
          }, `先完成或放弃 Task ${otherTaskId} 并清理其 Environment。`);
        }
      }
      }
    } finally {
      try { opened?.database?.close(); } catch {}
    }
  }

  function executableIdentity(executable) {
    try {
      const stat = fs.statSync(executable);
      if (!stat.isFile()) return null;
      const payload = [fs.realpathSync(executable), stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.mode];
      return `sha256-${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    } catch {
      return null;
    }
  }

  function resolveExecutable(step, scopeRoot, projectRoot, serviceRoot, workspaceNode) {
    if (step.executable.kind === 'workspace-foundation') {
      const executables = {
        node: workspaceNode?.executable,
        npm: workspaceNode?.npmExecutable,
        npx: workspaceNode?.paths?.npx,
      };
      const executable = executables[step.executable.name];
      if (!executable) throw taskEnvironmentError('task_environment_plan_foundation_unknown', `Workspace Foundation 未提供可执行项：${step.executable.name}。`, 409, { name: step.executable.name });
      return executable;
    }
    if (step.executable.kind === 'absolute') return step.executable.path;
    const executableRoot = step.executable.kind === 'project' ? projectRoot : serviceRoot;
    if (!executableRoot) throw taskEnvironmentError('task_environment_plan_executable_scope_invalid', `${step.executable.kind} executable不适用于当前Recipe scope。`, 409, { kind: step.executable.kind });
    const executable = path.resolve(executableRoot, step.executable.path);
    if (!inside(executableRoot, executable)) throw taskEnvironmentError('task_environment_plan_path_invalid', `Recipe executable 越出执行根：${step.executable.path}。`, 409, { executable, executableRoot });
    try {
      const real = fs.realpathSync(executable);
      if (!inside(fs.realpathSync(executableRoot), real)) throw new Error('real path escapes Recipe executable root');
    } catch (error) {
      if (fs.existsSync(executable)) throw taskEnvironmentError('task_environment_plan_executable_untrusted', `Recipe executable 不可信：${executable}（${error.message}）。`, 409, { executable });
    }
    return executable;
  }

  function observeOutput(scopeRoot, output) {
    const target = path.resolve(scopeRoot, output.path);
    if (!inside(scopeRoot, target)) return { path: target, kind: output.kind, status: 'blocked', diagnostic: '输出路径越出 Recipe execution root。' };
    if (!fs.existsSync(target)) return { path: target, kind: output.kind, status: 'missing', diagnostic: `准备输出不存在：${target}` };
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) return { path: target, kind: output.kind, status: 'blocked', diagnostic: `准备输出不得是符号链接：${target}` };
      if (!inside(fs.realpathSync(scopeRoot), fs.realpathSync(target))) return { path: target, kind: output.kind, status: 'blocked', diagnostic: `准备输出真实路径越出 Recipe execution root：${target}` };
      const valid = output.kind === 'directory' ? stat.isDirectory() : stat.isFile() && (output.kind !== 'executable' || process.platform === 'win32' || Boolean(stat.mode & 0o111));
      return valid
        ? { path: target, kind: output.kind, status: 'ready', diagnostic: null }
        : { path: target, kind: output.kind, status: 'blocked', diagnostic: `准备输出类型不匹配：${target}` };
    } catch (error) {
      return { path: target, kind: output.kind, status: 'blocked', diagnostic: error.message };
    }
  }

  function plannedSteps(receipt, workspaceNode) {
    if (!receipt.preparationPlan) return [];
    const scopes = new Map(receipt.scopes.map((scope) => [scope.selector, scope]));
    return receipt.preparationPlan.projects.flatMap((project) => project.scopes.flatMap((plannedScope) => {
      const scope = scopes.get(plannedScope.selector);
      const projectScope = scopes.get(`project:${project.project}`);
      if (!scope || !projectScope) throw taskEnvironmentError('task_environment_preparation_scope_invalid', `Environment Plan scope没有执行根：${plannedScope.selector}。`, 409, { selector: plannedScope.selector });
      const serviceRoot = scope.kind === 'service' ? scope.executionRoot : null;
      return plannedScope.recipes.flatMap((recipe) => recipe.steps.map((step) => ({
        ...step,
        id: `${plannedScope.selector}/${recipe.id}/${step.id}`,
        scope: plannedScope.selector,
        recipe: recipe.id,
        recipeRequired: recipe.required,
        scopeRoot: scope.executionRoot,
        projectRoot: projectScope.executionRoot,
        serviceRoot,
        cwd: path.resolve(scope.executionRoot, step.cwd),
        executablePath: resolveExecutable(step, scope.executionRoot, projectScope.executionRoot, serviceRoot, workspaceNode),
      })));
    }));
  }

  function observePreparationStep(planned, saved = null, prepared = null) {
    const observedAt = now();
    const executable = planned.executablePath;
    const currentExecutableIdentity = executableIdentity(executable);
    const preparedExecutableIdentity = prepared?.executableIdentity ?? saved?.preparedExecutableIdentity ?? null;
    const inputs = planned.inputs.map((relative) => {
      const target = path.resolve(planned.scopeRoot, relative);
      return {
        path: target,
        identity: inside(planned.scopeRoot, target) ? fileIdentity(target) : null,
        preparedIdentity: prepared?.inputIdentities?.get(target) ?? saved?.inputs?.find((input) => input.path === target)?.preparedIdentity ?? null,
      };
    });
    const outputs = planned.outputs.map((output) => observeOutput(planned.scopeRoot, output));
    let status = 'ready';
    let diagnostic = null;
    if (!inside(planned.scopeRoot, planned.cwd)) {
      status = 'blocked'; diagnostic = `Step cwd 越出 Recipe execution root：${planned.cwd}`;
    } else if (!fs.existsSync(planned.cwd) || !fs.statSync(planned.cwd).isDirectory()) {
      status = 'missing'; diagnostic = `Step cwd 不存在：${planned.cwd}`;
    } else if (!currentExecutableIdentity) {
      status = 'missing'; diagnostic = `Step executable 不存在或不是文件：${executable}`;
    } else if (inputs.some((input) => !input.identity)) {
      status = 'missing'; diagnostic = `Step input 不存在：${inputs.find((input) => !input.identity).path}`;
    } else if (!preparedExecutableIdentity || inputs.some((input) => !input.preparedIdentity)) {
      status = 'blocked'; diagnostic = `Step 尚未由 Task Environment prepare：${planned.id}`;
    } else if (preparedExecutableIdentity !== currentExecutableIdentity || inputs.some((input) => input.identity !== input.preparedIdentity)) {
      status = 'drifted'; diagnostic = `Step executable 或 input 已漂移：${planned.id}`;
    } else if (outputs.some((output) => output.status !== 'ready')) {
      const output = outputs.find((item) => item.status !== 'ready');
      status = output.status === 'missing' ? 'missing' : 'blocked'; diagnostic = output.diagnostic;
    }
    return {
      id: planned.id,
      scope: planned.scope,
      recipe: planned.recipe,
      required: planned.required,
      executed: Boolean(prepared?.executed),
      cwd: planned.cwd,
      executable,
      executableIdentity: currentExecutableIdentity,
      preparedExecutableIdentity,
      inputs,
      outputs,
      status,
      observedAt,
      diagnostic,
    };
  }

  function prepareSteps(receipt, workspaceNode, effects, { mutate, onStep = null }) {
    const saved = new Map((receipt.preparationSteps || []).map((step) => [step.id, step]));
    const blockedServices = new Set();
    const observed = [];
    for (const planned of plannedSteps(receipt, workspaceNode)) {
      let step = observePreparationStep(planned, saved.get(planned.id));
      if (blockedServices.has(planned.scope)) {
        step = { ...step, status: 'blocked', observedAt: now(), diagnostic: `前序 required Step 失败，未执行：${planned.id}` };
      } else if (mutate && step.status !== 'ready' && step.executableIdentity && step.inputs.every((input) => input.identity)) {
        const result = spawnCommandSync(step.executable, planned.args, {
          cwd: step.cwd,
          encoding: 'utf8',
          env: planned.executable.kind === 'workspace-foundation' ? workspaceNode.environment : process.env,
          timeout: planned.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
        });
        if (result.status !== 0) {
          const output = (result.stderr || result.stdout || 'preparation command failed').trim().slice(0, 2000);
          step = { ...step, executed: true, status: 'failed', observedAt: now(), diagnostic: `${planned.scope} Step ${planned.id} 失败（exit ${result.status ?? 'unknown'}）：${output}` };
        } else {
          step = observePreparationStep(planned, null, {
            executableIdentity: executableIdentity(step.executable),
            inputIdentities: new Map(step.inputs.map((input) => [input.path, fileIdentity(input.path)])),
            executed: true,
          });
          if (step.status !== 'ready') step = { ...step, status: 'failed', diagnostic: `Step 执行成功但输出未 ready：${step.diagnostic}` };
          effects.push({ type: 'preparation-step-executed', id: planned.id, scope: planned.scope, recipe: planned.recipe, cwd: planned.cwd, executable: step.executable, status: step.status });
        }
      }
      observed.push(step);
      if (step.required && step.status !== 'ready') blockedServices.add(planned.scope);
      if (onStep) onStep(observed);
    }
    return observed;
  }

  function observePreparationDeclarations(receipt) {
    return (receipt.preparationPlan?.projects || []).map((project) => {
      const observedAt = now();
      if (project.source.kind === 'task-inline') return { project: project.project, source: 'task-inline', path: null, identity: null, preparedIdentity: null, status: 'ready', observedAt, diagnostic: null };
      const declarationFile = path.resolve(receipt.scopes[0].validationRoot, project.source.path);
      if (!inside(receipt.scopes[0].validationRoot, declarationFile) || !fs.existsSync(declarationFile)) return { project: project.project, source: project.source.kind, path: declarationFile, identity: null, preparedIdentity: project.source.identity, status: 'missing', observedAt, diagnostic: `Preparation Declaration不存在：${declarationFile}` };
      try {
        const registry = runtime.readServiceRegistryRecord(receipt.workspace.root, project.project);
        const current = normalizeProjectEnvironmentPreparation(parseProjectEnvironmentPreparation(fs.readFileSync(declarationFile, 'utf8'), project.source.path), { projectCode: project.project, services: Object.keys(registry.services || {}) });
        return { project: project.project, source: project.source.kind, path: declarationFile, identity: current.identity, preparedIdentity: project.source.identity, status: current.identity === project.source.identity ? 'ready' : 'drifted', observedAt, diagnostic: current.identity === project.source.identity ? null : `Preparation Declaration已漂移：${project.project}` };
      } catch (error) {
        return { project: project.project, source: project.source.kind, path: declarationFile, identity: null, preparedIdentity: project.source.identity, status: 'blocked', observedAt, diagnostic: error.message };
      }
    });
  }

  function aggregatePreparation(receipt, preparationSteps, declarations = observePreparationDeclarations(receipt)) {
    const declarationByProject = new Map(declarations.map((item) => [item.project, item]));
    const recipes = (receipt.preparationPlan?.projects || []).flatMap((project) => project.scopes.flatMap((plannedScope) => plannedScope.recipes.map((recipe) => {
      const declaration = declarationByProject.get(project.project);
      const stepIds = recipe.steps.map((step) => `${plannedScope.selector}/${recipe.id}/${step.id}`);
      const steps = preparationSteps.filter((step) => step.recipe === recipe.id && step.scope === plannedScope.selector);
      const missingStep = stepIds.find((id) => !steps.some((step) => step.id === id));
      const blockedStep = steps.find((step) => step.required && step.status !== 'ready');
      const blockedDeclaration = declaration?.status !== 'ready' ? declaration : null;
      return {
        id: `${plannedScope.selector}/${recipe.id}`,
        project: project.project,
        scope: plannedScope.selector,
        recipe: recipe.id,
        source: project.source.kind,
        required: recipe.required,
        identity: blockedDeclaration ? null : recipe.identity,
        preparedIdentity: recipe.identity,
        status: blockedDeclaration || missingStep || blockedStep ? 'blocked' : 'ready',
        stepIds: steps.map((step) => step.id),
        observedAt: steps.reduce((latest, step) => step.observedAt > latest ? step.observedAt : latest, declaration?.observedAt || now()),
        diagnostic: blockedDeclaration?.diagnostic || (missingStep ? `尚未观察 Preparation Step：${missingStep}` : blockedStep ? `${blockedStep.id}: ${blockedStep.diagnostic}` : null),
      };
    })));
    const preparationScopes = (receipt.preparationPlan?.projects || []).flatMap((project) => project.scopes.map((planned) => {
      if (planned.disposition === 'not-applicable') return { selector: planned.selector, disposition: planned.disposition, status: 'not-applicable', recipeIds: [], observedAt: now(), diagnostic: planned.reason };
      const selected = recipes.filter((recipe) => recipe.scope === planned.selector);
      const blockedRecipe = selected.find((recipe) => recipe.required && recipe.status !== 'ready');
      return { selector: planned.selector, disposition: planned.disposition, status: blockedRecipe ? 'blocked' : 'ready', recipeIds: selected.map((recipe) => recipe.id), observedAt: selected.reduce((latest, recipe) => recipe.observedAt > latest ? recipe.observedAt : latest, now()), diagnostic: blockedRecipe ? `${blockedRecipe.id}: ${blockedRecipe.diagnostic}` : null };
    }));
    const scopes = receipt.scopes.map((scope) => {
      const relevant = preparationScopes.filter((item) => scope.kind === 'workspace' || (scope.kind === 'project' && (item.selector === scope.selector || item.selector.startsWith(`service:${scope.project}/`))) || item.selector === scope.selector);
      if (!relevant.length) return { ...scope, preparation: probe('not-applicable', null, null) };
      const blockedScope = relevant.find((item) => item.status === 'blocked');
      const preparationIdentity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(relevant.map((item) => [item.selector, item.status, ...item.recipeIds]))).digest('hex')}`;
      return { ...scope, preparation: blockedScope ? probe('blocked', preparationIdentity, `${blockedScope.selector}: ${blockedScope.diagnostic}`, blockedScope.observedAt) : probe('ready', preparationIdentity, null) };
    });
    return { scopes, declarations, preparationScopes, recipes };
  }

  function preparationDeclarationGapActions(declarations, scopePlan) {
    return declarations
      .filter((declaration) => declaration.source === 'project-declaration' && declaration.status !== 'ready')
      .sort((left, right) => left.project.localeCompare(right.project))
      .map((declaration) => declarationIntakeGapNextAction({
        kind: 'environment',
        project: declaration.project,
        services: scopePlan.scopes.filter((scope) => scope.kind === 'service' && scope.project === declaration.project).map((scope) => scope.service),
        scopes: [`project:${declaration.project}`],
      }));
  }

  function pendingPreparationFacts(plan, currentScopes = [], diagnostic = '尚未 prepare。') {
    const validationRoot = currentScopes[0]?.validationRoot || null;
    const declarations = (plan?.projects || []).map((project) => ({ project: project.project, source: project.source.kind, path: project.source.path && validationRoot ? path.resolve(validationRoot, project.source.path) : null, identity: project.source.identity, preparedIdentity: project.source.identity, status: project.source.kind === 'task-inline' ? 'ready' : 'blocked', observedAt: now(), diagnostic: project.source.kind === 'task-inline' ? null : diagnostic }));
    const preparationScopes = (plan?.projects || []).flatMap((project) => project.scopes.map((scope) => ({ selector: scope.selector, disposition: scope.disposition, status: scope.disposition === 'not-applicable' ? 'not-applicable' : 'blocked', recipeIds: [], observedAt: now(), diagnostic: scope.reason || diagnostic })));
    const recipes = (plan?.projects || []).flatMap((project) => project.scopes.flatMap((scope) => scope.recipes.map((recipe) => ({ id: `${scope.selector}/${recipe.id}`, project: project.project, scope: scope.selector, recipe: recipe.id, source: project.source.kind, required: recipe.required, identity: recipe.identity, preparedIdentity: recipe.identity, status: 'blocked', stepIds: [], observedAt: now(), diagnostic }))));
    return { declarations, preparationScopes, recipes };
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

  function probeCandidateProjection(adapter, validationRoot, cli, workspaceNode) {
    const result = spawnSync(cli.command, [...cli.argsPrefix, 'runtime', 'check', adapter, '--target', validationRoot, '--scope', '.'], {
      cwd: validationRoot,
      encoding: 'utf8',
      env: workspaceNode?.environment || process.env,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const identity = /^Projection identity:\s*(\S+)\s*$/m.exec(result.stdout || '')?.[1] || null;
    if (result.status !== 0 || !identity) {
      return probe('blocked', identity, (result.stderr || result.stdout || 'Candidate runtime check failed.').trim().slice(0, 2000));
    }
    return probe('ready', identity);
  }

  function prepareProjection(adapter, validationRoot, cli, workspaceNode, effects) {
    const check = runtime.checkRuntimeAdapter || checkRuntimeAdapter;
    let checked = check(['--target', validationRoot, '--scope', '.'], { repoRoot: validationRoot, adapterId: adapter, command: `buildr runtime check ${adapter}` });
    if (cli.kind === 'task-environment-candidate') {
      try {
        const rendered = spawnSync(cli.command, [...cli.argsPrefix, 'sync', adapter, '--target', validationRoot], { cwd: validationRoot, encoding: 'utf8', env: workspaceNode?.environment || process.env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
        if (rendered.status !== 0) return probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, (rendered.stderr || rendered.stdout || 'Candidate runtime projection failed.').trim().slice(0, 2000));
        effects.push({ type: 'runtime-projected', adapter, target: validationRoot, source: cli.kind });
        return probeCandidateProjection(adapter, validationRoot, cli, workspaceNode);
      } catch (error) {
        return probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, error.message);
      }
    }
    if (!checked.runtimeSourceEvidence?.projectionReady) {
      try {
        runtime.renderRuntime(adapter, ['--target', validationRoot], { productSkill: true });
        effects.push({ type: 'runtime-projected', adapter, target: validationRoot, source: cli.kind });
        checked = check(['--target', validationRoot, '--scope', '.'], { repoRoot: validationRoot, adapterId: adapter, command: `buildr runtime check ${adapter}` });
      } catch (error) {
        return probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, error.message);
      }
    }
    return checked.runtimeSourceEvidence?.projectionReady ? probe('ready', checked.runtimeSourceEvidence.projectionIdentity) : probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, 'Agent runtime projection 未就绪。');
  }

  function observeProjection(adapter, validationRoot, cli, workspaceNode) {
    try {
      if (cli.kind === 'task-environment-candidate') return probeCandidateProjection(adapter, validationRoot, cli, workspaceNode);
      const check = runtime.checkRuntimeAdapter || checkRuntimeAdapter;
      const checked = check(['--target', validationRoot, '--scope', '.'], { repoRoot: validationRoot, adapterId: adapter, command: `buildr runtime check ${adapter}` });
      return checked.runtimeSourceEvidence?.projectionReady ? probe('ready', checked.runtimeSourceEvidence.projectionIdentity) : probe('blocked', checked.runtimeSourceEvidence?.projectionIdentity || null, 'Agent runtime projection 已漂移或不完整。');
    } catch (error) {
      return probe('blocked', null, error.message);
    }
  }

  function planOwnsCandidateController(receipt, controller) {
    if (!receipt.preparationPlan || !inside(receipt.workspace.root, controller.sourceRoot)) return false;
    const sourcePath = path.relative(receipt.workspace.root, controller.sourceRoot).split(path.sep).join('/');
    const planned = new Set(receipt.preparationPlan.projects.flatMap((project) => project.scopes.map((scope) => scope.selector)));
    return receipt.scopes.some((scope) => scope.kind === 'service' && scope.sourcePath === sourcePath && planned.has(scope.selector));
  }

  function prepareFoundations(receipt, controller, effects, { mutate, onStep = null }) {
    const validationRoot = receipt.scopes[0].validationRoot;
    const workspaceNode = runtime.workspaceNodeExecution(validationRoot);
    const runtimeProbe = workspaceNode.ready ? probe('ready', workspaceNode.identity.digest) : probe('blocked', workspaceNode.identity?.digest || null, workspaceNode.diagnostic || 'Workspace Node 未就绪。');
    const cli = candidateCli(controller, receipt.workspace.root, validationRoot, planOwnsCandidateController(receipt, controller));
    if (!receipt.preparationPlan) {
      const diagnostic = 'Task 尚未登记 Environment Preparation Plan。';
      const scopes = receipt.scopes.map((scope) => ({ ...scope, runtime: runtimeProbe, cli: probe('blocked', null, diagnostic), preparation: probe('blocked', null, diagnostic), projection: probe('blocked', null, diagnostic) }));
      return { scopes, preparationDeclarations: [], preparationScopes: [], preparationRecipes: [], preparationSteps: [], ready: false, diagnostic, cli };
    }
    const declarations = observePreparationDeclarations(receipt);
    const declarationBlocked = declarations.find((declaration) => declaration.status !== 'ready');
    const preparationSteps = declarationBlocked ? (receipt.preparationSteps || []).map((step) => ({ ...step, executed: false })) : prepareSteps(receipt, workspaceNode, effects, { mutate, onStep });
    const aggregated = aggregatePreparation(receipt, preparationSteps, declarations);
    let scopes = aggregated.scopes;
    const preparationBlocked = aggregated.preparationScopes.some((scope) => scope.status === 'blocked');
    const cliProbe = preparationBlocked ? probe('blocked', null, '必需环境准备 Step 未就绪，跳过 CLI probe。') : probeCli(cli, validationRoot, workspaceNode);
    const projection = preparationBlocked
      ? probe('blocked', null, '环境准备未就绪，跳过 runtime projection。')
      : mutate
        ? prepareProjection(controller.adapter, validationRoot, cli, workspaceNode, effects)
        : observeProjection(controller.adapter, validationRoot, cli, workspaceNode);
    scopes = scopes.map((scope) => ({ ...scope, runtime: runtimeProbe, cli: cliProbe, projection }));
    const ready = scopes.every((scope) => [scope.runtime, scope.cli, scope.preparation, scope.projection].every((item) => item.status !== 'blocked'));
    const blockedScope = aggregated.preparationScopes.find((scope) => scope.status === 'blocked');
    const diagnostic = ready ? null : blockedScope
      ? `${blockedScope.selector}: ${blockedScope.diagnostic}`
      : scopes.flatMap((scope) => [scope.runtime, scope.cli, scope.preparation, scope.projection].filter((item) => item.status === 'blocked').map((item) => `${scope.selector}: ${item.diagnostic}`))[0];
    return { scopes, preparationDeclarations: aggregated.declarations, preparationScopes: aggregated.preparationScopes, preparationRecipes: aggregated.recipes, preparationSteps, ready, diagnostic, cli };
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

  function environmentResult(operation, status, targetRoot, taskId, persistence = null, environment = null, diagnostic = null, effects = [], nextActions = [], observedAt = now(), persist = operation !== 'inspect') {
    let execution = null;
    if (status === 'ready' && persistence && environment) {
      const controller = receiptController(persistence.receipt);
      const cli = candidateCli(controller, environment.workspace.root, environment.scopes[0].validationRoot, planOwnsCandidateController(persistence.receipt, controller));
      execution = {
        ready: true,
        workdir: environment.scopes[0].validationRoot,
        executionRoots: environment.scopes.map((scope) => scope.executionRoot),
        allowedExecutionRoots: [...new Set(environment.scopes.flatMap((scope) => [scope.executionRoot, scope.validationRoot]))],
        controller: { identity: environment.controller.identity, adapter: environment.controller.adapter },
        cliInvocation: { command: cli.command, argsPrefix: cli.argsPrefix, sourceRoot: cli.sourceRoot, kind: cli.kind },
      };
    }
    const response = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskEnvironmentResult, {
      operation,
      status,
      taskId,
      receipt: {
        locator: persistence?.file || runtime.taskEnvironmentPath(targetRoot, taskId),
        available: Boolean(persistence),
        path: null,
      },
      observedAt,
      source: 'current-machine',
      environment,
      execution,
      diagnostic,
      effects,
      nextActions,
    });
    return response;
  }

  function projectEnvironmentPersistence(targetRoot, taskId, persistence) {
    if (!persistence) return;
    environmentResult(
      'inspect',
      persistence.receipt.status === 'cleaned' ? 'cleaned' : 'ready',
      targetRoot,
      taskId,
      persistence,
      taskEnvironmentReadModel(persistence.receipt),
      null,
      [],
      [],
      now(),
      true,
    );
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
      const previousReceipt = persistence?.receipt || null;
      if (previousReceipt && previousReceipt.schemaVersion !== TASK_ENVIRONMENT_RECEIPT_SCHEMA && !options.plan) {
        throw taskEnvironmentError('task_environment_plan_required_for_upgrade', 'Legacy Environment current 不能自动推导 Environment Preparation Plan。', 409, { schemaVersion: previousReceipt.schemaVersion }, '由 Agent 登记明确 Plan，或使用 prepare --plan <file> 显式升级。');
      }
      let scopePlan = taskScopes(root, taskPersistence.record);
      const scopes = scopePlan.scopes;
      let preparationPlan = previousReceipt?.schemaVersion === TASK_ENVIRONMENT_RECEIPT_SCHEMA ? previousReceipt.preparationPlan : null;
      if (options.plan && previousReceipt) preparationPlan = resolveTaskEnvironmentPlanRequest(options.plan, scopePlan, previousReceipt.scopes, root);
      let reusePreparation = previousReceipt?.schemaVersion === TASK_ENVIRONMENT_RECEIPT_SCHEMA && previousReceipt.preparationPlan?.identity === preparationPlan?.identity;
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
      const pending = reusePreparation
        ? { declarations: previousReceipt.preparationDeclarations, preparationScopes: previousReceipt.preparationScopes, recipes: previousReceipt.preparationRecipes }
        : pendingPreparationFacts(preparationPlan, initialScopes);
      const initial = {
        schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
        taskId,
        workspace: { id: runtime.readWorkspaceRecord(root).workspace.id, root },
        controller: persistence?.receipt.controller || { sourceRoot: controller.sourceRoot, cliSource: controller.cliSource, identity: controller.identity, adapter },
        status: 'blocked',
        scopes: initialScopes,
        preparationPlan,
        preparationDeclarations: pending.declarations,
        preparationScopes: pending.preparationScopes,
        preparationRecipes: pending.recipes,
        preparationSteps: reusePreparation ? previousReceipt.preparationSteps : [],
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
      scopePlan = taskScopes(root, taskPersistence.record);
      const locatedScopes = executionScopes(scopePlan.scopes, root, checkoutRoot, providerResult, now());
      if (options.plan && !previousReceipt) preparationPlan = resolveTaskEnvironmentPlanRequest(options.plan, scopePlan, locatedScopes, root);
      reusePreparation = previousReceipt?.schemaVersion === TASK_ENVIRONMENT_RECEIPT_SCHEMA && previousReceipt.preparationPlan?.identity === preparationPlan?.identity;
      const locatedPending = reusePreparation
        ? { declarations: previousReceipt.preparationDeclarations, preparationScopes: previousReceipt.preparationScopes, recipes: previousReceipt.preparationRecipes }
        : pendingPreparationFacts(preparationPlan, locatedScopes);
      const withLocations = {
        ...persistence.receipt,
        scopes: locatedScopes,
        preparationPlan,
        preparationDeclarations: locatedPending.declarations,
        preparationScopes: locatedPending.preparationScopes,
        preparationRecipes: locatedPending.recipes,
        preparationSteps: reusePreparation ? previousReceipt.preparationSteps : [],
        updatedAt: now(),
      };
      const foundations = prepareFoundations(withLocations, controller, effects, {
        mutate: true,
        onStep: (steps) => {
          const progress = aggregatePreparation(withLocations, steps);
          persistence = runtime.writeTaskEnvironmentPersistence(root, {
            ...withLocations,
            status: 'blocked',
            scopes: progress.scopes,
            preparationDeclarations: progress.declarations,
            preparationScopes: progress.preparationScopes,
            preparationRecipes: progress.recipes,
            preparationSteps: steps,
            latest: { ...withLocations.latest, ready: { status: 'blocked', observedAt: now(), diagnostic: 'Environment Preparation Plan 执行中。' } },
            updatedAt: now(),
          });
        },
      });
      const resources = observeResources(withLocations);
      const resourcesReady = resources.every((resource) => resource.status !== 'stale');
      const ready = foundations.ready && resourcesReady;
      const diagnostic = foundations.diagnostic || resources.find((resource) => resource.status === 'stale')?.probe.diagnostic || null;
      const finalReceipt = {
        ...withLocations,
        status: ready ? 'ready' : 'blocked',
        scopes: foundations.scopes,
        preparationDeclarations: foundations.preparationDeclarations,
        preparationScopes: foundations.preparationScopes,
        preparationRecipes: foundations.preparationRecipes,
        preparationSteps: foundations.preparationSteps,
        resources,
        latest: { ...withLocations.latest, ready: { status: ready ? 'ready' : 'blocked', observedAt: now(), diagnostic } },
        updatedAt: now(),
      };
      persistence = runtime.writeTaskEnvironmentPersistence(root, finalReceipt);
      effects.push({ type: 'receipt-updated', path: persistence.file });
      if (!ready) {
        const planMissing = !preparationPlan;
        const code = planMissing ? 'task_environment_plan_missing' : 'task_environment_probe_blocked';
        const declarationActions = preparationDeclarationGapActions(foundations.preparationDeclarations, scopePlan);
        const nextActions = declarationActions.length
          ? declarationActions
          : planMissing
            ? scopePlan.scopes.filter((scope) => scope.kind === 'project').map((scope) => `${declarationIntakeGapNextAction({ kind: 'environment', project: scope.project, services: scopePlan.scopes.filter((item) => item.kind === 'service' && item.project === scope.project).map((item) => item.service) })} 或由Agent登记显式task-inline Plan，然后重新运行 prepare。`)
            : ['按具体 Preparation Step 诊断修复后重新运行 prepare；已 ready 的 Step 将被复用。'];
        return environmentResult('prepare', 'blocked', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt), { code, message: diagnostic }, effects, nextActions);
      }
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

  function readTaskEnvironmentCurrent(targetRoot, taskId) {
    try {
      const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
      const root = task.root || targetRoot;
      const persistence = runtime.readTaskEnvironmentPersistence(root, task.record.taskId, { optional: true });
      if (!persistence) return environmentResult('inspect', 'unavailable', root, task.record.taskId, null, null, { code: 'task_environment_snapshot_missing', message: '尚未形成 Task Environment SQLite current。' }, [], ['先执行 Task Environment prepare，再读取保存的环境状态。']);
      if (persistence.receipt.status === 'cleaned') return environmentResult('inspect', 'cleaned', root, task.record.taskId, persistence, taskEnvironmentReadModel(persistence.receipt));
      if (persistence.receipt.schemaVersion !== TASK_ENVIRONMENT_RECEIPT_SCHEMA) {
        return environmentResult('inspect', 'blocked', root, task.record.taskId, persistence, taskEnvironmentReadModel(persistence.receipt), {
          code: 'task_environment_legacy_receipt',
          message: `保存的 Environment current 是 legacy ${persistence.receipt.schemaVersion}；不能自动推导 Environment Preparation Plan。`,
        }, [], ['由 Agent 登记明确 Plan，或使用 prepare --plan <file> 显式升级。']);
      }
      return environmentResult('inspect', persistence.receipt.status, root, task.record.taskId, persistence, taskEnvironmentReadModel(persistence.receipt));
    } catch (error) {
      return blocked('inspect', targetRoot, taskId, error);
    }
  }

  function inspectTaskEnvironment(targetRoot, taskId) {
    const read = () => {
      try {
      const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
      const root = task.root || targetRoot;
      const persistence = runtime.readTaskEnvironmentPersistence(root, task.record.taskId, { optional: true });
      if (!persistence) return environmentResult('inspect', 'unavailable', root, task.record.taskId, null, null, { code: 'task_environment_snapshot_missing', message: '尚未形成 Task Environment SQLite current。' }, [], ['先执行 Task Environment prepare，再读取保存的环境状态。']);
      if (persistence.receipt.status === 'cleaned') return environmentResult('inspect', 'cleaned', root, task.record.taskId, persistence, taskEnvironmentReadModel(persistence.receipt));
      if (persistence.receipt.schemaVersion !== TASK_ENVIRONMENT_RECEIPT_SCHEMA) {
        return environmentResult('inspect', 'blocked', root, task.record.taskId, persistence, taskEnvironmentReadModel(persistence.receipt), {
          code: 'task_environment_legacy_receipt',
          message: `保存的 Environment current 是 legacy ${persistence.receipt.schemaVersion}；inspect 不会自动推导或升级 Plan。`,
        }, [], ['由 Agent 登记明确 Environment Preparation Plan 后运行 prepare。']);
      }
      const controller = environmentInspector(root, persistence.receipt);
      const validationRoot = persistence.receipt.scopes[0].validationRoot;
      const scopePlan = taskScopes(root, task.record);
      if (persistence.receipt.preparationPlan) normalizeTaskEnvironmentPlan(persistence.receipt.preparationPlan, { scopeSelectors: preparationScopeSelectors(scopePlan.scopes) });
      const hasGit = persistence.receipt.scopes.some((scope) => scope.provider?.capability === GIT_PROVIDER);
      const providerObservation = hasGit ? runtime.inspectGitWorktrees({ workspaceRoot: root, taskId: task.record.taskId }) : null;
      const providerResult = providerObservation ? {
        ...providerObservation,
        evidencePath: providerObservation.evidencePath || persistence.receipt.scopes.find((scope) => scope.provider)?.provider?.evidence,
      } : null;
      const checkoutRoot = persistence.receipt.scopes[0].shared ? null : validationRoot;
      const observedBase = {
        ...persistence.receipt,
        scopes: executionScopes(scopePlan.scopes, root, checkoutRoot, providerResult, now(), persistence.receipt.scopes),
        updatedAt: now(),
      };
      const foundations = prepareFoundations(observedBase, controller, [], { mutate: false });
      const resources = observeResources(observedBase);
      const providerReady = !providerResult || providerResult.status !== 'blocked';
      const resourcesReady = resources.every((resource) => resource.status !== 'stale');
      const ready = foundations.ready && providerReady && resourcesReady;
      const diagnostic = foundations.diagnostic
        || providerResult?.diagnostic?.message
        || resources.find((resource) => resource.status === 'stale')?.probe.diagnostic
        || null;
      const observedReceipt = {
        ...observedBase,
        status: ready ? 'ready' : 'blocked',
        scopes: foundations.scopes,
        preparationDeclarations: foundations.preparationDeclarations,
        preparationScopes: foundations.preparationScopes,
        preparationRecipes: foundations.preparationRecipes,
        preparationSteps: foundations.preparationSteps,
        resources,
        latest: { ...observedBase.latest, ready: { status: ready ? 'ready' : 'blocked', observedAt: now(), diagnostic } },
        updatedAt: now(),
      };
        const declarationActions = preparationDeclarationGapActions(foundations.preparationDeclarations, scopePlan);
        return environmentResult('inspect', ready ? 'ready' : 'blocked', root, task.record.taskId, persistence, taskEnvironmentReadModel(observedReceipt), ready ? null : { code: !observedBase.preparationPlan ? 'task_environment_plan_missing' : 'task_environment_probe_blocked', message: diagnostic }, [], ready ? [] : declarationActions.length ? declarationActions : ['按诊断修复后运行 prepare；inspect 不会执行 Step、创建输出或回写 Receipt。']);
      } catch (error) {
        return blocked('inspect', targetRoot, taskId, error);
      }
    };
    if (typeof runtime.memoizeWorkspaceOperation !== 'function') return read();
    return runtime.memoizeWorkspaceOperation(targetRoot, `task-environment:inspect:${taskId}`, read);
  }

  function planResult(operation, status, targetRoot, taskId, persistence = null, diagnostic = null, effects = [], nextActions = []) {
    return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskEnvironmentPlanResult, {
      operation,
      status,
      taskId,
      observedAt: now(),
      source: 'current-machine',
      receipt: { locator: persistence?.file || runtime.taskEnvironmentPath(targetRoot, taskId), available: Boolean(persistence), path: null },
      plan: persistence?.receipt.preparationPlan || null,
      diagnostic,
      effects,
      nextActions,
    });
  }

  function recordTaskEnvironmentPlan(targetRoot, taskId, input) {
    let root = path.resolve(targetRoot);
    let persistence = null;
    try {
      root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(root));
      const task = runtime.readTaskRecordPersistence(root, taskId).record;
      if (task.status !== 'active') throw taskEnvironmentError('task_environment_task_terminal', `Task ${taskId} 已是 ${task.status}，不能登记 Environment Plan。`, 409, { status: task.status });
      persistence = runtime.readTaskEnvironmentPersistence(root, taskId, { optional: true });
      if (!persistence) throw taskEnvironmentError('task_environment_snapshot_missing', '尚未形成 Task Environment current。', 409, undefined, '先运行一次 task environment prepare 形成执行根，或直接使用 prepare --plan。');
      if (persistence.receipt.status === 'cleaned') throw taskEnvironmentError('task_environment_already_cleaned', `Task Environment 已清理：${taskId}。`, 409);
      assertEnvironmentManager(root, persistence.receipt);
      const scopePlan = taskScopes(root, task);
      const plan = resolveTaskEnvironmentPlanRequest(input, scopePlan, persistence.receipt.scopes, root);
      const savedScopes = new Map(persistence.receipt.scopes.map((scope) => [scope.selector, scope]));
      const scopes = scopePlan.scopes.map((scope) => {
        const saved = savedScopes.get(scope.selector);
        if (!saved) throw taskEnvironmentError('task_environment_plan_scope_changed', `Task scope ${scope.selector} 尚未形成执行根。`, 409, { selector: scope.selector }, '重新运行 prepare --plan，让 provider 为新 scope 建立执行根。');
        const { dependencies: _dependencies, preparation: _preparation, ...base } = saved;
        return { ...base, preparation: probe('blocked', plan.identity, 'Environment Plan 已登记，尚未 prepare。') };
      });
      const timestamp = now();
      const pending = pendingPreparationFacts(plan, scopes, 'Environment Plan 已登记，尚未 prepare。');
      persistence = runtime.writeTaskEnvironmentPersistence(root, {
        schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
        taskId,
        workspace: persistence.receipt.workspace,
        controller: persistence.receipt.controller,
        status: 'blocked',
        scopes,
        preparationPlan: plan,
        preparationDeclarations: pending.declarations,
        preparationScopes: pending.preparationScopes,
        preparationRecipes: pending.recipes,
        preparationSteps: [],
        resources: persistence.receipt.resources,
        latest: { ...persistence.receipt.latest, ready: { status: 'blocked', observedAt: timestamp, diagnostic: 'Environment Plan 已登记，尚未 prepare。' } },
        createdAt: persistence.receipt.createdAt,
        updatedAt: timestamp,
      });
      return planResult('record', 'ready', root, taskId, persistence, null, [{ type: 'environment-plan-recorded', identity: plan.identity }], ['运行 task environment prepare 执行并验证 Plan。']);
    } catch (error) {
      return planResult('record', 'blocked', root, taskId, persistence, { code: error.code || 'task_environment_plan_blocked', message: error.message, details: error.details }, [], [error.nextAction || '修正 Plan 后重试。']);
    }
  }

  function inspectTaskEnvironmentPlan(targetRoot, taskId) {
    try {
      const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
      const root = task.root || targetRoot;
      const persistence = runtime.readTaskEnvironmentPersistence(root, task.record.taskId, { optional: true });
      if (!persistence || persistence.receipt.schemaVersion !== TASK_ENVIRONMENT_RECEIPT_SCHEMA || !persistence.receipt.preparationPlan) {
        return planResult('inspect', 'unavailable', root, task.record.taskId, persistence, { code: 'task_environment_plan_missing', message: '当前 Environment current 尚未保存 Preparation Plan v2。' }, [], ['由 Agent 从Project Preparation Declaration选择Recipe，或登记显式task-inline Plan。']);
      }
      return planResult('inspect', 'ready', root, task.record.taskId, persistence);
    } catch (error) {
      return planResult('inspect', 'blocked', targetRoot, taskId, null, { code: error.code || 'task_environment_plan_blocked', message: error.message, details: error.details }, [], [error.nextAction || '修正诊断后重试。']);
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
    projectEnvironmentPersistence(root, taskId, written);
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
    projectEnvironmentPersistence(root, taskId, written);
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
        projectEnvironmentPersistence(root, taskId, persistence);
        effects.push({ type: 'resource-released', id: resource.id, provider: resource.provider });
      }
      const hasGit = persistence.receipt.scopes.some((scope) => scope.provider?.capability === GIT_PROVIDER);
      if (hasGit) {
        const provider = runtime.cleanupGitWorktrees({ workspaceRoot: root, taskId, integratedRefs: finish ? authorization.deliveries : {}, integratedContributions: finish ? authorization.integratedContributions || {} : {}, allowDirty: abandon });
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
    const inspected = runtime.inspectTaskEnvironment(targetRoot, taskId);
    if (inspected.status !== 'ready') return { ready: false, blocked: inspected.diagnostic, taskId, environment: inspected.environment, observedAt: inspected.observedAt };
    const persistence = runtime.readTaskEnvironmentPersistence(inspected.environment.workspace.root, taskId);
    const handles = new Map(persistence.receipt.resources.map((resource) => [resource.id, resource.handle]));
    const controller = receiptController(persistence.receipt);
    const candidate = candidateCli(controller, inspected.environment.workspace.root, inspected.environment.scopes[0].validationRoot, planOwnsCandidateController(persistence.receipt, controller));
    const providerResult = inspected.environment.scopes.some((scope) => scope.provider) ? runtime.inspectGitWorktrees({ workspaceRoot: inspected.environment.workspace.root, taskId }) : null;
    return {
      ready: true,
      taskId,
      receiptSchema: persistence.receipt.schemaVersion,
      workspaceRoot: inspected.environment.workspace.root,
      environmentRoot: inspected.environment.scopes[0].validationRoot,
      executionRoots: inspected.environment.scopes.map((scope) => scope.executionRoot),
      allowedExecutionRoots: [...new Set(inspected.environment.scopes.flatMap((scope) => [scope.executionRoot, scope.validationRoot]))],
      validationRoot: inspected.environment.scopes[0].validationRoot,
      controller: inspected.environment.controller,
      controllerInvocation: {
        command: process.execPath,
        argsPrefix: [persistence.receipt.controller.cliSource],
        sourceRoot: persistence.receipt.controller.sourceRoot,
        kind: 'stable-controller',
      },
      cliInvocation: { command: candidate.command, argsPrefix: candidate.argsPrefix, sourceRoot: candidate.sourceRoot, kind: candidate.kind },
      repositories: providerResult?.repositories || [],
      scopes: inspected.environment.scopes,
      resources: inspected.environment.resources.map((resource) => ({ ...resource, handle: handles.get(resource.id) })),
      observedAt: inspected.observedAt,
    };
  }

  function resolveTaskEnvironmentCleanupContext(targetRoot, taskId) {
    try {
      const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(path.resolve(targetRoot)));
      runtime.readTaskRecordPersistence(root, taskId);
      const persistence = runtime.readTaskEnvironmentPersistence(root, taskId, { optional: true });
      if (!persistence) return { ready: false, blocked: { code: 'task_environment_no_receipt', message: '当前机器没有可清理的 Environment Receipt。' }, taskId };
      if (persistence.receipt.status === 'cleaned') return { ready: false, blocked: { code: 'task_environment_already_cleaned', message: `Task Environment 已清理：${taskId}。` }, taskId, environment: taskEnvironmentReadModel(persistence.receipt) };
      const providerResult = persistence.receipt.scopes.some((scope) => scope.provider)
        ? runtime.inspectGitWorktrees({ workspaceRoot: root, taskId })
        : null;
      if (providerResult?.status === 'blocked') return { ready: false, blocked: providerResult.diagnostic, taskId, environment: taskEnvironmentReadModel(persistence.receipt) };
      return {
        ready: true,
        taskId,
        receiptSchema: persistence.receipt.schemaVersion,
        workspaceRoot: persistence.receipt.workspace.root,
        environmentRoot: persistence.receipt.scopes[0].validationRoot,
        controller: persistence.receipt.controller,
        controllerInvocation: {
          command: process.execPath,
          argsPrefix: [persistence.receipt.controller.cliSource],
          sourceRoot: persistence.receipt.controller.sourceRoot,
          kind: 'stable-controller',
        },
        repositories: providerResult?.repositories || [],
        observedAt: now(),
      };
    } catch (error) {
      return { ready: false, blocked: { code: error.code || 'task_environment_cleanup_context_blocked', message: error.message, details: error.details }, taskId };
    }
  }

  function assertTaskEnvironmentController(targetRoot, taskId) {
    const root = fs.realpathSync(runtime.assertCanonicalTaskWorkspace(targetRoot));
    const persistence = runtime.readTaskEnvironmentPersistence(root, taskId);
    return assertEnvironmentManager(root, persistence.receipt);
  }

  Object.assign(runtime, {
    prepareTaskEnvironment,
    inspectTaskEnvironment,
    readTaskEnvironmentCurrent,
    recordTaskEnvironmentPlan,
    inspectTaskEnvironmentPlan,
    cleanupTaskEnvironment,
    registerTaskEnvironmentResource,
    releaseTaskEnvironmentResource,
    resolveTaskEnvironmentExecution,
    resolveTaskEnvironmentCleanupContext,
    assertTaskEnvironmentController,
  });
  return runtime;
}
