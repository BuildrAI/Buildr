import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {ConversationView} from './types';

type Props={conversation:ConversationView|null;selectionKey:string;stream:RefObject<HTMLDivElement|null>;bottom:RefObject<boolean>;position:RefObject<number>;loadPage:(chat:ConversationView,before:number,signal:AbortSignal)=>Promise<ConversationView>;prepend:(page:ConversationView)=>void};
type Anchor={attribute:string;id:string;offset:number;height:number;top:number;first:string;scope:string;fit:boolean};
const PREFETCH_DISTANCE=800;
const INITIAL_FILL_PAGES=4;

/** Fill a short initial viewport within a budget; then fetch only for an upward reader. */
export function useEarlierConversationEntries(props:Props){
 const {conversation:chat,selectionKey,stream,bottom,position}=props;
 const current=useRef(props);current.current=props;
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const scope=useRef(selectionKey);scope.current=selectionKey;
 const active=useRef<AbortController|null>(null),anchor=useRef<Anchor|null>(null);
 const touch=useRef<number|null>(null),lastTop=useRef(0),pointerActive=useRef(false);
 const size=useRef({height:0,viewport:0});
 const fill=useRef({allowed:true,cursors:new Set<number>()}),fillFrame=useRef(0);
 const cancelFill=()=>{if(fillFrame.current)cancelAnimationFrame(fillFrame.current);fillFrame.current=0;};
 const stopFill=()=>{fill.current.allowed=false;cancelFill();};
 const scheduleFill=()=>{
  const value=current.current.conversation;
  if(!fill.current.allowed||fillFrame.current||!value?.entries.length||value.nextEntryCursor===undefined)return;
  fillFrame.current=requestAnimationFrame(()=>{fillFrame.current=requestAnimationFrame(()=>{
   fillFrame.current=0;
   const node=stream.current,value=current.current.conversation;
   if(!fill.current.allowed||active.current||!node?.getClientRects().length||!value?.entries.length||value.nextEntryCursor===undefined)return;
   // Explicit wheel, touch, keyboard and pointer handlers already end automatic
   // filling. A transient layout scroll must not be mistaken for reader takeover.
   if(node.scrollHeight>node.clientHeight+1||fill.current.cursors.size>=INITIAL_FILL_PAGES||fill.current.cursors.has(value.nextEntryCursor)){stopFill();return;}
   fill.current.cursors.add(value.nextEntryCursor);void load(true);
  });});
 };
 const remember=()=>{
  const node=stream.current;if(!node)return;
  lastTop.current=node.scrollTop;position.current=node.scrollTop;
  size.current={height:node.scrollHeight,viewport:node.clientHeight};
 };
 const layoutClampedTop=(node:HTMLDivElement)=>Math.min(lastTop.current,Math.max(0,node.scrollHeight-node.clientHeight));
 const followLayout=()=>{
  const node=stream.current;if(!node||!bottom.current)return;
  // A send can shrink then regrow content before either callback runs. Its
  // intermediate native clamp is not reader intent; a live scrollbar drag is.
  if(size.current.height>0&&pointerActive.current&&Math.abs(node.scrollTop-layoutClampedTop(node))>1&&node.scrollHeight-node.scrollTop-node.clientHeight>=24){
   anchor.current=null;bottom.current=false;remember();return;
  }
  node.scrollTop=node.scrollHeight;remember();scheduleFill();
 };
 useEffect(()=>{
  const release=()=>{pointerActive.current=false;};
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
  return()=>{window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);active.current?.abort();active.current=null;anchor.current=null;cancelFill();};
 },[]);
 useLayoutEffect(()=>{
  active.current?.abort();active.current=null;anchor.current=null;touch.current=null;pointerActive.current=false;lastTop.current=0;size.current={height:0,viewport:0};cancelFill();fill.current={allowed:true,cursors:new Set()};setLoading(false);setError('');
 },[selectionKey]);
 useEffect(()=>{scheduleFill();},[chat?.entries,chat?.nextEntryCursor,selectionKey]);
 useLayoutEffect(()=>{
  const a=anchor.current,node=stream.current;
  if(!a||!node||a.scope!==selectionKey||!chat?.entries.some(e=>e.id===a.first))return;
  const restore=()=>{
   if(anchor.current!==a||scope.current!==a.scope)return;
   const visible=(n:HTMLElement)=>n.getBoundingClientRect().height>0;
   const direct=a.attribute==='data-entry-id'?[...node.querySelectorAll<HTMLElement>('[data-entry-id]')].find(n=>n.dataset.entryId===a.id&&visible(n)):undefined;
   const item=direct??[...node.querySelectorAll<HTMLElement>('[data-entry-group]')].find(n=>JSON.parse(n.dataset.entryGroup!).includes(a.id)&&visible(n))??[...node.querySelectorAll<HTMLElement>('[data-run-id]')].find(n=>n.getAttribute(a.attribute)===a.id&&visible(n));
   node.scrollTop=a.fit?0:item?node.scrollTop+item.getBoundingClientRect().top-node.getBoundingClientRect().top-a.offset:a.top+node.scrollHeight-a.height;
   remember();bottom.current=false;
  };
  restore();
  // MarkdownHost populates new content in an effect. Account for that DOM work
  // before painting instead of flashing a jump after the content appears.
  const observer=new MutationObserver(restore);observer.observe(node,{childList:true,subtree:true,characterData:true});
  let second=0;
  const first=requestAnimationFrame(()=>{restore();second=requestAnimationFrame(()=>{restore();observer.disconnect();if(anchor.current===a)anchor.current=null;});});
  return()=>{observer.disconnect();cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[chat?.entries,selectionKey,stream,bottom,position]);
 const load=async(initialFill=false)=>{
  const owner=current.current,{conversation:chat,selectionKey}=owner;
  if(!chat||chat.nextEntryCursor===undefined||active.current)return;
  const operation=new AbortController(),observed=selectionKey;
  active.current=operation;setLoading(true);setError('');if(!initialFill)bottom.current=false;
  try{
   const page=await owner.loadPage(chat,chat.nextEntryCursor,operation.signal);
   if(scope.current!==observed||active.current!==operation)return;
   const existing=new Set(chat.entries.map(e=>e.id)),entries=page.entries.filter(e=>!existing.has(e.id)),node=stream.current;
   // The reader may take over while an automatic page is in flight.
   if(node&&entries.length&&(!initialFill||!fill.current.allowed)){
    const rect=node.getBoundingClientRect(),candidates=[...node.querySelectorAll<HTMLElement>('[data-entry-id],[data-entry-group]')];
    const visible=(n:HTMLElement)=>{const box=n.getBoundingClientRect();return !(n.hasAttribute('data-entry-group')&&n.parentElement?.hasAttribute('open'))&&box.height>0&&box.bottom>rect.top+4;};
    // A sticky prompt can stay at the same coordinate while the reading content moves.
    const item=candidates.find(n=>!n.closest('.ac-turn-context')&&visible(n))||candidates.find(visible)||[...node.querySelectorAll<HTMLElement>('[data-run-id]')].find(n=>n.getBoundingClientRect().bottom>rect.top+4);
    const attribute=item?.hasAttribute('data-entry-group')?'data-entry-group':item?.hasAttribute('data-entry-id')?'data-entry-id':'data-run-id';
    const id=attribute==='data-entry-group'?JSON.parse(item!.getAttribute(attribute)!)[0]:item?.getAttribute(attribute)||'';
    anchor.current={attribute,id,offset:(item?.getBoundingClientRect().top??rect.top)-rect.top,height:node.scrollHeight,top:node.scrollTop,first:entries[0].id,scope:observed,fit:node.scrollHeight<=node.clientHeight+1};
   }
   if(initialFill&&(!entries.length||page.nextEntryCursor!==undefined&&page.nextEntryCursor>=chat.nextEntryCursor))stopFill();
   owner.prepend(page);
  }catch(failure){if(scope.current===observed&&active.current===operation&&!operation.signal.aborted){stopFill();setError(failure instanceof Error?failure.message:'更早记录暂时无法读取，请继续向上滚动重试。');}}
  finally{if(active.current===operation){active.current=null;setLoading(false);if(initialFill)scheduleFill();}}
 };
 const readEarlier=()=>{
  stopFill();anchor.current=null;
  const node=stream.current;
  if(node?.getClientRects().length&&node.scrollTop<=PREFETCH_DISTANCE)void load();
 };
 const onScroll=()=>{
  const node=stream.current;if(!node?.getClientRects().length)return;
  const resized=node.scrollHeight!==size.current.height||node.clientHeight!==size.current.viewport;
  const upward=node.scrollTop<lastTop.current-1;
  const moved=Math.abs(node.scrollTop-lastTop.current)>1;
  const layoutOnly=resized&&(!pointerActive.current||Math.abs(node.scrollTop-layoutClampedTop(node))<=1);
  // A queued scroll caused by our compensation already has this exact top.
  // Any other movement belongs to the reader, including scrollbar dragging.
  if(moved)anchor.current=null;
  remember();
  const distance=node.scrollHeight-node.scrollTop-node.clientHeight;
  // Layout may clamp scrollTop before ResizeObserver runs. Do not turn that
  // into a request for history or disable the initial/latest follow.
  if(bottom.current&&(layoutOnly||!moved))return;
  if(distance<24)bottom.current=true;
  else{bottom.current=false;if(moved&&!layoutOnly&&!fill.current.allowed)stopFill();}
  // A shrinking composer clamps the viewport to the new bottom; that upward
  // scroll event is layout, not a request to read older entries.
  if(upward&&distance>=24)readEarlier();
 };
 const pinLatest=()=>{
  stopFill();anchor.current=null;touch.current=null;pointerActive.current=false;
  active.current?.abort();active.current=null;setLoading(false);setError('');
  const node=stream.current;bottom.current=true;
  if(node){node.scrollTop=node.scrollHeight;remember();}
 };
 const interrupt=()=>{stopFill();anchor.current=null;};
 return {loading,error,onScroll,pinLatest,remember,followLayout,
  onPointerDown:()=>{pointerActive.current=true;interrupt();},
  onPointerUp:()=>{pointerActive.current=false;},
  onPointerCancel:()=>{pointerActive.current=false;},
  onWheel:(event:{deltaY:number})=>{interrupt();if(event.deltaY<0){bottom.current=false;readEarlier();}},
  onTouchStart:(event:{touches:ArrayLike<{clientY:number}>})=>{interrupt();touch.current=event.touches[0]?.clientY??null;},
  onTouchMove:(event:{touches:ArrayLike<{clientY:number}>})=>{const y=event.touches[0]?.clientY;if(y===undefined)return;interrupt();if(touch.current!==null&&y>touch.current){bottom.current=false;readEarlier();}touch.current=y;},
  onTouchEnd:()=>{touch.current=null;},
  onTouchCancel:()=>{touch.current=null;},
  onKeyDown:(event:{key:string;shiftKey:boolean;defaultPrevented:boolean;target:EventTarget|null})=>{
   if(event.defaultPrevented||event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   interrupt();
   if(['ArrowUp','PageUp','Home'].includes(event.key)||event.key===' '&&event.shiftKey){
    bottom.current=false;
    // Let the native key scroll request its page through onScroll. Starting a
    // fetch before Home moves can race anchor restoration and fetch twice.
    // At the top there is no scroll event, so an explicit request is necessary.
    if((stream.current?.scrollTop??0)<=1)readEarlier();
   }else anchor.current=null;
  },
 };
}
