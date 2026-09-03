import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { COMMAND_CATALOG } from '../../src/bootstrap/cli/registry.mjs';
import { createRuntime, runtimeContributions, runtimeModuleSnapshot, runtimeProvide } from '../../src/bootstrap/runtime.mjs';
import {
  AGENT_ASSETS_APPLICATION,
  AGENT_ASSETS_CAPABILITY_QUERY,
  AGENT_ASSETS_RUNTIME,
} from '../../src/agent-assets/module.mjs';
import {
  TASK_RECORD_APPLICATION,
  TASK_RECORD_RUNTIME_PORT,
  TASK_RECORD_PERSISTENCE_READ,
  TASK_REVIEW_APPLICATION,
  TASK_REVIEW_RUNTIME_PORT,
  TASK_REVIEW_PERSISTENCE_READ,
  TASK_WORKTREE_PROVIDER,
} from '../../src/task/module.ts';
import {
  VERIFICATION_APPLICATION,
  VERIFICATION_DECLARATION,
} from '../../src/verification/module.ts';
import {
  SYSTEM_INSTALLATION_APPLICATION,
  SYSTEM_INSTALLATION_IDENTITY,
  SYSTEM_INSTALLATION_LAUNCHER,
} from '../../src/system/installation/module.mjs';
import { WEB_INSTANCE_LIFECYCLE } from '../../src/web/module.ts';
import {
  PROJECT_DAILY_PROGRESS_APPLICATION,
  PROJECT_APPLICATION,
  SERVICE_APPLICATION,
  WORKSPACE_QUERY,
  WORKSPACE_APPLICATION,
} from '../../src/workspace/module.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Bootstrap 是唯一 composition root，bin 与公共 Host 不直连 Task 内部 Adapter', () => {
  assert.match(read('bin/buildr.mjs'), /src\/bootstrap\/cli\/main\.ts/);
  assert.equal(fs.existsSync(path.join(root, 'src/application/compose-runtime.mjs')), false);
  const bootstrap = read('src/bootstrap/runtime.mjs');
  assert.match(bootstrap, /createModuleRegistry/);
  assert.doesNotMatch(bootstrap, /registerLegacyRuntime|legacy-runtime-module/);
  assert.equal(fs.existsSync(path.join(root, 'src/bootstrap/legacy-runtime-module.mjs')), false);
  assert.doesNotMatch(bootstrap, /registerTaskRecord(?:Repository|Application)/);

  const cliHost = read('src/bootstrap/cli/registry.mjs');
  assert.match(cliHost, /from '..\/..\/task\/module\.ts'/);
  assert.doesNotMatch(cliHost, /task\/interfaces\/(?:cli|http)/);
  assert.match(cliHost, /runtimeContributions\(runtime, 'cli'\)/);

  const httpHost = read('src/web/http/server.ts');
  assert.doesNotMatch(httpHost, /task\/interfaces\/(?:cli|http)|task-(?:record|review|retrospective)-http|taskRetrospectiveMatch/);
  assert.match(httpHost, /createLocalWorkspaceRequestRouter/);
  const httpRouter = read('src/web/http/router.ts');
  assert.doesNotMatch(httpRouter, /task\/interfaces\/(?:cli|http)|task-(?:record|review|retrospective)-http|taskRetrospectiveMatch/);
  assert.match(httpRouter, /for \(const contribution of httpContributions\)/);
  assert.match(httpRouter, /contribution\.handle\(/);
});

test('Workspace、Agent Assets、Task、Web 与 Doctor modules 暴露显式 capability、contribution 与 runtime port', () => {
  const runtime = createRuntime();
  assert.deepEqual(runtimeModuleSnapshot(runtime), [{
    id: 'agent-assets-runtime',
    requires: [],
    provides: [AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY],
    contributions: { cli: [], http: [], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'workspace-core',
    requires: [AGENT_ASSETS_RUNTIME],
    provides: [WORKSPACE_APPLICATION, PROJECT_APPLICATION, SERVICE_APPLICATION, WORKSPACE_QUERY, PROJECT_DAILY_PROGRESS_APPLICATION],
    contributions: {
      cli: ['project create', 'service create', 'project daily-progress record', 'project daily-progress inspect', 'project daily-progress list'],
      http: ['workspace-core.http'],
      diagnostics: ['workspace.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'agent-assets',
    requires: [WORKSPACE_APPLICATION, WORKSPACE_QUERY, AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY],
    provides: [AGENT_ASSETS_APPLICATION],
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
    requires: ['project.application'],
    provides: ['publication.application'],
    contributions: { cli: [], http: ['publication.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'openspec',
    requires: ['project.application'],
    provides: ['openspec.application', 'openspec.query'],
    contributions: {
      cli: ['openspec converge', 'openspec convergence preflight', 'openspec convergence inspect'],
      http: [], diagnostics: [],
    },
    lifecycle: 'none',
  }, {
    id: 'task-worktree-provider',
    requires: [],
    provides: [TASK_WORKTREE_PROVIDER],
    contributions: { cli: ['worktree create', 'worktree cleanup', 'worktree inspect'], http: [], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'change',
    requires: ['openspec.query', 'project.application', TASK_WORKTREE_PROVIDER],
    provides: ['change.application'],
    contributions: { cli: [], http: ['change.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'task-record',
    requires: ['workspace.structured-store', 'project-service.reader', 'change.resolver', 'workspace.operation-memoizer'],
    provides: [TASK_RECORD_APPLICATION, TASK_RECORD_PERSISTENCE_READ, TASK_RECORD_RUNTIME_PORT],
    contributions: {
      cli: ['task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon'],
      http: ['task-record.http'],
      diagnostics: ['task-record.diagnostics'],
    },
    lifecycle: 'none',
  }, {
    id: 'project-verification',
    requires: [],
    provides: [VERIFICATION_APPLICATION, VERIFICATION_DECLARATION],
    contributions: { cli: [], http: [], diagnostics: ['project-verification.diagnostics'] },
    lifecycle: 'none',
  }, {
    id: 'task-review',
    requires: [TASK_RECORD_PERSISTENCE_READ, 'workspace.structured-store'],
    provides: [TASK_REVIEW_APPLICATION, TASK_REVIEW_PERSISTENCE_READ, TASK_REVIEW_RUNTIME_PORT],
    contributions: {
      cli: ['task review inspect', 'task review record'],
      http: ['task-review.http'],
      diagnostics: [],
    },
    lifecycle: 'none',
  }, {
    id: 'task-verification',
    requires: ['task-record.persistence-read', VERIFICATION_DECLARATION],
    provides: ['task-verification.application', 'task-verification.persistence-read', 'task-verification.runtime-port'],
    contributions: { cli: ['task verification inspect', 'task verification record'], http: ['task-verification.http'], diagnostics: [] },
    lifecycle: 'none',
  }, {
    id: 'task-parent-coordination',
    requires: ['task-record.application', 'task-record.persistence-read'],
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
    requires: [AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY, VERIFICATION_DECLARATION, WORKSPACE_QUERY],
    provides: ['system.doctor.application'],
    contributions: { cli: ['doctor'], http: [], diagnostics: [] },
    lifecycle: 'none',
  }]);
  assert.deepEqual(runtimeContributions(runtime, 'cli').map((item) => item.key), [
    'project create', 'service create',
    'project daily-progress record', 'project daily-progress inspect', 'project daily-progress list',
    'package check', 'package build', 'runtime list',
    'commands check', 'commands add', 'commands remove',
    'component list', 'component check', 'component install', 'component uninstall',
    'rules add', 'rules remove',
    'builtin list', 'builtin uninstall', 'builtin restore',
    'render', 'sync',
    'skills add', 'skills remove', 'skills bind', 'skills unbind',
    'skill install', 'runtime check', 'skills render', 'rules render',
    'openspec converge', 'openspec convergence preflight', 'openspec convergence inspect',
    'worktree create', 'worktree cleanup', 'worktree inspect',
    'task create', 'task inspect', 'task update', 'task activate', 'task complete', 'task abandon',
    'task review inspect', 'task review record',
    'task verification inspect', 'task verification record',
    'task parent inspect',
    'installation status', 'update check', 'update',
    'web launcher install', 'web launcher status', 'web launcher repair', 'web launcher uninstall',
    'web preview start', 'web preview list', 'web preview stop', 'web',
    'doctor',
  ]);
  assert.deepEqual(runtimeContributions(runtime, 'http').map((item) => item.id), [
    'workspace-core.http', 'agent-assets.http', 'publication.http', 'change.http', 'task-record.http',
    'task-review.http', 'task-verification.http',
    'task-parent-coordination.http', 'system-installation.release-awareness.http',
  ]);

  const workspace = runtimeProvide(runtime, WORKSPACE_APPLICATION);
  const project = runtimeProvide(runtime, PROJECT_APPLICATION);
  const service = runtimeProvide(runtime, SERVICE_APPLICATION);
  const query = runtimeProvide(runtime, WORKSPACE_QUERY);
  assert.equal(typeof workspace.getWorkspace, 'function');
  assert.equal(typeof project.listProjects, 'function');
  assert.equal(typeof service.listServices, 'function');
  assert.equal(typeof query.readProjectRegistryRecord, 'function');
  assert.equal(typeof query.readServiceRegistryRecord, 'function');
  const agentAssets = runtimeProvide(runtime, AGENT_ASSETS_APPLICATION);
  assert.equal(typeof agentAssets.skillsAdd, 'function');
  assert.equal(typeof agentAssets.componentInstall, 'function');
  assert.equal(typeof agentAssets.syncRuntime, 'function');
  const agentRuntime = runtimeProvide(runtime, AGENT_ASSETS_RUNTIME);
  assert.equal(typeof agentRuntime.getRuntimeAdapter, 'function');
  assert.equal(typeof agentRuntime.assembleRuntimeProjection, 'function');
  const application = runtimeProvide(runtime, TASK_RECORD_APPLICATION);
  const persistenceRead = runtimeProvide(runtime, TASK_RECORD_PERSISTENCE_READ);
  assert.equal(typeof application.inspectTaskRecord, 'function');
  assert.equal(typeof application.inspectTaskRetrospectiveDocument, 'function');
  assert.equal(typeof application.createTaskRecord, 'function');
  assert.equal(typeof persistenceRead.readTaskRecordPersistence, 'function');
  assert.equal(typeof persistenceRead.readTaskRetrospectiveDocumentPersistence, 'function');
  assert.equal(persistenceRead.createTaskRecordPersistence, undefined);

  const runtimePort = runtimeProvide(runtime, TASK_RECORD_RUNTIME_PORT);
  assert.deepEqual(runtimePort.testSupportMethods, ['createTaskRecordPersistence', 'mutateTaskRecordPersistence', 'writeTaskRecordPersistence']);
  assert.equal(runtimePort.owner, undefined);
  assert.equal(runtimePort.exit, undefined);

  const webLifecycle = runtimeProvide(runtime, WEB_INSTANCE_LIFECYCLE);
  assert.equal(typeof webLifecycle.startBuildrWeb, 'function');
  assert.equal(typeof webLifecycle.manageBuildrWebPreview, 'function');
});

test('Agent Assets CLI contributions 保留公开根帮助的历史位置', () => {
  const keys = COMMAND_CATALOG.filter((item) => item.executable).map((item) => item.key);
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
    'src/application/domains/runtime.mjs',
    'src/application/package-maintenance.mjs',
    'src/application/package-maintenance',
    'src/application/runtime.mjs',
    'src/infrastructure/runtime',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);

  assert.equal(fs.existsSync(path.join(root, 'src/bootstrap/legacy-runtime-module.mjs')), false);
  assert.match(read('src/bootstrap/runtime.mjs'), /createAgentAssetsModule/);
});

test('System Installation module owns installation identity, update and npm Launcher boundaries', () => {
  const runtime = createRuntime();
  const identity = runtimeProvide(runtime, SYSTEM_INSTALLATION_IDENTITY);
  const launcher = runtimeProvide(runtime, SYSTEM_INSTALLATION_LAUNCHER);
  const application = runtimeProvide(runtime, SYSTEM_INSTALLATION_APPLICATION);

  assert.deepEqual(Object.keys(identity), ['readCurrentProductIdentity']);
  assert.deepEqual(Object.keys(launcher), [
    'assertCurrentNpmLauncherBinding', 'refreshInstalledNpmLauncher', 'validateNpmLauncherBinding',
  ]);
  assert.equal(typeof application.releaseAwareness, 'function');
  assert.equal(typeof application.buildInstallationInventory, 'function');

  const cliHost = read('src/bootstrap/cli/registry.mjs');
  assert.match(cliHost, /from '..\/..\/system\/installation\/module\.mjs'/);
  assert.doesNotMatch(cliHost, /system\/installation\/(?:application|infrastructure|interfaces)/);
  for (const relative of [
    'src/application/cli-update.mjs',
    'src/application/npm-installation-enrollment.mjs',
    'src/application/product-installation-status.mjs',
    'src/application/release-awareness.mjs',
    'src/infrastructure/product-identity/current-product-identity.mjs',
    'src/infrastructure/product-identity/installation-origin.mjs',
    'src/infrastructure/product-identity/installation-registry.mjs',
    'src/infrastructure/product-identity/launcher-binding.mjs',
    'src/infrastructure/product-identity/web-profile.mjs',
    'src/infrastructure/product-launcher/index.mjs',
    'src/interfaces/cli/launcher.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
});

test('Task Review module 只公开共享 Application、只读 Persistence 与正式 runtime port', () => {
  const runtime = createRuntime();
  const application = runtimeProvide(runtime, TASK_REVIEW_APPLICATION);
  assert.deepEqual(Object.keys(application), ['inspectTaskReview', 'recordTaskReview']);

  const persistenceRead = runtimeProvide(runtime, TASK_REVIEW_PERSISTENCE_READ);
  assert.equal(typeof persistenceRead.readTaskReviewResultPersistence, 'function');
  assert.equal(persistenceRead.writeTaskReviewResultPersistence, undefined);

  const runtimePort = runtimeProvide(runtime, TASK_REVIEW_RUNTIME_PORT);
  assert.deepEqual(Object.keys(runtimePort.testSupportProperties), ['taskReviewSerialize']);
  assert.equal(runtimePort.owner, undefined);
  assert.equal(runtimePort.exit, undefined);
});

test('Task Review 旧全局技术层路径已经退出', () => {
  for (const relative of [
    'src/domain/task-review/task-review.mjs',
    'src/application/task-review/task-review-application.ts',
    'src/interfaces/cli/task-review.ts',
    'src/task/persistence/review/task-review-repository.ts',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
});

test('Task Retrospective独立模块已经退出，文档读取归属Task Record', () => {
  const runtime = createRuntime();
  assert.equal(runtimeModuleSnapshot(runtime).some((item) => item.id === 'task-retrospective'), false);
  assert.equal(runtime.recordTaskRetrospective, undefined);
  assert.equal(runtime.handleTaskRetrospective, undefined);
  assert.equal(runtime.listTaskRetrospectives, undefined);
  assert.equal(typeof runtimeProvide(runtime, TASK_RECORD_APPLICATION).inspectTaskRetrospectiveDocument, 'function');
});

test('Task Retrospective 旧全局技术层路径已经退出', () => {
  for (const relative of [
    'src/domain/task-retrospective/task-retrospective.mjs',
    'src/application/task-retrospective/task-retrospective-application.mjs',
    'src/application/task-retrospective-prompt.mjs',
    'src/task/persistence/retrospective/task-retrospective-repository.mjs',
    'src/interfaces/internal/task-retrospective-driver.mjs',
    'src/interfaces/internal/task-retrospective-driver-runner.mjs',
    'src/task/application/task-retrospective-application.mjs',
    'src/task/domain/task-retrospective.mjs',
    'src/task/interfaces/http/task-retrospective-http.mjs',
    'src/task/interfaces/internal/task-retrospective-driver.mjs',
    'src/task/persistence/task-retrospective-repository.mjs',
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
    'src/task/persistence/index.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative);

  assert.equal(fs.existsSync(path.join(root, 'src/task/interfaces/http/task-lifecycle-core.ts')), true);

  const host = read('src/web/http/server.ts');
  assert.doesNotMatch(host, /recordParentPlan|reconcileParentPlan|readTaskEnvironmentCurrent|taskDevelopmentMatch|taskVerificationMatch/);
});
