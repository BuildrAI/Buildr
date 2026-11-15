import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createModuleRegistry } from '../../src/bootstrap/module-registry.ts';
import { createCodeModule, CODE_APPLICATION, CODE_GENERATION_APPLICATION } from '../../src/modules/code/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../../src/modules/workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../../src/modules/task/module.ts';
import { AGENT_ASSETS_SOURCE_READ } from '../../src/modules/agent-assets/module.ts';
import type { GenerateModel } from '../../src/modules/code/application/code-generation.ts';

for (const integrated of [false, true]) test(`code module keeps business operations without a Harness dependency (model adapter: ${integrated})`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-module-isolation-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['-C', root, 'init', '--initial-branch=main'], {stdio: 'ignore'});
  fs.writeFileSync(path.join(root, 'new.txt'), 'new content\n');
  const catalog = {repositories: [{id: 'repo', code: 'fixture', name: 'Fixture', source: {type: 'workspace', path: root}}], projects: [], services: []};
  const registry = createModuleRegistry({capabilities: {
    [WORKSPACE_APPLICATION]: {assetCatalog: () => catalog},
    [WORKSPACE_QUERY]: {resolveSourceRoot: (_root: string, source: {path: string}) => source.path},
    [TASK_QUERY_APPLICATION]: {readTask() { throw Error('No task is needed for directory code operations'); }},
    [TASK_WORKTREE_PROVIDER]: {readGitWorktreeEvidence: () => null},
    [AGENT_ASSETS_SOURCE_READ]: {},
  }});
  let requests = 0;
  const generateModel: GenerateModel = async input => {
    requests++;
    assert.equal(input.accountId, 'account');
    assert.equal(input.agentId, 'commit-message');
    assert.match(input.prompt, /new content/);
    return '{"commitMessage":"feat: 新增文件"}';
  };
  const descriptor = registry.install(createCodeModule(integrated ? {generateModel} : {}));
  t.after(() => descriptor.lifecycle.stop());
  assert.ok(!descriptor.requires.includes('agent-service.application'));
  const code = registry.provide(CODE_APPLICATION);
  assert.equal(code.repositories(root).repositories[0].id, 'repo');
  const tree = code.sourceControl(root).repositories[0].worktrees.find((item: {isMain: boolean}) => item.isMain);
  const location = {repositoryId: 'repo', worktreeId: tree.worktreeId}, context = code.commitContext(root, location);
  assert.equal(context.hasChanges, true);
  const generation = registry.provide(CODE_GENERATION_APPLICATION);
  const run = await generation.generateCommitMessage(root, {...location, expectedRevision: context.revision,
    modelAccountId: 'account', modelId: 'model', accountIdentity: 'identity', accountRevision: 'revision', label: 'Fixture'});
  const http = descriptor.contributions.http.find((item: {id: string}) => item.id === 'code.generation.http');
  let outcome;
  for (let n = 0; n < 20; n++) {
    outcome = await http.handle({request: {method: 'GET'}, suffix: '/code/commit-message-runs', root,
      searchParams: new URLSearchParams({runId: run.id}), authorizeRead() {}});
    if (outcome.body.status !== 'running') break;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.equal(outcome.body.status, integrated ? 'succeeded' : 'failed');
  if (!integrated) assert.equal(outcome.body.error.code, 'code_generation_unavailable');
  assert.equal(requests, integrated ? 1 : 0);
  assert.equal(code.commitContext(root, location).revision, context.revision, 'unavailable generation does not change the worktree');
});
