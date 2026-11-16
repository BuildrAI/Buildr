import assert from 'node:assert/strict';
import test from 'node:test';
import {DevelopmentUpdates, replaceDevelopmentHost} from '../../tools/development/dev-update.ts';

test('bad preparation does not stop an available development host', async () => {
  let stopped = 0;
  await assert.rejects(replaceDevelopmentHost('bad', 'good', {
    check: async () => {throw new Error('syntax error');}, stop: async () => {stopped++;},
    start: async () => {}, report: () => {},
  }), /syntax error/);
  assert.equal(stopped, 0);
});

test('failed startup restores exact last runnable code and reports both outcomes', async () => {
  const calls: string[] = [], reports: boolean[] = [];
  const result = await replaceDevelopmentHost('new', 'previous', {
    check: async () => {calls.push('check');}, stop: async () => {calls.push('stop');},
    start: async value => {calls.push(value); if (value === 'new') throw new Error('startup');},
    report: (_error, restored) => {reports.push(restored);},
  });
  assert.equal(result, 'previous');
  assert.deepEqual(calls, ['check', 'stop', 'new', 'stop', 'previous']);
  assert.deepEqual(reports, [true]);
});

test('unconfirmed stop never launches another writer', async () => {
  let started = false;
  await assert.rejects(replaceDevelopmentHost('next', 'previous', {
    check: async () => {}, stop: async () => {throw new Error('owner changed');},
    start: async () => {started = true;}, report: () => {},
  }), /owner changed/);
  assert.equal(started, false);
});

test('rapid saves coalesce and supersede a candidate before adoption', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  const batches: string[][] = [], adopted: boolean[] = [];
  const queue = new DevelopmentUpdates(async (changes, current) => {
    batches.push([...changes].sort());
    if (batches.length === 1) await gate;
    adopted.push(current());
  }, error => {throw error;}, 60_000);
  queue.request('host'); queue.request('harness');
  const work = queue.flush();
  queue.request('host'); queue.request('host');
  release(); await work; await queue.flush(); await queue.close();
  assert.deepEqual(batches, [['harness', 'host'], ['host']]);
  assert.deepEqual(adopted, [false, true]);
});
