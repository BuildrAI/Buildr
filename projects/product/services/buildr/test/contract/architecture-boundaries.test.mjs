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

test('Workspace、Project 与 Service Domain 保持纯净且 local app 静态资源随 src 交付', () => {
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
  assert.ok(packageJson.files.includes('src/'));
  assert.equal(fs.existsSync(path.join(productRoot, 'tools')), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/project')), true);
  assert.equal(fs.existsSync(path.join(productRoot, 'src/domain/service')), true);
});
