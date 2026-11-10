import test from 'node:test';
import assert from 'node:assert/strict';
import {accountQuotaView,accountQuotaWarning,quotaOverviewAccounts} from '../src/features/agent-conversations/account-quota-view.ts';
import {modelSourceViews} from '../src/features/agent-conversations/account-model-view.ts';
const now=Date.parse('2026-10-30T00:00:00Z');
const account={id:'a',identity:'i',provider:'deepseek',label:'DeepSeek',accountLabel:'已登录账号',revision:'r',enabled:false,status:'ready',models:[],observedAt:new Date(now).toISOString()};
test('概览保留所有原生窗口和余额，不将账户余额伪造成百分比',()=>{
 const source={...account,quota:{available:true,observedAt:new Date(now).toISOString(),balances:[{currency:'CNY',total:'0.00',toppedUp:'0.00',granted:'0.00'}],windows:[{id:'week',label:'周限额',remainingPercent:90},{id:'day',label:'日限额',remainingPercent:60},{id:'hour',label:'5小时限额',remainingPercent:10,resetsAt:'2026-10-30T05:00:00Z'},{id:'other',label:'组织额度',remainingPercent:0}]}};
 const view=accountQuotaView(source,now);assert.equal(view.stale,false);assert.equal(view.lines.length,5);assert.equal(view.lines[0].text,'账户余额 CNY 0.00（充值 0.00 · 赠送 0.00）');assert.match(view.lines[3].text,/5小时限额/);assert.equal(view.lines[3].resetsAt,'2026-10-30T05:00:00Z');assert.match(view.lines[4].text,/剩余 0%/);
 const [card]=modelSourceViews([source],[]);assert.deepEqual(card.balanceLabels,[view.lines[0].text]);
});
test('包括停用但已登录的账号，未登录断开过期排除，旧失败明确未确认',()=>{
 const accounts=quotaOverviewAccounts([account,{...account,id:'failed',status:'failed',quota:{available:false}},{...account,id:'expired',status:'expired'},{...account,id:'disconnected',status:'disconnected'},{...account,id:'new',status:'not-authenticated'},{...account,id:'unknown',status:'failed',observedAt:undefined}]);assert.deepEqual(accounts.map(row=>row.id),['a','failed']);
});
test('未知不填零，旧观察和摘要型额度保持真实边界',()=>{
 assert.equal(accountQuotaView(account,now).lines[0].text,'额度暂不可读取');
 const quota={available:true,observedAt:new Date(now-61000).toISOString(),summary:'剩余 100 Credits'};
 assert.equal(accountQuotaView({...account,quota},now).stale,true);assert.equal(accountQuotaView({...account,quota},now).lines[0].text,'剩余 100 Credits');
 assert.equal(accountQuotaView({...account,quota:{...quota,observedAt:'invalid'}},now).stale,true);
 assert.equal(accountQuotaView({...account,quota:{...quota,stale:true,observedAt:new Date(now).toISOString()}},now).stale,true);
});
test('紧凑概览只显示适度精度的余额，详细视图同样保留两位小数且不改写原始金额或丢失额度窗口',()=>{
 const source={...account,quota:{available:true,observedAt:new Date(now).toISOString(),balances:[{currency:'CNY',total:'96.813383920000000',toppedUp:'96.813383920000000',granted:'0'},{currency:'USD',total:'0.00'}],windows:[{id:'week',label:'每周窗口',remainingPercent:92},{id:'hour',label:'5小时窗口',remainingPercent:0}]}};
 const view=accountQuotaView(source,now,true);
 assert.deepEqual(view.lines.map(line=>line.text),['CNY 96.81','USD 0.00','每周窗口 · 剩余 92%','5小时窗口 · 剩余 0%']);
 assert.equal(accountQuotaView(source,now).lines[0].text,'账户余额 CNY 96.81（充值 96.81 · 赠送 0.00）');
 assert.equal(modelSourceViews([source],[])[0].balanceLabels[0],'账户余额 CNY 96.81（充值 96.81 · 赠送 0.00）');
 assert.equal(source.quota.balances[0].total,'96.813383920000000');
 assert.equal(accountQuotaView({...account,quota:{available:true,balances:[{currency:'CNY',total:'未知'}]}},now,true).lines[0].text,'CNY 未知');
 assert.equal(accountQuotaView(account,now,true).lines[0].text,'额度暂不可读取');
});
test('详细余额保留两位小数，未知与空值不冒充零',()=>{
 const balances=[{currency:'CNY',total:'81.362111880000000',toppedUp:'81.362111880000000',granted:'0'},{currency:'USD',total:'12.999',toppedUp:'未知',granted:''}];
 assert.deepEqual(accountQuotaView({...account,quota:{available:true,balances}},now).lines.map(line=>line.text),['账户余额 CNY 81.36（充值 81.36 · 赠送 0.00）','账户余额 USD 13.00（充值 未知 · 赠送 ）']);
});
test('缓存额度直接展示，不额外提示非实时；只有账号待确认时说明',()=>{
 const quota={available:true,observedAt:new Date(now-61000).toISOString(),windows:[{id:'week',label:'每周窗口',remainingPercent:84}]};
 const cached={...account,quota};
 assert.equal(accountQuotaView(cached,now).stale,true);
 assert.equal(accountQuotaView(cached,now).lines[0].text,'每周窗口 · 剩余 84%');
 assert.equal(accountQuotaWarning(cached),undefined);
 assert.equal(accountQuotaWarning({...cached,status:'failed'}),'账号待确认');
 assert.equal(accountQuotaWarning({...cached,quota:{...quota,diagnostic:'本次额度读取未完成，以下保留上次观察。'}}),undefined);
});
