import { AGENT_ASSETS_DIAGNOSTICS_READ } from '../../src/modules/agent-assets/module.ts';
import { PROJECT_DAILY_PROGRESS_APPLICATION } from '../../src/modules/task/module.ts';
import { AGENT_ASSETS_PACKAGE_CHECK_SUPPORT } from '../../src/modules/agent-assets/module.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { COMMAND_CATALOG } from '../../src/bootstrap/cli/registry.ts';
import { createRuntime, runtimeContributions, runtimeModuleSnapshot, runtimeProvide } from '../helpers/runtime-harness.ts';
import { createRuntime as createProductRuntime } from '../../src/bootstrap/runtime.ts';
import { OPENSPEC_QUERY, createOpenSpecModule } from '../../src/modules/openspec/module.ts';
import { CHANGE_APPLICATION } from '../../src/modules/task/change/module.ts';

test('OpenSpec 独占通用内容查询，任务能力只提供关联组合', () => {
  const runtime = createProductRuntime();
  const query = runtimeProvide(runtime, OPENSPEC_QUERY);
  const taskChanges = runtimeProvide(runtime, CHANGE_APPLICATION);
  for (const method of ['listProjectChanges', 'listChanges', 'changeDetail', 'generateChangeCreatePrompt', 'generateChangeActionPrompt', 'findLogicalChange', 'discoverUiPrototypes']) {
    assert.equal(typeof query[method], 'function', method);
    assert.equal(taskChanges[method], undefined, method);
  }
  for (const method of ['resolveTaskScopedChange', 'taskScopedChangeDetail', 'taskUiPrototypes', 'taskUiPrototype']) {
    assert.equal(typeof taskChanges[method], 'function', method);
    assert.equal(query[method], undefined, method);
  }
});

test('OpenSpec 只取得五项资产支撑方法，并在装配时拒绝缺失方法', () => {
  const runtime = createProductRuntime();
  const support = runtimeProvide(runtime, AGENT_ASSETS_OPENSPEC_SUPPORT);
  const methods = ['assertName', 'componentDefinitionFile', 'readComponentDefinition', 'readComponentsManifestForWrite', 'runCommandsCheck'];
  assert.deepEqual(Object.keys(support).sort(), [...methods].sort());
  assert.equal(Object.isFrozen(support), true);
  assert.equal(support.syncRuntime, undefined);
  const module = createOpenSpecModule({} as never);
  assert.deepEqual(module.requires, [WORKSPACE_QUERY, AGENT_ASSETS_OPENSPEC_SUPPORT]);
  for (const missing of methods) {
    assert.throws(() => module.create({
      [WORKSPACE_QUERY]: {} as never,
      [AGENT_ASSETS_OPENSPEC_SUPPORT]: { ...support, [missing]: undefined },
    }), new RegExp(`OpenSpec asset dependency is missing: ${missing}`));
  }
});

test('OpenSpec 窄依赖保留提供者绑定、参数、返回值和异常', () => {
  const failure = new Error('source validation failed');
  const source = {
    label: 'source',
    assertName(value: string, label: string) { if (value === 'invalid' && label === 'change') throw failure; },
    componentDefinitionFile(root: string, entry: { id: string }) { return `${this.label}:${root}/${entry.id}`; },
    readComponentDefinition(file: string, id: string) { return { upstream: { version: `${file}:${id}` } }; },
    readComponentsManifestForWrite(root: string) { return { components: [{ id: root }] }; },
    runCommandsCheck(root: string) { return { commands: [{ id: root, status: 'ready', executablePath: root }] }; },
    syncRuntime() { throw new Error('not an OpenSpec dependency'); },
  };
  const support = createOpenSpecAssetSupport(source);
  assert.equal(support.componentDefinitionFile('root', { id: 'openspec' }), 'source:root/openspec');
  assert.deepEqual(support.readComponentDefinition('file', 'openspec'), { upstream: { version: 'file:openspec' } });
  assert.deepEqual(support.readComponentsManifestForWrite('root'), { components: [{ id: 'root' }] });
  assert.equal(support.runCommandsCheck('root').commands[0].id, 'root');
  assert.throws(() => support.assertName('invalid', 'change'), (error) => error === failure);
});
import {
  AGENT_ASSETS_APPLICATION,
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_DIAGNOSTICS_BINDER,
  AGENT_ASSETS_INTERNAL,
  AGENT_ASSETS_OPENSPEC_SUPPORT,
  createOpenSpecAssetSupport,
  AGENT_ASSETS_RUNTIME,
} from '../../src/modules/agent-assets/module.ts';
import {
  TASK_QUERY_APPLICATION,
  TASK_CHANGE_BINDER,
  TASK_RUNTIME_PORT,
  TASK_COMMAND_APPLICATION,
  TASK_REVIEW_APPLICATION,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_REVIEW_PERSISTENCE_READ,
  TASK_WORKTREE_PROVIDER,
} from '../../src/modules/task/module.ts';
import {
  VERIFICATION_APPLICATION,
  VERIFICATION_DECLARATION,
} from '../../src/modules/project-testing/module.ts';
import {
  SYSTEM_INSTALLATION_APPLICATION,
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
} from '../../src/modules/installation/module.ts';
import { WEB_INSTANCE_LIFECYCLE } from '../../src/web/module.ts';
import {
  PROJECT_APPLICATION,
  SERVICE_APPLICATION,
  WORKSPACE_QUERY,
  WORKSPACE_DOMAIN,
  WORKSPACE_TASK_SUPPORT,
  WORKSPACE_ASSET_SUPPORT,
  WORKSPACE_AGENT_ASSETS_BINDER,
  WORKSPACE_DIAGNOSTICS,
  WORKSPACE_RUNTIME_PORT,
  WORKSPACE_APPLICATION,
} from '../../src/modules/workspace/module.ts';

const root: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Bootstrap 是唯一 composition root，bin 与公共 Host 不直连 Task 内部 Adapter', () => {
  assert.match(read('bin/buildr.mjs'), /src\/bootstrap\/cli\/main\.ts/);
  assert.equal(fs.existsSync(path.join(root, 'src/application/compose-runtime.ts')), false);
  const bootstrap: any = read('src/bootstrap/runtime.ts');
  assert.match(bootstrap, /createModuleRegistry/);
  assert.doesNotMatch(bootstrap, /registerLegacyRuntime|legacy-runtime-module/);
  assert.equal(fs.existsSync(path.join(root, 'src/bootstrap/legacy-runtime-module.mjs')), false);
  assert.doesNotMatch(bootstrap, /registerTaskRecord(?:Repository|Application)/);
  assert.doesNotMatch(bootstrap, /Object\.assign\(runtime,\s*(?:registry\.provide|runtimePort|doctorApplication)/);

  const productRuntime = createProductRuntime();
  for (const method of ['initBuildr', 'createTask', 'doctor', 'startBuildrWeb', 'listPublications', 'projectVerificationCommand', 'syncRuntime']) {
    assert.equal(typeof productRuntime[method], 'undefined', `${method} must be available only through its named capability`);
  }

  const cliHost: any = read('src/bootstrap/cli/registry.ts');
  assert.match(cliHost, /from '..\/..\/modules\/task\/module\.ts'/);
  assert.doesNotMatch(cliHost, /task\/interfaces\/(?:cli|http)/);
  assert.match(cliHost, /runtimeContributions\(runtime, 'cli'\)/);

  const httpHost: any = read('src/web/http/server.ts');
  assert.doesNotMatch(httpHost, /task\/interfaces\/(?:cli|http)|task-(?:record|review|retrospective)-http|taskRetrospectiveMatch/);
  assert.match(httpHost, /createLocalWorkspaceRequestRouter/);
  const httpRouter: any = read('src/web/http/router.ts');
  assert.doesNotMatch(httpRouter, /task\/interfaces\/(?:cli|http)|task-(?:record|review|retrospective)-http|taskRetrospectiveMatch/);
  assert.match(httpRouter, /for \(const contribution of httpContributions\)/);
  assert.match(httpRouter, /contribution\.handle\(/);
});

test('Workspace、Agent Assets、Task、Web 与 Doctor modules 暴露显式 capability、contribution 与 runtime port', () => {
  const runtime: any = createRuntime();
  assert.deepEqual(runtimeModuleSnapshot(runtime), [{
    id: 'agent-assets-runtime',
    requires: [],
    provides: [AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY],
    contributions: { cli: [], http: [], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'workspace-core',
    requires: [AGENT_ASSETS_RUNTIME],
    provides: [WORKSPACE_APPLICATION, PROJECT_APPLICATION, SERVICE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_RUNTIME_PORT, WORKSPACE_ASSET_SUPPORT, WORKSPACE_DOMAIN, WORKSPACE_TASK_SUPPORT, WORKSPACE_AGENT_ASSETS_BINDER, WORKSPACE_DIAGNOSTICS],
    contributions: {
      cli: ['init', 'bootstrap guide', 'mutation recover', 'project create', 'service create'],
      http: ['workspace-core.http'],
      diagnostics: ['workspace.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'agent-assets',
    requires: [WORKSPACE_ASSET_SUPPORT, AGENT_ASSETS_RUNTIME],
    provides: [AGENT_ASSETS_APPLICATION, AGENT_ASSETS_INTERNAL, AGENT_ASSETS_OPENSPEC_SUPPORT, AGENT_ASSETS_DIAGNOSTICS_READ, AGENT_ASSETS_PACKAGE_CHECK_SUPPORT, AGENT_ASSETS_DIAGNOSTICS_BINDER],
    contributions: {
      cli: [
        'package check', 'package build', 'runtime list',
        'commands check', 'commands add', 'commands remove',
        'component list', 'component check', 'component install', 'component uninstall',
        'rules add', 'rules remove',
        'builtin list', 'builtin uninstall', 'builtin restore',
        'render', 'sync',
        'skills add', 'skills remove', 'skills bind', 'skills unbind',
        'skill install', 'runtime check', 'skills render', 'rules render',
      ],
      http: ['agent-assets.http'],
      diagnostics: ['agent-assets.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'publication',
    requires: [WORKSPACE_QUERY],
    provides: ['publication.application'],
    contributions: { cli: [], http: ['publication.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'openspec',
    requires: [WORKSPACE_QUERY, AGENT_ASSETS_OPENSPEC_SUPPORT],
    provides: ['openspec.application', 'openspec.query'],
    contributions: {
      cli: ['openspec converge', 'openspec convergence preflight', 'openspec convergence inspect'],
      http: [], diagnostics: [],
    },
    lifecycle: 'none',
  }, {
    id: 'task',
    requires: [WORKSPACE_TASK_SUPPORT],
    provides: [TASK_QUERY_APPLICATION, TASK_COMMAND_APPLICATION, TASK_RUNTIME_PORT, TASK_CHANGE_BINDER],
    contributions: {
      cli: ['task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon'],
      http: ['task.http'],
      diagnostics: ['task.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'task-daily-progress',
    requires: [WORKSPACE_QUERY, TASK_QUERY_APPLICATION],
    provides: [PROJECT_DAILY_PROGRESS_APPLICATION],
    contributions: { cli: ['project daily-progress record', 'project daily-progress inspect', 'project daily-progress list'], http: ['task.daily-progress.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'task-worktree-provider',
    requires: [TASK_QUERY_APPLICATION, WORKSPACE_QUERY],
    provides: [TASK_WORKTREE_PROVIDER],
    contributions: { cli: ['worktree create', 'worktree cleanup', 'worktree inspect'], http: [], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'change',
    requires: ['openspec.query', WORKSPACE_QUERY, TASK_WORKTREE_PROVIDER, TASK_QUERY_APPLICATION],
    provides: ['change.application'],
    contributions: { cli: [], http: ['change.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'project-verification',
    requires: [WORKSPACE_QUERY],
    provides: [VERIFICATION_APPLICATION, VERIFICATION_DECLARATION],
    contributions: { cli: ['project verification inspect', 'project verification validate', 'project verification update'], http: [], diagnostics: ['project-verification.diagnostics'] },
    lifecycle: 'none',
  }, {
    id: 'task-review',
    requires: [TASK_QUERY_APPLICATION, WORKSPACE_TASK_SUPPORT],
    provides: [TASK_REVIEW_APPLICATION, TASK_REVIEW_PERSISTENCE_READ, TASK_REVIEW_RUNTIME_PORT],
    contributions: {
      cli: ['task review inspect', 'task review record'],
      http: ['task-review.http'],
      diagnostics: [],
    },
    lifecycle: 'none',
  }, {
    id: 'task-verification',
    requires: [TASK_QUERY_APPLICATION, WORKSPACE_TASK_SUPPORT, VERIFICATION_DECLARATION],
    provides: ['task-verification.application', 'task-verification.persistence-read', 'task-verification.runtime-port'],
    contributions: { cli: ['task verification inspect', 'task verification record'], http: ['task-verification.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'task-parent-coordination',
    requires: [TASK_QUERY_APPLICATION],
    provides: ['task-parent-coordination.application', 'task-parent-coordination.runtime-port'],
    contributions: {
      cli: ['task parent inspect'],
      http: ['task-parent-coordination.http'],
      diagnostics: [],
    },
    lifecycle: 'none',
  }, {
    id: 'system-installation',
    requires: [],
    provides: [SYSTEM_INSTALLATION_IDENTITY, SYSTEM_INSTALLATION_LAUNCHER, SYSTEM_INSTALLATION_APPLICATION],
    contributions: {
      cli: [
        'installation status', 'update check', 'update',
        'web launcher install', 'web launcher status', 'web launcher repair', 'web launcher uninstall',
      ],
      http: ['system-installation.release-awareness.http'],
      diagnostics: ['system-installation.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'web-instance-lifecycle',
    requires: [WORKSPACE_APPLICATION, SYSTEM_INSTALLATION_IDENTITY, SYSTEM_INSTALLATION_LAUNCHER],
    provides: [WEB_INSTANCE_LIFECYCLE],
    contributions: {
      cli: ['web preview start', 'web preview list', 'web preview stop', 'web'],
      http: [],
      diagnostics: ['web-instance-lifecycle.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'system-doctor',
    requires: [WORKSPACE_DIAGNOSTICS, AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY, AGENT_ASSETS_DIAGNOSTICS_READ, VERIFICATION_DECLARATION, WORKSPACE_QUERY, SYSTEM_INSTALLATION_APPLICATION, WORKSPACE_APPLICATION],
    provides: ['system.doctor.application'],
    contributions: { cli: ['doctor'], http: [], diagnostics: [] },
    lifecycle: 'none',
  }]);
  assert.deepEqual(runtimeContributions(runtime, 'cli').map((item: any) => item.key), [
    'init', 'bootstrap guide', 'mutation recover', 'project create', 'service create',
    'package check', 'package build', 'runtime list',
    'commands check', 'commands add', 'commands remove',
    'component list', 'component check', 'component install', 'component uninstall',
    'rules add', 'rules remove',
    'builtin list', 'builtin uninstall', 'builtin restore',
    'render', 'sync',
    'skills add', 'skills remove', 'skills bind', 'skills unbind',
    'skill install', 'runtime check', 'skills render', 'rules render',
    'openspec converge', 'openspec convergence preflight', 'openspec convergence inspect',
    'task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon',
    'project daily-progress record', 'project daily-progress inspect', 'project daily-progress list',
    'worktree create', 'worktree cleanup', 'worktree inspect',
    'project verification inspect', 'project verification validate', 'project verification update',
    'task review inspect', 'task review record',
    'task verification inspect', 'task verification record',
    'task parent inspect',
    'installation status', 'update check', 'update',
    'web launcher install', 'web launcher status', 'web launcher repair', 'web launcher uninstall',
    'web preview start', 'web preview list', 'web preview stop', 'web',
    'doctor',
  ]);
  assert.deepEqual(runtimeContributions(runtime, 'http').map((item: any) => item.id), [
    'workspace-core.http', 'agent-assets.http', 'publication.http', 'task.http', 'task.daily-progress.http', 'change.http',
    'task-review.http', 'task-verification.http',
    'task-parent-coordination.http', 'system-installation.release-awareness.http',
  ]);

  const workspace: any = runtimeProvide(runtime, WORKSPACE_APPLICATION);
  const assetSupport = runtimeProvide(runtime, WORKSPACE_ASSET_SUPPORT);
  for (const name of ['inspectTask', 'recordProjectDailyProgress', 'writeDailyProgressDocument', 'withWorkspaceRegistryMutation']) {
    assert.equal(name in assetSupport, false, `asset support must not expose ${name}`);
  }
  const assetDiagnostics = runtimeProvide(runtime, AGENT_ASSETS_DIAGNOSTICS_READ);
  assert.equal(typeof assetDiagnostics.inspectPackageBuiltins, 'function');
  assert.equal('syncPackageBuiltins' in assetDiagnostics, false);
  assert.equal('syncRuntime' in assetDiagnostics, false);
  const project: any = runtimeProvide(runtime, PROJECT_APPLICATION);
  const service: any = runtimeProvide(runtime, SERVICE_APPLICATION);
  const query: any = runtimeProvide(runtime, WORKSPACE_QUERY);
  assert.equal(typeof workspace.getWorkspace, 'function');
  assert.equal(typeof project.listProjects, 'function');
  assert.equal(typeof service.listServices, 'function');
  assert.equal(typeof query.readProjectRegistryRecord, 'function');
  assert.equal(typeof query.readServiceRegistryRecord, 'function');
  const agentAssets: any = runtimeProvide(runtime, AGENT_ASSETS_APPLICATION);
  assert.equal(typeof agentAssets.skillsAdd, 'function');
  assert.equal(typeof agentAssets.componentInstall, 'function');
  assert.equal(typeof agentAssets.syncRuntime, 'function');
  const agentRuntime: any = runtimeProvide(runtime, AGENT_ASSETS_RUNTIME);
  assert.equal(typeof agentRuntime.getRuntimeAdapter, 'function');
  assert.equal(typeof agentRuntime.assembleRuntimeProjection, 'function');
  const taskQuery: any = runtimeProvide(runtime, TASK_QUERY_APPLICATION);
  const command: any = runtimeProvide(runtime, TASK_COMMAND_APPLICATION);
  assert.equal(typeof taskQuery.inspectTask, 'function');
  assert.equal(typeof taskQuery.inspectTaskRetrospectiveDocument, 'function');
  assert.equal(typeof taskQuery.readTask, 'function');
  assert.equal(taskQuery.createTask, undefined);
  assert.equal(typeof command.createTask, 'function');
  assert.equal(command.inspectTask, undefined);

  const runtimePort: any = runtimeProvide(runtime, TASK_RUNTIME_PORT);
  assert.deepEqual(runtimePort.testSupportMethods, ['createTaskPersistence', 'mutateTaskPersistence', 'writeTaskPersistence']);
  assert.equal(runtimePort.owner, undefined);
  assert.equal(runtimePort.exit, undefined);

  const webLifecycle: any = runtimeProvide(runtime, WEB_INSTANCE_LIFECYCLE);
  assert.equal(typeof webLifecycle.startBuildrWeb, 'function');
  assert.equal(typeof webLifecycle.manageBuildrWebPreview, 'function');
});

test('Workspace 模块使用私有组合并只拆分超界 Application', () => {
  const moduleSource = read('src/modules/workspace/module.ts');
  assert.match(moduleSource, /const privateComposition = Object\.assign\(Object\.create\(runtime\), agentRuntime\)/);
  assert.match(moduleSource, /registerWorkspaceQueryApplication\(privateComposition\)/);
  assert.match(moduleSource, /registerWorkspaceCommandApplication\(privateComposition\)/);
  assert.match(moduleSource, /registerProjectApplication\(privateComposition\)/);
  assert.match(moduleSource, /registerServiceApplication\(privateComposition\)/);
  assert.doesNotMatch(moduleSource, /registerWorkspace(?:Query|Command)Application\(runtime\)/);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/workspace-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/workspace-query-application.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/workspace-command-application.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/project-query-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/project-command-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/service-query-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/service-command-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/source-creation-support.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/project-creation-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/service-creation-application.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/modules/workspace/application/source-creation-policy.ts')), false);
  assert.doesNotMatch(moduleSource, /Object\\.entries\\(privateComposition\\)/);
  assert.match(moduleSource, /projectRepository/);
  assert.match(moduleSource, /serviceRepository/);
  const sourceGit = read('src/modules/workspace/infrastructure/workspace-source-git.ts');
  assert.match(sourceGit, /function gitOutput/);
  assert.match(sourceGit, /function inspectAttachedGitRoot/);
});

test('Agent Assets CLI contributions 保留公开根帮助的历史位置', () => {
  const keys: any = COMMAND_CATALOG.filter((item: any) => item.executable).map((item: any) => item.key);
  assert.deepEqual(keys.slice(keys.indexOf('bootstrap guide'), keys.indexOf('project daily-progress record') + 1), [
    'bootstrap guide', 'package check', 'package build', 'project daily-progress record',
  ]);
  assert.deepEqual(keys.slice(keys.indexOf('mutation recover'), keys.indexOf('openspec converge') + 1), [
    'mutation recover', 'runtime list', 'commands check', 'commands add', 'commands remove', 'openspec converge',
  ]);
  assert.deepEqual(keys.slice(keys.indexOf('openspec convergence inspect')), [
    'openspec convergence inspect',
    'component list', 'component check', 'component install', 'component uninstall',
    'rules add', 'rules remove',
    'builtin list', 'builtin uninstall', 'builtin restore',
    'render', 'sync',
    'skills add', 'skills remove', 'skills bind', 'skills unbind',
    'skill install', 'runtime check', 'skills render', 'rules render',
  ]);
});

test('Agent Assets 旧全局路径与 legacy runtime 已经退出', () => {
  for (const relative of [
    'src/application/domains/rules.mjs',
    'src/application/domains/skills.mjs',
    'src/application/domains/commands.mjs',
    'src/application/domains/components.mjs',
    'src/application/domains/runtime.ts',
    'src/application/package-maintenance.mjs',
    'src/application/package-maintenance',
    'src/application/runtime.ts',
    'src/infrastructure/runtime',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);

  assert.equal(fs.existsSync(path.join(root, 'src/bootstrap/legacy-runtime-module.mjs')), false);
  assert.match(read('src/bootstrap/runtime.ts'), /createAgentAssetsModule/);
});

test('System Installation module owns installation identity, update and npm Launcher boundaries', () => {
  const runtime: any = createRuntime();
  const identity: any = runtimeProvide(runtime, SYSTEM_INSTALLATION_IDENTITY);
  const launcher: any = runtimeProvide(runtime, SYSTEM_INSTALLATION_LAUNCHER);
  const application: any = runtimeProvide(runtime, SYSTEM_INSTALLATION_APPLICATION);

  assert.deepEqual(Object.keys(identity), ['readCurrentProductIdentity']);
  assert.deepEqual(Object.keys(launcher), [
    'assertCurrentNpmLauncherBinding', 'refreshInstalledNpmLauncher', 'validateNpmLauncherBinding',
  ]);
  assert.equal(typeof application.releaseAwareness, 'function');
  assert.equal(typeof application.buildInstallationInventory, 'function');

  const cliHost: any = read('src/bootstrap/cli/registry.ts');
  assert.match(cliHost, /from '..\/..\/modules\/installation\/module\.ts'/);
  assert.doesNotMatch(cliHost, /modules\/installation\/(?:application|infrastructure|interfaces)/);
  for (const relative of [
    'src/application/cli-update.mjs',
    'src/application/npm-installation-enrollment.mjs',
    'src/application/product-installation-status.mjs',
    'src/application/release-awareness.mjs',
    'src/infrastructure/product-identity/current-product-identity.mjs',
    'src/infrastructure/product-identity/installation-origin.mjs',
    'src/infrastructure/product-identity/installation-registry.mjs',
    'src/infrastructure/product-identity/launcher-binding.mjs',
    'src/infrastructure/product-identity/web-profile.ts',
    'src/infrastructure/product-launcher/index.mjs',
    'src/interfaces/cli/launcher.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
});

test('Task Review module 只公开共享 Application、只读 Persistence 与正式 runtime port', () => {
  const runtime: any = createRuntime();
  const application: any = runtimeProvide(runtime, TASK_REVIEW_APPLICATION);
  assert.deepEqual(Object.keys(application), ['inspectTaskReview', 'recordTaskReview']);

  const persistenceRead: any = runtimeProvide(runtime, TASK_REVIEW_PERSISTENCE_READ);
  assert.equal(typeof persistenceRead.readTaskReviewResultPersistence, 'function');
  assert.equal(persistenceRead.writeTaskReviewResultPersistence, undefined);

  const runtimePort: any = runtimeProvide(runtime, TASK_REVIEW_RUNTIME_PORT);
  assert.deepEqual(Object.keys(runtimePort.testSupportProperties), ['taskReviewSerialize']);
  assert.equal(runtimePort.owner, undefined);
  assert.equal(runtimePort.exit, undefined);
});

test('Task Review 旧全局技术层路径已经退出', () => {
  for (const relative of [
    'src/domain/task-review/task-review.mjs',
    'src/application/task-review/task-review-application.ts',
    'src/interfaces/cli/task-review.ts',
    'src/modules/task/persistence/review/task-review-repository.ts',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
});

test('Task Retrospective独立模块已经退出，文档读取归属Task Record', () => {
  const runtime: any = createRuntime();
  assert.equal(runtimeModuleSnapshot(runtime).some((item: any) => item.id === 'task-retrospective'), false);
  assert.equal(runtime.recordTaskRetrospective, undefined);
  assert.equal(runtime.handleTaskRetrospective, undefined);
  assert.equal(runtime.listTaskRetrospectives, undefined);
  assert.equal(typeof runtimeProvide(runtime, TASK_QUERY_APPLICATION).inspectTaskRetrospectiveDocument, 'function');
});

test('Task Retrospective 旧全局技术层路径已经退出', () => {
  for (const relative of [
    'src/domain/task-retrospective/task-retrospective.mjs',
    'src/application/task-retrospective/task-retrospective-application.mjs',
    'src/application/task-retrospective-prompt.mjs',
    'src/modules/task/persistence/retrospective/task-retrospective-repository.ts',
    'src/interfaces/internal/task-retrospective-driver.mjs',
    'src/interfaces/internal/task-retrospective-driver-runner.mjs',
    'src/modules/task/application/task-retrospective-application.mjs',
    'src/modules/task/domain/task-retrospective.mjs',
    'src/modules/task/interfaces/http/task-retrospective-http.mjs',
    'src/modules/task/interfaces/internal/task-retrospective-driver.mjs',
    'src/modules/task/persistence/task-retrospective-repository.ts',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
});

test('Task 生命周期核心只保留模块内扁平技术层', () => {
  for (const relative of [
    'src/domain/parent-coordination/parent-coordination.ts',
    'src/domain/task-environment/task-environment.mjs',
    'src/domain/task-verification/task-verification.mjs',
    'src/application/parent-coordination/parent-coordination-application.ts',
    'src/application/task-environment/task-environment-application.mjs',
    'src/application/task-overview/task-overview-application.ts',
    'src/application/task-verification/task-verification-application.mjs',
    'src/interfaces/cli/task-environment.mjs',
    'src/modules/task/persistence/index.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);

  assert.equal(fs.existsSync(path.join(root, 'src/modules/task/interfaces/http/task-lifecycle-core.ts')), true);

  const host: any = read('src/web/http/server.ts');
  assert.doesNotMatch(host, /recordParentPlan|reconcileParentPlan|readTaskEnvironmentCurrent|taskDevelopmentMatch|taskVerificationMatch/);
});
