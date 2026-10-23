import { useCallback, useEffect, useRef, useState } from 'react';
import { releaseAwarenessApi, type ReleaseAwareness } from '../api/release-awareness-api';
import { updateFlowApi, type UpdateFlowJob } from '../api/update-flow-api';
import { waitForRestart } from '../../../app/restart-watch';
import type { ConnectionState } from '../lib/update-view';

export function useUpdateFlow({ enabled, onCompleted }: { enabled:boolean; onCompleted?():void }) {
  const [awareness,setAwareness]=useState<ReleaseAwareness|null>(null),[job,setJob]=useState<UpdateFlowJob|null>(null);
  const [checking,setChecking]=useState(false),[checkError,setCheckError]=useState(''),[connection,setConnection]=useState<ConnectionState>('connected');
  const jobRef=useRef(job),generation=useRef(0),mutating=useRef(false),watcher=useRef<AbortController|null>(null),expectingRestart=useRef(false),finished=useRef(false);
  const mounted=useRef(true),checkGeneration=useRef(0),manualCheck=useRef(false);
  jobRef.current=job;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;watcher.current?.abort();};},[]);
  const reconnect=useCallback(async()=>{
    if(watcher.current)return;
    const controller=new AbortController();watcher.current=controller;setConnection('watching');
    const result=await waitForRestart({url:window.location.origin+'/',previousToken:document.querySelector('meta[name="buildr-session"]')?.getAttribute('content')??null,signal:controller.signal});
    if(controller.signal.aborted||!mounted.current)return;
    watcher.current=null;
    if(result==='ready')window.location.reload();else setConnection('timed-out');
  },[]);
  const accept=useCallback((next:UpdateFlowJob)=>{
    if(!mounted.current)return;
    setJob(next);jobRef.current=next;
    if(!expectingRestart.current||finished.current)return;
    if(next.simulated&&next.status==='completed'){
      finished.current=true;onCompleted?.();
    }else if(!next.simulated&&next.installedVersion&&next.runningVersion!==next.version&&['partial','completed'].includes(next.status)){
      finished.current=true;
      // A new session and the successor's actual version are observed independently.
      void reconnect();
    }
  },[onCompleted,reconnect]);
  const check=useCallback(async(options:{silent?:boolean;signal?:AbortSignal}={})=>{
    if(mutating.current)return;
    if(options.silent&&manualCheck.current)return;
    const currentCheck=++checkGeneration.current;
    const current=++generation.current;
    if(!options.silent){manualCheck.current=true;setChecking(true);setCheckError('');}
    const results=await Promise.allSettled([releaseAwarenessApi.inspect(options.signal),updateFlowApi.status(options.signal)]);
    if(!mounted.current||options.signal?.aborted||currentCheck!==checkGeneration.current)return;
    if(results[0].status==='fulfilled')setAwareness(results[0].value);
    else if(!options.silent)setCheckError(results[0].reason instanceof Error?results[0].reason.message:'暂时无法检查发布版本。');
    if(results[1].status==='fulfilled'&&current===generation.current)accept(results[1].value);
    else if(results[1].status==='rejected'&&!options.silent)setCheckError(results[1].reason instanceof Error?results[1].reason.message:'更新状态暂不可用。');
    if(!options.silent){manualCheck.current=false;setChecking(false);}
  },[accept]);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();void check({silent:true,signal:controller.signal});
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void check({silent:true,signal:controller.signal});},60000);
    return()=>{controller.abort();clearInterval(timer);};
  },[enabled,check]);
  useEffect(()=>{
    if(!enabled||!job||!['preparing','applying'].includes(job.status)||connection!=='connected')return;
    const controller=new AbortController();
    const timer=setInterval(()=>{
      if(mutating.current)return;
      const current=++generation.current;
      void updateFlowApi.status(controller.signal).then(next=>{if(!controller.signal.aborted&&current===generation.current)accept(next);}).catch(()=>{
        if(!controller.signal.aborted&&jobRef.current?.status==='applying')void reconnect();
      });
    },job.status==='preparing'?2000:1000);
    return()=>{controller.abort();clearInterval(timer);};
  },[enabled,job?.status,connection,accept,reconnect]);
  const mutate=useCallback(async(action:()=>Promise<UpdateFlowJob>,restart=false)=>{
    if(mutating.current)throw new Error('更新操作正在进行。');
    mutating.current=true;generation.current++;checkGeneration.current++;manualCheck.current=false;setChecking(false);setCheckError('');
    if(restart){expectingRestart.current=true;finished.current=false;}
    try{const next=await action();accept(next);return next;}
    catch(error){if(restart)expectingRestart.current=false;throw error;}
    finally{mutating.current=false;}
  },[accept]);
  return {awareness,job,checking,checkError,connection,check,reconnect,
    prepare:(track:'stable'|'candidate',expectedVersion:string)=>mutate(()=>updateFlowApi.prepare({track,expectedVersion,autoApply:true}),true),
    apply:(expectedVersion:string)=>mutate(()=>updateFlowApi.apply({expectedVersion}),true),
    recover:(action:'install'|'launcher'|'restart'|'workspaces',rootPath?:string,keepCustomizations=false)=>{
      const current=jobRef.current;
      if(!current?.id||!current.version)return Promise.reject(new Error('请重新读取本次更新。'));
      return mutate(()=>updateFlowApi.recover({action,...(rootPath?{rootPath}:{}),keepCustomizations,expectedJobId:current.id!,expectedVersion:current.version!}),action==='install'||action==='restart'||current.runningVersion!==current.version);
    },
  };
}
