import '../components/file-link-action.css';

/** Bind the secondary file action without changing the primary link target. */
export function bindFileLinkAction(link: HTMLAnchorElement, resolve: (signal:AbortSignal)=>Promise<(() => Promise<void>)|null>, lifetime: AbortSignal) {
  const wrap=document.createElement('span');
  wrap.className='harness-file-link-action';
  link.before(wrap);wrap.append(link);
  const button=document.createElement('button');
  button.type='button';button.textContent='在资源管理器中打开';button.hidden=true;wrap.append(button);
  const listen={signal:lifetime};
  let timer:ReturnType<typeof setTimeout>|undefined, pending:AbortController|undefined;
  let touch=false, suppressClick=false, moving=false, action:(()=>Promise<void>)|null=null;
  const reset=()=>{clearTimeout(timer);pending?.abort();pending=undefined;action=null;button.hidden=true;};
  const show=(delay:number)=>{
    clearTimeout(timer);
    if(pending||!button.hidden)return;
    timer=setTimeout(()=>{
      if(lifetime.aborted)return;
      const controller=new AbortController();pending=controller;
      void resolve(controller.signal).then(open=>{
        if(!controller.signal.aborted&&open){action=open;button.hidden=false;if(touch)suppressClick=true;}
      }).catch(()=>{}).finally(()=>{if(pending===controller&&!action)pending=undefined;});
    },delay);
  };
  wrap.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')show(350);},listen);
  wrap.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&!moving&&!wrap.contains(document.activeElement))reset();},listen);
  wrap.addEventListener('focusin',()=>{if(!touch)show(0);},listen);
  wrap.addEventListener('focusout',event=>{if(!moving&&!(event.relatedTarget instanceof Node&&wrap.contains(event.relatedTarget)))reset();},listen);
  link.addEventListener('pointerdown',event=>{touch=event.pointerType==='touch';suppressClick=false;if(touch)show(450);},listen);
  link.addEventListener('pointerup',()=>{if(touch)clearTimeout(timer);},listen);
  link.addEventListener('pointercancel',()=>{if(touch&&!suppressClick)reset();},listen);
  link.addEventListener('contextmenu',event=>{if(touch){event.preventDefault();show(0);}},listen);
  link.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}else if(touch)reset();}, {...listen,capture:true});
  wrap.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!button.hidden&&!moving){event.preventDefault();link.focus();reset();}
    if(event.target===link&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){event.preventDefault();show(0);}
  },listen);
  document.addEventListener('pointerdown',event=>{if(!moving&&button.hidden===false&&event.target instanceof Node&&!wrap.contains(event.target))reset();},listen);
  button.addEventListener('click',()=>{
    if(!action||moving)return;
    moving=true;button.disabled=true;
    void action().finally(()=>{moving=false;button.disabled=false;reset();});
  },listen);
  lifetime.addEventListener('abort',reset,{once:true});
}
