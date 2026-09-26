import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from 'antd';
import { taskApi } from '../api/task-api';
import { PrototypeTab } from '../components/PrototypeTab';
import { prototypeEntries, type UiPrototypeData } from '../components/prototype-content';

/** Deliberately outside AppLayout: only the trusted reader owns a task-scoped request. */
export function PrototypeReaderPage() {
  const {workspaceId='',taskId=''} = useParams();
  const [search,setSearch] = useSearchParams();
  const [loaded,setLoaded] = useState<{scope:string;data:UiPrototypeData}|null>(null),[error,setError] = useState<string|null>(null),[loading,setLoading] = useState(true),[revision,setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(null);
    void taskApi.prototypes(taskId,{signal:abort.signal},workspaceId).then(value => { if (!abort.signal.aborted) setLoaded({scope:`${workspaceId}:${taskId}`,data:value as UiPrototypeData}); }).catch(error => {if(!abort.signal.aborted) setError(error.message);}).finally(() => {if(!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  },[workspaceId,taskId,revision]);
  const data = loaded?.scope === `${workspaceId}:${taskId}` ? loaded.data : null;
  const entries = prototypeEntries(data), selected = entries.find(entry => entry.key === search.get('page')) || entries[0];
  const select = (key:string) => setSearch({page:key},{replace:true});
  return <main className="prototype-standalone"><nav aria-label="原型页面列表"><h1>界面原型</h1>{entries.map(entry => <Button key={entry.key} type={entry.key===selected?.key?'primary':'text'} onClick={() => select(entry.key)}>{entry.scene.title}{(data?.prototypes.length || 0)>1 && <small>{entry.file.project}/{entry.file.change}</small>}</Button>)}</nav>
    <PrototypeTab active standalone workspaceId={workspaceId} data={data} loading={loading} error={error} onRefresh={() => setRevision(value => value+1)} selectedKey={selected?.key} initialState={search.get('state') || ''} onSelect={select} />
  </main>;
}
