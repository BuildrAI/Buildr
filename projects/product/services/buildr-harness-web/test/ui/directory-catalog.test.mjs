import test from 'node:test';
import assert from 'node:assert/strict';
import { collectExplorerLoadTargets, loadDirectoryCatalog, shouldCollapseExplorerTree } from '../../src/features/directory-workbench/directory-catalog.ts';

const hint = path => ({path,name:path});
const response = path => ({readAt:'later',repositories:[{...hint(path),id:'actual:'+path,gitId:'git:'+path,checkouts:{defaultId:path,members:[],truncated:false},members:[]}]});
const drain = () => new Promise(resolve => setImmediate(resolve));

test('directory names publish before scoped reads; a later click takes the next slot and discovery appends', async () => {
  const snapshots = [], pending = new Map(), calls = [];
  let preferred;
  const request = (operation,input) => {
    if (operation === 'inventory') return Promise.resolve({repositories:(input.cursor ? ['nested'] : ['slow','fast','third','last']).map(hint),readAt:'now',nextCursor:input.cursor ? null : 'continuation',limited:false,diagnostic:null});
    const path = input.repositoryPath; calls.push(path);
    return new Promise(resolve => pending.set(path,() => resolve(response(path))));
  };
  const signal = new AbortController().signal;
  const first = loadDirectoryCatalog(request,null,false,false,() => preferred,signal,value => snapshots.push(value));
  await drain();
  assert.deepEqual(snapshots[0].repositories.map(repo => [repo.path, repo.pending]), [['slow',true],['fast',true],['third',true],['last',true]]);
  assert.deepEqual(calls,['slow','fast']);
  preferred = 'last'; pending.get('fast')(); await drain();
  assert.deepEqual(calls,['slow','fast','last']);
  pending.get('last')(); await drain();
  assert.equal(snapshots.at(-1).repositories.find(repo => repo.path === 'last').id,'actual:last');
  assert.equal(snapshots.at(-1).repositories[0].pending,true);
  pending.get('third')(); pending.get('slow')();
  const read = await first;
  const continuation = loadDirectoryCatalog(request,read,true,false,() => undefined,signal,value => snapshots.push(value));
  await drain(); pending.get('nested')();
  const more = await continuation;
  assert.deepEqual(more.repositories.map(repo => repo.path),['slow','fast','third','last','nested']);
  assert.deepEqual(calls,['slow','fast','last','third','nested']);
});

test('publishes the preferred checkout before completing the rest of its repository', async () => {
  const snapshots = [];
  const calls = [];
  let finish;
  const full = response('repo');
  const member = id => ({ id, files: [], truncated: false });
  const complete = { ...full.repositories[0], members: [member('default'), member('chosen')] };
  const request = async (operation, input) => {
    if (operation === 'inventory') return { repositories: [hint('repo')], readAt: 'now', nextCursor: null };
    calls.push(input);
    if (input.primaryStatus) return { ...full, repositories: [{ ...complete, members: [member('chosen')], statusPending: true }] };
    return await new Promise(resolve => { finish = () => resolve({ ...full, repositories: [complete] }); });
  };
  const signal = new AbortController().signal;
  const loading = loadDirectoryCatalog(request, null, false, false, () => 'repo', signal,
    value => snapshots.push(value), () => ({ preferredCheckoutId: 'chosen' }));
  await drain();
  assert.deepEqual(calls, [{ repositoryPath: 'repo', primaryStatus: true, preferredCheckoutId: 'chosen' }, { repositoryPath: 'repo' }]);
  assert.deepEqual(snapshots.at(-1).repositories[0].members.map(item => item.id), ['chosen']);
  assert.equal(snapshots.at(-1).repositories[0].statusPending, true);
  finish();
  const settled = (await loading).repositories[0];
  assert.deepEqual(settled.members.map(item => item.id), ['default', 'chosen']);
  assert.equal(settled.statusPending, undefined);
});

test('continuing discovery finishes repository status left pending by the previous read', async () => {
  const calls = [];
  const root = response('root').repositories[0];
  const pending = { ...response('pending').repositories[0], pending: true };
  const previous = { nextCursor: 'more', repositories: [{ ...root, statusPending: true }, pending] };
  const request = async (operation, input) => {
    if (operation === 'inventory') return { repositories: [hint('nested')], readAt: 'now', nextCursor: null };
    calls.push(input.repositoryPath);
    return response(input.repositoryPath);
  };
  const signal = new AbortController().signal;
  const result = await loadDirectoryCatalog(request, previous, true, false, () => undefined, signal, () => {});
  assert.deepEqual(calls.sort(), ['nested', 'pending', 'root']);
  assert.deepEqual(result.repositories.map(item => item.path), ['root', 'pending', 'nested']);
  assert.ok(result.repositories.every(item => !item.pending && !item.statusPending));
});

test('multi-repo explorer keeps tree collapsed and loads only expanded directories on demand', () => {
  assert.equal(shouldCollapseExplorerTree(1, 29, []), true);
  assert.equal(shouldCollapseExplorerTree(1, 29, ['repositories/freshx-pigs']), false);
  assert.equal(shouldCollapseExplorerTree(1, 1, []), false);

  assert.deepEqual(
    collectExplorerLoadTargets({ collapsed: true, visibleBrowserIds: ['r1', 'r2', 'r3'], expandedKeys: [] }),
    [],
  );
  assert.deepEqual(
    collectExplorerLoadTargets({ collapsed: true, visibleBrowserIds: ['r1', 'r2'], expandedKeys: ['r2::', 'r2::src', 'hidden::src'] }),
    [{ browserId: 'r2', relative: '' }, { browserId: 'r2', relative: 'src' }],
  );
  assert.deepEqual(
    collectExplorerLoadTargets({ collapsed: false, visibleBrowserIds: ['r1'], expandedKeys: ['r1::', 'r1::docs'] }),
    [{ browserId: 'r1', relative: '' }, { browserId: 'r1', relative: 'docs' }],
  );
});

test('registered repository codes and names survive pending publish, single-repo resolution, and continuation', async () => {
  const snapshots = [];
  const request = (operation, input) => {
    if (operation === 'inventory') {
      return Promise.resolve({
        repositories: input.cursor
          ? [{ path: 'extra/tool', code: 'tool', name: 'tool' }]
          : [{ path: 'repositories/feishu-companion', code: 'feishu-companion', name: '办公平台' }],
        readAt: 'now',
        registered: true,
        nextCursor: input.cursor ? null : 'cont',
        limited: false,
        diagnostic: null,
      });
    }
    const dirName = input.repositoryPath.split('/').at(-1);
    return Promise.resolve({
      readAt: 'later',
      repositories: [{ path: input.repositoryPath, code: dirName, name: dirName, id: 'actual:' + input.repositoryPath, gitId: 'git:' + input.repositoryPath, checkouts: { defaultId: dirName, members: [], truncated: false }, members: [] }],
    });
  };
  const signal = new AbortController().signal;
  const first = await loadDirectoryCatalog(request, null, false, false, () => undefined, signal, value => snapshots.push(value));
  assert.equal(snapshots[0].registered, true);
  assert.deepEqual(snapshots[0].repositories.map(repo => ({ path: repo.path, code: repo.code, name: repo.name })), [
    { path: 'repositories/feishu-companion', code: 'feishu-companion', name: '办公平台' },
  ]);
  assert.equal(first.registered, true);
  assert.deepEqual(first.repositories.map(repo => ({ path: repo.path, code: repo.code, name: repo.name })), [
    { path: 'repositories/feishu-companion', code: 'feishu-companion', name: '办公平台' },
  ]);
  const more = await loadDirectoryCatalog(request, first, true, false, () => undefined, signal, value => snapshots.push(value));
  assert.equal(more.registered, true);
  assert.deepEqual(more.repositories.map(repo => ({ path: repo.path, code: repo.code, name: repo.name })), [
    { path: 'repositories/feishu-companion', code: 'feishu-companion', name: '办公平台' },
    { path: 'extra/tool', code: 'tool', name: 'tool' },
  ]);
});
