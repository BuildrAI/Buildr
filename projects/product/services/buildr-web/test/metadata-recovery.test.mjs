import assert from 'node:assert/strict';
import test from 'node:test';
import { rebaseEditedFields } from '../src/lib/metadata-recovery.ts';

test('explicit recovery retains changed input and adopts untouched latest fields', () => {
  const base = { name: '原名称', description: '原说明', repositoryId: 'r1', modulePath: 'src', url: 'old', remote: 'origin' };
  const draft = { ...base, name: '我的名称', modulePath: '', remote: 'upstream' };
  const latest = { ...base, name: '另一名称', description: '新说明', repositoryId: 'r2', modulePath: 'new', url: 'new', remote: 'peer' };
  assert.deepEqual(rebaseEditedFields(base, draft, latest), { name: '我的名称', description: '新说明', repositoryId: 'r2', modulePath: '', url: 'new', remote: 'upstream' });
  assert.equal(draft.description, '原说明');
  assert.equal(latest.name, '另一名称');
});

test('a further conflict rebases against the last observed base without losing the draft', () => {
  const base = { name: 'A', description: 'old', repositoryId: undefined };
  const draft = { ...base, name: '我的名称' };
  const first = { name: 'B', description: 'new', repositoryId: 'r1' };
  const retained = rebaseEditedFields(base, draft, first);
  const second = { name: 'C', description: 'newer', repositoryId: 'r2' };
  assert.deepEqual(rebaseEditedFields(first, retained, second), { name: '我的名称', description: 'newer', repositoryId: 'r2' });
});
