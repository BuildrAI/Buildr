import test from 'node:test';
import assert from 'node:assert/strict';
import { measureParticipation, nativeParticipation, normalizeParticipation, participationRequests, mergeParticipation } from '../../src/domain/participation.ts';
import { summarizeParticipation } from '../../src/domain/participation-record.ts';
import { validateOperation } from '../../src/process/operations.ts';

test('native measurement counts Unicode before display truncation and never infers success', () => {
  assert.deepEqual(measureParticipation('中😀'), {utf8Bytes:7,utf16Units:3,boundary:'native-observed',completeness:'complete',upstreamCompleteness:'unknown'});
  assert.equal(nativeParticipation(undefined,'done').outcome,'unknown');
  assert.equal(nativeParticipation().output,undefined);
  assert.equal(nativeParticipation(undefined,'x'.repeat(100000)).output?.utf8Bytes,100000);
});
test('closed observation strips unknown nested fields without persisting source text', () => {
  const value=nativeParticipation('secret');
  (value.input as any).body='credential';
  const clean=normalizeParticipation(value)!;
  assert.ok(!JSON.stringify(clean).includes('credential'));
  assert.ok(!JSON.stringify(clean).includes('secret'));
  assert.equal(normalizeParticipation({...value,version:2}),undefined);
  assert.equal(normalizeParticipation({...value,input:{utf8Bytes:-1}})?.input,undefined);
});
test('bounded input grammar detects candidates only; output, dynamic and compound shells are not execution evidence', () => {
  for (const cmd of ['echo buildr task list','grep buildr log','buildr task list && echo ok','$(which buildr) task list','eval buildr','ls .agents/skills']) assert.deepEqual(participationRequests('command',cmd),[],cmd);
  const [cli]=participationRequests('functions.exec_command',JSON.stringify({cmd:'/known/buildr task inspect --token secret'}));
  assert.equal(cli?.status,'candidate');assert.equal(cli?.providedBy,'unknown');
  assert.ok(!JSON.stringify(cli).includes('secret'));
  assert.equal(participationRequests('Read',JSON.stringify({path:'.agents/skills/buildr/SKILL.md'}))[0]?.kind,'skill');
  assert.deepEqual(participationRequests('command','x'.repeat(16001)),[]);
});
test('result replaces measurement without duplicating action; delayed start cannot erase terminal evidence',()=>{
  const start=mergeParticipation(undefined,nativeParticipation('buildr task list',undefined,'pending'),'command','buildr task list')!;
  const done=mergeParticipation(start,nativeParticipation(undefined,'ok','succeeded',0))!;
  const repeated=mergeParticipation(done,nativeParticipation('buildr task list',undefined,'pending'))!;
  assert.equal(repeated.matches.length,1);assert.equal(repeated.outcome,'succeeded');assert.equal(repeated.output?.utf8Bytes,2);
});
test('real native literal shell wrapper is parsed without evaluating dynamic or compound input',()=>{
  const path='.agents/skills/buildr/SKILL.md';
  assert.deepEqual(participationRequests('command',`/bin/zsh -lc 'cat ${path}'`),participationRequests('Read',JSON.stringify({path})));
  assert.equal(participationRequests('command',`/bin/bash -lc 'cat "${path}"'`)[0]?.locator,path);
  for(const command of [
    `/bin/zsh -lc 'cat ${path}; echo done'`,
    `/bin/zsh -lc 'cat ${path} && echo done'`,
    `/bin/zsh -lc 'cat "$HOME/skills/buildr/SKILL.md"'`,
    `/bin/zsh -lc 'cat ${path}' extra`,
    `/bin/zsh -lc 'cat ${path}' > out`,
    `/bin/zsh -lc 'cat ${path}\\\\'`,
  ]) assert.deepEqual(participationRequests('command',command),[],command);
});
test('summary excludes unknown outcomes from failure denominator and binds pagination to revision',()=>{
  const facts=['succeeded','failed','unknown'].map((outcome,i)=>({identity:'cli',name:'Buildr',kind:'cli',providedBy:'buildr',status:'confirmed',action:'requested',outcome,conversationId:'c',runId:'r'+i,participantId:'p',startedAt:'2026-11-01T00:00:00.000Z',evidence:{entryId:'t'+i}})) as any;
  const projection={revision:'v1',runs:[],gaps:[],facts};
  const summary=summarizeParticipation('w',[projection],{},'2026-11-02T00:00:00.000Z');
  assert.equal(summary.rows[0]?.requested,3);assert.equal(summary.rows[0]?.failureRatio,.5);assert.equal(summary.rows[0]?.unknown,1);
  assert.throws(()=>summarizeParticipation('w',[],{to:'invalid'},'now'),/时间无效/);
  assert.throws(()=>summarizeParticipation('w',[],{limit:201},'2026-11-02T00:00:00.000Z'));
});
test('remote participation queries are closed and do not accept replacement scope fields',()=>{
  validateOperation('conversations.participation',['w','c',{runId:'r'}]);
  validateOperation('conversations.participationSummary',['w',{}]);
  assert.throws(()=>validateOperation('conversations.participation',['w','c',{runId:'r',workspaceId:'other'}]));
  assert.throws(()=>validateOperation('conversations.participationSummary',['w',{limit:201}]));
});

test('offered and observed versions stay separate, availability ratios need a proven denominator, and duplicate deliveries do not count twice',()=>{
 const base:any={identity:'skill',name:'method',kind:'skill',providedBy:'buildr',status:'confirmed',conversationId:'c',runId:'r',participantId:'p',startedAt:'2026-11-01T00:00:00.000Z',outcome:'unknown'};
 const facts=[{...base,action:'available',offeredVersion:'v1',evidence:{inputId:'i'}},{...base,action:'requested',offeredVersion:'v1',evidence:{entryId:'t'}},{...base,action:'requested',offeredVersion:'v1',evidence:{entryId:'t'}},{...base,action:'observed',observedVersion:'v1',evidence:{entryId:'other'}}];
 const result=summarizeParticipation('w',[{revision:'v',runs:[],gaps:[],facts}],{},'2026-11-02T00:00:00Z');
 assert.equal(result.rows.length,2);
 const offered=result.rows.find(row=>row.versionBasis==='offered')!;assert.equal(offered.requested,1);assert.equal(offered.observableUseRatio,1);assert.equal(offered.requestedAvailableRuns,1);
 const observed=result.rows.find(row=>row.versionBasis==='observed')!;assert.equal(observed.observableUseRatio,null);assert.equal(observed.failureRatio,null);
});
test('pagination binds exact cut and filters, and zero known results are not zero failure',()=>{
 const facts=Array.from({length:3},(_,i)=>({identity:'object-'+i,name:'object',kind:'skill',providedBy:'buildr',status:'confirmed',action:'requested',outcome:'unknown',conversationId:'c',runId:'r',participantId:'p',startedAt:'2026-11-01T00:00:00.000Z',evidence:{entryId:'t'+i}})) as any;
 const projection={revision:'v1',facts,runs:[],gaps:[]};const input={from:'2026-11-01T00:00:00Z',to:'2026-11-02T00:00:00Z',limit:1};
 const first=summarizeParticipation('w',[projection],input,'now');assert.ok(first.nextCursor);assert.equal(first.rows[0]?.failureRatio,null);
 const second=summarizeParticipation('w',[projection],{...input,cursor:first.nextCursor},'later');assert.notEqual(first.rows[0]?.identity,second.rows[0]?.identity);
 assert.throws(()=>summarizeParticipation('w',[{...projection,revision:'v2'}],{...input,cursor:first.nextCursor},'now'),/切点/);
 assert.throws(()=>summarizeParticipation('w',[projection],{...input,provider:'codex',cursor:first.nextCursor},'now'),/切点/);
});

test('observation limits are local, unknown fields and free-form diagnostics never become persisted body copies',()=>{
 const source={identity:'object',name:'object',kind:'skill',providedBy:'buildr',status:'confirmed',action:'requested',body:'secret'};
 const normalized=normalizeParticipation({...nativeParticipation(),matches:Array.from({length:100},()=>source),gaps:['valid-gap','password=secret','unbounded message with secret']})!;
 assert.equal(normalized.coverage,'partial');assert.ok(normalized.matches.length<=32);assert.ok(Buffer.byteLength(JSON.stringify(normalized))<=8192);assert.ok(!JSON.stringify(normalized).includes('secret'));
 assert.equal(normalizeParticipation({version:1,matches:[]}),undefined);
});

test('half-open execution start ranges and model filters do not use tool completion times',()=>{
 const facts=['2026-11-01T00:00:00.000Z','2026-11-02T00:00:00.000Z'].map((startedAt,i)=>({identity:'obj',name:'obj',kind:'skill',providedBy:'buildr',status:'confirmed',action:'requested',outcome:'unknown',conversationId:'c',runId:'r'+i,participantId:'p',provider:'codex',model:'model',startedAt,evidence:{entryId:'t'+i}})) as any;
 const projection={revision:'v',facts,runs:facts.map((f:any)=>({id:f.runId,startedAt:f.startedAt,collected:true,provider:f.provider,model:f.model})),gaps:[]};
 const input={from:'2026-11-01T00:00:00Z',to:'2026-11-02T00:00:00Z',provider:'codex',model:'model'};
 const summary=summarizeParticipation('w',[projection],input,'now');assert.equal(summary.rows[0]?.requested,1);assert.equal(summary.runs,1);
 assert.equal(summarizeParticipation('w',[projection],{...input,model:'other'},'now').rows.length,0);
 assert.throws(()=>summarizeParticipation('w',[projection],{from:'2026-01-01',to:'2026-11-01'},'now'),/90天/);
});

test('CLI statistics never copy positional values into a method name or secret digest',()=>{
 const value=participationRequests('command','buildr lookup secretpassword');assert.ok(!JSON.stringify(value).includes('secretpassword'));assert.equal(value[0]?.name,'Buildr CLI');
 assert.equal(participationRequests('command','buildr task inspect --help')[0]?.name,'Buildr CLI 帮助');
});
