import { useEffect, useRef } from 'react';
import type { PrototypeNote } from './prototype-content';
import { mountFeatureNotes } from '../../../../../buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.js';
import '../../../../../buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.css';

type Props = {notes:PrototypeNote[];activePosition?:string;onHighlight(position?:string,reveal?:boolean):void};
/** React adapter for the component distributed with the UI Prototype skill. */
export function PrototypeFeatureNotes({notes,activePosition,onHighlight}:Props) {
  const root=useRef<HTMLDivElement>(null),callback=useRef(onHighlight);
  const component=useRef<ReturnType<typeof mountFeatureNotes>|null>(null);
  callback.current=onHighlight;
  useEffect(()=>{
    component.current=mountFeatureNotes(root.current!,{notes:[],onHighlight:(position,reveal)=>callback.current(position,reveal)});
    return()=>{component.current?.destroy();component.current=null;};
  },[]);
  useEffect(()=>{component.current?.update({notes,activePosition});},[notes,activePosition]);
  return <div ref={root} />;
}
