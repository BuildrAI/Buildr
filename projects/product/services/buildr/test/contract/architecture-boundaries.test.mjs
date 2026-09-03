import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRuntime, runtimeContributions, runtimeModuleSnapshot } from '../../src/bootstrap/runtime.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function lines(relative) {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8').trimEnd().split(/\r?\n/);
}

test('保留入口保持有界且 Doctor 已归属 System', () => {
  assert.ok(lines('src/agent-assets/infrastructure/runtime/render-claude-code.mjs').length <= 100);
  assert.ok(lines('src/system/doctor/application/diagnostics.mjs').length <= 250);
  assert.ok(lines('src/agent-assets/application/package-maintenance.mjs').length <= 550);
});

test('package verification 使用稳定 registry 且不恢复共享 smoke runner', () => {
  const application = fs.readFileSync(path.join(productRoot, 'src/agent-assets/application/package-maintenance.mjs'), 'utf8');
  const smoke = fs.readFileSync(path.join(productRoot, 'src/agent-assets/application/package-maintenance/smoke-checks.mjs'), 'utf8');
  const registry = fs.readFileSync(path.join(productRoot, 'src/agent-assets/application/package-maintenance/verification-registry.mjs'), 'utf8');
  assert.match(application, /selectPackageVerifiers/);
  assert.equal(application.match(/validatePackageStatic\(context\)/g)?.length, 1);
  for (const runner of ['runPackageWorkspaceSmoke', 'runPackageDomainIntegration', 'runPackageRuntimeIntegration']) {
    assert.match(application, new RegExp(`${runner}\\(smokeContext`));
  }
  assert.match(application, /static package validation is owned by selector static/);
  assert.doesNotMatch(smoke, /runPackageSmokeChecks/);
  for (const selector of ['static', 'workspace', 'commands', 'rules', 'skills', 'runtime']) {
    assert.match(registry, new RegExp(`id: '${selector}'`));
  }
});

test('Product platform namespace 只允许 composition root 聚合', () => {
  const sourceRoot = path.join(productRoot, 'src');
  const violations = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.mjs') && /import \* as platform/.test(fs.readFileSync(file, 'utf8'))) {
        const relative = path.relative(productRoot, file).split(path.sep).join('/');
        if (relative !== 'src/bootstrap/runtime.mjs') violations.push(relative);
      }
    }
  };
  visit(sourceRoot);
  assert.deepEqual(violations, []);
});

test('Windows 平台身份、Node 脚本启动与 runtime mode 使用共享 owner', () => {
  const identityConsumers = [
    'src/task/infrastructure/git-worktree-provider.ts',
    'src/web/application/preview-lifecycle.ts',
    'package/launchers/manage.mjs',
  ];
  for (const relative of identityConsumers) {
    const source = fs.readFileSync(path.join(productRoot, relative), 'utf8');
    assert.match(source, /sameFilesystemPath/, `${relative} must use the shared filesystem identity owner`);
  }
  const worktree = fs.readFileSync(path.join(productRoot, 'src/task/infrastructure/git-worktree-provider.ts'), 'utf8');
  assert.doesNotMatch(worktree, /identity\.repository\s*!==\s*item\.checkoutPath/);
  const adapter = fs.readFileSync(path.join(productRoot, 'src/agent-assets/infrastructure/runtime/adapter-contract.mjs'), 'utf8');
  assert.match(adapter, /runtimeWriteModeMatches/);
  assert.doesNotMatch(adapter, /ownerExecutable/);
  const closeout = fs.readFileSync(path.join(productRoot, '../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), 'utf8');
  assert.match(closeout, /productCommand\(execute, root, nodeExecutable/);
  assert.match(closeout, /path\.join\(root, PRODUCT_ROOT, 'buildr'\)/);
  assert.match(closeout, /BUILDR_NODE: nodeExecutable/);
  assert.doesNotMatch(closeout, /resolveDefaultBuildr|install-development-cli/u);
});

test('Buildr Web 实例生命周期使用扁平技术层且 HTTP Host 不拥有运行策略', () => {
  for (const relative of [
    'src/web/module.ts',
    'src/web/application/instance-lifecycle.ts',
    'src/web/application/preview-lifecycle.ts',
    'src/web/infrastructure/instance-runtime.ts',
    'src/web/interfaces/cli/web.ts',
  ]) assert.equal(fs.existsSync(path.join(productRoot, relative)), true, `missing ${relative}`);
  for (const legacy of ['instance-manager.mjs', 'preview-manager.mjs', 'scheduled-maintenance.mjs']) {
    assert.equal(fs.existsSync(path.join(productRoot, 'src/web/runtime', legacy)), false);
  }
  const host = fs.readFileSync(path.join(productRoot, 'src/web/http/server.ts'), 'utf8');
  assert.doesNotMatch(host, /registerLocalWorkspaceAppInterface|startBuildrWeb|manageBuildrWebPreview|scheduledMaintenance/);
  const lifecycle = fs.readFileSync(path.join(productRoot, 'src/web/application/instance-lifecycle.ts'), 'utf8');
  assert.doesNotMatch(lifecycle, /ensureRegisteredTarget\(runtime,/);
  const registry = fs.readFileSync(path.join(productRoot, 'src/bootstrap/cli/registry.mjs'), 'utf8');
  assert.doesNotMatch(registry, /key: "web preview|key: "web"/);
});

test('旧 Task Development、Finish 与 Terminal Delivery runtime 已整体退出', () => {
  for (const relative of [
    'src/task/application/finish/task-finish-application.mjs',
    'src/task/application/task-terminal-delivery-application.ts',
    'src/task/persistence/task-finish-repository.mjs',
    'src/task/interfaces/cli/task-terminal-delivery.mjs',
    'src/task/interfaces/internal/task-finish-maintenance-driver.mjs',
    'src/task/interfaces/internal/task-finish-retained-cleanup.mjs',
    'src/task/interfaces/internal/task-finish-target-lease-driver.mjs',
    'src/application/task-finish',
    'src/application/task-terminal-delivery',
    'src/task/persistence/finish',
    'src/interfaces/cli/task-terminal-delivery.mjs',
    'src/interfaces/internal/task-finish-maintenance-driver.mjs',
    'src/interfaces/internal/task-finish-retained-cleanup.mjs',
    'src/interfaces/internal/task-finish-target-lease-driver.mjs',
  ]) assert.equal(fs.existsSync(path.join(productRoot, relative)), false, `legacy entry remains: ${relative}`);

  const runtime = createRuntime();
  const modules = runtimeModuleSnapshot(runtime);
  assert.equal(modules.some((module) => ['task-development', 'task-planning-identity', 'task-finish', 'task-terminal-delivery'].includes(module.id)), false);
  assert.deepEqual(
    runtimeContributions(runtime, 'cli')
      .filter((route) => route.key.startsWith('task finish ') || route.key === 'task delivery inspect')
      .map((route) => route.key),
    [],
  );
  assert.equal(fs.existsSync(path.join(productRoot, 'src/bootstrap/legacy-runtime-module.mjs')), false);
  const cliRegistry = fs.readFileSync(path.join(productRoot, 'src/bootstrap/cli/registry.mjs'), 'utf8');
  assert.doesNotMatch(cliRegistry, /key: ["']task (?:finish (?:inspect|rollover|reconcile|run)|delivery inspect)/);
});

test('Workspace、Project 与 Service Domain 保持纯净且 Buildr Web 静态资源由构建产物交付', () => {
  const domain = fs.readFileSync(path.join(productRoot, 'src/workspace/domain/workspace.ts'), 'utf8');
  assert.doesNotMatch(domain, /yaml|filesystem|http|process|repository/i);
  const projectDomain = fs.readFileSync(path.join(productRoot, 'src/workspace/domain/project.ts'), 'utf8');
  assert.doesNotMatch(projectDomain, /node:|yaml|filesystem|http|process|runtime|repository/i);
  const serviceDomain = fs.readFileSync(path.join(productRoot, 'src/workspace/domain/service.ts'), 'utf8');
  assert.doesNotMatch(serviceDomain, /node:|yaml|filesystem|http|process|runtime|repository/i);
  for (const relative of [
    'src/web/http/server.ts',
    '../buildr-web/src/styles.css',
    '../buildr-web/src/main.tsx',
    '../buildr-web/src/App.tsx',
  ]) {
    assert.ok(fs.existsSync(path.join(productRoot, relative)), `missing ${relative}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  assert.match(fs.readFileSync(path.join(productRoot, '.gitignore'), 'utf8'), /^web-dist\/$/m);
  assert.equal(packageJson.bin.buildr, 'bin/buildr.mjs');
  const candidatePackage = fs.readFileSync(path.join(productRoot, 'test/verification/release/candidate-package.mjs'), 'utf8');
  assert.match(candidatePackage, /buildApplicationPayload\(/);
  assert.match(candidatePackage, /createReleaseArtifact\(/);
  assert.doesNotMatch(candidatePackage, /\['pack', productRoot/);
  assert.equal(fs.existsSync(path.join(productRoot, 'tools', 'development')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'tools', 'release')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/workspace/module.ts')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/project/project.mjs')), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/service/service.mjs')), false);
});
