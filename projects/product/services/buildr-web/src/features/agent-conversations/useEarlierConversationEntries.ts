import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {ConversationView} from './types';

type Props={conversation:ConversationView|null;selectionKey:string;stream:RefObject<HTMLDivElement|null>;bottom:RefObject<boolean>;position:RefObject<number>;loadPage:(chat:ConversationView,before:number)=>Promise<ConversationView>;prepend:(page:ConversationView)=>void;onError:(error:unknown)=>void};
type Anchor={attribute:string;id:string;offset:number;height:number;top:number;first:string;scope:string;fit:boolean};
/** Paging belongs to a reading gesture, never to a stream update or an opened pane. */
export function useEarlierConversationEntries(props:Props){
 const {conversation:chat,selectionKey,stream,bottom,position}=props;
 const [loading,setLoading]=useState(false),[pull,setPull]=useState(0);
 const scope=useRef(selectionKey);scope.current=selectionKey;
 const active=useRef<object|null>(null),anchor=useRef<Anchor|null>(null),touch=useRef<{y:number;top:boolean;distance:number}|null>(null);
 const wheel=useRef({at:0,used:false}),intent=useRef(0);
 useEffect(()=>()=>{active.current=null;anchor.current=null;},[]);
 useEffect(()=>{active.current=null;anchor.current=null;touch.current=null;setLoading(false);setPull(0);},[selectionKey]);
 useLayoutEffect(()=>{
  const a=anchor.current,node=stream.current;
  if(!a||!node||a.scope!==selectionKey||!chat?.entries.some(e=>e.id===a.first))return;
  const restore=()=>{
   if(anchor.current!==a||scope.current!==a.scope)return;
   const item=[...node.querySelectorAll<HTMLElement>('['+a.attribute+']')].find(n=>n.getAttribute(a.attribute)===a.id);
   node.scrollTop=a.fit?0:item?node.scrollTop+item.getBoundingClientRect().top-node.getBoundingClientRect().top-a.offset:a.top+node.scrollHeight-a.height;
   bottom.current=false;position.current=node.scrollTop;
  };
  restore();
  // MarkdownHost fills its DOM in a passive effect. Restore again after that
  // content exists; an early scroll can otherwise be clamped by an empty tail.
  let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{restore();if(anchor.current===a)anchor.current=null;});});
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[chat?.entries,selectionKey,stream,bottom,position]);
 const load=async()=>{
  if(!chat||chat.nextEntryCursor===undefined||active.current)return;
  const operation={},observed=selectionKey;active.current=operation;setLoading(true);bottom.current=false;
  const existing=new Set(chat.entries.map(e=>e.id)),added=new Map<string,ConversationView['entries'][number]>();let cursor=chat.nextEntryCursor,last:ConversationView|undefined;
  try{
   for(let page=0;page<3;page++){
    const result=await props.loadPage(chat,cursor);if(scope.current!==observed||active.current!==operation)return;
    last=result;for(const entry of result.entries)if(!existing.has(entry.id))added.set(entry.id,entry);
    if(result.entries.some(e=>e.kind==='message'&&e.role==='user')||result.nextEntryCursor===undefined||result.nextEntryCursor>=cursor)break;
    cursor=result.nextEntryCursor;
   }
   if(!last)return;
   const entries=[...added.values()].sort((a,b)=>a.sequence-b.sequence),node=stream.current;
   if(node&&entries.length){
    const rect=node.getBoundingClientRect();const candidates=[...node.querySelectorAll<HTMLElement>('[data-entry-id]')];
    const item=candidates.find(n=>n.getBoundingClientRect().bottom>rect.top+4)||[...node.querySelectorAll<HTMLElement>('[data-run-id]')].find(n=>n.getBoundingClientRect().bottom>rect.top+4);
    const attribute=item?.hasAttribute('data-entry-id')?'data-entry-id':'data-run-id';
    anchor.current={attribute,id:item?.getAttribute(attribute)||'',offset:(item?.getBoundingClientRect().top??rect.top)-rect.top,height:node.scrollHeight,top:node.scrollTop,first:entries[0].id,scope:observed,fit:node.scrollHeight<=node.clientHeight+1};
   }
   props.prepend({...last,entries});
  }catch(error){if(scope.current===observed)props.onError(error);}
  finally{if(active.current===operation){active.current=null;setLoading(false);}}
 };
 const onScroll=()=>{
  const node=stream.current;if(!node?.getClientRects().length)return;
  position.current=node.scrollTop;bottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<80;
  if(node.scrollTop<=32&&Date.now()-intent.current<300&&!wheel.current.used){wheel.current.used=true;void load();}
 };
 return {loading,pull,load,onScroll,
  onWheel:(event:{deltaY:number})=>{anchor.current=null;if(event.deltaY>=0)return;const now=Date.now();if(now-wheel.current.at>200)wheel.current.used=false;wheel.current.at=now;intent.current=now;onScroll();},
  onTouchStart:(event:{touches:ArrayLike<{clientY:number}>})=>{anchor.current=null;const point=event.touches[0];if(point)touch.current={y:point.clientY,top:(stream.current?.scrollTop??1)<=0,distance:0};},
  onTouchMove:(event:{touches:ArrayLike<{clientY:number}>})=>{const point=event.touches[0],start=touch.current;if(!point||!start?.top||loading||chat?.nextEntryCursor===undefined)return;start.distance=Math.max(0,Math.min(80,point.clientY-start.y));setPull(start.distance);},
  onTouchEnd:()=>{const distance=touch.current?.distance??0;touch.current=null;setPull(0);if(distance>=60)void load();},
  onTouchCancel:()=>{touch.current=null;setPull(0);},
 };
}
