import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeCommitMessageApplication } from '../../src/modules/code/application/code-commit-message-application.ts';
import { createCodeGenerationHttpContribution } from '../../src/modules/code/interfaces/http/code-generation-http.ts';
import { createCodeCommitMaterialReader } from '../../src/modules/code/infrastructure/code-commit-material.ts';

test('generation HTTP accepts the exact worktree identity from real code observation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-generation-http-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['-C', root, 'init', '--initial-branch=main'], { stdio: 'ignore' });
  fs.writeFileSync(path.join(root, 'new.txt'), 'new content\n');
  const code = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'registered-repo', code: 'fixture', name: 'Fixture', source: { type: 'workspace', path: root } }], projects: [], services: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const tree = code.sourceControl(root).repositories[0].worktrees.find(item => item.isMain)!;
  const location = { repositoryId: 'registered-repo', worktreeId: tree.worktreeId };
  const context = code.commitContext(root, location);
  let invoked = 0;
  const generation = createCodeCommitMessageApplication({ commitSnapshot: code.commitSnapshot, commitGuidance: () => ({ scopes: [{ kind: 'repository', path: fs.realpathSync(root) }], ruleEntrypoints: [], readableRoots: [fs.realpathSync(root)], task: null, revision: 'entries-1' }), commitMaterial: createCodeCommitMaterialReader({readRules: () => []}), startGeneration: input => { invoked++; assert.equal(input.cwd, fs.realpathSync(root)); assert.equal(input.environment, undefined); assert.match(input.prompt, /new content/); return { id: 'run-1', agentId: 'agent-1', registrationRevision: 'v1', executionConfig: null, status: 'queued', output: null, error: null }; } });
  const response = await createCodeGenerationHttpContribution(generation).handle({ request: { method: 'POST' }, suffix: '/code/commit-message', root, searchParams: new URLSearchParams(), authorizeWrite: () => {}, readJsonBody: async () => ({ ...location, expectedRevision: context.revision }) });
  assert.equal(response?.status, 202); assert.equal(invoked, 1);
});
