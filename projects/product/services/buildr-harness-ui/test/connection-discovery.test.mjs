import test from 'node:test';
import assert from 'node:assert/strict';
import {ConnectionDiscovery} from '../src/features/agent-conversations/connection-discovery.ts';

test('a failed initial discovery retries itself and is not mistaken for successful empty setup',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let attempts=0;const rows=[],states=[];
 const discovery=new ConnectionDiscovery(async()=>{if(++attempts===1)throw Error('offline');return [{id:'dsh',enabled:true}];},v=>rows.push(v),v=>states.push(v));t.after(()=>discovery.stop());
 const first=discovery.refresh();assert.equal(first,discovery.refresh(),'overlapping observers share one request');await first;
 assert.equal(states.at(-1).ready,false);assert.equal(states.at(-1).error,'');assert.equal(rows.length,0);
 t.mock.timers.tick(1000);await discovery.refresh();assert.equal(attempts,2);assert.equal(states.at(-1).ready,true);assert.equal(states.at(-1).error,'');assert.equal(rows.at(-1)[0].id,'dsh');
});
test('refresh failures preserve the last ready snapshot; stopped views cannot be overwritten by late replies',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let reject=false,release;const rows=[],states=[];
 const discovery=new ConnectionDiscovery(async()=>{if(reject)throw Error('handoff');return [{id:'codex',enabled:true}];},v=>rows.push(v),v=>states.push(v));
 await discovery.refresh();reject=true;await discovery.refresh();assert.equal(rows.length,1);assert.equal(states.at(-1).ready,true);assert.equal(states.at(-1).error,'');discovery.stop();t.mock.timers.tick(5000);assert.equal(rows.length,1);
 const late=new ConnectionDiscovery(()=>new Promise(resolve=>{release=resolve;}),v=>rows.push(v),()=>{});const pending=late.refresh();await Promise.resolve();late.stop();release([]);await pending;assert.equal(rows.length,1);
});
test('版本对齐按已知状态提示并保留上次快照，恢复后清除',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let aligning=false;const rows=[],states=[];
 const discovery=new ConnectionDiscovery(async()=>{if(aligning)throw Object.assign(new Error('aligning'),{code:'agent_service_aligning',status:503});return [{id:'codex',enabled:true}];},v=>rows.push(v),v=>states.push(v));t.after(()=>discovery.stop());
 await discovery.refresh();assert.equal(states.at(-1).error,'');assert.equal(rows.length,1);
 aligning=true;await discovery.refresh();assert.equal(rows.length,1,'对齐期间保留上次快照');assert.equal(states.at(-1).error,'执行后台正在切换版本，连接状态稍后自动恢复。');
 aligning=false;t.mock.timers.tick(1000);await discovery.refresh();assert.equal(states.at(-1).error,'');assert.equal(states.at(-1).ready,true);
});
