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
