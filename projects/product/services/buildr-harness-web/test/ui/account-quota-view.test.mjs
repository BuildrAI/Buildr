import test from 'node:test';
import assert from 'node:assert/strict';
import {accountBillingUrl,accountQuotaView,accountQuotaWarning,accountSourceName,formatQuotaPercent,magpieQuotaOverviewGroups,OPENAI_BILLING_URL,quotaOverviewAccounts,quotaOverviewSections,quotaResetCountdown} from '../../src/features/agent-conversations/account-quota-view.ts';
import {modelSourceViews} from '../../src/features/agent-conversations/account-model-view.ts';
const now=Date.parse('2026-10-30T00:00:00Z');
const account={id:'a',identity:'i',provider:'deepseek',label:'DeepSeek',accountLabel:'已登录账号',revision:'r',enabled:false,status:'ready',models:[],observedAt:new Date(now).toISOString()};
test('概览保留所有原生窗口和余额，不将账户余额伪造成百分比',()=>{
 const source={...account,quota:{available:true,observedAt:new Date(now).toISOString(),balances:[{currency:'CNY',total:'0.00',toppedUp:'0.00',granted:'0.00'}],windows:[{id:'week',label:'周限额',remainingPercent:90},{id:'day',label:'日限额',remainingPercent:60},{id:'hour',label:'5小时限额',remainingPercent:10,resetsAt:'2026-10-30T05:00:00Z'},{id:'other',label:'组织额度',remainingPercent:0}]}};
 const view=accountQuotaView(source,now);assert.equal(view.stale,false);assert.equal(view.lines.length,5);assert.equal(view.lines[0].text,'账户余额 CNY 0.00（充值 0.00 · 赠送 0.00）');assert.match(view.lines[3].text,/5小时限额/);assert.equal(view.lines[3].resetsAt,'2026-10-30T05:00:00Z');assert.match(view.lines[4].text,/剩余 0%/);
 const card=modelSourceViews([source],[]).find(item=>item.id===source.id);assert.deepEqual(card.balanceLabels,[view.lines[0].text]);
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
 assert.equal(modelSourceViews([source],[]).find(item=>item.id===source.id).balanceLabels[0],'账户余额 CNY 96.81（充值 96.81 · 赠送 0.00）');
 assert.equal(source.quota.balances[0].total,'96.813383920000000');
 assert.equal(accountQuotaView({...account,quota:{available:true,balances:[{currency:'CNY',total:'未知'}]}},now,true).lines[0].text,'CNY 未知');
 assert.equal(accountQuotaView(account,now,true).lines[0].text,'额度暂不可读取');
});
test('详细余额保留两位小数，未知与空值不冒充零',()=>{
 const balances=[{currency:'CNY',total:'81.362111880000000',toppedUp:'81.362111880000000',granted:'0'},{currency:'USD',total:'12.999',toppedUp:'未知',granted:''}];
 assert.deepEqual(accountQuotaView({...account,quota:{available:true,balances}},now).lines.map(line=>line.text),['账户余额 CNY 81.36（充值 81.36 · 赠送 0.00）','账户余额 USD 13.00（充值 未知 · 赠送 ）']);
});
test('缓存额度直接展示，不额外提示非实时；只有供应商待确认时说明',()=>{
 const quota={available:true,observedAt:new Date(now-61000).toISOString(),windows:[{id:'week',label:'每周窗口',remainingPercent:84}]};
 const cached={...account,quota};
 assert.equal(accountQuotaView(cached,now).stale,true);
 assert.equal(accountQuotaView(cached,now).lines[0].text,'每周窗口 · 剩余 84%');
 assert.equal(accountQuotaWarning(cached),undefined);
 assert.equal(accountQuotaWarning({...cached,status:'failed'}),'供应商待确认');
 assert.equal(accountQuotaWarning({...cached,quota:{...quota,diagnostic:'本次额度读取未完成，以下保留上次观察。'}}),undefined);
});
test('自定义供应商显示用户填写的名称，不改用 ChatGPT API 名称',()=>{
 const custom={...account,id:'custom',provider:'custom',label:'我的网关',accountLabel:'我的网关',authType:'api-key',modeLabel:'OpenAI 兼容',custom:{protocol:'chat-completions',baseUrl:'https://models.example.com/v1',useApiKey:true,models:[{id:'m',label:'M'}]}};
 assert.equal(accountSourceName(custom),'我的网关');
 assert.equal(accountSourceName({...account,provider:'qoder',authType:'api-key'}),'Qoder');
 assert.equal(accountQuotaView(custom,now).lines[0].text,'额度暂不可读取');
 const card=modelSourceViews([custom],[]).find(item=>item.id==='custom');
 assert.equal(card.providerLabel,'我的网关');
 assert.deepEqual(card.windows,[]);
 assert.match(card.quotaNote,/自定义供应商没有额度接口/);
});
test('额度概览按来源显示名称稳定排序，同一来源按账号名排序',()=>{
 const rows=[
  {...account,id:'qoder-cn',provider:'qoder-cn',label:'Qoder CN',accountLabel:'Qoder CN'},
  {...account,id:'deepseek',provider:'dsh',label:'DeepSeek',accountLabel:'DeepSeek'},
  {...account,id:'qoder-b',provider:'qoder',label:'Qoder',accountLabel:'Qoder · B'},
  {...account,id:'api',provider:'openai',label:'ChatGPT API',accountLabel:'ChatGPT API',authType:'api-key'},
  {...account,id:'qoder-a',provider:'qoder',label:'Qoder',accountLabel:'Qoder · A'},
  {...account,id:'codex',provider:'codex',label:'ChatGPT',accountLabel:'ChatGPT · proLite'},
 ];
 assert.deepEqual(quotaOverviewAccounts(rows).map(row=>row.id),['codex','api','deepseek','qoder-a','qoder-b','qoder-cn']);
 assert.equal(accountSourceName(rows.at(-1)),'ChatGPT');
 assert.equal(accountSourceName({...account,provider:'openai',label:'OpenAI',authType:'api-key'}),'ChatGPT API');
});
test('平台返回数量时额度窗口显示剩余 credits，缺任一侧不推算',()=>{
 const source={...account,provider:'qoder',label:'Qoder',accountLabel:'Qoder',quota:{available:true,observedAt:new Date(now).toISOString(),windows:[
  {id:'credits',label:'套餐内 Credits',remainingPercent:0,remainingCredits:0,totalCredits:1000},
  {id:'add-on',label:'资源包',remainingPercent:59.2,remainingCredits:1599,totalCredits:2700},
  {id:'partial',label:'数量不全',remainingPercent:50,remainingCredits:10},
 ]}};
 const view=accountQuotaView(source,now,true);
 assert.deepEqual(view.lines.map(line=>line.text),['套餐内 Credits · 剩余 0%','资源包 · 剩余 59.2%','数量不全 · 剩余 50%']);
 assert.deepEqual(view.lines.map(line=>line.credits),['0 / 1,000','1,599 / 2,700',undefined]);
 assert.deepEqual(view.lines.map(line=>[line.label,line.percent]),[['套餐内 Credits',0],['资源包',59.2],['数量不全',50]]);
 const card=modelSourceViews([source],[]).find(item=>item.id===source.id);
 assert.deepEqual(card.windows.map(window=>window.balanceLabel),['0 / 1,000 credits','1,599 / 2,700 credits',undefined]);
});
test('ChatGPT API 概览只提供官方账单地址，不伪造余额，其他来源没有账单入口',()=>{
 const api={...account,provider:'openai',authType:'api-key',label:'ChatGPT API'};
 assert.equal(accountBillingUrl(api),OPENAI_BILLING_URL);
 assert.equal(accountBillingUrl(account),undefined);
 assert.deepEqual(accountQuotaView(api,now,true).lines.map(line=>[line.kind,line.text]),[['summary','额度暂不可读取']]);
});

test('额度重置统一显示中文倒计时，绝对时间仅作悬停详情',()=>{
 const base=Date.parse('2026-11-16T00:00:00Z');
 assert.equal(quotaResetCountdown('2026-11-21T00:25:49Z',base),'5 天 0 小时后重置');
 assert.equal(quotaResetCountdown('2026-11-16T04:35:00Z',base),'4 小时 35 分钟后重置');
 assert.equal(quotaResetCountdown('2026-11-16T00:00:30Z',base),'1 分钟后重置');
 assert.equal(quotaResetCountdown(undefined,base),undefined);
 assert.equal(quotaResetCountdown('not-a-date',base),undefined);
});

test('额度百分比最多保留两位小数且整数不补零，Magpie 浮窗按上游供应商分组排序且不合计多账号',()=>{
 assert.equal(formatQuotaPercent(99),'99');
 assert.equal(formatQuotaPercent(0),'0');
 assert.equal(formatQuotaPercent(59.2),'59.2');
 assert.equal(formatQuotaPercent(50.91575091575091),'50.92');
 assert.equal(formatQuotaPercent(50.9001),'50.9');
 const groups=magpieQuotaOverviewGroups({
  readAt:'2026-11-24T00:00:00Z',
  accounts:[
   {provider:'qoder',providerLabel:'Qoder',accountLabel:'c•••@newhope.cn',plan:'teams',windows:[{label:'Credits',remainingPercent:50.91575091575091}]},
   {provider:'codex',providerLabel:'Codex',accountLabel:'a•••@gmail.com',plan:'prolite',balance:'73523.98 credits',windows:[{label:'7 days',remainingPercent:92}]},
   {provider:'codex',providerLabel:'Codex',accountLabel:'b•••@gmail.com',windows:[{label:'7 days',remainingPercent:50}]},
   {provider:'magpie',providerLabel:'Magpie',windows:[{label:'Pool',remainingPercent:80}]},
  ],
 });
 assert.deepEqual(groups.map(group=>[group.provider,group.label,group.accounts.length]),[
  ['codex','Codex',2],
  ['magpie','Magpie',1],
  ['qoder','Qoder',1],
 ]);
 assert.ok(groups.every(group=>group.accounts.every(row=>!Object.hasOwn(row,'accountLabel'))));
 assert.deepEqual(groups[0].accounts.map(row=>row.windows[0].remainingPercent),[92,50]);
 assert.equal(groups[0].accounts[0].balance,'73523.98 credits');
 assert.equal(groups[2].accounts[0].plan,'teams');
});


test('浮窗把 Magpie 的上游额度和读取状态集中置底，保留各区块内的原顺序',()=>{
 const entries=[
  {kind:'standard',key:'claude-gpt'},
  {kind:'magpie-group',key:'grok'},
  {kind:'magpie-fallback',key:'gateway-unavailable'},
  {kind:'standard',key:'qoder-direct'},
  {kind:'magpie-group',key:'qoder-gateway'},
 ];
 const {standard,magpie}=quotaOverviewSections(entries);
 assert.deepEqual(standard.map(row=>row.key),['claude-gpt','qoder-direct']);
 assert.deepEqual(magpie.map(row=>row.key),['grok','gateway-unavailable','qoder-gateway']);
 assert.deepEqual(quotaOverviewSections([entries[0]]).magpie,[]);
 assert.deepEqual(quotaOverviewSections([entries[1]]).standard,[]);
});
