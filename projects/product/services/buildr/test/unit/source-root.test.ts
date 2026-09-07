import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectSource } from '../../src/workspace/domain/project.ts';
import { createServiceSource } from '../../src/workspace/domain/service.ts';
import { resolveSourceRoot } from '../../src/workspace/infrastructure/workspace-source-filesystem.ts';
import { sourceIdentity, sourceOwnership, sourceRootKind } from '../../src/workspace/domain/source-root.ts';

test('managed source 保持旧shape并解析到Workspace', () => {
  const source: any = createProjectSource({ type: 'workspace', path: 'projects/demo' }, 'demo');
  assert.deepEqual(source, { type: 'workspace', path: 'projects/demo' });
  assert.equal(sourceRootKind(source), 'managed');
  assert.equal(resolveSourceRoot('/workspace', source), '/workspace/projects/demo');
  assert.equal(sourceOwnership(source), 'workspace-managed');
});

test('attached source只接受绝对Git root并形成稳定identity', () => {
  const source: any = createServiceSource({ type: 'git', root: 'attached', path: '/repos/api', git: { url: 'https://example.com/api.git', remote: 'origin', integrationBranch: 'dev' } }, 'demo', 'api');
  assert.equal(sourceRootKind(source), 'attached');
  assert.equal(resolveSourceRoot('/workspace', source), '/repos/api');
  assert.equal(sourceOwnership(source), 'external');
  assert.equal(sourceIdentity('entity', source), sourceIdentity('entity', { ...source, path: '/moved/api' }), 'Git attached identity不绑定机器路径');
  assert.throws(() => createProjectSource({ type: 'workspace', root: 'attached', path: '/repos/demo' }, 'demo'), /requires a git source/);
  assert.throws(() => createProjectSource({ type: 'git', root: 'attached', path: '../demo', git: { url: 'https://example.com/demo.git', remote: 'origin', integrationBranch: 'dev' } }, 'demo'), /normalized absolute path/);
});
