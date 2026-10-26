import test from 'node:test';
import assert from 'node:assert/strict';
import {groupConversationStream,processBlockKey} from '../src/features/agent-conversations/conversation-state.ts';
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
