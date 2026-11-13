import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import workerThreads from 'node:worker_threads';
import {syncBuiltinESMExports} from 'node:module';
import {StorageMaintenance} from '../../src/process/storage-maintenance.ts';
import type {AgentRuntimeUnit} from '../../src/execution-contracts.ts';

test('maintenance backs off after expensive passes and avoids overlapping or repeating inventory',t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const workers:Array<{worker:EventEmitter;data:any}>=[];
  class FakeWorker extends EventEmitter {
    constructor(_entry:URL,options:{workerData:unknown}){super();workers.push({worker:this,data:options.workerData});}
    unref(){}
  }
  const patched=t.mock.method(workerThreads,'Worker',function(entry:URL,options:{workerData:unknown}){return new FakeWorker(entry,options);} as unknown as typeof workerThreads.Worker);
  syncBuiltinESMExports();t.after(()=>{patched.mock.restore();syncBuiltinESMExports();});
  const runtime={digest:'keep-current'} as AgentRuntimeUnit;
  const maintenance=new StorageMaintenance('/unused',{initialMs:0,intervalMs:20,runtime});t.after(()=>maintenance.close());
  t.mock.timers.tick(0);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].data.nativeOnly, true);
  t.mock.timers.tick(100);
  assert.equal(workers.length, 1, 'workers never overlap');
  workers[0].worker.emit('exit', 0);
  t.mock.timers.tick(1);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].data.inventoryOnly, true);
  assert.deepEqual(workers[1].data.runtime, runtime);
  workers[1].worker.emit('message', {cpuMs: 41000, durationMs: 62000});
  workers[1].worker.emit('exit', 0);
  t.mock.timers.tick(20);
  assert.equal(workers.length, 3, 'expensive inventory does not defer native continuation');
  assert.equal(workers[2].data.nativeOnly, true);
  assert.equal(workers[2].data.runtime, undefined);
  workers[2].worker.emit('message', {cpuMs: 12, durationMs: 15});
  workers[2].worker.emit('exit', 0);
  t.mock.timers.tick(599);
  assert.equal(workers.length, 3, 'native continuation retains its own cooldown');
  t.mock.timers.tick(1);
  assert.equal(workers.length, 4);
  assert.equal(workers[3].data.nativeOnly, true);
  maintenance.close();
  workers[3].worker.emit('exit', 0);
  t.mock.timers.tick(60000);
  assert.equal(workers.length, 4);
});
