import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({
  resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/ConversationProcessBlock.tsx')){
      if(specifier.endsWith('/MarkdownHost'))return {url:'data:text/javascript,export const MarkdownHost=()=>null;',shortCircuit:true};
      if(specifier.startsWith('./'))return next(new URL(specifier+'.ts',context.parentURL).href,context);
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('/ConversationProcessBlock.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    return next(url,context);
  },
});
const {ConversationProcessBlock}=await import('../src/features/agent-conversations/ConversationProcessBlock.tsx');
const entry={id:'tool',sequence:1,kind:'tool',role:'system',name:'command',text:'echo check',status:'running',createdAt:'2026-10-27T00:00:00Z'};
const tool=(id,name='command')=>({id,sequence:0,kind:'tool',role:'system',name,text:'echo '+id,status:'completed',createdAt:'2026-10-27T00:00:00Z'});
const narration=(id)=>({id,sequence:0,kind:'message',role:'assistant',text:'说明 '+id,createdAt:'2026-10-27T00:00:00Z'});
const render=active=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries:[entry],active,open:true,onToggle(){},onOpenFile(){}}));
const renderEntries=(entries,{active=false,liveToolId,open=true,groupsOpen={},toolsOpen={}}={})=>renderToStaticMarkup(React.createElement(ConversationProcessBlock,{blockKey:'block',entries,active,liveToolId,open,groupsOpen,toolsOpen,onToggle(){},onOpenFile(){}}));
test('折叠工具组也保留失败和未知，运行时不重复状态文案',()=>{
 const settled=render(false);assert.match(settled,/查看处理过程/);assert.match(settled,/1 项结果待核对/);assert.doesNotMatch(settled,/正在处理|执行中|is-running/);
 const live=render(true);assert.match(live,/data-process-state="live"/);assert.match(live,/ac-step-group/);assert.doesNotMatch(live,/正在处理|执行中|查看处理过程|ac-tool-detail/);
});
test('连续工具默认成组折叠，助手说明按原位置独立展示',()=>{
 const html=renderEntries([narration('n1'),tool('t1'),tool('t2'),{...tool('t3'),status:'failed'},narration('n2'),tool('t4','read')]);
 assert.equal((html.match(/class="ac-step-group(?: is-failed)?"/g)||[]).length,2);assert.match(html,/3 次工具调用/);
 assert.equal((html.match(/ac-process-narration/g)||[]).length,2);assert.match(html,/1 项失败/);assert.doesNotMatch(html,/ac-step ac-step-tool|ac-tool-detail/);
});
test('按已有成员接续展开选择，明细保持顺序且提供底部收起',()=>{
 const html=renderEntries([tool('prepended'),tool('t1'),tool('t2')],{groupsOpen:{'tool-group:t1':true}});
 assert.match(html,/class="ac-step-group" open/);assert.equal((html.match(/ac-step ac-step-tool/g)||[]).length,3);
 assert.ok(html.indexOf('data-entry-id="prepended"')<html.indexOf('data-entry-id="t1"'));assert.match(html,/收起工具调用/);assert.match(html,/收起处理过程/);
});
test('未展开的历史过程不挂载正文，执行中的说明与工具汇总可见',()=>{
 const entries=[narration('large'),tool('t1')];const closed=renderEntries(entries,{open:false});
 assert.doesNotMatch(closed,/ac-process-narration|ac-step ac-step-tool|ac-tool-detail/);assert.match(closed,/查看处理过程/);
 const live=renderEntries(entries,{active:true,open:false});assert.match(live,/ac-process-narration/);assert.match(live,/ac-step-group/);assert.doesNotMatch(live,/ac-tool-detail|ac-step-group-items/);
});

test('执行中光点排在工具图标之前，结束后恢复统计',()=>{const live=render(true);assert.ok(live.indexOf('ac-execution-light')<live.indexOf('ac-step-node'));assert.doesNotMatch(live,/次工具调用/);assert.match(render(false),/次工具调用/);});
test('实时摘要携带当前工具自身状态，不使用组内历史失败作为当前状态',()=>{
 const failed={...tool('failed'),status:'failed'};
 for(const status of ['running','completed','unknown','failed']){
  const html=renderEntries([failed,{...tool('current','Agent'),status}],{active:true,groupsOpen:{'tool-group:failed':true}});
  assert.match(html,/ac-step-group is-failed is-live/);
  assert.match(html,new RegExp('data-current-tool-status="'+status+'"'));
  assert.match(html,/data-entry-id="failed"/);assert.match(html,/失败/);
 }
 const historical=renderEntries([failed,tool('current')]);
 assert.doesNotMatch(historical,/data-current-tool-status=/);assert.match(historical,/1 项失败/);
});

test('工具图标按真实类型区分，不用统一占位图标',()=>{
 for(const [name,icon] of [['search','search'],['web_fetch','global'],['ls','folder-open'],['view-image','picture'],['unknown','tool']]){
  const html=renderEntries([{...tool('typed',name),status:'running'}],{active:true});assert.match(html,new RegExp('data-icon="'+icon+'"'),name);
 }
 assert.match(render(true),/ac-command-symbol/);
});
test('写入与编辑共用纸张加笔的图形，读取保持文字线且原动作名称仍有区别',()=>{
 const icons={};
 for(const kind of ['read','write','edit']){
  for(const active of [false,true]){
   const html=renderEntries([tool('file',kind)],{active});
   assert.match(html,new RegExp('data-file-operation="'+kind+'"'));
   assert.match(html,/<svg class="ac-file-symbol"/);assert.doesNotMatch(html,/data-icon="file-add"/);
   const shape=['outline','fold','mark'].map(part=>html.match(new RegExp('class="ac-file-'+part+'" d="([^"]+)"'))[1]);
   if(active)assert.deepEqual(shape,icons[kind]);else icons[kind]=shape;
  }
 }
 assert.deepEqual(icons.write,icons.edit);assert.notDeepEqual(icons.read,icons.write);
 const mixed=renderEntries([tool('written','write'),tool('edited','edit')]);
 assert.match(mixed,/写入文件 · 编辑文件/);assert.match(mixed,/2 次工具调用/);
});
test('命令图形使用框与矢量笔画，不再受文本基线影响',()=>{
 for(const html of [render(true),render(false)]){
  assert.match(html,/<svg class="ac-command-symbol" viewBox="0 0 15 13" aria-hidden="true">/);
  assert.match(html,/<rect /);assert.match(html,/<g class="ac-command-glyph"><path /);
  assert.doesNotMatch(html,/>›_</);
 }
});
test('同类别名沿用类别图形，混合类别仍用通用图形且保留失败未知提醒',()=>{
 const edits=renderEntries([tool('one','apply_patch'),tool('two','MultiEdit')]);
 assert.match(edits,/data-file-operation="edit"/);assert.match(edits,/编辑文件 ×2/);
 const mixed=renderEntries([{...tool('image','view-image'),status:'failed'},{...tool('external','mcp-tool'),status:'unknown'}]);
 assert.match(mixed,/data-icon="tool"/);assert.match(mixed,/1 项失败/);assert.match(mixed,/1 项结果待核对/);
});

test('执行中已完成的单条折叠工具只显示统计和动作，当前工具仍显示内容',()=>{
 const html=renderEntries([tool('completed-command'),narration('between'),{...tool('current-command'),status:'running'}],{active:true});
 const summaries=[...html.matchAll(/<summary data-entry-group=.*?<\/summary>/g)].map(match=>match[0]);
 assert.equal(summaries.length,2);
 assert.match(summaries[0],/1 次工具调用/);assert.match(summaries[0],/title="运行命令"/);
 assert.doesNotMatch(summaries[0],/echo completed-command|ac-execution-light/);
 assert.match(summaries[1],/echo current-command/);assert.match(summaries[1],/ac-execution-light/);
});

test('单条与多条折叠统计均不带命令、路径、搜索词或输出',()=>{
 const examples=[
  {...tool('command'),input:'{"cmd":"echo command-detail"}',text:'command-output'},
  {...tool('read','read'),input:'{"file_path":"/workspace/private-file.ts"}'},
  {...tool('search','search'),input:'{"query":"private-query"}'},
  {...tool('fetch','web_fetch'),input:'{"url":"https://example.test/private-url"}'},
  {...tool('custom','custom_tool'),text:'private-result'},
 ];
 for(const entries of [...examples.map(entry=>[entry]),examples]){
  const html=renderEntries(entries);
  assert.match(html,new RegExp(entries.length+' 次工具调用'));
  assert.doesNotMatch(html,/command-detail|command-output|private-file|private-query|private-url|private-result/);
 }
 const mixed=renderEntries([tool('one'),tool('two'),tool('read','read')]);
 assert.match(mixed,/运行命令 ×2 · 读取文件/);
});

test('单条折叠统计继续提示失败和未知，展开仍能查看完整命令输出',()=>{
 const completed={...tool('completed'),input:'{"cmd":"echo full-command"}',text:'full-output'};
 for(const [status,expected] of [['failed',/1 项失败/],['unknown',/1 项结果待核对/]]){
  const html=renderEntries([{...completed,status},narration('between'),entry],{active:true});
  assert.match(html,expected);assert.doesNotMatch(html,/full-command|full-output/);
 }
 const html=renderEntries([completed],{groupsOpen:{'tool-group:completed':true},toolsOpen:{'tool:completed':true}});
 const summary=html.match(/<summary data-entry-group=.*?<\/summary>/)?.[0];
 assert.match(summary,/1 次工具调用/);assert.doesNotMatch(summary,/full-command|full-output/);
 assert.match(html,/ac-tool-command">echo full-command/);assert.match(html,/<pre>full-output<\/pre>/);
});

test('旧分组残留running或同轮补充分段不会产生多个实时指示',()=>{
 const old={...tool('old'),status:'running'},current={...tool('current'),status:'running'};
 const html=renderEntries([old,narration('between'),current],{active:true,groupsOpen:{'tool-group:old':true}});
 assert.equal((html.match(/ac-execution-light/g)||[]).length,1);
 const summaries=[...html.matchAll(/<summary data-entry-group=.*?<\/summary>/g)].map(match=>match[0]);
 assert.match(summaries[0],/1 次工具调用/);assert.doesNotMatch(summaries[0],/ac-execution-light/);
 assert.match(summaries[1],/ac-execution-light/);
 assert.match(html,/ac-step-group" open/,'较早分组仍保留用户明确展开选择');
 const earlierSegment=renderEntries([old],{active:true,liveToolId:'current'});
 assert.doesNotMatch(earlierSegment,/ac-execution-light/);assert.match(earlierSegment,/1 次工具调用/);
 assert.equal((renderEntries([current],{active:true,liveToolId:'current'}).match(/ac-execution-light/g)||[]).length,1);
});
