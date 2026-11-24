import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier,context,next){
    const sourceSpecifier=specifier.replace(/\.(?:tsx?|jsx?)$/,'').replace(/\/index$/,'');
  if(specifier==='react'&&context.parentURL?.endsWith('/useEarlierConversationEntries.ts'))return {url:'data:text/javascript,'+encodeURIComponent('export const useEffect=()=>{};export const useLayoutEffect=()=>{};export const useRef=current=>({current});export const useState=current=>[current,()=>{}];'),shortCircuit:true};
  return next(specifier,context);
}});
const {useEarlierConversationEntries}=await import('../../src/features/agent-conversations/useEarlierConversationEntries.ts');

function fixture(){
  let top=3500;
  const node={get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));},scrollHeight:4000,clientHeight:500,getClientRects:()=>[{}]};
  const bottom={current:true},position={current:3500};
  const hook=useEarlierConversationEntries({conversation:null,selectionKey:'test',stream:{current:node},bottom,position,loadPage:async()=>{throw Error('unexpected history load');},prepend(){}});
  hook.remember();return {node,bottom,position,hook};
}
for(const callback of ['onScroll','followLayout'])test(callback+' respects a reading move in the same frame as layout growth',()=>{
  const {node,bottom,position,hook}=fixture();
  hook.onPointerDown();node.scrollHeight=4200;node.scrollTop=1200;hook[callback]();
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
test('布局回调短暂清掉贴底状态时仍补齐首屏，直到内容真正超出一屏',async t=>{
  const f=initialViewport(t,{heightAfterPage:n=>n<3?500:900});
  const prepend=f.props.prepend;
  f.props.prepend=value=>{
    prepend(value);
    if(f.reads()===1)f.bottom.current=false;
  };
  f.hook.followLayout();await f.flush();
  assert.equal(f.reads(),3);assert.ok(f.node.scrollHeight>f.node.clientHeight);
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

test('连续异步排版与输入框增高复用同一贴底记录，不误判为用户上翻',()=>{
 const {node,bottom,position,hook}=fixture();
 node.scrollHeight=4200;hook.followLayout();assert.equal(node.scrollTop,3700);
 // The composer reduces the viewport before the previous scroll event arrives.
 node.clientHeight=350;node.scrollHeight=4250;hook.followLayout();hook.onScroll();
 assert.equal(node.scrollTop,3900);assert.equal(position.current,3900);assert.equal(bottom.current,true);
 node.scrollHeight=4278;hook.followLayout();hook.onScroll();
 assert.equal(node.scrollTop,3928);assert.equal(bottom.current,true);
 node.clientHeight=500;node.scrollTop=3778;hook.onScroll();hook.followLayout();
 assert.equal(node.scrollTop,3778);assert.equal(bottom.current,true);
});
test('用户已上翻时输入框增高和异步内容增长不会抢回底部',()=>{
 const {node,bottom,hook}=fixture();node.scrollTop=1600;hook.onScroll();assert.equal(bottom.current,false);
 node.clientHeight=300;node.scrollHeight=4300;hook.followLayout();
 assert.equal(node.scrollTop,1600);assert.equal(bottom.current,false);
});

for(const callback of ['onScroll','followLayout'])test('发送重排期间先钳制再增长不被'+callback+'误判为上翻',()=>{
 const {node,bottom,position,hook}=fixture();
 // Old-turn collapse/Markdown replacement clamps the viewport; content and
 // the cleared composer settle before the queued scroll/resize callback.
 node.scrollHeight=1800;node.scrollTop=1300;
 node.scrollHeight=4600;node.clientHeight=600;hook[callback]();
 assert.equal(bottom.current,true);hook.followLayout();
 assert.equal(node.scrollTop,4000);assert.equal(position.current,4000);
});

const {locateConversationContent}=await import('../../src/features/agent-conversations/conversation-reading.ts');
function createLocateFixture(t,{headerPosition='sticky',headPosition='sticky',withHeader=true,targetInsideHead=false}={}){
 const prevGetComputedStyle=globalThis.getComputedStyle;
 const header=withHeader?{offsetHeight:43,position:headerPosition,contains:()=>false}:null;
 const head={offsetHeight:96,position:headPosition,contains:node=>targetInsideHead&&node===target};
 const turn={querySelector:selector=>selector===':scope > .ac-turn-head'?head:null};
 const stream={
  scrollTop:500,
  scrollCalls:[],
  getBoundingClientRect:()=>({top:100}),
  querySelector:selector=>selector===':scope > .ac-thread-header-in-stream'?header:null,
  scrollTo(options){this.scrollCalls.push(options);this.scrollTop=options.top;},
 };
 const target={
  tabIndex:-1,
  focusedWith:null,
  hasAttribute:()=>false,
  getBoundingClientRect:()=>({top:420}),
  closest:selector=>selector==='.ac-stream'?stream:selector==='.ac-turn'?turn:null,
  focus(options){this.focusedWith=options;},
 };
 globalThis.getComputedStyle=node=>({position:node.position||'static'});
 t.after(()=>{if(prevGetComputedStyle)globalThis.getComputedStyle=prevGetComputedStyle;else delete globalThis.getComputedStyle;});
 return {stream,target};
}
test('独立对话流存在粘性内嵌顶栏时定位轮次额外扣除顶栏高度',t=>{
 const {stream,target}=createLocateFixture(t,{withHeader:true,headerPosition:'sticky',headPosition:'sticky'});
 locateConversationContent(target,false);
 assert.equal(stream.scrollTop,500+420-100-43);
 assert.deepEqual(target.focusedWith,{preventScroll:true});
});
test('独立对话流定位执行中助手内容同时扣除粘性顶栏与轮次头部高度',t=>{
 const {stream,target}=createLocateFixture(t,{withHeader:true,headerPosition:'sticky',headPosition:'sticky'});
 locateConversationContent(target,true);
 assert.equal(stream.scrollTop,500+420-100-43-(96+8));
});
test('目标在轮次头部内时只扣除粘性内嵌顶栏高度，不重复扣除轮次头部',t=>{
 const {stream,target}=createLocateFixture(t,{withHeader:true,headerPosition:'sticky',headPosition:'sticky',targetInsideHead:true});
 locateConversationContent(target,true);
 assert.equal(stream.scrollTop,500+420-100-43);
});
test('无内嵌顶栏或顶栏非粘性时保持原定位偏移不变',t=>{
 const embedded=createLocateFixture(t,{withHeader:false,headPosition:'sticky'});
 locateConversationContent(embedded.target,false);
 assert.equal(embedded.stream.scrollTop,500+420-100);
 const nonSticky=createLocateFixture(t,{withHeader:true,headerPosition:'static',headPosition:'sticky'});
 locateConversationContent(nonSticky.target,true);
 assert.equal(nonSticky.stream.scrollTop,500+420-100-(96+8));
});

const {revealConversationAnswer}=await import('../../src/features/agent-conversations/conversation-reading.ts');
test('已贴底时展开其他回答直接贴紧底部并返回 true，避免误弹出到底按钮',()=>{
 const shortStream={scrollTop:0,scrollHeight:680,clientHeight:600,getBoundingClientRect:()=>({top:0,bottom:600})};
 assert.equal(revealConversationAnswer(shortStream,{getBoundingClientRect:()=>({top:480,bottom:640})},true,{getBoundingClientRect:()=>({top:300,bottom:660})}),true);
 assert.equal(shortStream.scrollTop,80);

 const longStream={scrollTop:800,scrollHeight:1580,clientHeight:600,getBoundingClientRect:()=>({top:0,bottom:600})};
 assert.equal(revealConversationAnswer(longStream,{getBoundingClientRect:()=>({top:520,bottom:680})},true,{getBoundingClientRect:()=>({top:360,bottom:720})}),true);
 assert.equal(longStream.scrollTop,980);
});
test('未贴底但底部卡片展开后进入贴底范围时自动对齐底部并返回 true',()=>{
 const stream={scrollTop:940,scrollHeight:1580,clientHeight:600,getBoundingClientRect:()=>({top:0,bottom:600})};
 assert.equal(revealConversationAnswer(stream,{getBoundingClientRect:()=>({top:430,bottom:600})},false,{getBoundingClientRect:()=>({top:350,bottom:620})}),true);
 assert.equal(stream.scrollTop,980);
});
test('上方卡片展开且下方仍有较多内容时只滚出该卡片与留白，返回 false',()=>{
 const stream={scrollTop:400,scrollHeight:2000,clientHeight:600,getBoundingClientRect:()=>({top:100,bottom:700})};
 assert.equal(revealConversationAnswer(stream,{getBoundingClientRect:()=>({top:560,bottom:730})},false,{getBoundingClientRect:()=>({top:500,bottom:730})}),false);
 assert.equal(stream.scrollTop,448);
});
test('多题卡片首题展开其他时若贴底会顶出输入框，则按安全上限滚动并保持输入框可见',()=>{
 const stream={scrollTop:600,scrollHeight:1500,clientHeight:500,getBoundingClientRect:()=>({top:100,bottom:600})};
 assert.equal(revealConversationAnswer(stream,{getBoundingClientRect:()=>({top:320,bottom:480})},true,{getBoundingClientRect:()=>({top:320,bottom:650})}),false);
 assert.equal(stream.scrollTop,668);
});
