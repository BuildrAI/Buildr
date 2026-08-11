import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { spawnCommandSync } from '../../src/infrastructure/process.mjs';
import { materializeCleanProductSource } from '../helpers/clean-product-source.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const webSourceRoot = path.resolve(serviceRoot, '../buildr-web');

function run(command, args, options = {}) {
  const result = spawnCommandSync(command, args, { encoding: 'utf8', timeout: 360_000, maxBuffer: 8 * 1024 * 1024, ...options });
  const diagnostic = [result.stderr, result.stdout, result.error?.stack, result.signal && `signal=${result.signal}`].filter(Boolean).join('\n');
  assert.equal(result.status, options.status ?? 0, diagnostic);
  return result.stdout;
}

test('fresh Git Task Environment 一次 prepare 安装 buildr/buildr-web 并用锁定工具链完成 build:web', { timeout: 420_000 }, (t) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-fresh-environment-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const managerStatus = run('git', ['status', '--porcelain', '--', 'bin', 'src', 'package', 'package.json', 'package-lock.json'], { cwd: serviceRoot });
  const controller = managerStatus.trim()
    ? materializeCleanProductSource(serviceRoot, path.join(base, 'prepared-controller'))
    : { root: serviceRoot, cli: path.join(serviceRoot, 'bin', 'buildr.mjs') };
  assert.equal(fs.existsSync(path.join(controller.root, 'node_modules')), true, 'System controller must reuse prepared dependencies without another npm ci');
  const buildr = (args) => JSON.parse(run(process.execPath, [controller.cli, ...args], { cwd: controller.root }));
  run(process.execPath, [controller.cli, 'init', '--target', root, '--name', 'fresh-environment', '--description', 'Task Environment dependency closure fixture', '--profile', 'team'], { cwd: controller.root });

  const productRoot = path.join(root, 'projects', 'product');
  const candidateBuildr = path.join(productRoot, 'services', 'buildr');
  const candidateWeb = path.join(productRoot, 'services', 'buildr-web');
  fs.mkdirSync(candidateBuildr, { recursive: true });
  fs.copyFileSync(path.join(serviceRoot, 'package.json'), path.join(candidateBuildr, 'package.json'));
  fs.copyFileSync(path.join(serviceRoot, 'package-lock.json'), path.join(candidateBuildr, 'package-lock.json'));
  fs.cpSync(webSourceRoot, candidateWeb, { recursive: true, filter: (source) => path.basename(source) !== 'node_modules' });
  const workspaceId = /^id:\s*(\S+)\s*$/m.exec(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'))?.[1];
  assert.ok(workspaceId);
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), `schemaVersion: buildr.projects/v2
projects:
  product:
    id: 62bc8f4b-f8b6-4e8b-b40c-f93b466e3993
    workspaceId: ${workspaceId}
    code: product
    name: Product
    description: Fresh dependency closure fixture
    source: { type: workspace, path: projects/product }
`);
  fs.mkdirSync(path.join(productRoot, 'services'), { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'services', 'manifest.yml'), `schemaVersion: buildr.services/v2
projectId: 62bc8f4b-f8b6-4e8b-b40c-f93b466e3993
services:
  buildr:
    id: d6fc0b2d-79f0-4bb6-a26e-748ff5deb67a
    workspaceId: ${workspaceId}
    projectId: 62bc8f4b-f8b6-4e8b-b40c-f93b466e3993
    code: buildr
    name: Buildr
    description: Buildr fixture
    type: application
    source: { type: workspace, path: projects/product/services/buildr }
  buildr-web:
    id: dc709c32-ea13-4eaa-9516-7047a6fc56a4
    workspaceId: ${workspaceId}
    projectId: 62bc8f4b-f8b6-4e8b-b40c-f93b466e3993
    code: buildr-web
    name: Buildr Web
    description: Buildr Web fixture
    type: application
    source: { type: workspace, path: projects/product/services/buildr-web }
`);
  fs.writeFileSync(path.join(productRoot, 'preparation.yml'), `schemaVersion: buildr.project-environment-preparation/v1
recipes:
  - id: buildr.npm-ci
    scope: { kind: service, service: buildr }
    required: true
    steps:
      - id: npm-ci
        cwd: .
        executable: { kind: workspace-foundation, name: npm }
        args: [ci]
        inputs: [package.json, package-lock.json]
        outputs: [{ path: node_modules, kind: directory }]
        required: true
        timeoutMs: 240000
  - id: buildr-web.npm-ci
    scope: { kind: service, service: buildr-web }
    required: true
    steps:
      - id: npm-ci
        cwd: .
        executable: { kind: workspace-foundation, name: npm }
        args: [ci]
        inputs: [package.json, package-lock.json]
        outputs: [{ path: node_modules, kind: directory }]
        required: true
        timeoutMs: 240000
`);
  run('git', ['init', '-b', 'dev'], { cwd: root });
  run('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
  run('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root });
  run('git', ['add', '.'], { cwd: root });
  run('git', ['commit', '-m', 'fresh workspace baseline'], { cwd: root });

  const taskId = 'fresh-build-web';
  buildr(['task', 'create', taskId, '--title', 'Fresh build web', '--intent', 'Prove explicit multi-Service preparation', '--project', 'product', '--service', 'product/buildr', '--service', 'product/buildr-web', '--target', root, '--json']);
  assert.equal(fs.existsSync(path.join(candidateBuildr, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(candidateWeb, 'node_modules')), false);
  const planFile = path.join(base, 'environment-plan.json');
  fs.writeFileSync(planFile, `${JSON.stringify({
    schemaVersion: 'buildr.task-environment-plan-request/v1',
    projects: [{
      project: 'product', source: { kind: 'project-declaration' },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'No Project-wide preparation is required.' },
        { selector: 'service:product/buildr', disposition: 'required', reason: 'Buildr runtime dependencies are required.', recipeIds: ['buildr.npm-ci'] },
        { selector: 'service:product/buildr-web', disposition: 'required', reason: 'Buildr web build dependencies are required.', recipeIds: ['buildr-web.npm-ci'] },
      ],
    }],
  }, null, 2)}\n`);
  const prepared = buildr(['task', 'environment', 'prepare', taskId, '--plan', planFile, '--agent', 'codex', '--target', root, '--json']);
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v4');
  assert.equal(prepared.environment.schemaVersion, 'buildr.task-environment-receipt/v5');
  assert.equal(prepared.environment.preparationDeclarations[0].source, 'project-declaration');
  assert.equal(prepared.environment.preparationDeclarations[0].status, 'ready');
  assert.deepEqual(prepared.environment.preparationRecipes.map((recipe) => [recipe.scope, recipe.status]), [
    ['service:product/buildr', 'ready'],
    ['service:product/buildr-web', 'ready'],
  ]);
  assert.deepEqual(prepared.environment.preparationSteps.map((step) => [step.scope, step.status]), [
    ['service:product/buildr', 'ready'],
    ['service:product/buildr-web', 'ready'],
  ]);
  assert.equal(prepared.effects.filter((effect) => effect.type === 'preparation-step-executed').length, 2);
  assert.deepEqual(prepared.environment.preparationSteps.map((step) => step.executed), [true, true]);
  const worktree = prepared.execution.workdir;
  const worktreeBuildr = path.join(worktree, 'projects', 'product', 'services', 'buildr');
  const worktreeWeb = path.join(worktree, 'projects', 'product', 'services', 'buildr-web');
  assert.equal(fs.existsSync(path.join(worktreeBuildr, 'node_modules')), true);
  assert.equal(fs.existsSync(path.join(worktreeWeb, 'node_modules')), true);
  assert.equal(fs.realpathSync(path.join(worktreeWeb, 'node_modules', '.bin', 'tsc')).startsWith(worktreeWeb), true);
  assert.equal(fs.realpathSync(path.join(worktreeWeb, 'node_modules', '.bin', 'vite')).startsWith(worktreeWeb), true);

  const managedNpm = prepared.environment.preparationSteps.find((step) => step.scope === 'service:product/buildr').executable;
  const systemCommandPaths = process.platform === 'win32'
    ? [process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].filter(Boolean)
    : ['/usr/bin', '/bin'];
  const managedPath = [path.dirname(managedNpm), ...systemCommandPaths].join(path.delimiter);
  run(managedNpm, ['run', 'build:web'], { cwd: worktreeBuildr, env: { ...process.env, PATH: managedPath } });
  assert.equal(fs.existsSync(path.join(worktreeBuildr, 'src', 'interfaces', 'local-app', 'web-dist', 'index.html')), true);
});
