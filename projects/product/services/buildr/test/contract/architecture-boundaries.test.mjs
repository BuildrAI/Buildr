import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function lines(relative) {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8').trimEnd().split(/\r?\n/);
}

test('兼容 facade 保持薄入口', () => {
  assert.ok(lines('src/infrastructure/runtime/render-claude-code.mjs').length <= 100);
  assert.ok(lines('src/application/doctor.mjs').length <= 250);
  assert.ok(lines('src/application/package-maintenance.mjs').length <= 550);
});

test('package verification 使用稳定 registry 且不恢复共享 smoke runner', () => {
  const application = fs.readFileSync(path.join(productRoot, 'src/application/package-maintenance.mjs'), 'utf8');
  const smoke = fs.readFileSync(path.join(productRoot, 'src/application/package-maintenance/smoke-checks.mjs'), 'utf8');
  const registry = fs.readFileSync(path.join(productRoot, 'src/application/package-maintenance/verification-registry.mjs'), 'utf8');
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
        if (relative !== 'src/application/compose-runtime.mjs') violations.push(relative);
      }
    }
  };
  visit(sourceRoot);
  assert.deepEqual(violations, []);
});

test('Windows 平台身份、Node 脚本启动与 runtime mode 使用共享 owner', () => {
  const identityConsumers = [
    'src/application/worktree/git-worktree-provider.mjs',
    'src/infrastructure/filesystem/task-environment-repository.mjs',
    'src/application/task-verification/task-verification-application.mjs',
    'src/application/task-finish/task-finish-application.mjs',
    'src/interfaces/local-app/runtime/preview-manager.mjs',
    'package/launchers/manage.mjs',
  ];
  for (const relative of identityConsumers) {
    const source = fs.readFileSync(path.join(productRoot, relative), 'utf8');
    assert.match(source, /sameFilesystemPath/, `${relative} must use the shared filesystem identity owner`);
  }
  const worktree = fs.readFileSync(path.join(productRoot, 'src/application/worktree/git-worktree-provider.mjs'), 'utf8');
  assert.doesNotMatch(worktree, /identity\.repository\s*!==\s*item\.checkoutPath/);
  const adapter = fs.readFileSync(path.join(productRoot, 'src/infrastructure/runtime/adapter-contract.mjs'), 'utf8');
  assert.match(adapter, /runtimeWriteModeMatches/);
  assert.doesNotMatch(adapter, /ownerExecutable/);
  const closeout = fs.readFileSync(path.join(productRoot, '../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), 'utf8');
  assert.match(closeout, /productCommand\(execute, root, nodeExecutable/);
  assert.doesNotMatch(closeout, /path\.join\(root, PRODUCT_ROOT, 'buildr'\)/);
});

test('Workspace、Project 与 Service Domain 保持纯净且 Buildr Web 静态资源随 src 交付', () => {
  const domain = fs.readFileSync(path.join(productRoot, 'src/domain/workspace/workspace.mjs'), 'utf8');
  assert.doesNotMatch(domain, /yaml|filesystem|http|process|repository/i);
  const projectDomain = fs.readFileSync(path.join(productRoot, 'src/domain/project/project.mjs'), 'utf8');
  assert.doesNotMatch(projectDomain, /node:|yaml|filesystem|http|process|runtime|repository/i);
  const serviceDomain = fs.readFileSync(path.join(productRoot, 'src/domain/service/service.mjs'), 'utf8');
  assert.doesNotMatch(serviceDomain, /node:|yaml|filesystem|http|process|runtime|repository/i);
  for (const relative of [
    'src/interfaces/local-app/http/server.mjs',
    'src/interfaces/local-app/web-dist/index.html',
    '../buildr-web/src/styles.css',
    '../buildr-web/src/main.tsx',
    '../buildr-web/src/App.tsx',
  ]) {
    assert.ok(fs.existsSync(path.join(productRoot, relative)), `missing ${relative}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.bin.buildr, 'bin/buildr.mjs');
  const candidatePackage = fs.readFileSync(path.join(productRoot, 'test/verification/release/candidate-package.mjs'), 'utf8');
  assert.match(candidatePackage, /buildApplicationPayload\(/);
  assert.match(candidatePackage, /createReleaseArtifact\(/);
  assert.doesNotMatch(candidatePackage, /\['pack', productRoot/);
  assert.equal(fs.existsSync(path.join(productRoot, 'tools')), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/project')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/service')), true);
});
