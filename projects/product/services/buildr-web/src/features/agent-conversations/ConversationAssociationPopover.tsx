import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Popover,AutoComplete,Alert,Button} from 'antd';
import {DeleteOutlined,LinkOutlined,CommentOutlined} from '@ant-design/icons';
import {associationKey,associationQueryReady,ASSOCIATION_SEARCH_LIMIT,type AssociationItem,type AssociationResult} from './conversation-associations';
import './conversation-associations.css';

/** Shared only by the two ends of the conversation/task relation. */
export function ConversationAssociationPopover({kind,count,loading,enabled=true,children,onOpenChange}:{kind:'task'|'conversation';count:number|null;loading?:boolean;enabled?:boolean;children:ReactNode;onOpenChange?:(open:boolean)=>void}){
  const [open,setOpen]=useState(false),[pinned,setPinned]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null),body=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),returning=useRef(false);
  const label=kind==='task'?'关联任务':'关联对话';
  const cancel=()=>{clearTimeout(timer.current);};
  const close=()=>{cancel();setOpen(false);setPinned(false);};
  const enter=()=>{if(!enabled)return;cancel();document.dispatchEvent(new CustomEvent('buildr-association-popover-open',{detail:trigger.current}));setOpen(true);};
  const leave=()=>{cancel();timer.current=setTimeout(()=>{if(!pinned&&!body.current?.contains(document.activeElement))setOpen(false);},220);};
  useEffect(()=>{onOpenChange?.(open&&enabled);},[open,enabled,onOpenChange]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{const other=(event:Event)=>{if((event as CustomEvent).detail!==trigger.current)close();};document.addEventListener('buildr-association-popover-open',other);return()=>document.removeEventListener('buildr-association-popover-open',other);},[]);
  useEffect(()=>{
    if(!open||!enabled)return;
    const outside=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!body.current?.contains(event.target as Node))close();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();if(document.activeElement!==trigger.current){returning.current=true;trigger.current?.focus();}}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
  },[open,enabled]);
  return <Popover rootClassName={'ac-panel-popup ac-association-popup'+(open&&enabled?' is-open':'')} trigger={[]} open={open&&enabled} placement="top" autoAdjustOverflow content={<div ref={body} className="ac-association-body" onMouseEnter={enter} onMouseLeave={leave} onFocusCapture={()=>{cancel();setPinned(true);}} onClick={event=>{if((event.target as HTMLElement).closest('.ac-association-open,[data-association-navigate]'))close();}}>{children}</div>}>
    <button ref={trigger} type="button" className="ac-association-trigger" aria-label={label} aria-expanded={open&&enabled} aria-busy={loading} onMouseEnter={enter} onMouseLeave={leave} onFocus={()=>{if(returning.current){returning.current=false;return;}enter();}} onBlur={leave} onClick={()=>{cancel();if(pinned)close();else{setPinned(true);enter();}}}>{kind==='task'?<LinkOutlined/>:<CommentOutlined/>}<span>{label}</span><span>{count===null?'未确认':count}</span></button>
  </Popover>;
}

export function AssociationRows({items,names,saving,onOpen,onRemove,kind='task'}:{kind?:'task'|'conversation';items:AssociationItem[];names:Record<string,string>;saving:boolean;onOpen:(item:AssociationItem)=>void;onRemove:(item:AssociationItem)=>void}){
  return <div className="ac-association-rows">{items.map(item=><div className="ac-association-row" key={associationKey(item)}>
    <button type="button" className="ac-association-open" data-associated-task={kind==='task'?item.id:undefined} data-associated-conversation={kind==='conversation'?item.id:undefined} data-associated-workspace={item.workspaceId} onClick={()=>onOpen(item)}><strong>{item.title}</strong><small>{names[item.workspaceId]||item.workspaceId} · {item.id}</small>{item.error&&<small role="status">{item.error}</small>}</button>
    <Button type="text" size="small" icon={<DeleteOutlined/>} disabled={saving} aria-label={'解除关联 '+item.id} title="只解除关联，不删除对象" onClick={()=>onRemove(item)}/>
  </div>)}</div>;
}

export function AssociationSearch({kind,names,selected,saving,search,onAdd}:{kind:'task'|'conversation';names:Record<string,string>;selected:Set<string>;saving:boolean;search:(query:string,signal:AbortSignal)=>Promise<AssociationResult>;onAdd:(item:AssociationItem)=>void}){
  const [query,setQuery]=useState(''),[focused,setFocused]=useState(false),[state,setState]=useState<{query:string;result:AssociationResult;loading:boolean}>({query:'',result:{items:[],errors:[]},loading:false});
  const ready=associationQueryReady(query),current=state.query===query;
  const result=current?state.result:{items:[],errors:[]},loading=!current||state.loading;
  useEffect(()=>{
    const controller=new AbortController();
    setState({query,result:{items:[],errors:[]},loading:ready});
    if(!ready)return()=>controller.abort();
    const timer=setTimeout(()=>{void search(query.trim(),controller.signal).then(result=>{if(!controller.signal.aborted)setState({query,result,loading:false});}).catch(failure=>{if(!controller.signal.aborted)setState({query,result:{items:[],errors:[failure instanceof Error?failure.message:'搜索暂时不可用。']},loading:false});});},250);
    return()=>{controller.abort();clearTimeout(timer);};
  },[query,ready,search]);
  const items=result.items.slice(0,ASSOCIATION_SEARCH_LIMIT);
  const options=items.map(item=>{const linked=selected.has(associationKey(item));return {value:associationKey(item),disabled:saving||linked,label:<div className="ac-association-candidate"><strong>{item.title}{linked?' · 已关联':''}</strong><small>{names[item.workspaceId]||item.workspaceId} · {item.id}</small></div>};});
  return <section className="ac-association-search"><strong>新增关联</strong><AutoComplete aria-label={kind==='task'?'搜索任务':'搜索对话'} placeholder={kind==='task'?'输入至少 2 个字符，匹配名称或编码前缀':'输入至少 2 个字符，匹配标题或标识前缀'} allowClear value={query} options={options.length?options:[{value:"__empty__",disabled:true,label:<div className="ac-association-search-hint">{result.errors.length?'已读取范围中暂无匹配，部分空间尚未确认。':'没有前缀匹配。'}</div>}]} open={focused&&ready&&!loading} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={value=>{if(!items.some(item=>associationKey(item)===value))setQuery(value);}} onSelect={value=>{const item=items.find(item=>associationKey(item)===value);if(item&&!saving&&!selected.has(value))onAdd(item);}} getPopupContainer={trigger=>trigger.parentElement!} classNames={{popup:{root:'ac-association-options'}}} notFoundContent={<div className="ac-association-search-hint">{result.errors.length?'已读取范围中暂无匹配，部分空间尚未确认。':'没有前缀匹配。'}</div>} popupRender={menu=><>{menu}{result.errors.map((error,index)=><Alert key={index} type="warning" showIcon message={error}/>)}</>}/></section>;
}
