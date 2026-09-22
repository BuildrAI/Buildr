import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreferenceWriteQueue } from '../src/features/workbench/hooks/preferenceWriteQueue.ts';

test('偏好与访问写入按用户顺序完成，后续快响应不覆盖前面未完成写入', async () => {
 const queue=createPreferenceWriteQueue(), events=[];
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const first=queue.run(async()=>{events.push('first-start');await gate;events.push('first-result');return 'first'});
 const next=queue.run(async()=>{events.push('next-start');events.push('next-result');return 'next'});
 await Promise.resolve();
 assert.deepEqual(events,['first-start']);assert.equal(queue.pending,2);
 release();
 assert.deepEqual(await Promise.all([first,next]),['first','next']);
 await queue.settled();
 assert.deepEqual(events,['first-start','first-result','next-start','next-result']);assert.equal(queue.pending,0);
});
test('局部写入失败不阻断后续操作，不同工作空间队列独立', async () => {
 const left=createPreferenceWriteQueue(), right=createPreferenceWriteQueue();
 const failure=left.run(async()=>{throw new Error('conflict')});
 const next=left.run(async()=>42);
 assert.equal(await right.run(async()=>7),7);
 await assert.rejects(failure,/conflict/);assert.equal(await next,42);
 await left.settled();assert.equal(left.pending,0);
});
