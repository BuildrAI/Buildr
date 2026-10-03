import { useCallback, useEffect, useRef, useState } from 'react';
import { codeApi, type CodeCatalog, type CodeDirectory, type CodeFile, type CodeLocation, type CodeSearch } from '../api/code-api';
import { codeBrowserKey, codeCheckoutKey, codeFileKey, codeLocationKey, type CodeFileTab, type CodeTaskEntry } from '../code-navigation';
import { codeFilterMembers, codeFilterOptions, retainCodeSelections, selectCodeWorktreeGroup } from '../code-filters';
import { repositorySearchQuery } from '../../workspace/components/repository-search-query';
const failure=(error:unknown)=>error instanceof Error?error.message:'当前内容不可读取。';
type CachedCodeFile=CodeFile & {observedMatch?:{line:number;query:string}};
export function useCodeExplorer(workspaceId:string) {
  const [catalog,setCatalog]=useState<CodeCatalog|null>(null);
  const [scope,setScope]=useState<string[]>([]),[worktreeScope,setWorktreeScope]=useState<string|undefined>('main');
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
  const [searchResults,setSearchResults]=useState<Array<CodeSearch & {browserId:string;repositoryId:string}>>([]),[searchLoading,setSearchLoading]=useState(false),[searchErrors,setSearchErrors]=useState<string[]>([]);
  const [entry,setEntry]=useState<CodeTaskEntry|null>(null);
  const controllers=useRef(new Set<AbortController>()),epoch=useRef(0),pending=useRef(new Map<string,Promise<void>>());
  const entrySequence=useRef(0),fileSequence=useRef(new Map<string,number>()),directorySequence=useRef(new Map<string,number>());
  const catalogSequence=useRef(0);
  const focusSequence=useRef(0);
  const latestCatalog=useRef<CodeCatalog|null>(null);
  const members=codeFilterMembers(catalog,scope,worktreeScope);
  const sources=members.map(member=>{
    const observed={repositoryId:member.repositoryId,checkoutId:member.id};
    const source=locations[codeCheckoutKey(observed)]||observed;
    return {id:codeBrowserKey(source),source,member};
  });
  const filterOptions=codeFilterOptions(catalog,scope,worktreeScope);
  const selectedIds=[...new Set(sources.map(item=>item.source.repositoryId))];
  const selectedLocationsKey=JSON.stringify(sources.map(item=>item.id));
  const current=useRef({directories,files,catalog,tabs,sources,worktreeScope});current.current={directories,files,catalog,tabs,sources,worktreeScope};
  const run=useCallback(async<T,>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
    const controller=new AbortController();controllers.current.add(controller);
    try{return await operation(controller.signal);}finally{controllers.current.delete(controller);}
  },[]);
  useEffect(()=>{
    epoch.current++;const version=epoch.current,sequence=++catalogSequence.current;
    void run(signal=>codeApi.repositories(workspaceId,undefined,signal)).then(value=>{if(version===epoch.current&&sequence===catalogSequence.current){latestCatalog.current=value;setCatalog(value);}}).catch(error=>{if(version===epoch.current&&sequence===catalogSequence.current)setCatalogError(failure(error));});
    return()=>{epoch.current++;controllers.current.forEach(c=>c.abort());controllers.current.clear();pending.current.clear();};
  },[workspaceId,run]);
  const locationFor=useCallback((browserId:string)=>current.current.sources.find(item=>item.id===browserId)?.source,[]);
  const directoryKey=useCallback((source:CodeLocation,path:string)=>codeLocationKey(source)+':'+String(showIgnored)+':'+path,[showIgnored]);
  const loadDirectory=useCallback((browserId:string,path:string,force=false,explicit?:CodeLocation):Promise<void>=>{
    const source=explicit||locationFor(browserId);if(!source)return Promise.resolve();
    const key=directoryKey(source,path),version=epoch.current;
    if(!force&&current.current.directories[key])return Promise.resolve();
    const existing=pending.current.get(key);if(existing&&!force)return existing;
    const sequence=(directorySequence.current.get(key)||0)+1;directorySequence.current.set(key,sequence);
    const promise=run(signal=>codeApi.directory(workspaceId,{...source,path,showIgnored},signal)).then(value=>{
      if(version!==epoch.current||directorySequence.current.get(key)!==sequence)return;
      setDirectories(previous=>({...previous,[key]:value}));setDirectoryErrors(previous=>{const next={...previous};delete next[key];return next;});
    }).catch(error=>{if(version===epoch.current&&directorySequence.current.get(key)===sequence&&!String(error).includes('AbortError'))setDirectoryErrors(previous=>({...previous,[key]:failure(error)}));}).finally(()=>{if(pending.current.get(key)===promise)pending.current.delete(key);});
    pending.current.set(key,promise);return promise;
  },[workspaceId,locationFor,directoryKey,showIgnored,run]);
  useEffect(()=>{for(const item of sources)void loadDirectory(item.id,'',false,item.source);},[selectedLocationsKey,loadDirectory]);
  const loadFile=useCallback(async(tab:CodeFileTab,force=false,page?:number)=>{
    const cached=current.current.files[tab.key];
    const cachedTarget=cached?.page&&tab.line&&tab.line>=cached.page.startLine&&tab.line<=cached.page.endLine;
    const cachedMatch=!tab.matchQuery||cached?.observedMatch?.line===tab.line&&cached?.observedMatch?.query===tab.matchQuery;
    if(!force&&page===undefined&&cached&&(!tab.line||!cached.page||cachedTarget&&cachedMatch))return;
    if(page!==undefined&&(!cached?.page||page<0||page>=cached.page.total))return;
    const version=epoch.current,sequence=(fileSequence.current.get(tab.key)||0)+1;fileSequence.current.set(tab.key,sequence);setLoading(previous=>[...new Set([...previous,tab.key])]);
    const isCurrent=()=>version===epoch.current&&fileSequence.current.get(tab.key)===sequence;
    try{
      const value:CachedCodeFile=await run(signal=>codeApi.file(workspaceId,{repositoryId:tab.repositoryId,checkoutId:tab.checkoutId,taskId:tab.taskId,commitHash:tab.commitHash,path:tab.path,page,line:page===undefined?tab.line:undefined,matchQuery:page===undefined&&tab.line?tab.matchQuery:undefined,expectedRevision:!force&&cached?cached.revision:undefined},signal));
      if(page!==undefined&&value.page&&cached?.page&&value.revision===cached.revision){value.page={...value.page,matchOffset:cached.page.matchOffset,matchEndOffset:cached.page.matchEndOffset};value.observedMatch=cached.observedMatch;}
      else if(tab.line&&tab.matchQuery)value.observedMatch={line:tab.line,query:tab.matchQuery};
      if(isCurrent()&&current.current.tabs.some(t=>t.key===tab.key)){setFiles(previous=>Object.fromEntries([...Object.entries(previous).filter(([key])=>key!==tab.key).slice(-7),[tab.key,value]]));setFileErrors(previous=>{const next={...previous};delete next[tab.key];return next;});}
    }
    catch(error){if(isCurrent()&&!String(error).includes('AbortError')){setFileErrors(previous=>({...previous,[tab.key]:failure(error)}));setFiles(previous=>{const next={...previous};delete next[tab.key];return next;});}}
    finally{if(isCurrent())setLoading(previous=>previous.filter(key=>key!==tab.key));}
  },[workspaceId,run]);
  const open=useCallback((source:CodeLocation,path:string,line?:number,force=false,matchQuery?:string)=>{
    const tab={...source,path,line,matchQuery,focusRequest:line?++focusSequence.current:undefined,key:codeFileKey(source,path)};
    setLocations(previous=>codeLocationKey(previous[codeCheckoutKey(source)]||{repositoryId:source.repositoryId,checkoutId:source.checkoutId})===codeLocationKey(source)?previous:{...previous,[codeCheckoutKey(source)]:source});
    setTabs(previous=>{const found=previous.find(t=>t.key===tab.key);return found?previous.map(t=>t.key===tab.key?tab:t):[...previous,tab];});
    setActiveKey(tab.key);void loadFile(tab,force);
    const parents=path.split('/').slice(0,-1),browserId=codeBrowserKey(source);void loadDirectory(browserId,'',false,source);
    parents.forEach((_,index)=>void loadDirectory(browserId,parents.slice(0,index+1).join('/'),false,source));
  },[loadFile,loadDirectory]);
  const applyEntry=useCallback(async(next:CodeTaskEntry)=>{
    setEntry(next);setCatalogError('');const version=epoch.current,sequence=++entrySequence.current,catalogRequest=++catalogSequence.current;
    try{
      const value=await run(signal=>codeApi.repositories(workspaceId,next.taskId,signal));if(version!==epoch.current||entrySequence.current!==sequence)return;
      if(catalogRequest===catalogSequence.current){latestCatalog.current=value;setCatalog(value);}
      setScope(value.selectedRepositoryIds);setWorktreeScope(value.selectedWorktreeGroupIds[0]);setOrigin(value.scopeReason);
      if(next.file){
        const candidates=value.repositories.filter(r=>r.gitId===next.file!.gitRepositoryId);
        const scoped=candidates.filter(r=>value.selectedRepositoryIds.includes(r.id));const resolved=scoped.length===1?scoped:candidates;
        if(resolved.length!==1){setCatalogError('任务文件的代码库身份无法唯一确定，请从目录选择代码库。');return;}
        const repositoryId=resolved[0].id;
        const possible=value.worktrees.filter(member=>member.repositoryId===repositoryId&&value.selectedWorktreeGroupIds.includes(member.groupId));
        const member=next.file.checkoutId?value.worktrees.find(item=>item.repositoryId===repositoryId&&item.id===next.file!.checkoutId):possible.length===1?possible[0]:undefined;
        if(!member&&!next.file.checkoutId&&!next.file.commitHash){setCatalogError('任务文件的工作树无法唯一确定，请从目录选择实际来源。');return;}
        if(!value.selectedRepositoryIds.includes(repositoryId))setScope([...value.selectedRepositoryIds,repositoryId]);
        if(member)setWorktreeScope(member.groupId);
        open({repositoryId,checkoutId:next.file.checkoutId||member?.id,commitHash:next.file.commitHash},next.file.path,next.file.line,true);
      }
    }catch(error){if(version===epoch.current&&entrySequence.current===sequence)setCatalogError(failure(error));}
  },[workspaceId,run,open]);
  const search=useCallback((value:string,mode:'name'|'content')=>{const query=repositorySearchQuery(value);setSearchInput(previous=>previous.query===query&&previous.mode===mode?previous:{query,mode});},[]);
  useEffect(()=>{
    let alive=true;const abort=new AbortController();setSearchResults([]);setSearchErrors([]);
    if(!repositorySearchQuery(searchInput.query)){setSearchLoading(false);return;}
    setSearchLoading(true);
    const timer=setTimeout(()=>{void Promise.allSettled(sources.map(item=>codeApi.search(workspaceId,{...item.source,query:searchInput.query,mode:searchInput.mode,showIgnored},abort.signal))).then(results=>{
      if(!alive)return;setSearchResults(results.flatMap((result,index)=>result.status==='fulfilled'?[{...result.value,browserId:sources[index].id,repositoryId:sources[index].source.repositoryId}]:[]));setSearchErrors(results.flatMap(result=>result.status==='rejected'?[failure(result.reason)]:[]));setSearchLoading(false);
    });},300);
    return()=>{alive=false;abort.abort();clearTimeout(timer);};
  },[workspaceId,selectedLocationsKey,showIgnored,searchInput,searchRefresh]);
  const active=tabs.find(tab=>tab.key===activeKey)||null;
  const readPage=useCallback((index:number)=>{
    if(!active)return;
    const tab={...active,line:undefined,focusRequest:undefined};
    setTabs(previous=>previous.map(item=>item.key===tab.key?tab:item));
    void loadFile(tab,false,index);
  },[active,loadFile]);
  useEffect(()=>{const keys=new Set(tabs.map(tab=>tab.key));setFiles(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>keys.has(key))));},[tabs.map(tab=>tab.key).join('|')]);
  useEffect(()=>{
    for(const item of current.current.sources){
      const prefix=codeLocationKey(item.source)+':';
      const paths=new Set(['',...Object.keys(current.current.directories).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length).replace(/^(?:true|false):/,''))]);
      for(const path of paths)void loadDirectory(item.id,path,false,item.source);
    }
  },[showIgnored,loadDirectory]);
  const refresh=useCallback(async()=>{
    const version=epoch.current,sequence=entrySequence.current,catalogRequest=++catalogSequence.current;
    const value=await run(signal=>codeApi.repositories(workspaceId,entry?.taskId,signal));if(version!==epoch.current||sequence!==entrySequence.current||catalogRequest!==catalogSequence.current)return;
    latestCatalog.current=value;setCatalog(previous=>retainCodeSelections(value,previous,current.current.worktreeScope));setCatalogError('');
    setSearchRefresh(previous=>previous+1);
    await Promise.allSettled(current.current.sources.flatMap(item=>{
      const prefix=directoryKey(item.source,'');
      const paths=new Set(['',...Object.keys(current.current.directories).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length)),...Object.keys(directoryErrors).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length))]);
      return [...paths].map(path=>loadDirectory(item.id,path,true,item.source));
    }));
    if(active)await loadFile(active,true);
  },[workspaceId,entry?.taskId,active,loadDirectory,loadFile,run,directoryErrors,directoryKey]);
  return {catalog,catalogError,scope,worktreeScope,origin,locations,sources,filterOptions,directories,directoryErrors,tabs,active,files,fileErrors,loading,showIgnored,searchResults,searchLoading,searchErrors,entry,selectedIds,
    locationFor,directoryKey,loadDirectory,open,applyEntry,search,setShowIgnored,refresh,readPage,
    setWorktreeScope:(id:string|undefined)=>{
      const previousId=current.current.worktreeScope,latest=latestCatalog.current;
      if(latest)setCatalog(observed=>selectCodeWorktreeGroup(latest,observed,previousId,id));
      setWorktreeScope(id);
    },
    setScope:(ids:string[])=>{setScope(ids);setOrigin(ids.length?'自选 '+ids.length+' 个代码库':'显示全部代码库');},
    activate:(tab:CodeFileTab)=>open(tab,tab.path),
    close:(key:string)=>{const remaining=tabs.filter(tab=>tab.key!==key);setTabs(remaining);setFiles(previous=>{const next={...previous};delete next[key];return next;});if(key===activeKey)setActiveKey(remaining.at(-1)?.key||'');},
  };
}
