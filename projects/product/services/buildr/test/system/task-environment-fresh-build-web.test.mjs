import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const webSourceRoot = path.resolve(serviceRoot, '../buildr-web');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 240_000, maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.status, options.status ?? 0, result.stderr || result.stdout);
  return result.stdout;
}

test('fresh Git Task Environment 一次 prepare 安装 buildr/buildr-web 并用锁定工具链完成 build:web', { timeout: 300_000 }, (t) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-fresh-environment-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const controllerRoot = path.join(base, 'controller');
  const npmCli = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  fs.cpSync(serviceRoot, controllerRoot, { recursive: true, filter: (source) => path.basename(source) !== 'node_modules' });
  run(process.execPath, [npmCli, 'ci'], { cwd: controllerRoot });
  const controllerCli = path.join(controllerRoot, 'bin', 'buildr.mjs');
  const buildr = (args) => JSON.parse(run(process.execPath, [controllerCli, ...args], { cwd: controllerRoot }));
  run(process.execPath, [controllerCli, 'init', '--target', root, '--name', 'fresh-environment', '--description', 'Task Environment dependency closure fixture', '--profile', 'team'], { cwd: controllerRoot });

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
  fs.writeFileSync(path.join(productRoot, 'task-environment.yml'), `schemaVersion: buildr.project-task-environment/v1
services:
  buildr:
    dependencyRoots:
      - { id: npm, manager: npm, root: ., manifest: package.json, lockfile: package-lock.json, required: true }
    requires:
      - { service: buildr-web, purpose: Local App source build }
  buildr-web:
    dependencyRoots:
      - { id: npm, manager: npm, root: ., manifest: package.json, lockfile: package-lock.json, required: true }
    requires: []
`);
  run('git', ['init', '-b', 'dev'], { cwd: root });
  run('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
  run('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root });
  run('git', ['add', '.'], { cwd: root });
  run('git', ['commit', '-m', 'fresh workspace baseline'], { cwd: root });

  const taskId = 'fresh-build-web';
  buildr(['task', 'create', taskId, '--title', 'Fresh build web', '--intent', 'Prove dependency closure', '--project', 'product', '--service', 'product/buildr', '--target', root, '--json']);
  assert.equal(fs.existsSync(path.join(candidateBuildr, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(candidateWeb, 'node_modules')), false);
  const prepared = buildr(['task', 'environment', 'prepare', taskId, '--agent', 'codex', '--target', root, '--json']);
  assert.equal(prepared.status, 'ready', JSON.stringify(prepared, null, 2));
  assert.equal(prepared.schemaVersion, 'buildr.task-environment-result/v2');
  assert.equal(prepared.environment.schemaVersion, 'buildr.task-environment-receipt/v3');
  assert.deepEqual(prepared.environment.dependencyRoots.map((dependency) => [dependency.scope, dependency.status]), [
    ['service:product/buildr-web', 'ready'],
    ['service:product/buildr', 'ready'],
  ]);
  assert.equal(prepared.effects.filter((effect) => effect.type === 'dependency-root-prepared').length, 2);
  const worktree = prepared.execution.workdir;
  const worktreeBuildr = path.join(worktree, 'projects', 'product', 'services', 'buildr');
  const worktreeWeb = path.join(worktree, 'projects', 'product', 'services', 'buildr-web');
  assert.equal(fs.existsSync(path.join(worktreeBuildr, 'node_modules')), true);
  assert.equal(fs.existsSync(path.join(worktreeWeb, 'node_modules')), true);
  assert.equal(fs.realpathSync(path.join(worktreeWeb, 'node_modules', '.bin', 'tsc')).startsWith(worktreeWeb), true);
  assert.equal(fs.realpathSync(path.join(worktreeWeb, 'node_modules', '.bin', 'vite')).startsWith(worktreeWeb), true);

  run(process.execPath, [npmCli, 'run', 'build:web'], { cwd: worktreeBuildr, env: { ...process.env, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` } });
  assert.equal(fs.existsSync(path.join(worktreeBuildr, 'src', 'interfaces', 'local-app', 'web-dist', 'index.html')), true);
});
