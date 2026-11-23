import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectoryCatalog } from '../../src/features/directory-workbench/directory-catalog.ts';

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
