import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeInputId, claudeItems, ClaudeItemProjector, claudeQuestion, claudeAnswers, claudeGatewayEnvironment, claudeEffort } from '../../src/executors/claude/protocol.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../../src/executors/program-policy.ts';
import { createClaudeExecutor } from '../../src/executors/claude/index.ts';
import { ClaudeControlInput } from '../../src/executors/claude/control.ts';

const gateway={identity:'lease',baseUrl:'http://127.0.0.1:1234/v1',apiKey:'private',models:[{id:'buildr-selected',label:'Selected',contextWindow:64000,maxOutputTokens:4096,reasoningEfforts:[{id:'high',label:'High'}]}]};
test('Claude exact input UUID and every native model purpose stay bound to one lease',()=>{
  assert.match(claudeInputId('input'),/^[a-f0-9-]{36}$/);assert.equal(claudeInputId('input'),claudeInputId('input'));assert.notEqual(claudeInputId('input'),claudeInputId('another'));
  const env=claudeGatewayEnvironment(gateway);
  assert.equal(env.ANTHROPIC_BASE_URL,'http://127.0.0.1:1234');
  for(const key of ['ANTHROPIC_MODEL','ANTHROPIC_DEFAULT_OPUS_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL','ANTHROPIC_DEFAULT_SONNET_MODEL','ANTHROPIC_DEFAULT_FABLE_MODEL','CLAUDE_CODE_SUBAGENT_MODEL','CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL'])assert.equal(env[key],'buildr-selected');
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS,'64000');assert.equal(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,'4096');
  assert.equal(env.ANTHROPIC_API_KEY,'');assert.equal(claudeEffort(gateway,undefined,'high'),'high');
  assert.throws(()=>claudeEffort(gateway,undefined,'ultra'),/reasoning/);
});
test('Claude complete block frames do not overwrite earlier text or thinking and retain child identity',()=>{
  const p=new ClaudeItemProjector();
  const row=(uuid:string,part:unknown)=>({type:'assistant',uuid,parent_tool_use_id:'parent',message:{id:'message',content:[part]}});
  const thinking=row('a',{type:'thinking',thinking:'visible thinking',signature:'do-not-render'});
  assert.equal(p.items(thinking)[0]?.id,'message:message:0');
  assert.equal(p.items(row('b',{type:'text',text:'first'}))[0]?.id,'message:message:1');
  assert.equal(p.items(row('c',{type:'text',text:'second'}))[0]?.id,'message:message:2');
  assert.equal(p.items(thinking)[0]?.id,'message:message:0','duplicate frame must retain identity');
  assert.equal(p.items(thinking)[0]?.parentToolId,'parent');
  assert.equal(claudeItems(row('private',{type:'redacted_thinking',data:'secret'})).length,0);
  const tool=claudeItems(row('tool',{type:'tool_use',id:'call',name:'Read',input:{file_path:'file'}}))[0]!;
  assert.equal(tool.id,'call');assert.equal(tool.nativeTool,true);
});
test('Claude business questions require a complete explicit answer even in full access',()=>{
  const input={questions:[{question:'部署哪里？',header:'环境',multiSelect:false,options:[{label:'测试'},{label:'生产'}]}]};
  const request=claudeQuestion('request',input);
  assert.equal(request.kind,'question');assert.equal(request.blocking,true);
  assert.deepEqual(claudeAnswers(request,input,{'0':'测试'}),{...input,answers:{'部署哪里？':'测试'}});
  assert.deepEqual(claudeAnswers(request,input,{'0':'暂不部署'}),{...input,answers:{'部署哪里？':'暂不部署'}});
  assert.throws(()=>claudeAnswers(request,input,{}),/invalid/);
  assert.throws(()=>claudeAnswers(request,input,{'0':[]}),/invalid/);
  assert.throws(()=>claudeAnswers(request,input,{'0':['测试','生产']}),/invalid/);
});
test('Claude program policy excludes older controls and global postinstall wrappers',()=>{
  assert.equal(isCompatibleProgram('claude-code','2.1.321'),false);
  assert.equal(isCompatibleProgram('claude-code','2.1.322'),true);
  assert.equal(isCompatibleProgram('claude-code','3.0.0'),false);
  assert.match(nativeProgramPolicy('claude-code').package,/@anthropic-ai\/claude-code-/);
  assert.match(nativeProgramPolicy('claude-code').entry,/\/claude(?:\.exe)?$/);
});
test('Claude atomic queue cancellation only extends the documented interrupt envelope',async()=>{
  let cancel=false;const input=new ClaudeControlInput(()=>cancel),chunks:Buffer[]=[];
  input.on('data',chunk=>chunks.push(Buffer.from(chunk)));
  const interrupt={type:'control_request',request_id:'exact-request',request:{subtype:'interrupt'}};
  input.write(JSON.stringify(interrupt)+'\n');
  cancel=true;
  const text=JSON.stringify({type:'user',message:{role:'user',content:'中文'}});
  const bytes=Buffer.from(text+'\n');input.write(bytes.subarray(0,bytes.length-4));input.write(bytes.subarray(bytes.length-4));
  input.end(JSON.stringify(interrupt)+'\n');
  const rows=Buffer.concat(chunks).toString().trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(rows[0],interrupt);assert.deepEqual(rows[1],JSON.parse(text));
  assert.deepEqual(rows[2],{...interrupt,request:{subtype:'interrupt',cancel_queued:true}});
});

test('Claude Code uses the requested product name without changing its provider identity',()=>{
  const executor=createClaudeExecutor();assert.equal(executor.descriptor.id,'claude-code');assert.equal(executor.descriptor.label,'Claude Code');
});

test('Claude session-task notifications in SDK history do not become user submissions',()=>{
  const row={type:'user',uuid:'notification',message:{content:'<task-notification>finished</task-notification>'}};
  assert.deepEqual(claudeItems({...row,origin:{kind:'task-notification',producer:'session-task',runId:'native-task'}}),[]);
  assert.equal(claudeItems(row)[0]?.id,'notification','text alone does not establish native provenance');
  assert.equal(claudeItems({...row,origin:{kind:'task-notification',subkind:'scheduled-trigger'}})[0]?.id,'notification');
});
