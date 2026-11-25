import '../components/file-link-action.css';
import { canShowOverlay, createOverlayDelay, createMouseMoveIntent } from './overlay-intent.ts';

/** Bind the secondary file action without changing the primary link target. */
export function bindFileLinkAction(link: HTMLAnchorElement, resolve: (signal:AbortSignal)=>Promise<(() => Promise<void>)|null>, lifetime: AbortSignal) {
  const wrap=document.createElement('span');
  wrap.className='harness-file-link-action';
  link.before(wrap);wrap.append(link);
  const button=document.createElement('button');
  button.type='button';button.hidden=true;
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS(icon.namespaceURI,'path');
  path.setAttribute('d','M3 7V5h6l2 2h2M3 7v12h18v-6M3 7h8m4-4h6v6m0-6-8 8');
  icon.append(path);button.append(icon,'在资源管理器中打开');wrap.append(button);
  const listen={signal:lifetime};
  const dwell=createOverlayDelay();
  const mouseMoved=createMouseMoveIntent();
  let pending:AbortController|undefined;
  let touch=false, tabbing=false, suppressClick=false, moving=false, action:(()=>Promise<void>)|null=null;
  const reset=()=>{dwell.cancel();pending?.abort();pending=undefined;action=null;button.hidden=true;};
  const show=(delay:number)=>{
    if(pending||!button.hidden||moving)return;
    dwell.start(delay,()=>{
      if(lifetime.aborted||!canShowOverlay(document))return;
      const controller=new AbortController();pending=controller;
      void resolve(controller.signal).then(open=>{
        if(!controller.signal.aborted&&open&&canShowOverlay(document)){action=open;button.hidden=false;if(touch)suppressClick=true;}
      }).catch(()=>{}).finally(()=>{if(pending===controller&&!action)pending=undefined;});
    });
  };
  const deactivate=()=>{tabbing=false;reset();};
  window.addEventListener('blur',deactivate,listen);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)deactivate();},listen);
  document.addEventListener('keydown',event=>{
    tabbing=event.key==='Tab'&&!event.altKey&&!event.ctrlKey&&!event.metaKey;
  },{...listen,capture:true});
  document.addEventListener('keyup',()=>{tabbing=false;},listen);
  wrap.addEventListener('pointermove',event=>{if(mouseMoved(event)){touch=false;show(350);}},listen);
  wrap.addEventListener('pointerleave',event=>{
    if(event.pointerType==='mouse'&&!moving&&!wrap.querySelector(':focus-visible'))reset();
  },listen);
  wrap.addEventListener('focusin',event=>{if(event.target===link&&tabbing&&link.matches(':focus-visible')){touch=false;show(0);}},listen);
  wrap.addEventListener('focusout',event=>{if(!moving&&!(event.relatedTarget instanceof Node&&wrap.contains(event.relatedTarget)))reset();},listen);
  link.addEventListener('pointerdown',event=>{reset();touch=event.pointerType==='touch';suppressClick=false;if(touch)show(450);},listen);
  link.addEventListener('pointerup',()=>{if(touch)dwell.cancel();},listen);
  link.addEventListener('pointercancel',()=>{if(touch&&!suppressClick)reset();},listen);
  link.addEventListener('contextmenu',event=>{if(touch){event.preventDefault();show(0);}},listen);
  link.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}else reset();}, {...listen,capture:true});
  wrap.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!button.hidden&&!moving){event.preventDefault();link.focus();reset();}
    if(event.target===link&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){event.preventDefault();touch=false;dwell.cancel();show(0);}
  },listen);
  document.addEventListener('pointerdown',event=>{if(!moving&&event.target instanceof Node&&!wrap.contains(event.target))reset();},listen);
  button.addEventListener('click',()=>{
    if(!action||moving)return;
    moving=true;button.disabled=true;
    void action().finally(()=>{moving=false;button.disabled=false;reset();});
  },listen);
  lifetime.addEventListener('abort',reset,{once:true});
}
