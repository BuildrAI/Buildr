import { useCallback, useEffect, useRef, useState } from 'react';
import { codeApi, type CodeCatalog, type CodeDirectory, type CodeFile, type CodeLocation, type CodeSearch } from '../api/code-api';
import { codeFileKey, codeLocationKey, type CodeFileTab, type CodeTaskEntry } from '../code-navigation';
import { repositorySearchQuery } from '../../workspace/components/repository-search-query';
const failure=(error:unknown)=>error instanceof Error?error.message:'当前内容不可读取。';
type CachedCodeFile=CodeFile & {observedMatch?:{line:number;query:string}};
export function useCodeExplorer(workspaceId:string) {
  const [catalog,setCatalog]=useState<CodeCatalog|null>(null);
  const [scope,setScope]=useState<string[]>([]);
  const [origin,setOrigin]=useState('显示全部代码库');
  const [locations,setLocations]=useState<Record<string,CodeLocation>>({});
  const [directories,setDirectories]=useState<Record<string,CodeDirectory>>({});
  const [directoryErrors,setDirectoryErrors]=useState<Record<string,string>>({});
  const [tabs,setTabs]=useState<CodeFileTab[]>([]),[activeKey,setActiveKey]=useState('');
  const [files,setFiles]=useState<Record<string,CachedCodeFile>>({}),[fileErrors,setFileErrors]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState<string[]>([]),[catalogError,setCatalogError]=useState('');
  const [showIgnored,setShowIgnored]=useState(false);
  const [searchInput,setSearchInput]=useState({query:'',mode:'name' as 'name'|'content'});
  const [searchRefresh,setSearchRefresh]=useState(0);
  const [searchResults,setSearchResults]=useState<Array<CodeSearch & {repositoryId:string}>>([]),[searchLoading,setSearchLoading]=useState(false),[searchErrors,setSearchErrors]=useState<string[]>([]);
  const [entry,setEntry]=useState<CodeTaskEntry|null>(null);
  const controllers=useRef(new Set<AbortController>()),epoch=useRef(0),pending=useRef(new Map<string,Promise<void>>());
  const entrySequence=useRef(0),fileSequence=useRef(new Map<string,number>()),directorySequence=useRef(new Map<string,number>());
  const focusSequence=useRef(0);
  const current=useRef({locations,directories,files,scope,catalog,tabs});current.current={locations,directories,files,scope,catalog,tabs};
  const run=useCallback(async<T,>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
    const controller=new AbortController();controllers.current.add(controller);
    try{return await operation(controller.signal);}finally{controllers.current.delete(controller);}
  },[]);
  useEffect(()=>{epoch.current++;const version=epoch.current;void run(signal=>codeApi.repositories(workspaceId,undefined,signal)).then(value=>{if(version===epoch.current)setCatalog(value);}).catch(error=>{if(version===epoch.current)setCatalogError(failure(error));});return()=>{epoch.current++;controllers.current.forEach(c=>c.abort());controllers.current.clear();pending.current.clear();};},[workspaceId,run]);
  const selectedIds=scope.length?scope:(catalog?.repositories||[]).map(r=>r.id);
  const locationFor=useCallback((repositoryId:string)=>current.current.locations[repositoryId]||{repositoryId},[]);
  const selectedLocationsKey=JSON.stringify(selectedIds.map(id=>codeLocationKey(locationFor(id))));
  const directoryKey=useCallback((source:CodeLocation,path:string)=>codeLocationKey(source)+':'+String(showIgnored)+':'+path,[showIgnored]);
  const loadDirectory=useCallback((repositoryId:string,path:string,force=false,explicit?:CodeLocation):Promise<void>=>{
    const source=explicit||locationFor(repositoryId),key=directoryKey(source,path),version=epoch.current;
    if(!force&&current.current.directories[key])return Promise.resolve();
    const existing=pending.current.get(key);if(existing&&!force)return existing;
    const sequence=(directorySequence.current.get(key)||0)+1;directorySequence.current.set(key,sequence);
    const promise=run(signal=>codeApi.directory(workspaceId,{...source,path,showIgnored},signal)).then(value=>{
      if(version!==epoch.current||directorySequence.current.get(key)!==sequence)return;
      setDirectories(previous=>({...previous,[key]:value}));setDirectoryErrors(previous=>{const next={...previous};delete next[key];return next;});
    }).catch(error=>{if(version===epoch.current&&directorySequence.current.get(key)===sequence&&!String(error).includes('AbortError'))setDirectoryErrors(previous=>({...previous,[key]:failure(error)}));}).finally(()=>{if(pending.current.get(key)===promise)pending.current.delete(key);});
    pending.current.set(key,promise);return promise;
  },[workspaceId,locationFor,directoryKey,showIgnored,run]);
  useEffect(()=>{for(const id of selectedIds)void loadDirectory(id,'');},[selectedIds.join(','),locations,loadDirectory]);
  const loadFile=useCallback(async(tab:CodeFileTab,force=false,page?:number)=>{
    const cached=current.current.files[tab.key];
    const cachedTarget=cached?.page&&tab.line&&tab.line>=cached.page.startLine&&tab.line<=cached.page.endLine;
    const cachedMatch=!tab.matchQuery||cached?.observedMatch?.line===tab.line&&cached?.observedMatch?.query===tab.matchQuery;
    if(!force&&page===undefined&&cached&&(!tab.line||!cached.page||cachedTarget&&cachedMatch))return;
    if(page!==undefined&&(!cached?.page||page<0||page>=cached.page.total))return;
    const version=epoch.current,sequence=(fileSequence.current.get(tab.key)||0)+1;fileSequence.current.set(tab.key,sequence);setLoading(previous=>[...new Set([...previous,tab.key])]);
    const isCurrent=()=>version===epoch.current&&fileSequence.current.get(tab.key)===sequence;
    try{
      const value:CachedCodeFile=await run(signal=>codeApi.file(workspaceId,{repositoryId:tab.repositoryId,taskId:tab.taskId,commitHash:tab.commitHash,path:tab.path,page,line:page===undefined?tab.line:undefined,matchQuery:page===undefined&&tab.line?tab.matchQuery:undefined,expectedRevision:!force&&cached?cached.revision:undefined},signal));
      if(page!==undefined&&value.page&&cached?.page&&value.revision===cached.revision){value.page={...value.page,matchOffset:cached.page.matchOffset,matchEndOffset:cached.page.matchEndOffset};value.observedMatch=cached.observedMatch;}
      else if(tab.line&&tab.matchQuery)value.observedMatch={line:tab.line,query:tab.matchQuery};
      if(isCurrent()&&current.current.tabs.some(t=>t.key===tab.key)){setFiles(previous=>Object.fromEntries([...Object.entries(previous).filter(([key])=>key!==tab.key).slice(-7),[tab.key,value]]));setFileErrors(previous=>{const next={...previous};delete next[tab.key];return next;});}
    }
    catch(error){if(isCurrent()&&!String(error).includes('AbortError'))setFileErrors(previous=>({...previous,[tab.key]:failure(error)}));}
    finally{if(isCurrent())setLoading(previous=>previous.filter(key=>key!==tab.key));}
  },[workspaceId,run]);
  const open=useCallback((source:CodeLocation,path:string,line?:number,force=false,matchQuery?:string)=>{
    const tab={...source,path,line,matchQuery,focusRequest:line?++focusSequence.current:undefined,key:codeFileKey(source,path)};
    setLocations(previous=>codeLocationKey(previous[source.repositoryId]||{repositoryId:source.repositoryId})===codeLocationKey(source)?previous:{...previous,[source.repositoryId]:source});
    setTabs(previous=>{const found=previous.find(t=>t.key===tab.key);return found?previous.map(t=>t.key===tab.key?tab:t):[...previous,tab];});
    setActiveKey(tab.key);void loadFile(tab,force);
    const parents=path.split('/').slice(0,-1);void loadDirectory(source.repositoryId,'',false,source);
    parents.forEach((_,index)=>void loadDirectory(source.repositoryId,parents.slice(0,index+1).join('/'),false,source));
  },[loadFile,loadDirectory]);
  const applyEntry=useCallback(async(next:CodeTaskEntry)=>{
    setEntry(next);setCatalogError('');const version=epoch.current,sequence=++entrySequence.current;
    try{
      const value=await run(signal=>codeApi.repositories(workspaceId,next.taskId,signal));if(version!==epoch.current||entrySequence.current!==sequence)return;
      setCatalog(value);setScope(value.selectedRepositoryIds);setOrigin(value.scopeReason);
      const sources=Object.fromEntries(value.selectedRepositoryIds.map(id=>[id,{repositoryId:id,taskId:next.taskId}]));setLocations(previous=>({...previous,...sources}));
      for(const source of Object.values(sources))void loadDirectory(source.repositoryId,'',true,source);
      if(next.file){
        const candidates=value.repositories.filter(r=>r.gitId===next.file!.gitRepositoryId);
        const scoped=candidates.filter(r=>value.selectedRepositoryIds.includes(r.id));const resolved=scoped.length===1?scoped:candidates;
        if(resolved.length!==1){setCatalogError('任务文件的代码库身份无法唯一确定，请从目录选择代码库。');return;}
        const id=resolved[0].id;if(value.selectedRepositoryIds.length&&!value.selectedRepositoryIds.includes(id))setScope([...value.selectedRepositoryIds,id]);
        open({repositoryId:id,taskId:next.taskId,commitHash:next.file.commitHash},next.file.path,next.file.line,true);
      }
    }catch(error){if(version===epoch.current&&entrySequence.current===sequence)setCatalogError(failure(error));}
  },[workspaceId,run,open,loadDirectory]);
  const search=useCallback((value:string,mode:'name'|'content')=>{const query=repositorySearchQuery(value);setSearchInput(previous=>previous.query===query&&previous.mode===mode?previous:{query,mode});},[]);
  useEffect(()=>{
    let alive=true;const abort=new AbortController();setSearchResults([]);setSearchErrors([]);
    if(!repositorySearchQuery(searchInput.query)){setSearchLoading(false);return;}
    setSearchLoading(true);
    const timer=setTimeout(()=>{void Promise.allSettled(selectedIds.map(id=>codeApi.search(workspaceId,{...locationFor(id),query:searchInput.query,mode:searchInput.mode,showIgnored},abort.signal))).then(results=>{
      if(!alive)return;setSearchResults(results.flatMap((result,index)=>result.status==='fulfilled'?[{...result.value,repositoryId:selectedIds[index]}]:[]));setSearchErrors(results.flatMap(result=>result.status==='rejected'?[failure(result.reason)]:[]));setSearchLoading(false);
    });},300);
    return()=>{alive=false;abort.abort();clearTimeout(timer);};
  },[workspaceId,selectedLocationsKey,showIgnored,searchInput,searchRefresh,locationFor]);
  const active=tabs.find(tab=>tab.key===activeKey)||null;
  const readPage=useCallback((index:number)=>{
    if(!active)return;
    const tab={...active,line:undefined,focusRequest:undefined};
    setTabs(previous=>previous.map(item=>item.key===tab.key?tab:item));
    void loadFile(tab,false,index);
  },[active,loadFile]);
  useEffect(()=>{const keys=new Set(tabs.map(tab=>tab.key));setFiles(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>keys.has(key))));},[tabs.map(tab=>tab.key).join('|')]);
  useEffect(()=>{for(const id of selectedIds){const source=locationFor(id);const paths=new Set(Object.values(current.current.directories).filter(dir=>dir.source.repositoryId===id&&codeLocationKey(dir.source)===codeLocationKey(source)).map(dir=>dir.path));for(const path of paths)void loadDirectory(id,path);}},[showIgnored]);
  const refresh=useCallback(async()=>{
    const value=await run(signal=>codeApi.repositories(workspaceId,entry?.taskId,signal));setCatalog(value);setCatalogError('');
    setSearchRefresh(previous=>previous+1);
    await Promise.allSettled(Object.values(current.current.directories).filter(dir=>selectedIds.includes(dir.source.repositoryId)&&codeLocationKey(dir.source)===codeLocationKey(locationFor(dir.source.repositoryId))).map(dir=>loadDirectory(dir.source.repositoryId,dir.path,true)));
    await Promise.allSettled(selectedIds.flatMap(id=>{const prefix=directoryKey(locationFor(id),'');return Object.keys(directoryErrors).filter(key=>key.startsWith(prefix)).map(key=>loadDirectory(id,key.slice(prefix.length),true));}));
    if(active)await loadFile(active,true);
  },[workspaceId,entry,selectedIds.join(','),active,loadDirectory,loadFile,locationFor,run,directoryErrors,directoryKey]);
  return {catalog,catalogError,scope,origin,locations,directories,directoryErrors,tabs,active,files,fileErrors,loading,showIgnored,searchResults,searchLoading,searchErrors,entry,selectedIds,
    locationFor,directoryKey,loadDirectory,open,applyEntry,search,setShowIgnored,refresh,readPage,
    setScope:(ids:string[])=>{setScope(ids);setOrigin(ids.length?'自选 '+ids.length+' 个代码库':'显示全部代码库');},
    setLocation:(id:string,source:CodeLocation)=>setLocations(previous=>codeLocationKey(previous[id]||{repositoryId:id})===codeLocationKey(source)?previous:{...previous,[id]:source}),
    activate:(tab:CodeFileTab)=>open(tab,tab.path),
    close:(key:string)=>{const remaining=tabs.filter(tab=>tab.key!==key);setTabs(remaining);setFiles(previous=>{const next={...previous};delete next[key];return next;});if(key===activeKey)setActiveKey(remaining.at(-1)?.key||'');},
  };
}
