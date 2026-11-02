import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier,context,next){
  if(specifier==='react'&&context.parentURL?.endsWith('/useEarlierConversationEntries.ts'))return {url:'data:text/javascript,'+encodeURIComponent('export const useEffect=()=>{};export const useLayoutEffect=()=>{};export const useRef=current=>({current});export const useState=current=>[current,()=>{}];'),shortCircuit:true};
  return next(specifier,context);
}});
const {useEarlierConversationEntries}=await import('../src/features/agent-conversations/useEarlierConversationEntries.ts');

function fixture(){
  let top=3500;
  const node={get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));},scrollHeight:4000,clientHeight:500,getClientRects:()=>[{}]};
  const bottom={current:true},position={current:3500};
  const hook=useEarlierConversationEntries({conversation:null,selectionKey:'test',stream:{current:node},bottom,position,loadPage:async()=>{throw Error('unexpected history load');},prepend(){}});
  hook.remember();return {node,bottom,position,hook};
}
for(const callback of ['onScroll','followLayout'])test(callback+' respects a reading move in the same frame as layout growth',()=>{
  const {node,bottom,position,hook}=fixture();
  node.scrollHeight=4200;node.scrollTop=1200;hook[callback]();
  assert.equal(node.scrollTop,1200);assert.equal(position.current,1200);assert.equal(bottom.current,false);
  hook.followLayout();assert.equal(node.scrollTop,1200);
});
test('layout growth still follows latest; shrinking viewport clamps are not reader intent',()=>{
  const {node,bottom,hook}=fixture();
  node.scrollHeight=4200;hook.followLayout();assert.equal(node.scrollTop,3700);
  node.scrollHeight=4000;node.scrollTop=3500;
  hook.onScroll();assert.equal(bottom.current,true);
  hook.followLayout();assert.equal(node.scrollTop,3500);
});

function initialViewport(t,{heightAfterPage=()=>500,page=before=>({entries:[{id:'older-'+before}],nextEntryCursor:before-1})}={}){
  const frames=new Map();let frameId=0,reads=0,top=0;
  const original=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  t.after(()=>{if(original)globalThis.requestAnimationFrame=original;else delete globalThis.requestAnimationFrame;if(cancel)globalThis.cancelAnimationFrame=cancel;else delete globalThis.cancelAnimationFrame;});
  const node={get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));},scrollHeight:500,clientHeight:500,getClientRects:()=>[{}],getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>[]};
  const bottom={current:true},position={current:0};
  const props={conversation:{id:'chat',entries:[{id:'latest'}],nextEntryCursor:10},selectionKey:'chat',stream:{current:node},bottom,position,
    async loadPage(chat,before,signal){reads++;return page(before,signal);},
    prepend(value){props.conversation={...props.conversation,entries:[...value.entries,...props.conversation.entries],nextEntryCursor:value.nextEntryCursor};node.scrollHeight=heightAfterPage(reads);hook.followLayout();},
  };
  const hook=useEarlierConversationEntries(props);
  const flush=async()=>{for(let i=0;i<40;i++){const pending=[...frames.values()];frames.clear();if(!pending.length)break;for(const fn of pending)fn(0);await Promise.resolve();await Promise.resolve();}};
  hook.remember();return {node,bottom,position,props,hook,flush,reads:()=>reads};
}
test('首屏不足时逐页补齐并保持最新，填满后停止且布局重复通知不重入',async t=>{
  const f=initialViewport(t,{heightAfterPage:n=>n<3?500:900});
  for(let i=0;i<8;i++)f.hook.followLayout();
  await f.flush();assert.equal(f.reads(),3);assert.equal(f.bottom.current,true);assert.equal(f.node.scrollTop,400);
  f.hook.followLayout();await f.flush();assert.equal(f.reads(),3);
});
test('首屏填充有预算，折叠内容不增加高度时不耗尽全部历史',async t=>{
  const f=initialViewport(t);f.hook.followLayout();await f.flush();assert.ok(f.reads()>0&&f.reads()<=4);assert.ok(f.props.conversation.nextEntryCursor>0);
  f.hook.followLayout();await f.flush();assert.ok(f.reads()<=4);
});
test('首屏已足够或用户接管后不自动读取',async t=>{
  const f=initialViewport(t);f.node.scrollHeight=900;f.hook.followLayout();await f.flush();assert.equal(f.reads(),0);
  f.node.scrollHeight=500;f.hook.followLayout();await f.flush();assert.equal(f.reads(),0);
});
test('用户接管会取消待执行的首屏测量',async t=>{
  const f=initialViewport(t);f.hook.followLayout();f.hook.onPointerDown();await f.flush();assert.equal(f.reads(),0);
});
for(const mode of ['empty','cursor','failure'])test('首屏补页遇到'+mode+'停止，后续布局不循环请求',async t=>{
  const f=initialViewport(t,{page:before=>{if(mode==='failure')throw Error('page unavailable');return {entries:mode==='empty'?[]:[{id:'older'}],nextEntryCursor:mode==='cursor'?before:before-1};}});
  f.hook.followLayout();await f.flush();assert.equal(f.reads(),1);f.hook.followLayout();await f.flush();assert.equal(f.reads(),1);
});

test('不足一屏保持顶部，流式输出溢出后跟随最新',()=>{
 const {node,bottom,position,hook}=fixture();
 node.scrollHeight=180;node.clientHeight=600;node.scrollTop=0;hook.remember();
 hook.followLayout();assert.equal(node.scrollTop,0);assert.equal(position.current,0);assert.equal(bottom.current,true);
 node.scrollHeight=450;hook.followLayout();assert.equal(node.scrollTop,0);
 node.scrollHeight=900;hook.followLayout();assert.equal(node.scrollTop,300);assert.equal(bottom.current,true);
 node.scrollHeight=450;hook.followLayout();assert.equal(node.scrollTop,0);
});
