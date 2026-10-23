import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('/lib/useTabNavigation.ts')){
    if(specifier==='react')return {url:'data:text/javascript,'+encodeURIComponent(['useLayoutEffect','useRef','useState'].map(name=>`export const ${name}=(...args)=>globalThis.__tabHarness.${name}(...args);`).join('\n')),shortCircuit:true};
    if(specifier==='./tab-navigation')return next(specifier+'.ts',context);
  }
  return next(specifier,context);
}});
const {useTabNavigation}=await import('../src/lib/useTabNavigation.ts');
function harness(enabled=true,sharedCloseFocus){
  const slots=[],effects=[];let cursor=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const root={scrollLeft:80,visible:true,getClientRects(){return this.visible?[{}]:[];},parentElement:null,contains(node){return buttons.includes(node);},querySelectorAll(){return buttons;}};
  const buttons=['a','b','c'].map(key=>({dataset:{tabKey:key},matches:()=>false,focus(){if(root.visible)globalThis.document.activeElement=this;},scrollIntoView(){root.scrollLeft=60;}}));
  const priorDocument=globalThis.document;globalThis.document={activeElement:null};
  globalThis.__tabHarness={
    useState(value){const i=cursor++;slots[i]||={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},
    useRef(value){const i=cursor++;return slots[i]||={current:value};},
    useLayoutEffect(fn,deps){const i=cursor++;if(!deps||!same(slots[i]?.deps,deps)){slots[i]={deps};effects.push(fn);}},
  };
  return {root,render(keys,active,version){cursor=0;const value=useTabNavigation(keys,active,{current:root},enabled,version,sharedCloseFocus);effects.splice(0).forEach(fn=>fn());return value;},dispose(){delete globalThis.__tabHarness;if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;}};
}

test('activation waits for reordered DOM before resetting scroll and explicit repeated activation also resets',()=>{
  const view=harness();
  try{
    view.render(['a','b','c'],'c');assert.equal(view.root.scrollLeft,80);
    view.render(['c','a','b'],'c');assert.equal(view.root.scrollLeft,0);
    view.root.scrollLeft=90;view.render(['c','a','b'],'c');assert.equal(view.root.scrollLeft,90,'ordinary rendering preserves manual horizontal scrolling');
    view.render(['c','a','b'],'c').onActivate('c');assert.equal(view.root.scrollLeft,0);
    view.root.scrollLeft=70;view.render(['c','a','b'],'c').onActivate('a');view.render(['c','a','b'],'c');assert.equal(view.root.scrollLeft,70,'an old active key must not consume the next activation reset');
    view.render(['c','a','b'],'a');assert.equal(view.root.scrollLeft,70);
    view.render(['a','c','b'],'a');assert.equal(view.root.scrollLeft,0);
    view.root.scrollLeft=100;view.render(['a','c','b'],'a',1);assert.equal(view.root.scrollLeft,0,'same-page navigation activation resets the strip');
  }finally{view.dispose();}
});

test('arrow focus and manual ordering leave scroll alone until confirmation; fixed view tabs do not opt in',()=>{
  const view=harness();
  try{
    const nav=view.render(['c','a','b'],'c');nav.onKeyDown({key:'ArrowRight',preventDefault(){}},'c');assert.equal(view.root.scrollLeft,60);
    assert.equal(view.render(['c','a','b'],'c').focusKey,'a');assert.equal(view.root.scrollLeft,60);
    view.render(['a','c','b'],'c');assert.equal(view.root.scrollLeft,60,'manual reorder is not activation');
  }finally{view.dispose();}
  const fixed=harness(false);
  try{fixed.render(['a','b','c'],'a');fixed.render(['a','b','c'],'a').onActivate('b');fixed.render(['a','b','c'],'b');assert.equal(fixed.root.scrollLeft,80);}finally{fixed.dispose();}
});

test('closing waits for a temporarily hidden strip to return before consuming focus handoff',()=>{
  const view=harness();
  try{
    const nav=view.render(['a','b','c'],'a');nav.onKeyDown({key:'Home',preventDefault(){}},'a');
    assert.equal(document.activeElement.dataset.tabKey,'a');
    nav.close('a',()=>{});view.root.visible=false;view.render(['b','c'],'b');
    assert.equal(document.activeElement.dataset.tabKey,'a');
    view.root.visible=true;view.render(['b','c'],'b');
    assert.equal(document.activeElement.dataset.tabKey,'b');assert.equal(view.root.scrollLeft,0);
  }finally{view.dispose();}
});

test('page header remount keeps close focus intent in the workspace owner',()=>{
  const shared={current:null};
  const first=harness(true,shared);
  const nav=first.render(['a','b'],'a');nav.onKeyDown({key:'Home',preventDefault(){}},'a');nav.close('a',()=>{});
  first.render(['b'],undefined);assert.deepEqual(shared.current,{removed:'a',next:'b'},'an intermediate render before route activation must not consume focus');
  first.dispose();
  assert.deepEqual(shared.current,{removed:'a',next:'b'});
  const restored=harness(true,shared);
  try{restored.render(['b'],'b');assert.equal(document.activeElement.dataset.tabKey,'b');assert.equal(shared.current,null);assert.equal(restored.root.scrollLeft,0);}finally{restored.dispose();}
});
