import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationWarmups,CONNECTION_IDLE_MS,type PreparedSource} from '../../src/application/conversation-warmups.ts';
const source={} as PreparedSource;
test('preparation coalesces, polling does not renew idle time and ownership transfers before pending work completes',async()=>{
  let time=0,opens=0,closes=0,ready!:()=>void;
  const gate=new Promise<void>(resolve=>ready=resolve),pool=new ConversationWarmups(async()=>{closes++;},()=>time);
  const create=async()=>{opens++;await gate;return source;};
  const a=pool.prepare('slot','exact','agent',create),b=pool.prepare('slot','exact','agent',create);
  const adopted=pool.take('slot','exact');
  await pool.prepare('slot','exact','agent',create);
  ready();await Promise.all([a,b]);assert.equal(await adopted,source);assert.equal(opens,1);
  time=CONNECTION_IDLE_MS*2;await pool.close(undefined,time-CONNECTION_IDLE_MS);assert.equal(closes,0,'adopted work is no longer speculative');
  pool.unclaim('slot');await pool.prepare('slot','next','agent',async()=>source);
  time+=CONNECTION_IDLE_MS-1;await pool.prepare('slot','next','agent',async()=>{throw Error('duplicate');});
  await pool.close(undefined,time-CONNECTION_IDLE_MS);assert.equal(closes,0);
  time++;await pool.close(undefined,time-CONNECTION_IDLE_MS);assert.equal(closes,1);
});
test('configuration changes wait for exact close and a close failure cannot silently cold-start',async()=>{
  let closed=0;const pool=new ConversationWarmups(async()=>{closed++;throw Error('exit unconfirmed');},()=>0);
  await pool.prepare('slot','old','agent',async()=>source);
  await assert.rejects(pool.prepare('slot','new','agent',async()=>source),/exit unconfirmed/);
  await assert.rejects(pool.take('slot','new'),/exit unconfirmed/);assert.equal(closed,1);assert.equal(pool.size,1);
});

test('concurrent Qoder selections only prepare the latest and exact discard cannot close adopted work',async()=>{
 let opens=0,closes=0;const pool=new ConversationWarmups(async()=>{closes++;},()=>0),create=async()=>{opens++;return source;};
 const first=pool.prepare('old-slot','old-key','qoder',create),latest=pool.prepare('new-slot','new-key','qoder',create);
 assert.equal(await first,false);assert.equal(await latest,true);assert.equal(opens,1);assert.equal(pool.size,1);
 await pool.discard('new-slot','old-key');assert.equal(closes,0);
 await pool.prepare('new-slot','new-key','qoder',create,'selection-a');
 await pool.prepare('new-slot','new-key','qoder',create,'selection-b');
 await pool.discard('new-slot','new-key','selection-a');assert.equal(closes,0,'reselecting the same binding transfers preparation identity');
 assert.equal(opens,1);
 assert.equal(await pool.take('new-slot','new-key'),source);
 await pool.discard('new-slot','new-key');assert.equal(closes,0);assert.equal(pool.size,0);
});
