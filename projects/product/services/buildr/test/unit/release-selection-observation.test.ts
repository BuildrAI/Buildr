import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectReleaseSelection } from '../../tools/release/release-selection.ts';

const version = '1.2.3-rc.1';
const branch = `refs/heads/release-${version}`;
const baseline = `refs/buildr/release/${version}/baseline`;
const frozen = `refs/buildr/release/${version}/frozen`;
const abandoned = `refs/buildr/release/${version}/abandoned`;
const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
const options = { repo: '/release-observation-fixture', version, devRef: 'dev' };

function observer(refs: () => string[]) {
  const calls: string[][] = [];
  const execute = (_command: string, args: string[]) => {
    calls.push([...args]);
    if (args[0] === 'for-each-ref') {
      return { status: 0, stdout: args[1] === '--format=%(refname)' ? refs().join('\n') : '' };
    }
    if (args[0] === 'rev-parse') return { status: 0, stdout: args.at(-1)?.endsWith('^{tree}') ? tree : commit };
    if (args[0] === 'rev-list' || args[0] === 'diff') return { status: 0, stdout: '' };
    assert.fail('Unexpected Git observation ' + args.join(' '));
  };
  return { calls, execute };
}

test('release observation rejects missing exact branch, baseline and explicit targets despite child refs', () => {
  const cases = [
    { input: options, refs: [branch + '/child', baseline], message: /Release branch .* does not exist/u },
    { input: options, refs: [branch, baseline + '/child'], message: /Release baseline ref is missing/u },
    { input: { ...options, selectionId: 'plugin-selection' }, refs: ['refs/heads/release-plugin-selection',
      'refs/buildr/release/plugin-selection/baseline', 'refs/buildr/release/plugin-selection/targets/child'],
      message: /immutable targets ref is missing/u },
  ];
  for (const item of cases) {
    const observed = observer(() => item.refs);
    const result = inspectReleaseSelection(item.input, observed);
    assert.equal(result.status, 'blocked');
    assert.match(result.diagnostic.message, item.message);
    assert.deepEqual(result.effects, []);
    assert.equal(observed.calls.length, 1, 'Missing exact identity must stop before any further Git observation.');
  }
});

test('child lifecycle refs do not make a legacy selection frozen, abandoned or explicitly targeted', () => {
  const observed = observer(() => [branch, baseline, frozen + '/child', abandoned + '/child',
    `refs/buildr/release/${version}/targets/child`]);
  const result = inspectReleaseSelection(options, observed);
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(result.freeze, { state: 'open', commit: null });
  assert.deepEqual(result.abandon, { state: 'active', commit: null });
  assert.equal(result.selectionId, undefined);
  assert.equal(observed.calls.filter(args => args[0] === 'for-each-ref').length, 2,
    'Freeze history must remain a separate Git observation.');
  assert.equal(observed.calls.some(args => args[0] === 'cat-file'), false);
});

test('release presence is observed again after refs change between inspections', () => {
  let refs = [branch, baseline];
  const observed = observer(() => refs);
  const before = inspectReleaseSelection(options, observed);
  refs = [branch, baseline, frozen];
  const after = inspectReleaseSelection(options, observed);
  assert.equal(before.status, 'ready');
  assert.equal(after.status, 'frozen');
  assert.equal(after.freeze.commit, commit);
  assert.notEqual(before.selectionIdentity, after.selectionIdentity);
  assert.equal(observed.calls.filter(args => args[0] === 'for-each-ref' && args[1] === '--format=%(refname)').length, 2);
  assert.ok(observed.calls.some(args => args[0] === 'rev-parse' && args.at(-1) === frozen + '^{commit}'));
});

test('failed Git presence observations block without interpreting their stdout as evidence', () => {
  for (const failure of [
    { status: 1, stdout: [branch, baseline].join('\n'), stderr: 'fixture permission denied' },
    { status: null, stdout: [branch, baseline].join('\n'), error: new Error('fixture spawn failed') },
  ]) {
    let calls = 0;
    const result = inspectReleaseSelection(options, { execute() { calls++; return failure; } });
    assert.equal(result.status, 'blocked');
    assert.match(result.diagnostic.message, /fixture (?:permission denied|spawn failed)/u);
    assert.deepEqual(result.effects, []);
    assert.equal(calls, 1);
  }
});
