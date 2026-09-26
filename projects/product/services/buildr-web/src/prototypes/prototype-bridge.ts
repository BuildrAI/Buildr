import { useEffect, useRef, type RefObject } from 'react';
import type { PrototypeScene } from '../features/task/components/prototype-content';
import { connectPrototype } from '../../../buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.js';
import '../../../buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.css';
type Selection={page:string;state:string};

/** React lifecycle only; the reusable skill component owns reading interactions. */
export function usePrototypeBridge(pages:PrototypeScene[],current:RefObject<Selection>,onSelect:(page:string,state:string)=>void) {
  const select=useRef(onSelect),bridge=useRef<ReturnType<typeof connectPrototype>|null>(null);
  select.current=onSelect;
  useEffect(()=>{
    bridge.current=connectPrototype({pages,getSelection:()=>current.current,onSelect:(page,state)=>select.current(page,state)});
    return()=>{bridge.current?.destroy();bridge.current=null;};
  },[pages,current]);
  return {report(page:string,state=''){current.current={page,state};bridge.current?.report(page,state);}};
}
