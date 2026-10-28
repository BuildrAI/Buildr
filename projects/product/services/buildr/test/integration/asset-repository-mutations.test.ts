import { createServiceDiagnostics } from '../../src/modules/workspace/application/diagnostics/service-diagnostics.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { resolveRuleScope } from '../../src/modules/agent-assets/infrastructure/runtime/rule-projection.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace, copyPreparedLegacyProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';
import { setup, setupLegacy, ready, addRepo, waitFor, makeOriginRepository, initRepository } from '../helpers/asset-relationships.ts';



test('repository branch edits work without a remote and do not change HEAD or service identity', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  let c = ready(runtime, root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'branch-edit', path: '.' });
  const repository = c.repositories[0];
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'branch-service', name: 'Branch', repositoryId: repository.id } });
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, remote: 'upstream' }), (e: any) => e.code === 'repository_remote_url_required');
  const service = c.services[0], config = fs.readFileSync(path.join(root, '.git/config')), head = fs.readFileSync(path.join(root, '.git/HEAD'));
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, integrationBranch: 'release/next' });
  assert.equal(c.repositories[0].source.integrationBranch, 'release/next'); assert.equal(c.repositories[0].source.git, undefined);
  assert.equal(c.repositories[0].id, repository.id); assert.deepEqual(c.services[0], service);
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/config')), config); assert.deepEqual(fs.readFileSync(path.join(root, '.git/HEAD')), head);
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).alignment, 'ready');
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).observed.currentBranch, 'dev');
  for (const integrationBranch of ['../bad', 'bad branch', '-bad', 'bad/.hidden', 'bad.lock/branch', 'bad\u0007branch']) assert.throws(() => runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, integrationBranch }), (e: any) => e.code === 'repository_branch_invalid');
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, integrationBranch: '' });
  assert.equal(c.repositories[0].source.integrationBranch, undefined);
});


test('repository HTTP edits store remote declaration, report pending alignment and reject stale writes', async (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  assert.equal(spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/actual.git'], { cwd: root }).status, 0);
  let c = ready(runtime, root); c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'remote-edit', path: '.' });
  const repository = c.repositories[0], old = c.revision, config = fs.readFileSync(path.join(root, '.git/config'));
  const http = createWorkspaceHttpContribution(runtime); let authorization = 0;
  const response: any = await http.handle({ request: { method: 'PUT' }, suffix: `/asset-catalog/repository/${repository.id}`, root, authorizeWrite: () => authorization++, readJsonBody: async () => ({ revision: old, url: 'https://example.com/desired.git', remote: 'origin', integrationBranch: 'main' }) });
  assert.equal(response.status, 200); assert.equal(authorization, 1); c = response.body;
  assert.equal(c.repositories[0].source.git.integrationBranch, 'main');
  const state: any = await http.handle({ request: { method: 'GET' }, suffix: `/repositories/${repository.id}/status`, root });
  assert.equal(state.body.alignment, 'pending'); assert.equal(state.body.observed.remoteUrl, 'https://example.com/actual.git');
  assert.match(state.body.diagnostic, /远端/); assert.deepEqual(fs.readFileSync(path.join(root, '.git/config')), config);
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: old, remote: 'upstream' }), (e: any) => e.code === 'asset_revision_conflict');
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, remote: 'upstream' });
  assert.equal(c.repositories[0].source.git.remote, 'upstream');
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).alignment, 'pending');
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, url: '' });
  assert.equal(c.repositories[0].source.git, undefined); assert.equal(c.repositories[0].source.integrationBranch, 'main');
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).alignment, 'ready');
});


test('repository location edits preserve old files, allow missing targets and reject duplicate or escaping modules', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  const oldRoot = path.join(root, 'code-old'); initRepository(oldRoot); fs.mkdirSync(path.join(oldRoot, 'module')); fs.writeFileSync(path.join(oldRoot, 'module/keep.txt'), 'keep');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'location-edit', path: 'code-old' });
  const id = c.repositories[0].id;
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'module-service', name: 'Module', repositoryId: id, modulePath: 'module' } });
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-new' });
  assert.equal(runtime.catalogRepositoryStatus(root, id).alignment, 'pending'); assert.equal(fs.existsSync(path.join(root, 'code-new')), false);
  assert.equal(fs.readFileSync(path.join(oldRoot, 'module/keep.txt'), 'utf8'), 'keep');
  const newRoot = path.join(root, 'code-new'); initRepository(newRoot);
  assert.match(runtime.catalogRepositoryStatus(root, id).diagnostic, /模块目录/);
  fs.symlinkSync(oldRoot, path.join(newRoot, 'module'));
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-new' }), (e: any) => e.code === 'service_module_path_forbidden');
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-old/module' }), (e: any) => e.code === 'repository_not_root');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'other-location', path: 'code-old' });
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-old' }), (e: any) => e.code === 'repository_duplicate_path');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-edit-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'outside-link'));
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'outside-link/missing' }), (e: any) => e.code === 'repository_path_invalid');
});


test('repository declaration edits neither start a clone nor create the target directory', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  const codeRoot = path.join(root, 'declared-edit'); initRepository(codeRoot);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'declared-edit', path: 'declared-edit' });
  const id = c.repositories[0].id;
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, url: 'https://example.com/declared.git', remote: 'origin', integrationBranch: 'main', path: 'declared-future' });
  assert.equal(runtime.repositoryCloneStatus(root, id).state, null, 'saving declarations must not start a clone');
  assert.equal(fs.existsSync(path.join(root, 'declared-future')), false, 'saving declarations must not materialize code');
  assert.match(runtime.catalogRepositoryLocalConfig(root, id).diagnostic, /不存在/);
});


test('local repository integration branch is consumed by subsequent task worktree planning', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  const git = (cwd: string, ...args: string[]) => { const result = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  let c = ready(runtime, root); const code = path.join(root, 'local-code'); initRepository(code);
  git(code, 'config', 'user.name', 'Test'); git(code, 'config', 'user.email', 'test@example.com'); git(code, 'commit', '--allow-empty', '-m', 'base');
  const start = git(code, 'rev-parse', 'HEAD'); git(code, 'branch', 'integration'); git(code, 'commit', '--allow-empty', '-m', 'later');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'local-code', path: 'local-code' });
  c = runtime.updateCatalogAsset(root, 'repository', c.repositories[0].id, { revision: c.revision, integrationBranch: 'integration' });
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'local-module', name: 'Local', repositoryId: c.repositories[0].id } });
  fs.appendFileSync(path.join(root, '.gitignore'), '\n/local-code/\n'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com'); git(root, 'add', '.'); git(root, 'commit', '-m', 'workspace');
  const plan = runtime.planGitWorktrees({ workspaceRoot: root, taskId: 'local-branch-edit', branch: 'codex/local-branch-edit', includes: ['service:demo/local-module'] });
  assert.equal(plan.repositories.length, 2); assert.equal(plan.repositories[1].startPoint, 'integration'); assert.equal(git(code, 'rev-parse', plan.repositories[1].startPoint), start);
  assert.equal(git(code, 'branch', '--show-current'), 'dev');
});


test('workspace-root integration branch is used unless the task explicitly chooses a start point', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  let c = ready(runtime, root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'root-branch', path: '.', integrationBranch: 'integration' });
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'root-branch-service', name: 'Root', repositoryId: c.repositories[0].id } });
  git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com'); git('add', '.'); git('commit', '-m', 'base'); git('branch', 'integration'); git('commit', '--allow-empty', '-m', 'later');
  const input = { workspaceRoot: root, taskId: 'root-default', branch: 'codex/root-default', includes: ['service:demo/root-branch-service'] };
  assert.equal(runtime.planGitWorktrees(input).repositories[0].startPoint, 'integration');
  assert.equal(runtime.planGitWorktrees({ ...input, startPoint: 'HEAD' }).repositories[0].startPoint, 'HEAD');
  assert.equal(git('branch', '--show-current'), 'dev');
});


test('local Git config reads real remotes without changing declarations or scanning status', async (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  assert.equal(spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/local.git'], { cwd: root }).status, 0);
  let c = ready(runtime, root); c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'local-config', path: '.', integrationBranch: 'integration' });
  const before = fs.readFileSync(path.join(root, 'repositories/manifest.yml')), config = fs.readFileSync(path.join(root, '.git/config'));
  const original = runtime.observeProjectGit; runtime.observeProjectGit = () => { throw new Error('local configuration must not scan status'); };
  try {
    const http = createWorkspaceHttpContribution(runtime);
    const response: any = await http.handle({ request: { method: 'GET' }, suffix: `/repositories/${c.repositories[0].id}/local-config`, root });
    assert.equal(response.status, 200); assert.equal(response.body.selectedRemote, 'origin'); assert.equal(response.body.currentBranch, 'dev');
    assert.deepEqual(response.body.remotes, [{ name: 'origin', url: 'https://example.com/local.git' }]);
    assert.deepEqual(fs.readFileSync(path.join(root, 'repositories/manifest.yml')), before); assert.deepEqual(fs.readFileSync(path.join(root, '.git/config')), config);
    assert.equal(runtime.assetCatalog(root).repositories[0].source.integrationBranch, 'integration');
  } finally { runtime.observeProjectGit = original; }
});


test('local config resolves tracked and sole remotes but does not guess ambiguous or missing declared remotes', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  const git = (...args: string[]) => assert.equal(spawnSync('git', args, { cwd: root }).status, 0);
  let c = ready(runtime, root); c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'multi-config', path: '.' });
  const id = c.repositories[0].id;
  git('remote', 'add', 'upstream', 'https://example.com/upstream.git');
  assert.equal(runtime.catalogRepositoryLocalConfig(root, id).selectedRemote, 'upstream');
  git('remote', 'add', 'mirror', 'https://example.com/mirror.git');
  let config = runtime.catalogRepositoryLocalConfig(root, id); assert.equal(config.selectedRemote, null); assert.match(config.diagnostic, /多个远端/);
  git('config', 'branch.dev.remote', 'mirror'); assert.equal(runtime.catalogRepositoryLocalConfig(root, id).selectedRemote, 'mirror');
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, url: 'https://example.com/desired.git', remote: 'absent', integrationBranch: 'main' });
  config = runtime.catalogRepositoryLocalConfig(root, id); assert.equal(config.selectedRemote, null); assert.match(config.diagnostic, /absent/); assert.equal(config.remotes.length, 2);
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'missing-local' });
  config = runtime.catalogRepositoryLocalConfig(root, id); assert.equal(config.available, false);
  assert.ok(config.diagnostic, 'missing declaration target reports before any clone attempt');
  assert.equal(runtime.repositoryCloneRequest(root, id).status, 'started');
  assert.ok(['cloning', 'failed'].includes(runtime.repositoryCloneStatus(root, id).state));
  assert.ok(runtime.catalogRepositoryLocalConfig(root, id).diagnostic, 'explicit preparation reports its running or failed clone instead of reading a partial Git directory');
});


test('service update creates and associates a repository atomically through the HTTP contract', async (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  c = addRepo(runtime, root, c.revision, 'old-service-code', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'edit-new-code', name: 'Original', repositoryId: c.repositories[0].id } });
  const service = c.services[0], projectRefs = c.projects.map((p: any) => p.serviceIds), originalRevision = c.revision;
  const http = createWorkspaceHttpContribution(runtime); let authorized = 0;
  const response: any = await http.handle({ request: { method: 'PUT' }, suffix: `/asset-catalog/service/${service.id}`, root, authorizeWrite: () => authorized++, readJsonBody: async () => ({ revision: c.revision, name: 'Updated', repository: { code: 'new-inline-code', url: 'https://example.com/new-inline.git', integrationBranch: 'main' } }) });
  c = response.body; assert.equal(response.status, 200); assert.equal(authorized, 1);
  assert.equal(c.repositories.length, 2); assert.equal(c.services[0].id, service.id); assert.equal(c.services[0].name, 'Updated');
  assert.equal(c.services[0].repositoryId, c.repositories.find((r: any) => r.code === 'new-inline-code').id);
  assert.deepEqual(c.projects.map((p: any) => p.serviceIds), projectRefs);
  const inlineRepository = c.repositories.find((r: any) => r.code === 'new-inline-code');
  assert.ok(['cloning', 'failed'].includes(runtime.repositoryCloneStatus(root, inlineRepository.id).state));
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', service.id, { revision: originalRevision, repository: { code: 'stale-inline-code', url: 'https://example.com/stale.git', integrationBranch: 'dev' } }), (e: any) => e.code === 'asset_revision_conflict');
  assert.equal(runtime.assetCatalog(root).repositories.length, 2);
});


test('invalid or ambiguous inline repository service updates leave every manifest untouched', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'original-inline', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'inline-failure', name: 'Keep', repositoryId: c.repositories[0].id } });
  const files = ['projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml']; const bytes = files.map(file => fs.readFileSync(path.join(root, file)));
  const repository = { code: 'invalid-inline', url: 'https://example.com/inline.git', integrationBranch: 'dev' };
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', c.services[0].id, { revision: c.revision, repositoryId: c.repositories[0].id, repository }), (e: any) => e.code === 'service_repository_ambiguous');
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', c.services[0].id, { revision: c.revision, repository, modulePath: '../escape' }), (e: any) => e.code === 'asset_path_invalid');
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes[i]));
  assert.equal(runtime.assetCatalog(root).repositories.length, 1);
});
