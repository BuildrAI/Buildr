import { isScriptSource, platformNamespaceImports } from '../verification/cli/source-imports.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRuntime, runtimeContributions, runtimeModuleSnapshot } from '../helpers/runtime-harness.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function lines(relative: any): any  {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8').trimEnd().split(/\r?\n/);
}

test('保留入口保持有界且 Doctor 已归属 System', () => {
  assert.ok(lines('src/modules/agent-assets/infrastructure/runtime/render-claude-code.ts').length <= 100);
  assert.ok(lines('src/modules/diagnostics/application/diagnostics.ts').length <= 250);
  assert.ok(lines('src/modules/agent-assets/application/package-maintenance.ts').length <= 550);
});

test('package verification 使用稳定 registry 且不恢复共享 smoke runner', () => {
  const application: any = fs.readFileSync(path.join(productRoot, 'tools/verification/package-check.ts'), 'utf8');
  const smoke: any = fs.readFileSync(path.join(productRoot, 'tools/verification/package-check/smoke-checks.ts'), 'utf8');
  const registry: any = fs.readFileSync(path.join(productRoot, 'tools/verification/package-check/verification-registry.ts'), 'utf8');
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

function scanPlatformNamespaceImports(sourceRoot: string): string[] {
  const files: { path: string; source: string }[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (isScriptSource(entry.name)) {
        files.push({ path: path.relative(sourceRoot, file).split(path.sep).join('/'), source: fs.readFileSync(file, 'utf8') });
      }
    }
  };
  visit(sourceRoot);
  return platformNamespaceImports(files);
}

test('Product platform namespace 只允许 composition root 聚合', () => {
  // A positive control also proves the real production tree was scanned.
  assert.deepEqual(scanPlatformNamespaceImports(path.join(productRoot, 'src')), ['bootstrap/runtime.ts']);
});

test('Windows 平台身份、Node 脚本启动与 runtime mode 使用共享 owner', () => {
  const identityConsumers: any[] = [
    'src/modules/task/infrastructure/git-worktree-provider.ts',
    'src/web/application/preview-lifecycle.ts',
    'tools/build/launcher/manage.ts',
  ];
  for (const relative of identityConsumers) {
    const source: any = fs.readFileSync(path.join(productRoot, relative), 'utf8');
    assert.match(source, /sameFilesystemPath/, `${relative} must use the shared filesystem identity owner`);
  }
  const worktree: any = fs.readFileSync(path.join(productRoot, 'src/modules/task/infrastructure/git-worktree-provider.ts'), 'utf8');
  assert.doesNotMatch(worktree, /identity\.repository\s*!==\s*item\.checkoutPath/);
  const adapter: any = fs.readFileSync(path.join(productRoot, 'src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts'), 'utf8');
  assert.doesNotMatch(adapter, /node:fs|projection-files|runtime-reconciler|reconcileRuntimePlan/);
  assert.match(adapter, /function createRuntimePlan/);
  const reconciler = fs.readFileSync(path.join(productRoot, 'src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts'), 'utf8');
  assert.match(reconciler, /runtimeWriteModeMatches/);
  assert.doesNotMatch(reconciler, /ownerExecutable/);
  assert.match(reconciler, /function reconcileRuntimePlan/);
  const closeout: any = fs.readFileSync(path.join(productRoot, '../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), 'utf8');
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
  const host: any = fs.readFileSync(path.join(productRoot, 'src/web/http/server.ts'), 'utf8');
  assert.doesNotMatch(host, /registerLocalWorkspaceAppInterface|startBuildrWeb|manageBuildrWebPreview|scheduledMaintenance/);
  const lifecycle: any = fs.readFileSync(path.join(productRoot, 'src/web/application/instance-lifecycle.ts'), 'utf8');
  assert.doesNotMatch(lifecycle, /ensureRegisteredTarget\(runtime,/);
  const registry: any = fs.readFileSync(path.join(productRoot, 'src/bootstrap/cli/registry.ts'), 'utf8');
  assert.doesNotMatch(registry, /key: "web preview|key: "web"/);
});

test('旧 Task Development、Finish 与 Terminal Delivery runtime 已整体退出', () => {
  for (const relative of [
    'src/modules/task/application/finish/task-finish-application.mjs',
    'src/modules/task/application/task-terminal-delivery-application.ts',
    'src/modules/task/persistence/task-finish-repository.ts',
    'src/modules/task/interfaces/cli/task-terminal-delivery.mjs',
    'src/modules/task/interfaces/internal/task-finish-maintenance-driver.mjs',
    'src/modules/task/interfaces/internal/task-finish-retained-cleanup.mjs',
    'src/modules/task/interfaces/internal/task-finish-target-lease-driver.mjs',
    'src/application/task-finish',
    'src/application/task-terminal-delivery',
    'src/modules/task/persistence/finish',
    'src/interfaces/cli/task-terminal-delivery.mjs',
    'src/interfaces/internal/task-finish-maintenance-driver.mjs',
    'src/interfaces/internal/task-finish-retained-cleanup.mjs',
    'src/interfaces/internal/task-finish-target-lease-driver.mjs',
  ]) assert.equal(fs.existsSync(path.join(productRoot, relative)), false, `legacy entry remains: ${relative}`);

  const runtime: any = createRuntime();
  const modules: any = runtimeModuleSnapshot(runtime);
  assert.equal(modules.some((module: any) => ['task-development', 'task-planning-identity', 'task-finish', 'task-terminal-delivery'].includes(module.id)), false);
  assert.deepEqual(
    runtimeContributions(runtime, 'cli')
      .filter((route: any) => route.key.startsWith('task finish ') || route.key === 'task delivery inspect')
      .map((route: any) => route.key),
    [],
  );
  assert.equal(fs.existsSync(path.join(productRoot, 'src/bootstrap/legacy-runtime-module.mjs')), false);
  const cliRegistry: any = fs.readFileSync(path.join(productRoot, 'src/bootstrap/cli/registry.ts'), 'utf8');
  assert.doesNotMatch(cliRegistry, /key: ["']task (?:finish (?:inspect|rollover|reconcile|run)|delivery inspect)/);
});

test('Workspace、Project 与 Service Domain 保持纯净且 Buildr Web 静态资源由构建产物交付', () => {
  const domain: any = fs.readFileSync(path.join(productRoot, 'src/modules/workspace/domain/workspace.ts'), 'utf8');
  assert.doesNotMatch(domain, /yaml|filesystem|http|process|repository/i);
  const projectDomain: any = fs.readFileSync(path.join(productRoot, 'src/modules/workspace/domain/project.ts'), 'utf8');
  assert.doesNotMatch(projectDomain, /node:|yaml|filesystem|http|process|runtime|repository/i);
  const serviceDomain: any = fs.readFileSync(path.join(productRoot, 'src/modules/workspace/domain/service.ts'), 'utf8');
  assert.doesNotMatch(serviceDomain, /node:|yaml|filesystem|http|process|runtime|repository/i);
  for (const relative of [
    'src/web/http/server.ts',
    '../buildr-web/src/styles.css',
    '../buildr-web/src/main.tsx',
    '../buildr-web/src/App.tsx',
  ]) {
    assert.ok(fs.existsSync(path.join(productRoot, relative)), `missing ${relative}`);
  }
  const packageJson: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  assert.match(fs.readFileSync(path.join(productRoot, '.gitignore'), 'utf8'), /^web-dist\/$/m);
  assert.equal(packageJson.bin.buildr, 'bin/buildr.mjs');
  const candidatePackage: any = fs.readFileSync(path.join(productRoot, 'test/verification/release/candidate-package.ts'), 'utf8');
  assert.match(candidatePackage, /buildApplicationPayload\(/);
  assert.match(candidatePackage, /createReleaseArtifact\(/);
  assert.doesNotMatch(candidatePackage, /\['pack', productRoot/);
  assert.equal(fs.existsSync(path.join(productRoot, 'tools', 'development')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'tools', 'release')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/modules/workspace/module.ts')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/project/project.mjs')), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/service/service.mjs')), false);
});

test('Workspace、Project 与 Service CLI 只保留独立协议适配', () => {
  const adapters = [
    'src/modules/workspace/interfaces/cli/workspace.ts',
    'src/modules/workspace/interfaces/cli/project.ts',
    'src/modules/workspace/interfaces/cli/service.ts',
  ];
  for (const relative of adapters) {
    const source = fs.readFileSync(path.join(productRoot, relative), 'utf8');
    assert.ok(lines(relative).length <= 160, `${relative} must remain a thin CLI adapter`);
    assert.doesNotMatch(source, /from ['"].*(?:domain|persistence)|\bYAML\b|execFileSync|spawnSync|writeProjectRegistry|writeServiceRegistry/);
  }
  const workspaceCli = fs.readFileSync(path.join(productRoot, adapters[0]), 'utf8');
  assert.doesNotMatch(workspaceCli, /createProject|createService/);
  for (const relative of [
    'src/modules/workspace/application/project-application.ts',
    'src/modules/workspace/application/service-application.ts',
  ]) assert.equal(fs.existsSync(path.join(productRoot, relative)), true, `missing ${relative}`);
  const projectRepository = fs.readFileSync(path.join(productRoot, 'src/modules/workspace/persistence/project-manifest-repository.ts'), 'utf8');
  const serviceRepository = fs.readFileSync(path.join(productRoot, 'src/modules/workspace/persistence/service-manifest-repository.ts'), 'utf8');
  assert.match(projectRepository, /function parseProjectsYaml/);
  assert.match(projectRepository, /function writeProjectsRegistry/);
  assert.match(serviceRepository, /function parseServicesManifestYaml/);
  assert.match(serviceRepository, /function writeServicesManifest/);
});

test('资产应用依赖具名且内部辅助方法不再通过共享对象暴露', () => {
  const module = fs.readFileSync(path.join(productRoot, 'src/modules/agent-assets/module.ts'), 'utf8');
  assert.doesNotMatch(module, /Object\.(?:assign|create)\(|methodPort\(/);
  for (const name of ['commands', 'components', 'rules', 'skills', 'runtime', 'runtime-projection', 'package-maintenance', 'package-maintenance/package-assets', 'http-query']) {
    const source = fs.readFileSync(path.join(productRoot, `src/modules/agent-assets/application/${name}.ts`), 'utf8');
    assert.doesNotMatch(source, /export function register\w+\(runtime:\s*any/);
    const exposed = source.slice(source.lastIndexOf('return Object.freeze({'));
    assert.doesNotMatch(exposed, /commandsAddUnsafe|commandsRemoveUnsafe|skillsAddUnsafe|skillsRemoveUnsafe|builtinUninstallUnsafe|builtinRestoreUnsafe|repairProjectBaseline|normalizeServiceEntry/);
  }
  const assets = fs.readFileSync(path.join(productRoot, 'src/modules/agent-assets/application/package-maintenance/package-assets.ts'), 'utf8');
  assert.doesNotMatch(assets, /readPackageComponentsManifest|readPackageBuiltinsManifest|createProjectEntity|createServiceEntity|writeServiceRegistry/);
});

test('Doctor与安装应用只返回结果，命令参数、打印和退出码归属接口', () => {
  for (const relative of [
    'diagnostics/application/doctor-application.ts',
    'diagnostics/application/diagnostics.ts',
    'diagnostics/application/capability-diagnostics.ts',
    'installation/application/product-installation-status.ts',
    'installation/application/cli-update.ts',
  ]) {
    const source = fs.readFileSync(path.join(productRoot, 'src/modules', relative), 'utf8');
    assert.doesNotMatch(source, /process\.(?:stdout|stderr|exitCode)|console\.(?:log|error)|optionValue\(|hasFlag\(|assertNoUnknownOptions\(/, relative);
  }
});
