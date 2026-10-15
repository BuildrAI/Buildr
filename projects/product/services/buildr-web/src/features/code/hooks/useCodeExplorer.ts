import { useCallback, useEffect, useRef, useState } from 'react';
import { codeApi, type CodeCatalog, type CodeDirectory, type CodeFile, type CodeLocation, type CodeSearch } from '../api/code-api';
import { codeBrowserKey, codeCheckoutKey, codeFileKey, codeLocationKey, canonicalCodeLocation, type CodeFileTab, type CodeTaskEntry } from '../code-navigation';
import { codeFilterMembers, codeFilterOptions, retainCodeSelections, selectCodeWorktreeGroup } from '../code-filters';
import { repositorySearchQuery } from '../../workspace/components/repository-search-query';
import { useCodeSourceSelection } from './useCodeSourceSelection';
import { codeSourceSelectionFilter, codeSourceTargetKey } from '../code-source-selection';
import { useSourceControlSummary } from './useSourceControl';
import { planCodeDirectoryRefresh, removedCodeDirectoryPaths, type CodeDirectoryObservation } from '../code-directory-refresh';
const failure=(error:unknown)=>error instanceof Error?error.message:'当前内容不可读取。';
type CachedCodeFile=CodeFile & {observedMatch?:{line:number;query:string}};
export function useCodeExplorer(workspaceId:string,viewActive=true,entryKey?:string) {
  const sourceChoice=useCodeSourceSelection(workspaceId);
  const appliedSourceSequence=useRef(0),explicitEntry=useRef<string|undefined>(undefined);
  if(entryKey&&entryKey!==explicitEntry.current){appliedSourceSequence.current=sourceChoice.selection?.sequence||0;}
  explicitEntry.current=entryKey;
  const sourceControl=useSourceControlSummary(workspaceId);
  useEffect(()=>{if(viewActive)sourceControl.check();},[viewActive,sourceControl.check]);
  const [catalog,setCatalog]=useState<CodeCatalog|null>(null);
  const [scope,setScope]=useState<string[]>([]),[worktreeScope,setWorktreeScope]=useState<string|undefined>('main');
  const [origin,setOrigin]=useState('显示全部代码库');
  const [locations,setLocations]=useState<Record<string,CodeLocation>>({});
  const [directories,setDirectories]=useState<Record<string,CodeDirectory>>({});
  const [directoryErrors,setDirectoryErrors]=useState<Record<string,string>>({});
  const [tabs,setTabs]=useState<CodeFileTab[]>([]),[activeKey,setActiveKey]=useState('');
  const [selectionRequest,setSelectionRequest]=useState(0);
  const [files,setFiles]=useState<Record<string,CachedCodeFile>>({}),[fileErrors,setFileErrors]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState<string[]>([]),[catalogError,setCatalogError]=useState('');
  const [showIgnored,setShowIgnored]=useState(false);
  const [searchInput,setSearchInput]=useState({query:'',mode:'name' as 'name'|'content'});
  const [searchRefresh,setSearchRefresh]=useState(0);
  const [searchResults,setSearchResults]=useState<Array<CodeSearch & {browserId:string;repositoryId:string}>>([]),[searchLoading,setSearchLoading]=useState(false),[searchErrors,setSearchErrors]=useState<string[]>([]);
  const [entry,setEntry]=useState<CodeTaskEntry|null>(null);
  const controllers=useRef(new Set<AbortController>()),epoch=useRef(0),pending=useRef(new Map<string,Promise<void>>());
  const entrySequence=useRef(0),sourceIntentSequence=useRef(0),fileSequence=useRef(new Map<string,number>()),directorySequence=useRef(new Map<string,number>());
  const catalogSequence=useRef(0);
  const focusSequence=useRef(0);
  const observedVersions=useRef(new Map<string,number>()),directoryObservations=useRef(new Map<string,CodeDirectoryObservation>());
  const automaticQueue=useRef(new Map<string,{source:CodeLocation;paths:Set<string>;readFile:boolean}>()),automaticRunning=useRef(false);
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
  const current=useRef({directories,files,catalog,tabs,sources,scope,worktreeScope,entry,activeKey,viewActive});current.current={directories,files,catalog,tabs,sources,scope,worktreeScope,entry,activeKey,viewActive};
  const run=useCallback(async<T,>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
    const controller=new AbortController();controllers.current.add(controller);
    try{return await operation(controller.signal);}finally{controllers.current.delete(controller);}
  },[]);
  useEffect(()=>{
    epoch.current++;const version=epoch.current,sequence=++catalogSequence.current;
    void run(signal=>codeApi.repositories(workspaceId,undefined,signal)).then(value=>{if(version===epoch.current&&(sequence===catalogSequence.current||!latestCatalog.current)){latestCatalog.current=value;setCatalog(value);setCatalogError('');}}).catch(error=>{if(version===epoch.current&&(sequence===catalogSequence.current||!latestCatalog.current))setCatalogError(failure(error));});
    return()=>{epoch.current++;controllers.current.forEach(c=>c.abort());controllers.current.clear();pending.current.clear();};
  },[workspaceId,run]);
  const publishFilters=useCallback((value:CodeCatalog|null,ids:string[],group?:string)=>{
    if(!value)return;
    const targets=codeFilterMembers(value,ids,group).map(member=>({repositoryId:member.repositoryId,checkoutId:member.id}));
    const tab=current.current.tabs.find(tab=>tab.key===current.current.activeKey);
    const preferred=tab?.checkoutId?targets.find(target=>codeSourceTargetKey(target)===codeSourceTargetKey({repositoryId:tab.repositoryId,checkoutId:tab.checkoutId!})):undefined;
    setLocations(previous=>{const next={...previous};for(const target of targets)next[codeCheckoutKey(target)]={...target};return next;});
    sourceChoice.select('explorer',targets,preferred||targets[0]);
  },[sourceChoice.select]);
  useEffect(()=>{
    const selection=sourceChoice.selection;
    if(!viewActive||!catalog||!selection||selection.sequence<=appliedSourceSequence.current)return;
    appliedSourceSequence.current=selection.sequence;
    if(selection.origin==='explorer'||!selection.targets.length)return;
    const apply=(value:CodeCatalog)=>{
      const selected=codeSourceSelectionFilter(value,selection);
      if(selected){
        setScope(selected.repositoryIds);setWorktreeScope(selected.groupId);
        // The shared pointer chooses a current checkout, while a fixed historical
        // file tab keeps its own commit identity and reading state outside this tree.
        setLocations(previous=>{const next={...previous};for(const target of selection.targets)next[codeCheckoutKey(target)]={...target};return next;});
        setOrigin('跟随源代码管理所选目录');setCatalogError('');return true;
      }
      return false;
    };
    ++entrySequence.current;const intent=++sourceIntentSequence.current;
    if(apply(catalog))return;
    // A just-created Git checkout may not yet be in Explorer's initial catalog.
    // Check once by identity; never substitute its path, branch, or registered root.
    const version=epoch.current,request=++catalogSequence.current;
    void run(signal=>codeApi.repositories(workspaceId,undefined,signal)).then(value=>{
      if(version!==epoch.current||intent!==sourceIntentSequence.current||request!==catalogSequence.current)return;
      latestCatalog.current=value;setCatalog(value);
      if(!apply(value)){
        const target=selection.preferredTarget||selection.targets[0];
        setScope([target.repositoryId]);setWorktreeScope('unavailable:'+target.checkoutId);
        setCatalogError('所选工作树身份暂不可确认，保留已打开文件，请重新选择实际来源。');
      }
    }).catch(error=>{if(version===epoch.current&&intent===sourceIntentSequence.current)setCatalogError(failure(error));});
  },[viewActive,catalog,sourceChoice.selection,workspaceId,run]);
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
      const prefix=directoryKey(source,'');
      const removed=removedCodeDirectoryPaths(value,[...directorySequence.current.keys()].filter(candidate=>candidate.startsWith(prefix)).map(candidate=>candidate.slice(prefix.length))).map(path=>prefix+path);
      // Fence pending descendants before removing their directory cache. File tabs and
      // editor snapshots remain available even after their containing directory disappears.
      for(const candidate of removed){directorySequence.current.set(candidate,(directorySequence.current.get(candidate)||0)+1);pending.current.delete(candidate);}
      const apply=(previous:Record<string,CodeDirectory>)=>{const next={...previous,[key]:value};for(const candidate of removed)delete next[candidate];return next;};
      current.current.directories=apply(current.current.directories);setDirectories(apply);
      setDirectoryErrors(previous=>{const next={...previous};delete next[key];for(const candidate of removed)delete next[candidate];return next;});
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
    catch(error){if(isCurrent()&&!String(error).includes('AbortError'))setFileErrors(previous=>({...previous,[tab.key]:failure(error)}));}
    finally{if(isCurrent())setLoading(previous=>previous.filter(key=>key!==tab.key));}
  },[workspaceId,run]);
  const open=useCallback((source:CodeLocation,path:string,line?:number,force=false,matchQuery?:string)=>{
    ++entrySequence.current;++sourceIntentSequence.current;
    source=canonicalCodeLocation(source);
    if(source.checkoutId&&!source.commitHash)sourceChoice.select('explorer',[{repositoryId:source.repositoryId,checkoutId:source.checkoutId}],{repositoryId:source.repositoryId,checkoutId:source.checkoutId});
    const tab={...source,path,line,matchQuery,focusRequest:line?++focusSequence.current:undefined,key:codeFileKey(source,path)};
    setLocations(previous=>codeLocationKey(previous[codeCheckoutKey(source)]||{repositoryId:source.repositoryId,checkoutId:source.checkoutId})===codeLocationKey(source)?previous:{...previous,[codeCheckoutKey(source)]:source});
    setTabs(previous=>{const found=previous.find(t=>t.key===tab.key);return found?previous.map(t=>t.key===tab.key?tab:t):[...previous,tab];});
    setActiveKey(tab.key);setSelectionRequest(value=>value+1);void loadFile(tab,force);
    const parents=path.split('/').slice(0,-1),browserId=codeBrowserKey(source);void loadDirectory(browserId,'',false,source);
    parents.forEach((_,index)=>void loadDirectory(browserId,parents.slice(0,index+1).join('/'),false,source));
  },[loadFile,loadDirectory,sourceChoice.select]);
  const applyEntry=useCallback(async(next:CodeTaskEntry)=>{
    ++sourceIntentSequence.current;setEntry(next);setCatalogError('');const version=epoch.current,sequence=++entrySequence.current,catalogRequest=++catalogSequence.current,sharedSequence=sourceChoice.getSelection()?.sequence||0;
    try{
      const value=await run(signal=>codeApi.repositories(workspaceId,next.taskId,signal));
      if(version!==epoch.current)return;
      // A cold entry can be superseded while its default catalog read was already
      // fenced. Keep directory facts available without adopting the old intent.
      if(!current.current.catalog&&catalogRequest===catalogSequence.current){latestCatalog.current=value;setCatalog(value);setCatalogError('');}
      if(entrySequence.current!==sequence||(sourceChoice.getSelection()?.sequence||0)!==sharedSequence)return;
      if(catalogRequest===catalogSequence.current){latestCatalog.current=value;setCatalog(value);setCatalogError('');}
      setScope(value.selectedRepositoryIds);setWorktreeScope(value.selectedWorktreeGroupIds[0]);setOrigin(value.scopeReason);
      if(!next.file)publishFilters(value,value.selectedRepositoryIds,value.selectedWorktreeGroupIds[0]);
      if(next.file){
        const candidates=value.repositories.filter(r=>next.file!.repositoryId?r.id===next.file!.repositoryId:r.gitId===next.file!.gitRepositoryId);
        const scoped=candidates.filter(r=>value.selectedRepositoryIds.includes(r.id));const resolved=scoped.length===1?scoped:candidates;
        if(resolved.length!==1){setCatalogError('任务文件的代码库身份无法唯一确定，请从目录选择代码库。');return;}
        const repositoryId=resolved[0].id;
        const possible=value.worktrees.filter(member=>member.repositoryId===repositoryId&&value.selectedWorktreeGroupIds.includes(member.groupId));
        const member=next.file.checkoutId?value.worktrees.find(item=>item.repositoryId===repositoryId&&item.id===next.file!.checkoutId):possible.length===1?possible[0]:undefined;
        if(!member&&!next.file.checkoutId&&!next.file.commitHash){setCatalogError('任务文件的工作树无法唯一确定，请从目录选择实际来源。');return;}
        if(!value.selectedRepositoryIds.includes(repositoryId))setScope([...value.selectedRepositoryIds,repositoryId]);
        if(member)setWorktreeScope(member.groupId);
        if(next.file.commitHash&&(next.file.checkoutId||member?.id)){
          const target={repositoryId,checkoutId:next.file.checkoutId||member!.id};sourceChoice.select('explorer',[target],target);
        }
        open({repositoryId,checkoutId:next.file.checkoutId||member?.id,commitHash:next.file.commitHash},next.file.path,next.file.line,true);
      }
    }catch(error){if(version===epoch.current&&entrySequence.current===sequence&&(sourceChoice.getSelection()?.sequence||0)===sharedSequence)setCatalogError(failure(error));}
  },[workspaceId,run,open,publishFilters,sourceChoice.getSelection,sourceChoice.select]);
  const clearEntry=useCallback(()=>{
    if(!current.current.entry)return;
    setEntry(null);setCatalogError('');const version=epoch.current,sequence=++entrySequence.current;
    // A direct navigation can supersede a cold entry before its catalog arrives.
    if(current.current.catalog)return;
    const catalogRequest=++catalogSequence.current;
    void run(signal=>codeApi.repositories(workspaceId,undefined,signal)).then(value=>{
      if(version!==epoch.current||sequence!==entrySequence.current||catalogRequest!==catalogSequence.current)return;
      latestCatalog.current=value;setCatalog(value);
    }).catch(error=>{if(version===epoch.current&&sequence===entrySequence.current&&catalogRequest===catalogSequence.current)setCatalogError(failure(error));});
  },[workspaceId,run]);
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
  useEffect(()=>{
    if(!viewActive)return;
    for(const item of sources){
      if(item.source.commitHash)continue;
      const version=sourceControl.versions[item.source.repositoryId];if(version===undefined)continue;
      const prefix=directoryKey(item.source,'');
      if(!current.current.directories[prefix])continue;
      const previous=observedVersions.current.get(item.id);observedVersions.current.set(item.id,version);
      if(previous===version)continue;
      const repository=sourceControl.data?.repositories.find(repository=>repository.id===item.source.repositoryId),worktree=repository?.worktrees.find(worktree=>worktree.worktreeId===item.source.checkoutId);
      const loaded=Object.entries(current.current.directories).filter(([key])=>key.startsWith(prefix)).map(([key,directory])=>({path:key.slice(prefix.length),entries:directory.entries}));
      const plan=planCodeDirectoryRefresh(directoryObservations.current.get(item.id),JSON.stringify([codeLocationKey(item.source),repository?.gitId,worktree?.location]),worktree,loaded);
      directoryObservations.current.set(item.id,plan.observation);
      const activeTab=current.current.tabs.find(tab=>tab.key===current.current.activeKey),cached=activeTab&&current.current.files[activeTab.key];
      const readFile=Boolean(plan.readFile&&activeTab&&cached&&!activeTab.commitHash&&!cached.page&&codeLocationKey(activeTab)===codeLocationKey(item.source));
      if(!readFile&&!plan.paths.length)continue;
      const queued=automaticQueue.current.get(item.id);
      automaticQueue.current.set(item.id,{source:item.source,paths:new Set([...(queued?.paths||[]),...plan.paths]),readFile:readFile||Boolean(queued?.readFile)});
    }
    if(automaticRunning.current||!automaticQueue.current.size)return;
    automaticRunning.current=true;const generation=epoch.current;
    void(async()=>{
      while(current.current.viewActive&&generation===epoch.current&&automaticQueue.current.size){
        const batch=[...automaticQueue.current].slice(0,2);for(const[id]of batch)automaticQueue.current.delete(id);
        await Promise.allSettled(batch.map(async([id,job])=>{
          if(!current.current.sources.some(item=>item.id===id))return;
          const {source}=job;
          for(const path of job.paths){if(!current.current.viewActive||generation!==epoch.current)return;if(current.current.directories[directoryKey(source,path)])await loadDirectory(id,path,true,source);}
          const tab=current.current.tabs.find(item=>item.key===current.current.activeKey);
          // A paged read is a fixed file snapshot. Keep its page and revision until the reader
          // explicitly restarts; the next-page API must still reject a changed file.
          if(job.readFile&&current.current.viewActive&&generation===epoch.current&&tab&&!tab.commitHash&&!current.current.files[tab.key]?.page&&codeLocationKey(tab)===codeLocationKey(source))await loadFile(tab,true);
        }));
      }
    })().finally(()=>{automaticRunning.current=false;});
  },[viewActive,selectedLocationsKey,sourceControl.versions,loadDirectory,loadFile,directoryKey,directories]);
  return {catalog,catalogError,scope,worktreeScope,origin,locations,sources,filterOptions,directories,directoryErrors,tabs,active,selectionRequest,files,fileErrors,loading,showIgnored,searchResults,searchLoading,searchErrors,entry,selectedIds,sourceControl,
    locationFor,directoryKey,loadDirectory,open,applyEntry,clearEntry,search,setShowIgnored,refresh,readPage,
    setSourceFilters:(ids:string[],id:string)=>{
      ++entrySequence.current;++sourceIntentSequence.current;
      const latest=latestCatalog.current||current.current.catalog;
      if(latest)setCatalog(observed=>selectCodeWorktreeGroup(latest,observed,current.current.worktreeScope,id));
      setScope(ids);setWorktreeScope(id);setOrigin(ids.length?'自选 '+ids.length+' 个代码库':'显示全部代码库');publishFilters(latest,ids,id);
    },
    setWorktreeScope:(id:string|undefined)=>{
      ++entrySequence.current;++sourceIntentSequence.current;
      const previousId=current.current.worktreeScope,latest=latestCatalog.current;
      if(latest)setCatalog(observed=>selectCodeWorktreeGroup(latest,observed,previousId,id));
      setWorktreeScope(id);publishFilters(latest||current.current.catalog,current.current.scope,id);
    },
    setScope:(ids:string[])=>{++entrySequence.current;++sourceIntentSequence.current;setScope(ids);setOrigin(ids.length?'自选 '+ids.length+' 个代码库':'显示全部代码库');publishFilters(current.current.catalog,ids,current.current.worktreeScope);},
    activate:(tab:CodeFileTab)=>open(tab,tab.path),
    close:(key:string)=>{const remaining=tabs.filter(tab=>tab.key!==key);setTabs(remaining);setFiles(previous=>{const next={...previous};delete next[key];return next;});if(key===activeKey)setActiveKey(remaining.at(-1)?.key||'');},
  };
}
