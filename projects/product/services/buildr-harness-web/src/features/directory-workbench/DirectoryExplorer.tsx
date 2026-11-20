import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { RepositoryFileBrowser, type RepositoryPreviewFile } from '../../workbench/explorer/RepositoryFileBrowser';
import { useSourceControlRead } from '../../workbench/source-control/useSourceControlRead';
import { DirectoryFileEditor, type FileDraft } from './DirectoryFileEditor';
import type { DirectoryListing, DirectoryRequest, DirectoryScope, DirectorySearchResult, FileObservation, WorkbenchFile } from './api';

export function DirectoryExplorer({scope,request,active,opened,onSaved,drafts}: {
  scope:DirectoryScope; request:DirectoryRequest; active:boolean; opened?:{path:string;nonce:number}; onSaved():void; drafts:Map<string,FileDraft>;
}) {
  const id=scope.ref.id;
  const [selected,setSelected]=useState<{path:string;line?:number;query?:string}>({path:''});
  const [page,setPage]=useState<number>(), [edit,setEdit]=useState(''), [version,bump]=useState(0);
  const [folders,setFolders]=useState<Record<string,DirectoryListing>>({}), [ignored,setIgnored]=useState(false);
  const [directoryError,setDirectoryError]=useState(''),[editorError,setEditorError]=useState(''), [loadingEditor,setLoadingEditor]=useState(false);
  const [search,setSearch]=useState<{query:string;mode:'name'|'content';showIgnored:boolean}>({query:'',mode:'name',showIgnored:false});
  const [,showDraft]=useState(0);
  const currentEditor=useRef<AbortController|null>(null);
  const loads=useRef(new Map<string,AbortController>()), folderState=useRef(folders);folderState.current=folders;
  const changeSelection=useCallback((relative:string,line?:number,query?:string)=>{
    currentEditor.current?.abort();setLoadingEditor(false);setEditorError('');setEdit('');setPage(undefined);setSelected({path:relative,line,query});
  },[]);
  useEffect(()=>{if(opened)changeSelection(opened.path);},[opened,changeSelection]);
  useEffect(()=>()=>currentEditor.current?.abort(),[]);
  const loadDirectory=useCallback(async(relative:string,refresh=false)=>{
    if(!refresh&&(folderState.current[relative]||loads.current.has(relative)))return;
    loads.current.get(relative)?.abort();const controller=new AbortController();loads.current.set(relative,controller);
    try {
      const result=await request<DirectoryListing>('directory',{path:relative,showIgnored:ignored},controller.signal);
      if(!controller.signal.aborted){setFolders(previous=>({...previous,[relative]:result}));setDirectoryError('');}
    } catch(error) {if(!controller.signal.aborted)setDirectoryError(error instanceof Error?error.message:'目录读取失败。');}
    finally{if(loads.current.get(relative)===controller)loads.current.delete(relative);}
  },[request,ignored]);
  useEffect(()=>{setFolders({});void loadDirectory('',true);return()=>{loads.current.forEach(controller=>controller.abort());loads.current.clear();};},[loadDirectory]);
  const searchLoader=useCallback((input:typeof search,signal:AbortSignal)=>request<DirectorySearchResult>('search',input,signal),[request]);
  const searchRead=useSourceControlRead(JSON.stringify(search),search,searchLoader,active&&!!search.query);
  const handleSearch=useCallback((query:string,mode:'name'|'content',showIgnored:boolean)=>setSearch({query,mode,showIgnored}),[]);
  const fileLoader=useCallback((input:{path:string;line?:number;matchQuery?:string;page?:number},signal:AbortSignal)=>request<WorkbenchFile>('file',input,signal),[request]);
  const fileInput=useMemo(()=>({path:selected.path,...(page===undefined?{line:selected.line,matchQuery:selected.query}:{page})}),[selected,page]);
  const read=useSourceControlRead(JSON.stringify(fileInput),fileInput,fileLoader,active&&!!selected.path,String(version));
  const file=read.data;
  const entries=useMemo(()=>Object.values(folders).flatMap(result=>result.entries.map(item=>({path:item.path,content:'',kind:'text' as const,ignored:item.ignored,directory:item.kind==='directory',link:item.kind==='link'}))),[folders]);
  const files:RepositoryPreviewFile[]=file?[{path:file.path,content:file.content,kind:file.kind,image:file.kind==='image'?file.content:undefined}]:[];
  const draftKey=JSON.stringify([scope.ref.id,scope.revision,selected.path]), draft=drafts.get(draftKey);
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
  const refresh=()=>{void Promise.all(Object.keys({...folders,'':null}).map(folder=>loadDirectory(folder,true)));bump(value=>value+1);};
  const searchResults=searchRead.data?.matches.map(item=>({...item,line:item.line??undefined,repositoryId:id,repositoryName:'',kind:'text' as const,content:''}));
  const notes=[directoryError,searchRead.error,...(searchRead.data?.diagnostics.map(item=>item.message)||[]),Object.values(folders).some(item=>item.truncated)?'目录达到读取上限。':''].filter(Boolean);
  const readerActions=file&&<div className="harness-directory-file-actions"><Space wrap>
      {!!file&&!file.truncated&&(file.kind==='text'||file.kind==='markdown')&&<Button size="small" loading={loadingEditor} onClick={()=>editing?setEdit(''):void openEditor()}>{editing?'返回阅读':draft&&draft.content!==draft.observation.content?'继续编辑草稿':'编辑文件'}</Button>}
      {editing&&<Button size="small" onClick={()=>{if(draft.content===draft.observation.content||window.confirm('仅丢弃此文件未保存的网页草稿？磁盘文件不受影响。')){drafts.delete(draftKey);setEdit('');bump(value=>value+1);}}}>关闭编辑</Button>}
      {selected.path&&<code>{selected.path}</code>}
    </Space></div>;
  return <div className="harness-directory-explorer">
    {editorError&&<Alert type="warning" showIcon message={editorError}/>}
    <RepositoryFileBrowser treeOnRight compactWorkspace readerActions={readerActions} context={scope.name||'当前目录'} location={scope.rootPath} version="当前目录" files={files}
      treeRepositories={[{id,name:scope.name||'当前目录',location:scope.rootPath,files:entries}]} selectedRepositoryId={id} selectedPath={selected.path}
      onSelect={changeSelection} onSelectRepositoryFile={(_id,relative,line,query)=>changeSelection(relative,line,query)}
      onLoadDirectory={(_id,relative)=>loadDirectory(relative)} loadedDirectoryKeys={Object.keys(folders).map(folder=>id+'::'+folder)}
      onSearch={handleSearch} searchResults={searchResults} searchLoading={searchRead.loading} searchIncomplete={Boolean(searchRead.error||searchRead.data?.truncated)}
      onShowIgnored={setIgnored} onRefreshDirectories={refresh} onRetry={refresh} onViewCurrent={()=>{setPage(undefined);bump(value=>value+1);}}
      focusLine={selected.line} readMatchQuery={selected.query} selectionKey={draftKey}
      treeNotice={notes.length?<Alert type="warning" showIcon message={notes.join('；')}/>:undefined}
      readLoading={read.loading} readError={read.error} readMessage={file?.message} sizeBytes={file?.sizeBytes} readPage={file?.page} onReadPage={setPage}
      canModify={false} readerContent={editing?draft.content:undefined}
      readerSurface={editing?<DirectoryFileEditor key={draftKey} path={selected.path} draft={draft}
        request={request} onSaved={()=>{bump(value=>value+1);onSaved();}}
        onChange={next=>{drafts.set(draftKey,next);showDraft(value=>value+1);}}/>:undefined} />
  </div>;
}
