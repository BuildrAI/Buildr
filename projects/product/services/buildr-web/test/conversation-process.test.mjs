import test from 'node:test';
import assert from 'node:assert/strict';
import {groupConversationStream,processBlockKey,carryExpandedProcessBlocks,processEntryStatus,conversationStreamTurns,conversationTurnExecution} from '../src/features/agent-conversations/conversation-state.ts';
import {processTool,conversationFileTarget} from '../src/features/agent-conversations/conversation-process.ts';
const message=(id,text,runId='r1',role='assistant')=>({id,sequence:0,kind:'message',role,text,runId,createdAt:'2026-10-26T00:00:00Z'});
const tool=(id,options={})=>({...message(id,'output'),kind:'tool',role:'system',status:'completed',...options});
test('短最终答复留在主线，长过程说明保留在同轮过程内，不按字数判断',()=>{
  const question=message('u','开始','r1','user'),narration=message('n','正在核对。'.repeat(80)),call=tool('t'),answer=message('a','收尾完成。');
  const items=groupConversationStream([question,narration,call,answer]);
  assert.deepEqual(items.map(item=>item.type),['entry','process-block','entry']);
  assert.deepEqual(items[1].entries,[narration,call]);assert.equal(items[2].entry,answer);assert.equal(items[1].finishedAt,answer.createdAt);
});
test('连续两轮均有独立最终答复，缺少runId的历史也以用户消息分界',()=>{
  const entries=[message('u1','开始',undefined,'user'),tool('t1',{runId:undefined}),message('a1','完成',undefined),message('u2','继续',undefined,'user'),tool('t2',{runId:undefined}),message('a2','结束',undefined)].map(entry=>({...entry,runId:undefined}));
  const items=groupConversationStream(entries);
  assert.deepEqual(items.filter(item=>item.type==='entry').map(item=>item.entry.id),['u1','a1','u2','a2']);
  assert.equal(items.filter(item=>item.type==='process-block').length,2);
});
test('当前轮未结束时说明仍在过程，完成后才显示最终答复',()=>{
  const entries=[tool('t'),message('n','正在检查')];
  for(const status of ['running','waiting-approval','unknown','tools-active']){
    const items=groupConversationStream(entries,{id:'r1',status});
    assert.equal(items.length,1);assert.equal(items[0].active,true);assert.equal(items[0].entries.length,2);
  }
  assert.equal(groupConversationStream(entries,{id:'r1',status:'completed'})[1].entry.id,'n');
});
test('普通无工具回答不生成空过程；没有助手答复时不伪造结论',()=>{
  assert.deepEqual(groupConversationStream([message('a','答复')]).map(item=>item.type),['entry']);
  assert.deepEqual(groupConversationStream([tool('t')]).map(item=>item.type),['process-block']);
});
test('新步骤到来不改变过程展开身份',()=>{
  assert.equal(processBlockKey([tool('a')]),processBlockKey([tool('a'),tool('b')]));
});
test('命令输入与输出分别保留；旧命令去掉外壳只用于摘要',()=>{
  const current=processTool(tool('t',{name:'bash',input:JSON.stringify({command:'pwd'}),text:'/repo'}));
  assert.equal(current.command,'pwd');assert.equal(current.output,'/repo');assert.equal(current.description,'pwd');
  const legacy=processTool(tool('old',{text:'/bin/zsh -lc "pwd"\n/repo'}));
  assert.equal(legacy.description,'pwd');assert.equal(legacy.command,'/bin/zsh -lc "pwd"');assert.equal(legacy.output,'/repo');
});
test('完成后的读取依据保留输入提供路径，不从输出内容猜文件名',()=>{
  const read=processTool(tool('r',{name:'Read',input:JSON.stringify({file_path:'/repo/a.ts'}),text:'export const a=1;'}));
  assert.equal(read.kind,'read');assert.deepEqual(read.paths,['/repo/a.ts']);assert.equal(read.description,'a.ts');
  assert.deepEqual(processTool(tool('missing',{name:'read',text:'文件 /repo/a.ts 内容'})).paths,[]);
});
test('文件修改保留实际路径，多路径不丢失',()=>{
  const edit=processTool(tool('e',{name:'file-change',text:'修改文件\nsrc/a.ts\nsrc/b.ts'}));
  assert.equal(edit.kind,'edit');assert.deepEqual(edit.paths,['src/a.ts','src/b.ts']);
});
test('明确编辑工具别名不区分大小写，补丁正文不猜文件目标',()=>{
  for(const name of ['apply_patch','MultiEdit','EditFile',' EDIT_FILE ']){
    const input=JSON.stringify({file_path:'/repo/a.ts',edits:[]});
    const edit=processTool(tool(name,{name,input}));
    assert.equal(edit.kind,'edit');assert.equal(edit.action,'编辑文件');assert.equal(edit.input,input);
    assert.deepEqual(edit.paths,['/repo/a.ts']);
  }
  const patch=processTool(tool('patch',{name:'apply_patch',input:'*** Begin Patch\n*** Add File: a.ts\n+hello\n*** End Patch'}));
  assert.equal(patch.kind,'edit');assert.deepEqual(patch.paths,[]);
});
test('图片有独立用途，不把图片路径变成代码文件打开动作',()=>{
  for(const name of ['view-image','view_image','imageView']){
    const image=processTool(tool(name,{name,input:'{"path":"/repo/diagram.png"}',text:'图片已读取'}));
    assert.equal(image.kind,'image');assert.equal(image.action,'查看图片');assert.equal(image.description,'diagram.png');
    assert.deepEqual(image.paths,[]);
  }
  const native=processTool(tool('native',{name:'view-image',text:'查看图片\n/repo/diagram.png'}));
  assert.equal(native.description,'');assert.deepEqual(native.paths,[]);
});
test('外部未知工具保留原名称，不从名称片段或命令正文猜用途',()=>{
  for(const name of ['mcp-tool','company_view_image','my_apply_patch']){
    const result=processTool(tool(name,{name,input:'{"path":"/repo/a.png"}',text:'read /repo/a.png'}));
    assert.equal(result.kind,'tool');assert.equal(result.action,name);assert.deepEqual(result.paths,[]);
  }
  const command=processTool(tool('read-via-shell',{name:'command',input:'cat /repo/a.ts'}));
  assert.equal(command.kind,'command');
});
const member=(id,path,repositoryId='repo',available=true)=>({id,path,repositoryId,available});
test('相对路径依据对话目录解析，选择真实嵌套代码库和明确checkout',()=>{
  const catalog={worktrees:[member('default','/repo'),member('task','/repo/.worktrees/task'),member('nested','/repo/.worktrees/task/modules/service','service')]};
  assert.deepEqual(conversationFileTarget('/repo/.worktrees/task','src/a.ts',catalog),{repositoryId:'repo',checkoutId:'task',path:'src/a.ts'});
  assert.deepEqual(conversationFileTarget('/repo/.worktrees/task','modules/service/src/a.ts',catalog),{repositoryId:'service',checkoutId:'nested',path:'src/a.ts'});
});
test('失效、歧义、越界与同前缀目录不退回其他工作树',()=>{
  assert.equal(conversationFileTarget('/repo-task','a.ts',{worktrees:[member('main','/repo')]}),null);
  assert.equal(conversationFileTarget('/repo/.worktrees/gone','a.ts',{worktrees:[member('gone','/repo/.worktrees/gone','repo',false),member('main','/repo')]}),null);
  assert.equal(conversationFileTarget('/gone','a.ts',{worktrees:[member('old','/gone','repo',false),member('main','/other')]}),null);
  assert.equal(conversationFileTarget('/repo','a.ts',{worktrees:[member('one','/repo'),member('two','/repo')]}),null);
  assert.equal(conversationFileTarget('/repo','../../outside.ts',{worktrees:[member('main','/repo')]}),null);
  assert.equal(conversationFileTarget('/repo','https://example.test/a.ts',{worktrees:[member('main','/repo')]}),null);
});

test('搜索作用目录不是文件链接，摘要保留搜索表达式',()=>{
  const search=processTool(tool('s',{name:'grep',input:JSON.stringify({pattern:'ConversationProcessBlock',path:'src/features'}),text:'找到2处匹配'}));
  assert.deepEqual(search.paths,[]);assert.equal(search.description,'ConversationProcessBlock');
});

test('Windows盘符和UNC绝对路径不被错误拼到对话目录下',()=>{
  const catalog={worktrees:[member('drive','C:/repo'),member('network','//server/share/repo')]};
  assert.deepEqual(conversationFileTarget('C:/repo',String.raw`C:\repo\src\a.ts`,catalog),{repositoryId:'repo',checkoutId:'drive',path:'src/a.ts'});
  assert.deepEqual(conversationFileTarget('C:/repo',String.raw`\\server\share\repo\src\a.ts`,catalog),{repositoryId:'repo',checkoutId:'network',path:'src/a.ts'});
});

test('JSON输出不能冒充原始文件输入，依赖执行器展开的路径不猜目标',()=>{
  for(const text of ['{"file_path":"/repo/other.ts"}','read\n{"file_path":"/repo/other.ts"}'])assert.deepEqual(processTool(tool('o',{name:'read',text})).paths,[]);
  const catalog={worktrees:[member('root','/repo')]};
  assert.equal(conversationFileTarget('/repo','symlink/../other.ts',catalog),null);
  assert.equal(conversationFileTarget('/repo','~/other.ts',catalog),null);
});

test('prepending earlier steps preserves expansion of the overlapping process',()=>{
 const current=[{...tool('current'),sequence:10},{...message('answer','完成'),sequence:11}];
 const added=[{...message('question','开始','r1','user'),sequence:1},{...tool('earlier'),sequence:2}];
 const key=processBlockKey([current[0]]),next=carryExpandedProcessBlocks(current,added,{[key]:true});assert.equal(next[processBlockKey([added[1],current[0]])],true);assert.deepEqual(carryExpandedProcessBlocks(current,added,{}),{});
});

test('加载更早记录保留用户对过程的显式折叠选择',()=>{
 const current=[{...tool('current'),sequence:10}],added=[{...tool('earlier'),sequence:2}];
 const key=processBlockKey([current[0]]),next=carryExpandedProcessBlocks(current,added,{[key]:false});
 assert.equal(next[processBlockKey([added[0],current[0]])],false);
});

test('继续后的历史轮次不会因残留running条目重新显示正在处理，也不伪造成成功',()=>{
  const old=tool('old',{runId:'old-run',status:'running'}),current=tool('current',{runId:'new-run',status:'running'});
  const blocks=groupConversationStream([old,message('continue','继续','new-run','user'),current],{id:'new-run',status:'running'}).filter(item=>item.type==='process-block');
  assert.equal(blocks[0].active,false);assert.equal(processEntryStatus(old,blocks[0].active),'unknown');
  assert.equal(blocks[1].active,true);assert.equal(processEntryStatus(current,blocks[1].active),'running');
  assert.equal(processEntryStatus(tool('failed',{status:'failed'}),false),'failed');
  assert.equal(processEntryStatus(tool('done'),false),'completed');
});

test('同一执行被补充分段后只保留整轮最后一份答复，授权提示不制造新轮次',()=>{
 const entries=[message('u','开始','r1','user'),message('n1','先检查'),tool('t1'),message('extra','补充图文','r1','user'),{...message('approval','允许','r1','user'),kind:'notice'},message('n2','继续检查'),tool('t2'),message('final','完成')];
 const items=groupConversationStream(entries,{id:'r1',status:'completed'});
 assert.deepEqual(items.filter(item=>item.type==='entry'&&item.entry.role==='assistant').map(item=>item.entry.id),['final']);
 const turns=conversationStreamTurns(items);assert.equal(turns.length,2);assert.equal(turns[1].prompt.id,'extra');
 assert.equal(turns[0].items[0].entries[0].id,'n1');assert.equal(turns[1].items.at(-1).entry.id,'final');
 assert.deepEqual(groupConversationStream(entries,{id:'r1',status:'running'}).filter(item=>item.type==='entry'&&item.entry.role==='assistant'),[]);
});

test('来源引用行号不混入文件名，准确工作树定位保持安全边界',async()=>{
  const {conversationFileReference}=await import('../src/features/agent-conversations/conversation-process.ts');
  for(const [reference,path,line] of [['projects/a.ts:155','projects/a.ts',155],['/repo/a.ts#L15-L20','/repo/a.ts',15],['C:/repo/a.ts:8:2','C:/repo/a.ts',8],['src/a%20b.ts#L3','src/a b.ts',3]])assert.deepEqual(conversationFileReference(reference),{path,line});
  for(const reference of ['//foreign/path','src/a.ts?download=1','src/a.ts#bad','%00bad','src/a.ts#L999999999999999999999'])assert.equal(conversationFileReference(reference),null);
  const catalog={worktrees:[{id:'actual',repositoryId:'repo',path:'/repo',available:true}]};
  assert.deepEqual(conversationFileTarget('/repo',conversationFileReference('src/a.ts:12').path,catalog),{repositoryId:'repo',checkoutId:'actual',path:'src/a.ts'});
  assert.equal(conversationFileTarget('/repo',conversationFileReference('%2e%2e/other/a.ts:12').path,catalog),null);
});


test('补回旧执行的记录按准确轮次归属，原轮不在当前页时单独保留',()=>{
 const oldPrompt=message('old-u','旧要求','old','user'),newPrompt=message('new-u','新要求','new','user'),late=tool('image',{runId:'old'});
 const turns=conversationStreamTurns(groupConversationStream([oldPrompt,message('old-a','完成','old'),newPrompt,late]));
 assert.equal(turns.length,2);assert.equal(turns[0].items.at(-1).entries[0].id,'image');assert.deepEqual(turns[1].items,[]);
 const page=conversationStreamTurns(groupConversationStream([newPrompt,late]));
 assert.equal(page[0].key,'history:old');assert.equal(page[1].prompt.id,'new-u');assert.deepEqual(page[1].items,[]);
});

test('重试通知在首条原生回应前即绑定当前执行与计时，旧图片不能干扰',()=>{
 const prompt=message('u','原要求','failed','user'),retry={...message('retry','已请求重试上次未送达的要求。','retry','system'),kind:'notice'};
 const turns=conversationStreamTurns(groupConversationStream([prompt,tool('old-image',{runId:'old'}),retry]));
 const run={id:'retry',status:'running',accepted:true,startedAt:'2026-10-29T01:31:08Z'};
 assert.deepEqual(conversationTurnExecution(turns.at(-1),run),{current:true,active:true,waiting:'已送达，等待智能体回应…'});
 assert.equal(conversationTurnExecution(turns[0],run).current,false);
 const preparing={...run,status:'starting',accepted:false};assert.equal(conversationTurnExecution(turns.at(-1),preparing).waiting,'正在准备连接并确认指令送达…');
 const responded=conversationStreamTurns(groupConversationStream([prompt,retry,tool('current',{runId:'retry'})],run));
 assert.deepEqual(conversationTurnExecution(responded.at(-1),run),{current:true,active:true});
 assert.equal(conversationTurnExecution(responded.at(-1),{...run,status:'completed'}).active,false);
});
