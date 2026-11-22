import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { ObjectTabStrip } from '../../workbench/ui/ObjectTabStrip';
import { tabElementId } from '../../workbench/ui/tab-navigation';
import { RepositoryFileBrowser, type RepositoryPreviewFile } from '../../workbench/explorer/RepositoryFileBrowser';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import { DirectoryFileEditor, type FileDraft } from './DirectoryFileEditor';
import type { DirectoryListing, DirectoryRequest, DirectoryScope, DirectorySearchResult, DirectorySelection, FileObservation, WorkbenchFile } from './api';

type FileTab = {key:string;path:string;line?:number;query?:string;source:DirectorySelection|null;location:string};
export function DirectoryExplorer({scope,scopeKey,source,request,active,opened,onSaved,drafts,onSelectSource}: {
  scope:DirectoryScope;scopeKey:string;source:DirectorySelection|null;request:DirectoryRequest;active:boolean;
  opened?:{path:string;line?:number;nonce:number};onSaved():void;drafts:Map<string,FileDraft>;onSelectSource(source:DirectorySelection|null):void;
}) {
  const id=source?.checkoutId??scope.ref.id, panelId=useId();
  const [tabs,setTabs]=useState<FileTab[]>([]), [picked,setPicked]=useState<Record<string,string>>({});
  const selected=tabs.find(tab=>tab.key===picked[id])??{path:'',key:'',line:undefined,query:undefined};
  const [page,setPage]=useState<{key:string;index:number;revision:string}>(), [edit,setEdit]=useState(''), [version,bump]=useState(0);
  const [listing,setListing]=useState<{id:string;folders:Record<string,DirectoryListing>}>({id,folders:{}}), [ignored,setIgnored]=useState(false);
  const folders=listing.id===id?listing.folders:{};
  const [directoryError,setDirectoryError]=useState(''),[editorError,setEditorError]=useState(''), [loadingEditor,setLoadingEditor]=useState(false);
  const [search,setSearch]=useState<{query:string;mode:'name'|'content';showIgnored:boolean}>({query:'',mode:'name',showIgnored:false});
  const [,showDraft]=useState(0);
  const currentEditor=useRef<AbortController|null>(null);
  const loads=useRef(new Map<string,AbortController>()), folderState=useRef(folders);folderState.current=folders;
  const changeSelection=useCallback((relative:string,line?:number,query?:string)=>{
    currentEditor.current?.abort();setLoadingEditor(false);setEditorError('');setEdit('');setPage(undefined);
    if(!relative)return;
    const key=JSON.stringify([scopeKey,id,relative]);
    setTabs(previous=>{
      const tab={key,path:relative,line,query,source:source?{repositoryId:source.repositoryId,checkoutId:source.checkoutId}:null,location:scope.rootPath};
      return previous.some(item=>item.key===key)?previous.map(item=>item.key===key?tab:item):[...previous,tab];
    });
    setPicked(previous=>({...previous,[id]:key}));
  },[scopeKey,id,source?.repositoryId,source?.checkoutId,scope.rootPath]);
  useEffect(()=>{if(opened)changeSelection(opened.path,opened.line);},[opened,changeSelection]);
  useEffect(()=>()=>currentEditor.current?.abort(),[]);
  const loadDirectory=useCallback(async(relative:string,refresh=false)=>{
    if(!refresh&&(folderState.current[relative]||loads.current.has(relative)))return;
    loads.current.get(relative)?.abort();const controller=new AbortController();loads.current.set(relative,controller);
    try {
      const result=await request<DirectoryListing>('directory',{path:relative,showIgnored:ignored},controller.signal);
      if(!controller.signal.aborted){setListing(previous=>({id,folders:{...(previous.id===id?previous.folders:{}),[relative]:result}}));setDirectoryError('');}
    } catch(error) {if(!controller.signal.aborted)setDirectoryError(error instanceof Error?error.message:'目录读取失败。');}
    finally{if(loads.current.get(relative)===controller)loads.current.delete(relative);}
  },[id,request,ignored]);
  useEffect(()=>{setListing({id,folders:{}});void loadDirectory('',true);return()=>{loads.current.forEach(controller=>controller.abort());loads.current.clear();};},[id,loadDirectory]);
  const searchLoader=useCallback((input:typeof search,signal:AbortSignal)=>request<DirectorySearchResult>('search',input,signal),[request]);
  const searchRead=useSourceControlRead(JSON.stringify([id,search]),search,searchLoader,active&&!!search.query);
  const handleSearch=useCallback((query:string,mode:'name'|'content',showIgnored:boolean)=>setSearch({query,mode,showIgnored}),[]);
  const fileLoader=useCallback((input:{path:string;line?:number;matchQuery?:string;page?:number;expectedRevision?:string},signal:AbortSignal)=>request<WorkbenchFile>('file',input,signal),[request]);
  const activePage=page?.key===selected.key?page:undefined;
  const fileInput=useMemo(()=>({path:selected.path,...(activePage?{page:activePage.index,expectedRevision:activePage.revision}:{line:selected.line,matchQuery:selected.query})}),[selected,activePage]);
  const read=useSourceControlRead(JSON.stringify([id,fileInput]),fileInput,fileLoader,active&&!!selected.path,String(version));
  const file=read.data;
  const entries=useMemo(()=>Object.values(folders).flatMap(result=>result.entries.map(item=>({path:item.path,content:'',kind:'text' as const,ignored:item.ignored,directory:item.kind==='directory',link:item.kind==='link'}))),[folders]);
  const files:RepositoryPreviewFile[]=file?[{path:file.path,content:file.content,kind:file.kind,image:file.kind==='image'?file.content:undefined}]:[];
  const draftKey=selected.key, draft=drafts.get(draftKey);
  const editing=edit===draftKey&&draft;
  const openEditor=async()=>{
    if(draft){setEdit(draftKey);return;}
    currentEditor.current?.abort();const controller=new AbortController();currentEditor.current=controller;
    setLoadingEditor(true);setEditorError('');
    try{
      const observed=await request<FileObservation>('editor',{path:selected.path},controller.signal);if(controller.signal.aborted)return;
      drafts.set(draftKey,{observation:observed,content:observed.content});setEdit(draftKey);
    }catch(error){if(!controller.signal.aborted)setEditorError(error instanceof Error?error.message:'文件暂不能编辑。');}
    finally{if(!controller.signal.aborted)setLoadingEditor(false);}
  };
  const refresh=()=>{setPage(undefined);void Promise.all(Object.keys({...folders,'':null}).map(folder=>loadDirectory(folder,true)));bump(value=>value+1);};
  const searchResults=searchRead.data?.matches.map(item=>({...item,line:item.line??undefined,repositoryId:id,repositoryName:'',kind:'text' as const,content:''}));
  const notes=[directoryError,searchRead.error,...(searchRead.data?.diagnostics.map(item=>item.message)||[]),Object.values(folders).some(item=>item.truncated)?'目录达到读取上限。':''].filter(Boolean);
  const readerActions=file&&<div className="harness-directory-file-actions"><Space wrap>
      {!!file&&!file.truncated&&(file.kind==='text'||file.kind==='markdown')&&<Button size="small" loading={loadingEditor} onClick={()=>editing?setEdit(''):void openEditor()}>{editing?'返回阅读':draft&&draft.content!==draft.observation.content?'继续编辑草稿':'编辑文件'}</Button>}
      {editing&&<Button size="small" onClick={()=>{if(draft.content===draft.observation.content||window.confirm('仅丢弃此文件未保存的网页草稿？磁盘文件不受影响。')){drafts.delete(draftKey);setEdit('');bump(value=>value+1);}}}>关闭编辑</Button>}
      {selected.path&&<code>{selected.path}</code>}
    </Space></div>;
  const tabItems=tabs.map(tab=>{
    const name=tab.path.split('/').at(-1)??tab.path;
    const duplicate=tabs.some(other=>other.key!==tab.key&&other.path.split('/').at(-1)===name);
    const label=duplicate?(tab.location.split(/[\\/]/).at(-1)??tab.location)+' · '+tab.path:name;
    return {key:tab.key,kind:/\.md$/i.test(tab.path)?'doc' as const:'svc' as const,title:tab.location+'/'+tab.path,label,accessibleLabel:label,closeLabel:'关闭文件 '+label};
  });
  return <div className="harness-directory-explorer">
    {tabs.length>0&&<ObjectTabStrip className="harness-file-tabs" label="打开的文件" panelId={panelId} active={selected.key} tabs={tabItems} onActivate={key=>{
      const tab=tabs.find(item=>item.key===key);if(!tab)return;
      setPicked(previous=>({...previous,[tab.source?.checkoutId??scope.ref.id]:key}));
      if(tab.source?.checkoutId!==source?.checkoutId)onSelectSource(tab.source);
      setPage(undefined);setEdit('');
    }} onClose={key=>{
      const closing=tabs.find(item=>item.key===key);if(!closing)return;
      const rest=tabs.filter(item=>item.key!==key);setTabs(rest);
      const checkout=closing.source?.checkoutId??scope.ref.id;
      setPicked(previous=>previous[checkout]===key?{...previous,[checkout]:rest.find(item=>(item.source?.checkoutId??scope.ref.id)===checkout)?.key??''}:previous);
    }}/>}
    <div id={panelId} className="harness-file-tab-content" role={selected.key?'tabpanel':undefined} aria-labelledby={selected.key?tabElementId(panelId,selected.key):undefined}>
    {editorError&&<Alert type="warning" showIcon message={editorError}/>}
    <RepositoryFileBrowser treeOnRight compactWorkspace readerActions={readerActions} context={scope.name||'当前目录'} location={scope.rootPath} version="当前目录" files={files}
      treeRepositories={[{id,name:scope.name||'当前目录',location:scope.rootPath,files:entries}]} selectedRepositoryId={id} selectedPath={selected.path}
      onSelect={changeSelection} onSelectRepositoryFile={(_id,relative,line,query)=>changeSelection(relative,line,query)}
      onLoadDirectory={(_id,relative)=>loadDirectory(relative)} loadedDirectoryKeys={Object.keys(folders).map(folder=>id+'::'+folder)}
      onSearch={handleSearch} searchResults={searchResults} searchLoading={searchRead.loading} searchIncomplete={Boolean(searchRead.error||searchRead.data?.truncated)}
      onShowIgnored={setIgnored} onRefreshDirectories={refresh} onRetry={refresh} onViewCurrent={()=>{setPage(undefined);bump(value=>value+1);}}
      revealSelectionRequest={opened?.nonce} focusRequest={opened?.nonce} focusLine={selected.line} readMatchQuery={selected.query} selectionKey={draftKey}
      treeNotice={notes.length?<Alert type="warning" showIcon message={notes.join('；')}/>:undefined}
      readLoading={read.loading} readError={read.error} readMessage={file?.message} sizeBytes={file?.sizeBytes} readPage={file?.page} onReadPage={index=>{if(file?.revision)setPage({key:selected.key,index,revision:file.revision});}}
      onOpenFolder={file&&!read.loading&&!read.error?()=>request('open-folder',{path:selected.path}):undefined}
      canModify={false} readerContent={editing?draft.content:undefined}
      readerSurface={editing?<DirectoryFileEditor key={draftKey} path={selected.path} draft={draft}
        request={request} onSaved={()=>{bump(value=>value+1);onSaved();}}
        onChange={next=>{drafts.set(draftKey,next);showDraft(value=>value+1);}}/>:undefined} />
    </div>
  </div>;
}
