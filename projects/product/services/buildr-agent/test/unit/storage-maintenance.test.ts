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
  assert.equal(workers.length,1);assert.deepEqual(workers[0].data.runtime,runtime);
  t.mock.timers.tick(100);assert.equal(workers.length,1,'an in-flight worker is never overlapped');
  workers[0].worker.emit('message',{cpuMs:12,durationMs:15,nativeContent:{nextEntry:100,nextAttachment:''}});
  workers[0].worker.emit('exit',0);
  t.mock.timers.tick(599);assert.equal(workers.length,1,'backlog cannot bypass the measured CPU cooldown');
  t.mock.timers.tick(1);
  assert.equal(workers.length,2);
  assert.equal(workers[1].data.runtime,undefined,'same retained runtimes are not probed on each pass');
  workers[1].worker.emit('exit',0);t.mock.timers.tick(20);
  assert.equal(workers.length,3);assert.equal(workers[2].data.nativeOnly,true,'native cursor advances without another storage inventory');
  workers[2].worker.emit('exit',0);t.mock.timers.tick(60000);
  assert.equal(workers.length,4);assert.deepEqual(workers[3].data.runtime,runtime,'a delayed pass can retry with fresh observations');
  maintenance.close();workers[3].worker.emit('exit',0);t.mock.timers.tick(60000);
  assert.equal(workers.length,4);
});
