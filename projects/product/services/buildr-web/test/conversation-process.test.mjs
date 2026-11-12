import test from 'node:test';
import assert from 'node:assert/strict';
import {needsConversationObservation,groupConversationStream,processBlockKey,carryExpandedProcessBlocks,processEntryStatus,conversationStreamTurns,conversationTurnExecution,conversationRunLive} from '../src/features/agent-conversations/conversation-state.ts';
import {processTool,conversationFileTarget} from '../src/features/agent-conversations/conversation-process.ts';
import {visibleConversationEntries} from '../src/features/agent-conversations/conversation-notices.ts';
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

test('后台可继续输入、保留旧执行和终态与执行事实冲突时，阶段说明不提升为最终答复',()=>{
  const entries=[tool('t'),message('stage','已开始修复，稍后继续')];
  const pending={id:'r1',status:'tools-active',canContinue:true,tools:[{id:'child',status:'running'}],executionState:'active'};
  for(const run of [pending,{...pending,status:'completed'}]){
    const grouped=groupConversationStream(entries,run);
    assert.equal(grouped.length,1);assert.equal(grouped[0].type,'process-block');assert.equal(grouped[0].active,true);
  }
  // 终态与执行事实冲突时按已结束呈现，阶段说明仍不当最终答复。
  const conflicting=groupConversationStream(entries,{...pending,status:'completed',tools:[],executionState:'unknown'});
  assert.equal(conflicting.length,1);assert.equal(conflicting[0].active,false);assert.equal(conflicting[0].entries.length,2);
  assert.equal(groupConversationStream(entries,{id:'new',status:'running'},[pending]).filter(item=>item.type==='entry').length,0);
  const turn=conversationStreamTurns(groupConversationStream(entries,pending))[0];
  assert.deepEqual(conversationTurnExecution(turn,pending),{current:true,active:true,waiting:'模型已结束，后台作业仍在运行'});
  assert.equal(conversationTurnExecution(turn,{...pending,resourcesReleased:true}).active,false);
  const ended=groupConversationStream(entries,{...pending,status:'completed',executionState:'ended',tools:[]});
  assert.equal(ended.at(-1).entry.id,'stage');
});
test('已释放的结果待核对轮次收起过程，仍在执行的过程保持实时',()=>{
  const entries=[tool('t'),message('stage','已开始修复，稍后继续')];
  const released={id:'r1',status:'unknown',executionState:'unknown',resourcesReleased:true,tools:[]};
  assert.equal(conversationRunLive(released),false);
  const [block]=groupConversationStream(entries,released);
  assert.equal(block.type,'process-block');assert.equal(block.active,false,'释放后不再按实时呈现');
  assert.equal(block.entries.length,2,'阶段说明不能被提升为最终答复');
  assert.equal(processEntryStatus(entries[0],block.active),'completed');
  const running={...released,status:'running',executionState:'active',resourcesReleased:false};
  assert.equal(conversationRunLive(running),true);
  assert.equal(groupConversationStream(entries,running)[0].active,true);
});
test('完成轮里的失败工具不把整轮留在实时态',()=>{
  const entries=[tool('a'),tool('b',{status:'failed'})];
  const run={id:'r1',status:'completed',executionState:'ended',resourcesReleased:true,tools:[{id:'a',status:'completed'},{id:'b',status:'failed'}]};
  assert.equal(conversationRunLive(run),false);
  assert.equal(groupConversationStream(entries,run)[0].active,false);
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
 const turns=conversationStreamTurns(items);assert.equal(turns.length,1);assert.equal(turns[0].prompt.id,'u');
 assert.equal(turns[0].items[1].entry.id,'extra');
 assert.equal(turns[0].items[0].entries[0].id,'n1');assert.equal(turns[0].items.at(-1).entry.id,'final');
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

test('重试后的答复与迟到的旧任务结论各归其轮，新输入保持最后一轮',()=>{
 const prompt=message('u','新问题','failed','user'),retry={...message('retry','重试','retry','system'),kind:'notice'};
 const answer=message('answer','新问题的答复','retry'),late=message('late','旧任务已经完成','old');
 const turns=conversationStreamTurns(groupConversationStream([prompt,retry,answer,late,message('next','同意执行','next','user')]));
 assert.equal(turns.at(-1).prompt.id,'next');
 const retryTurn=turns.find(turn=>turn.key==='run:retry');
 assert.ok(retryTurn.items.some(item=>item.type==='entry'&&item.entry.id==='answer'));
 assert.ok(!retryTurn.items.some(item=>item.type==='entry'&&item.entry.id==='late'));
 assert.ok(turns.find(turn=>turn.key==='history:old').items.some(item=>item.type==='entry'&&item.entry.id==='late'));
});

test('交错到达的执行先归属再合组，同轮用户补充保持分段',()=>{
 const entries=[message('old-u','旧要求','old','user'),tool('old-one',{runId:'old'}),message('new-u','新要求','new','user'),tool('new-one',{runId:'new'}),tool('old-two',{runId:'old'}),tool('new-two',{runId:'new'}),message('extra','补充','new','user'),tool('old-three',{runId:'old'}),tool('after-extra',{runId:'new'}),message('answer','完成','new')];
 const grouped=groupConversationStream(entries,{id:'new',status:'completed'});
 const original=structuredClone(grouped);
 const turns=conversationStreamTurns(grouped);
 assert.deepEqual(turns.map(turn=>turn.prompt?.id),['old-u','new-u']);
 assert.deepEqual(turns[0].items.map(item=>item.entries.map(entry=>entry.id)),[['old-one','old-two','old-three']]);
 assert.deepEqual(turns[1].items.map(item=>item.type==='process-block'?item.entries.map(entry=>entry.id):item.entry.id),[['new-one','new-two'],'extra',['after-extra'],'answer']);
 assert.deepEqual(grouped,original,'归属合组不修改原始分段或持久顺序');
});

test('交错分组合并与加载更早记录共同保留过程展开选择',()=>{
 const current=[message('a-u','旧要求','a','user'),tool('a-one',{runId:'a',sequence:3}),message('b-u','新要求','b','user'),tool('b-one',{runId:'b'}),tool('a-two',{runId:'a',sequence:7})].map((entry,index)=>({...entry,sequence:index+3}));
 const key=processBlockKey([current[1]]),added=[tool('a-earlier',{runId:'a',sequence:1})];
 for(const expanded of [true,false]){
  const carried=carryExpandedProcessBlocks(current,added,{[key]:expanded});
  // The earlier page can start a separate history segment; the existing merged
  // segment retains its exact explicit choice and all stable tool identities.
  assert.equal(carried[key],expanded);
  const turns=conversationStreamTurns(groupConversationStream(current));
  assert.deepEqual(turns[0].items[0].entries.map(entry=>entry.id),['a-one','a-two']);
 }
});

test('新执行的接续回执不会切断仍属于原执行的工具组',()=>{
 const handoff={...message('handoff','接续','new','system'),kind:'handoff'};
 const entries=[message('old-u','旧要求','old','user'),tool('old-one',{runId:'old'}),handoff,message('new-u','新要求','new','user'),tool('new-one',{runId:'new'}),tool('old-two',{runId:'old'})];
 const turns=conversationStreamTurns(groupConversationStream(entries));
 assert.deepEqual(turns[0].items.filter(item=>item.type==='process-block').map(item=>item.entries.map(entry=>entry.id)),[['old-one','old-two']]);
 assert.equal(turns.flatMap(turn=>turn.items).filter(item=>item.type==='entry'&&item.entry.id==='handoff').length,1);
});

test('带原生父工具来源的子报告不被提升为整轮最终答复',()=>{
 const main=message('main','主助手结果'),child={...message('child','子任务报告'),parentToolId:'agent-tool'};
 const entries=groupConversationStream([tool('agent-tool'),main,child],{id:'r1',status:'completed'});
 assert.deepEqual(entries.filter(item=>item.type==='entry'&&item.entry.role==='assistant').map(item=>item.entry.id),['main']);
});

test('可见主线分页后保留展开选择，隐藏子报告不能改变过程身份',()=>{
 const child={...message('hidden-first','内部报告'),parentToolId:'parent-agent',sequence:8};
 const current=[child,{...tool('visible-tool'),sequence:9},{...message('answer','完成'),sequence:10}];
 const added=[{...tool('earlier-tool'),sequence:1}],key=processBlockKey([current[1]]);
 for(const open of [true,false]){
  const carried=carryExpandedProcessBlocks(visibleConversationEntries(current),visibleConversationEntries(added),{[key]:open});
  assert.equal(carried[processBlockKey([added[0],current[1]])],open);
 }
});

test('多次同轮补充保持首条输入与稳定轮次，缺少身份或独立执行不合并',()=>{
 const prompt=message('u','开始','one','user'),extra=message('extra','补充','one','user');
 const initial=conversationStreamTurns(groupConversationStream([prompt,tool('t',{runId:'one'})]));
 const turns=conversationStreamTurns(groupConversationStream([prompt,tool('t',{runId:'one'}),extra,message('again','再次补充','one','user'),message('new','另一个执行','two','user'),message('late-extra','旧执行补充','one','user')]));
 assert.equal(turns[0].key,initial[0].key);assert.equal(turns[0].prompt.id,'u');assert.equal(turns.length,2);
 assert.deepEqual(turns[0].items.filter(item=>item.type==='entry').map(item=>item.entry.id),['extra','again','late-extra']);
 const legacy=conversationStreamTurns(groupConversationStream([message('legacy1','第一轮',undefined,'user'),message('legacy2','第二轮',undefined,'user')].map(entry=>({...entry,runId:undefined}))));
 assert.equal(legacy.length,2);
});

test('首条输入前的交接回执不能冒充原用户输入',()=>{
 const receipt={...message('receipt','接续','new','system'),kind:'handoff'};
 const turns=conversationStreamTurns(groupConversationStream([receipt,message('first','新要求','new','user'),message('extra','补充','new','user')]));
 assert.equal(turns.at(-1).prompt.id,'first');assert.equal(turns.at(-1).items[0].entry.id,'extra');
});


test('工具等待原生详情就绪时保持现有订阅，切换后按执行状态结束观察',()=>{
 const conversation={entries:[{detail:{revision:'r',live:true}}],requests:[],run:{status:'completed',tools:[]}};
 assert.equal(needsConversationObservation(conversation),true);
 conversation.entries[0].detail={revision:'r'};
 assert.equal(needsConversationObservation(conversation),false);
});
test('上游拆分的多段助手消息合并为一条正式答复，思考留在过程',()=>{
 const thinking=id=>({...message(id,'思考'),kind:'thinking',thinking:true});
 const entries=[message('u','问','r1','user'),thinking('th1'),message('a','不高'),thinking('th2'),message('b','，而且是一次性对账。')];
 const items=groupConversationStream(entries,{id:'r1',status:'completed',executionState:'ended',tools:[]});
 assert.deepEqual(items.map(item=>item.type),['entry','process-block','entry']);
 assert.equal(items[2].entry.text,'不高，而且是一次性对账。');
 assert.equal(items[2].entry.id,'b');
 assert.deepEqual(items[1].entries.map(entry=>entry.id),['th1','th2']);
});
test('工具之后的单段答复仍独立成正式答复，进度说明留在过程',()=>{
 const entries=[message('u','问','r1','user'),message('n','正在核对。'),tool('t'),message('a','收尾完成。')];
 const items=groupConversationStream(entries,{id:'r1',status:'completed',executionState:'ended',tools:[]});
 assert.deepEqual(items.map(item=>item.type),['entry','process-block','entry']);
 assert.deepEqual(items[1].entries.map(entry=>entry.id),['n','t']);
 assert.equal(items[2].entry.text,'收尾完成。');
});
test('过程区里被思考拆开的进度说明也合并为连贯一条，不出现脱落的开头',()=>{
 const thinking=id=>({...message(id,'思考'),kind:'thinking',thinking:true});
 const entries=[message('a','不高'),thinking('th'),message('b','，而且是一次性对账。'),tool('t')];
 const items=groupConversationStream(entries,{id:'r1',status:'running'});
 assert.equal(items.length,1);assert.equal(items[0].type,'process-block');
 assert.equal(items[0].entries[0].text,'不高，而且是一次性对账。');
 assert.deepEqual(items[0].entries.map(entry=>entry.id),['a','th','t']);
});
test('无思考间隔的相邻助手段也合并为一条正式答复',()=>{
 const entries=[message('u','问','r1','user'),message('a','不高'),message('b','，而且是一次性对账。')];
 const items=groupConversationStream(entries,{id:'r1',status:'completed',executionState:'ended',tools:[]});
 assert.deepEqual(items.map(item=>item.type),['entry','entry']);
 assert.equal(items[1].entry.text,'不高，而且是一次性对账。');
});
test('无思考间隔的相邻进度说明在过程区合并，工具仍独立',()=>{
 const entries=[message('a','不高'),message('b','，而且是一次性对账。'),tool('t')];
 const items=groupConversationStream(entries,{id:'r1',status:'running'});
 assert.equal(items.length,1);assert.equal(items[0].type,'process-block');
 assert.equal(items[0].entries[0].text,'不高，而且是一次性对账。');
 assert.deepEqual(items[0].entries.map(entry=>entry.id),['a','t']);
});
