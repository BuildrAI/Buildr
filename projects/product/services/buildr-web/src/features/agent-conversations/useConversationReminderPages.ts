import { useEffect, useRef, useState } from 'react';
import type { ConversationPage, createAgentConversationsClient } from './api/agent-conversations-api';

type Client=ReturnType<typeof createAgentConversationsClient>;
type Group='attention'|'running';
type Pages=Partial<Record<Group,ConversationPage>>;
/** Independent group cursors keep later pending conversations visible beside busy runs. */
export function useConversationReminderPages(api:Client,open:boolean) {
  const [pages,setPages]=useState<Pages>({}),[errors,setErrors]=useState<Partial<Record<Group,string>>>({});
  const firstPages=useRef<Partial<Record<Group,string>>>({}),abort=useRef<AbortController|null>(null);
  const generation=useRef(0),sequences=useRef({attention:0,running:0}),loading=useRef(new Set<Group>());
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const current=++generation.current,controller=new AbortController();abort.current=controller;
    const refresh=async(group:Group)=>{
      if(loading.current.has(group))return;
      const sequence=++sequences.current[group];
      try {
        const result=await api.listAll({activeOnly:true,activityState:group,limit:100,signal:controller.signal});
        if(!controller.signal.aborted&&generation.current===current&&sequences.current[group]===sequence){const signature=JSON.stringify([result.nextCursor,result.conversations]);if(firstPages.current[group]!==signature){firstPages.current[group]=signature;setPages(previous=>({...previous,[group]:result}));}setErrors(previous=>({...previous,[group]:undefined}));}
      }catch(error){if(!controller.signal.aborted&&generation.current===current&&sequences.current[group]===sequence)setErrors(previous=>({...previous,[group]:error instanceof Error?error.message:'对话尚未更新，保留上次结果。'}));}
    };
    const refreshAll=()=>{if(document.visibilityState==='visible')for(const group of ['attention','running'] as const)void refresh(group);};
    refreshAll();const timer=setInterval(refreshAll,5000);window.addEventListener('focus',refreshAll);
    return()=>{controller.abort();abort.current=null;generation.current++;loading.current.clear();setBusy(false);clearInterval(timer);window.removeEventListener('focus',refreshAll);};
  },[api,open]);
  const more=async()=>{
    if(busy)return;
    const current=generation.current;setBusy(true);
    await Promise.all((['attention','running'] as const).map(async group=>{
      const cursor=pages[group]?.nextCursor;if(!cursor||loading.current.has(group))return;
      loading.current.add(group);const sequence=++sequences.current[group];
      try{const result=await api.listAll({activeOnly:true,activityState:group,limit:100,cursor,signal:abort.current?.signal});
        if(generation.current===current&&sequences.current[group]===sequence){setPages(previous=>({...previous,[group]:{...result,conversations:[...(previous[group]?.conversations??[]),...result.conversations.filter(row=>!previous[group]?.conversations.some(item=>item.workspaceId===row.workspaceId&&item.id===row.id))]}}));setErrors(previous=>({...previous,[group]:undefined}));}
      }catch(error){if(generation.current===current&&sequences.current[group]===sequence)setErrors(previous=>({...previous,[group]:error instanceof Error?error.message:'无法读取更多对话。'}));}
      finally{if(generation.current===current)loading.current.delete(group);}
    }));
    if(generation.current===current)setBusy(false);
  };
  return {pages,error:Object.values(errors).filter(Boolean).join('；'),hasMore:Boolean(pages.attention?.nextCursor||pages.running?.nextCursor),more,busy};
}
