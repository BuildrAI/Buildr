import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA,
  TASK_ENVIRONMENT_RECEIPT_SCHEMA,
  taskEnvironmentError,
  taskEnvironmentReadModel,
} from '../../domain/task-environment/task-environment.mjs';
import {
  parseProjectTaskEnvironmentDeclaration,
  projectServiceDependencyClosure,
} from '../../domain/task-environment/task-environment-declaration.mjs';
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

function fileIdentity(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile()
    ? `sha256-${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
    : null;
}

function observeLocalNodeModules(root) {
  const directory = path.join(root, 'node_modules');
  if (!fs.existsSync(directory)) return { status: 'missing', diagnostic: `worktree-local node_modules 不存在：${root}` };
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    return { status: 'blocked', diagnostic: `node_modules 必须是 dependency root 内的实体目录，不得软链接或共享：${directory}` };
  }
  const realRoot = fs.realpathSync(root);
  const realDirectory = fs.realpathSync(directory);
  if (!inside(realRoot, realDirectory)) {
    return { status: 'blocked', diagnostic: `node_modules 真实路径越出 dependency root：${directory}` };
  }
  return { status: 'ready', diagnostic: null };
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

  function environmentInspector(_workspaceRoot, receipt) {
    return receiptController(receipt);
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

  function readProjectDependencyDeclaration(workspaceRoot, contentRoot, projectCode, projects, serviceRecords) {
    const project = projects.projects[projectCode];
    const declarationPath = path.join(contentRoot, project.source.path, 'task-environment.yml');
    if (!fs.existsSync(declarationPath)) return { schemaVersion: null, services: {} };
    let input;
    try {
      input = runtime.parseYamlDocument(fs.readFileSync(declarationPath, 'utf8'), path.relative(contentRoot, declarationPath));
    } catch (error) {
      throw taskEnvironmentError('task_environment_declaration_invalid', `无法读取 ${path.relative(workspaceRoot, declarationPath)}：${error.message}`, 409, { project: projectCode, declarationPath });
    }
    return parseProjectTaskEnvironmentDeclaration(input, { project: projectCode, knownServices: Object.keys(serviceRecords.services) });
  }

  function taskScopes(workspaceRoot, task, controller, contentRoot = workspaceRoot) {
    const projects = runtime.readProjectRegistryRecord(workspaceRoot);
    if (projects.registry.migrationRequired) throw taskEnvironmentError('task_environment_project_registry_migration_required', 'Project registry 需要先完成 canonical 迁移。', 409, undefined, '从 retained Workspace 运行 buildr sync。');
    const scopes = [{ selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', sourceType: workspaceHasRootGit(workspaceRoot) ? 'git' : 'workspace' }];
    const seen = new Set(['workspace']);
    const requirements = new Map();
    const declarations = new Map();
    const serviceRegistries = new Map();
    const serviceRegistry = (projectCode) => {
      if (!serviceRegistries.has(projectCode)) serviceRegistries.set(projectCode, runtime.readServiceRegistryRecord(workspaceRoot, projectCode));
      return serviceRegistries.get(projectCode);
    };
    const declaration = (projectCode) => {
      if (!declarations.has(projectCode)) declarations.set(projectCode, readProjectDependencyDeclaration(workspaceRoot, contentRoot, projectCode, projects, serviceRegistry(projectCode)));
      return declarations.get(projectCode);
    };
    const addProject = (projectCode) => {
      const project = projects.projects[projectCode];
      if (!project) throw taskEnvironmentError('task_environment_project_not_found', `Project 不存在：${projectCode}。`, 409, { project: projectCode });
      const selector = `project:${projectCode}`;
      if (!seen.has(selector)) scopes.push({ selector, kind: 'project', project: projectCode, service: null, sourcePath: project.source.path, sourceType: project.source.type });
      seen.add(selector);
      return project;
    };
    const addService = (projectCode, serviceCode, requiredBy) => {
      const project = addProject(projectCode);
      const services = serviceRegistry(projectCode);
      const service = services.services[serviceCode];
      if (!service) throw taskEnvironmentError('task_environment_service_not_found', `Service 不存在：${projectCode}/${serviceCode}。`, 409, { project: projectCode, service: serviceCode });
      const selector = `service:${projectCode}/${serviceCode}`;
      if (!seen.has(selector)) scopes.push({ selector, kind: 'service', project: projectCode, service: serviceCode, sourcePath: service.source.path, sourceType: service.source.type || project.source.type });
      seen.add(selector);
      if (!requirements.has(selector)) requirements.set(selector, new Set());
      requirements.get(selector).add(requiredBy);
    };
    for (const projectCode of new Set([...task.scope.projects, ...task.changes.map((reference) => reference.project)])) {
      addProject(projectCode);
    }
    for (const reference of task.scope.services) {
      const entrySelector = `service:${reference.project}/${reference.service}`;
      const closure = projectServiceDependencyClosure(declaration(reference.project), [reference.service]);
      for (const serviceCode of closure.keys()) addService(reference.project, serviceCode, entrySelector);
    }
    if (inside(workspaceRoot, controller.sourceRoot)) {
      const relativeController = path.relative(workspaceRoot, controller.sourceRoot).split(path.sep).join('/');
      for (const [projectCode, project] of Object.entries(projects.projects)) {
        const services = serviceRegistry(projectCode);
        const owner = Object.values(services.services).find((service) => service.source.path === relativeController);
        if (owner) {
          declaration(projectCode);
          addService(projectCode, owner.code, 'workspace');
          break;
        }
      }
    }
    return { scopes, requirements, declarations };
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
        dependencies: probe('blocked', null, '尚未探测依赖。', observedAt),
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

  function dependencyPlan(receipt, scopePlan) {
    const scopes = new Map(receipt.scopes.map((scope) => [scope.selector, scope]));
    const roots = [];
    for (const [selector, requiredBy] of scopePlan.requirements.entries()) {
      const scope = scopes.get(selector);
      if (!scope) throw taskEnvironmentError('task_environment_dependency_scope_invalid', `Dependency scope 未形成执行根：${selector}。`, 409, { selector });
      const declared = scopePlan.declarations.get(scope.project)?.services?.[scope.service];
      if (!declared) continue;
      for (const dependency of declared.dependencyRoots) {
        const root = path.resolve(scope.executionRoot, dependency.root);
        if (!inside(scope.executionRoot, root)) throw taskEnvironmentError('task_environment_dependency_path_invalid', `Dependency root 超出 Service execution root：${selector}/${dependency.id}。`, 409, { selector, root, executionRoot: scope.executionRoot });
        roots.push({
          id: `${selector}/${dependency.id}`,
          scope: selector,
          project: scope.project,
          service: scope.service,
          requiredBy: [...requiredBy].sort(),
          root,
          manager: dependency.manager,
          manifest: path.resolve(root, dependency.manifest),
          lockfile: path.resolve(root, dependency.lockfile),
          required: dependency.required,
        });
      }
    }
    return roots.sort((left, right) => left.id.localeCompare(right.id));
  }

  function observeDependencyRoot(planned, saved = null, legacy = null) {
    const observedAt = now();
    const manifestIdentity = fileIdentity(planned.manifest);
    const lockfileIdentity = fileIdentity(planned.lockfile);
    const preparedManifestIdentity = saved?.preparedManifestIdentity || legacy?.preparedManifestIdentity || null;
    const preparedLockfileIdentity = saved?.preparedLockfileIdentity || legacy?.preparedLockfileIdentity || null;
    let status = 'ready';
    let diagnostic = null;
    if (!manifestIdentity) {
      status = 'missing';
      diagnostic = `package manifest 不存在：${planned.manifest}`;
    } else if (!lockfileIdentity) {
      status = 'missing';
      diagnostic = `lockfile 不存在：${planned.lockfile}`;
    } else if (!preparedManifestIdentity || !preparedLockfileIdentity) {
      status = 'blocked';
      diagnostic = `依赖根尚未由 Task Environment prepare：${planned.scope}`;
    } else if (manifestIdentity !== preparedManifestIdentity || lockfileIdentity !== preparedLockfileIdentity) {
      status = 'drifted';
      diagnostic = `依赖声明已漂移：${planned.scope}`;
    } else {
      const nodeModules = observeLocalNodeModules(planned.root);
      if (nodeModules.status !== 'ready') {
        status = nodeModules.status;
        diagnostic = nodeModules.diagnostic;
      }
    }
    return {
      ...planned,
      manifestIdentity,
      lockfileIdentity,
      preparedManifestIdentity,
      preparedLockfileIdentity,
      status,
      observedAt,
      diagnostic,
    };
  }

  function legacyPreparedRoot(previousReceipt, planned, cli) {
    if (previousReceipt?.schemaVersion !== LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA || cli.kind !== 'task-environment-candidate' || path.resolve(planned.root) !== path.resolve(cli.sourceRoot)) return null;
    const legacyProbe = previousReceipt.scopes.find((scope) => scope.selector === planned.scope)?.dependencies
      || previousReceipt.scopes.find((scope) => scope.selector === 'workspace')?.dependencies;
    const manifestIdentity = fileIdentity(planned.manifest);
    const lockfileIdentity = fileIdentity(planned.lockfile);
    if (legacyProbe?.status !== 'ready' || legacyProbe.identity !== lockfileIdentity || !manifestIdentity || observeLocalNodeModules(planned.root).status !== 'ready') return null;
    return { preparedManifestIdentity: manifestIdentity, preparedLockfileIdentity: lockfileIdentity };
  }

  function prepareDependencyRoots(plannedRoots, previousReceipt, cli, workspaceNode, effects, { mutate }) {
    const savedRoots = new Map((previousReceipt?.dependencyRoots || []).map((root) => [root.id, root]));
    return plannedRoots.map((planned) => {
      let observed = observeDependencyRoot(planned, savedRoots.get(planned.id), legacyPreparedRoot(previousReceipt, planned, cli));
      if (!mutate || !planned.required || observed.status === 'ready') return observed;
      if (!observed.manifestIdentity || !observed.lockfileIdentity) return observed;
      if (!workspaceNode?.ready) return { ...observed, status: 'blocked', diagnostic: `Workspace Node/npm 未就绪，不能准备 ${planned.scope}：${workspaceNode?.diagnostic || 'unknown'}` };
      const installed = spawnSync(workspaceNode.npmExecutable, ['ci'], { cwd: planned.root, encoding: 'utf8', env: workspaceNode.environment, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
      if (installed.status !== 0) {
        const diagnostic = (installed.stderr || installed.stdout || 'npm ci failed').trim().slice(0, 2000);
        return { ...observed, status: 'failed', observedAt: now(), diagnostic: `${planned.scope} npm ci 失败（exit ${installed.status ?? 'unknown'}）：${diagnostic}` };
      }
      effects.push({ type: 'dependency-root-prepared', id: planned.id, scope: planned.scope, root: planned.root, manager: planned.manager, manifest: planned.manifest, lockfile: planned.lockfile });
      observed = observeDependencyRoot(planned, {
        preparedManifestIdentity: fileIdentity(planned.manifest),
        preparedLockfileIdentity: fileIdentity(planned.lockfile),
      });
      if (observed.status !== 'ready') return { ...observed, status: 'failed', diagnostic: `${planned.scope} npm ci 完成后依赖根仍未 ready：${observed.diagnostic}` };
      return observed;
    });
  }

  function aggregateDependencies(scopes, dependencyRoots) {
    return scopes.map((scope) => {
      const relevant = dependencyRoots.filter((dependency) => {
        if (scope.kind === 'workspace') return true;
        if (scope.kind === 'project') return dependency.project === scope.project;
        return dependency.requiredBy.includes(scope.selector) || dependency.scope === scope.selector;
      });
      if (!relevant.length) return { ...scope, dependencies: probe('not-applicable', null, null) };
      const required = relevant.filter((dependency) => dependency.required);
      const blockedRoot = required.find((dependency) => dependency.status !== 'ready');
      const identity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(relevant.map((dependency) => [dependency.id, dependency.lockfileIdentity, dependency.status]))).digest('hex')}`;
      return {
        ...scope,
        dependencies: blockedRoot
          ? probe('blocked', identity, `${blockedRoot.scope}: ${blockedRoot.diagnostic}`, blockedRoot.observedAt)
          : probe('ready', identity, null, relevant.reduce((latest, dependency) => dependency.observedAt > latest ? dependency.observedAt : latest, relevant[0].observedAt)),
      };
    });
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

  function prepareFoundations(receipt, controller, scopePlan, previousReceipt, effects, { mutate }) {
    const validationRoot = receipt.scopes[0].validationRoot;
    const workspaceNode = runtime.workspaceNodeExecution(validationRoot);
    const runtimeProbe = workspaceNode.ready ? probe('ready', workspaceNode.identity.digest) : probe('blocked', workspaceNode.identity?.digest || null, workspaceNode.diagnostic || 'Workspace Node 未就绪。');
    const cli = candidateCli(controller, receipt.workspace.root, validationRoot);
    const dependencyRoots = prepareDependencyRoots(dependencyPlan(receipt, scopePlan), previousReceipt, cli, workspaceNode, effects, { mutate });
    let scopes = aggregateDependencies(receipt.scopes, dependencyRoots);
    const dependenciesBlocked = dependencyRoots.some((dependency) => dependency.required && dependency.status !== 'ready');
    const cliProbe = dependenciesBlocked ? probe('blocked', null, '必需依赖根未就绪，跳过 CLI probe。') : probeCli(cli, validationRoot, workspaceNode);
    const projection = dependenciesBlocked
      ? probe('blocked', null, '依赖未就绪，跳过 runtime projection。')
      : mutate
        ? prepareProjection(controller.adapter, validationRoot, cli, workspaceNode, effects)
        : observeProjection(controller.adapter, validationRoot, cli, workspaceNode);
    scopes = scopes.map((scope) => ({ ...scope, runtime: runtimeProbe, cli: cliProbe, projection }));
    const ready = scopes.every((scope) => [scope.runtime, scope.cli, scope.dependencies, scope.projection].every((item) => item.status !== 'blocked'));
    const blockedDependency = dependencyRoots.find((dependency) => dependency.required && dependency.status !== 'ready');
    const diagnostic = ready ? null : blockedDependency
      ? `${blockedDependency.scope}: ${blockedDependency.diagnostic}`
      : scopes.flatMap((scope) => [scope.runtime, scope.cli, scope.dependencies, scope.projection].filter((item) => item.status === 'blocked').map((item) => `${scope.selector}: ${item.diagnostic}`))[0];
    return { scopes, dependencyRoots, ready, diagnostic, cli };
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
      let scopePlan = taskScopes(root, taskPersistence.record, controller);
      const scopes = scopePlan.scopes;
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
        dependencyRoots: [],
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
      scopePlan = taskScopes(root, taskPersistence.record, controller, checkoutRoot || root);
      const withLocations = { ...persistence.receipt, scopes: executionScopes(scopePlan.scopes, root, checkoutRoot, providerResult, now()), updatedAt: now() };
      const foundations = prepareFoundations(withLocations, controller, scopePlan, previousReceipt, effects, { mutate: true });
      const resources = observeResources(withLocations);
      const resourcesReady = resources.every((resource) => resource.status !== 'stale');
      const ready = foundations.ready && resourcesReady;
      const diagnostic = foundations.diagnostic || resources.find((resource) => resource.status === 'stale')?.probe.diagnostic || null;
      const finalReceipt = {
        ...withLocations,
        status: ready ? 'ready' : 'blocked',
        scopes: foundations.scopes,
        dependencyRoots: foundations.dependencyRoots,
        resources,
        latest: { ...withLocations.latest, ready: { status: ready ? 'ready' : 'blocked', observedAt: now(), diagnostic } },
        updatedAt: now(),
      };
      persistence = runtime.writeTaskEnvironmentPersistence(root, finalReceipt);
      effects.push({ type: 'receipt-updated', path: persistence.file });
      if (!ready) {
        const blockedDependency = foundations.dependencyRoots.find((dependency) => dependency.required && dependency.status !== 'ready');
        const nextActions = blockedDependency
          ? [`修复 ${blockedDependency.scope} 的依赖诊断后，按同一 Task ID 重新运行 prepare；其他已成功 root 将被复用。`]
          : ['按诊断修复执行基础或 Task-owned 资源后重新运行 prepare。'];
        return environmentResult('prepare', 'blocked', root, taskId, persistence, taskEnvironmentReadModel(persistence.receipt), { code: 'task_environment_probe_blocked', message: diagnostic }, effects, nextActions);
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
      if (persistence.receipt.schemaVersion === LEGACY_TASK_ENVIRONMENT_RECEIPT_SCHEMA) {
        return environmentResult('inspect', 'blocked', root, task.record.taskId, persistence, taskEnvironmentReadModel(persistence.receipt), {
          code: 'task_environment_legacy_receipt',
          message: '保存的 Environment current 是 legacy v2；需要显式 prepare 升级后才能证明多依赖根 readiness。',
        }, [], ['运行 Task Environment prepare，升级并保存 dependency-root facts。']);
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
      const controller = environmentInspector(root, persistence.receipt);
      const validationRoot = persistence.receipt.scopes[0].validationRoot;
      const scopePlan = taskScopes(root, task.record, controller, validationRoot);
      const hasGit = persistence.receipt.scopes.some((scope) => scope.provider?.capability === GIT_PROVIDER);
      const providerObservation = hasGit ? runtime.inspectGitWorktrees({ workspaceRoot: root, taskId: task.record.taskId }) : null;
      const providerResult = providerObservation ? {
        ...providerObservation,
        evidencePath: providerObservation.evidencePath || persistence.receipt.scopes.find((scope) => scope.provider)?.provider?.evidence,
      } : null;
      const checkoutRoot = persistence.receipt.scopes[0].shared ? null : validationRoot;
      const observedBase = {
        ...persistence.receipt,
        schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
        scopes: executionScopes(scopePlan.scopes, root, checkoutRoot, providerResult, now(), persistence.receipt.scopes),
        dependencyRoots: [],
        updatedAt: now(),
      };
      const foundations = prepareFoundations(observedBase, controller, scopePlan, persistence.receipt, [], { mutate: false });
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
        dependencyRoots: foundations.dependencyRoots,
        resources,
        latest: { ...observedBase.latest, ready: { status: ready ? 'ready' : 'blocked', observedAt: now(), diagnostic } },
        updatedAt: now(),
      };
        return environmentResult('inspect', ready ? 'ready' : 'blocked', root, task.record.taskId, persistence, taskEnvironmentReadModel(observedReceipt), ready ? null : { code: 'task_environment_probe_blocked', message: diagnostic }, [], ready ? [] : ['按诊断修复后运行 prepare；inspect 不会修改依赖或 Receipt。']);
      } catch (error) {
        return blocked('inspect', targetRoot, taskId, error);
      }
    };
    if (typeof runtime.memoizeWorkspaceOperation !== 'function') return read();
    return runtime.memoizeWorkspaceOperation(targetRoot, `task-environment:inspect:${taskId}`, read);
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
    const candidate = candidateCli(controller, inspected.environment.workspace.root, inspected.environment.scopes[0].validationRoot);
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
    cleanupTaskEnvironment,
    registerTaskEnvironmentResource,
    releaseTaskEnvironmentResource,
    resolveTaskEnvironmentExecution,
    resolveTaskEnvironmentCleanupContext,
    assertTaskEnvironmentController,
  });
  return runtime;
}
