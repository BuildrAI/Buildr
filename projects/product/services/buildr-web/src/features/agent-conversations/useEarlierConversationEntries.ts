import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {ConversationView} from './types';

type Props={conversation:ConversationView|null;selectionKey:string;stream:RefObject<HTMLDivElement|null>;bottom:RefObject<boolean>;position:RefObject<number>;loadPage:(chat:ConversationView,before:number,signal:AbortSignal)=>Promise<ConversationView>;prepend:(page:ConversationView)=>void};
type Anchor={attribute:string;id:string;offset:number;height:number;top:number;first:string;scope:string;fit:boolean};
const PREFETCH_DISTANCE=800;

/** Fetch ahead of an upward reader; opening, streaming and restoring never drain history. */
export function useEarlierConversationEntries(props:Props){
 const {conversation:chat,selectionKey,stream,bottom,position}=props;
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const scope=useRef(selectionKey);scope.current=selectionKey;
 const active=useRef<AbortController|null>(null),anchor=useRef<Anchor|null>(null);
 const touch=useRef<number|null>(null),lastTop=useRef(0);
 useEffect(()=>()=>{active.current?.abort();active.current=null;anchor.current=null;},[]);
 useLayoutEffect(()=>{
  active.current?.abort();active.current=null;anchor.current=null;touch.current=null;lastTop.current=0;setLoading(false);setError('');
 },[selectionKey]);
 useLayoutEffect(()=>{
  const a=anchor.current,node=stream.current;
  if(!a||!node||a.scope!==selectionKey||!chat?.entries.some(e=>e.id===a.first))return;
  const restore=()=>{
   if(anchor.current!==a||scope.current!==a.scope)return;
   const visible=(n:HTMLElement)=>n.getBoundingClientRect().height>0;
   const direct=a.attribute==='data-entry-id'?[...node.querySelectorAll<HTMLElement>('[data-entry-id]')].find(n=>n.dataset.entryId===a.id&&visible(n)):undefined;
   const item=direct??[...node.querySelectorAll<HTMLElement>('[data-entry-group]')].find(n=>JSON.parse(n.dataset.entryGroup!).includes(a.id)&&visible(n))??[...node.querySelectorAll<HTMLElement>('[data-run-id]')].find(n=>n.getAttribute(a.attribute)===a.id&&visible(n));
   node.scrollTop=a.fit?0:item?node.scrollTop+item.getBoundingClientRect().top-node.getBoundingClientRect().top-a.offset:a.top+node.scrollHeight-a.height;
   lastTop.current=node.scrollTop;bottom.current=false;position.current=node.scrollTop;
  };
  restore();
  // MarkdownHost populates new content in an effect. Account for that DOM work
  // before painting instead of flashing a jump after the content appears.
  const observer=new MutationObserver(restore);observer.observe(node,{childList:true,subtree:true,characterData:true});
  let second=0;
  const first=requestAnimationFrame(()=>{restore();second=requestAnimationFrame(()=>{restore();observer.disconnect();if(anchor.current===a)anchor.current=null;});});
  return()=>{observer.disconnect();cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[chat?.entries,selectionKey,stream,bottom,position]);
 const load=async()=>{
  if(!chat||chat.nextEntryCursor===undefined||active.current)return;
  const operation=new AbortController(),observed=selectionKey;
  active.current=operation;setLoading(true);setError('');bottom.current=false;
  try{
   const page=await props.loadPage(chat,chat.nextEntryCursor,operation.signal);
   if(scope.current!==observed||active.current!==operation)return;
   const existing=new Set(chat.entries.map(e=>e.id)),entries=page.entries.filter(e=>!existing.has(e.id)),node=stream.current;
   if(node&&entries.length){
    const rect=node.getBoundingClientRect(),candidates=[...node.querySelectorAll<HTMLElement>('[data-entry-id],[data-entry-group]')];
    const item=candidates.find(n=>{const box=n.getBoundingClientRect();return !(n.hasAttribute('data-entry-group')&&n.parentElement?.hasAttribute('open'))&&box.height>0&&box.bottom>rect.top+4;})||[...node.querySelectorAll<HTMLElement>('[data-run-id]')].find(n=>n.getBoundingClientRect().bottom>rect.top+4);
    const attribute=item?.hasAttribute('data-entry-group')?'data-entry-group':item?.hasAttribute('data-entry-id')?'data-entry-id':'data-run-id';
    const id=attribute==='data-entry-group'?JSON.parse(item!.getAttribute(attribute)!)[0]:item?.getAttribute(attribute)||'';
    anchor.current={attribute,id,offset:(item?.getBoundingClientRect().top??rect.top)-rect.top,height:node.scrollHeight,top:node.scrollTop,first:entries[0].id,scope:observed,fit:node.scrollHeight<=node.clientHeight+1};
   }
   props.prepend(page);
  }catch(failure){if(scope.current===observed&&active.current===operation&&!operation.signal.aborted)setError(failure instanceof Error?failure.message:'更早记录暂时无法读取，请继续向上滚动重试。');}
  finally{if(active.current===operation){active.current=null;setLoading(false);}}
 };
 const readEarlier=()=>{
  anchor.current=null;
  const node=stream.current;
  if(node?.getClientRects().length&&node.scrollTop<=PREFETCH_DISTANCE)void load();
 };
 const onScroll=()=>{
  const node=stream.current;if(!node?.getClientRects().length)return;
  const upward=node.scrollTop<lastTop.current-1;
  lastTop.current=node.scrollTop;position.current=node.scrollTop;bottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<80;
  if(upward)readEarlier();
 };
 return {loading,error,onScroll,
  onWheel:(event:{deltaY:number})=>{anchor.current=null;if(event.deltaY<0)readEarlier();},
  onTouchStart:(event:{touches:ArrayLike<{clientY:number}>})=>{anchor.current=null;touch.current=event.touches[0]?.clientY??null;},
  onTouchMove:(event:{touches:ArrayLike<{clientY:number}>})=>{const y=event.touches[0]?.clientY;if(y===undefined)return;if(touch.current!==null&&y>touch.current)readEarlier();touch.current=y;},
  onTouchEnd:()=>{touch.current=null;},
  onTouchCancel:()=>{touch.current=null;},
  onKeyDown:(event:{key:string;shiftKey:boolean;defaultPrevented:boolean;target:EventTarget|null})=>{
   if(event.defaultPrevented||event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(['ArrowUp','PageUp','Home'].includes(event.key)||event.key===' '&&event.shiftKey)readEarlier();
   else anchor.current=null;
  },
 };
}
