import { useCallback, useEffect, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { catalogChanged } from '../api/asset-catalog-api';
import { workspaceApi, type WorkspaceCompositionResponse } from '../api/workspace-api';
import { retainComposition } from './composition-data';

export function useWorkspaceComposition(enabled=true) {
  const {workspaceId}=useAppShell();
  const [snapshot,setSnapshot]=useState<{workspaceId:string|null;data:WorkspaceCompositionResponse|null}>({workspaceId:null,data:null});
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const reload=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    if(!enabled)return;
    const visible=()=>{if(document.visibilityState==='visible')reload();};
    window.addEventListener(catalogChanged,reload);window.addEventListener('focus',reload);document.addEventListener('visibilitychange',visible);
    return()=>{window.removeEventListener(catalogChanged,reload);window.removeEventListener('focus',reload);document.removeEventListener('visibilitychange',visible);};
  },[enabled,reload]);
  useEffect(()=>{
    if(!enabled||!workspaceId)return;
    const abort=new AbortController();setLoading(true);setError('');
    void workspaceApi.composition({signal:abort.signal}).then(data=>{
      if(!abort.signal.aborted&&data.workspaceId===workspaceId)setSnapshot(previous=>({workspaceId,data:retainComposition(previous.workspaceId===workspaceId?previous.data:null,data)}));
    }).catch(error=>{if(!abort.signal.aborted)setError(error instanceof Error?error.message:'组成暂时无法读取');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[workspaceId,enabled,revision]);
  return {data:snapshot.workspaceId===workspaceId?snapshot.data:null,error,loading,reload};
}
