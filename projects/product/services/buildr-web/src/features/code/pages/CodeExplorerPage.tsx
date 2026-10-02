import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Select, Space, Spin, Tag, Tooltip } from 'antd';
import { FolderOpenOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { ReadingToggle } from '../../../components/ReadingToggle';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { RepositoryFileBrowser, type RepositoryPreviewFile, type RepositoryTreeScope } from '../../workspace/components/RepositoryFileBrowser';
import { CodeTreePane } from '../components/CodeTreePane';
import { useCodeExplorer } from '../hooks/useCodeExplorer';
import { codeApi } from '../api/code-api';
import { codeLocationKey, relativeCodeLink, type CodeTaskEntry } from '../code-navigation';
import '../code-explorer.css';

export function CodeExplorerPage() {
  const {workspaceId,setBreadcrumbParts}=useAppShell();
  const state=useCodeExplorer(workspaceId||'');
  const location=useLocation(),navigate=useNavigate(),{message}=App.useApp();
  const [host,setHost]=useState<HTMLDivElement|null>(null),[treeHidden,setTreeHidden]=useState(()=>window.innerWidth<680);
  const [processed,setProcessed]=useState(''),[media,setMedia]=useState<Record<string,string>>({});
  useEffect(()=>{setBreadcrumbParts(['代码','资源管理器']);},[setBreadcrumbParts]);
  useEffect(()=>{const entry=location.state?.codeEntry as CodeTaskEntry|undefined;if(entry&&processed!==location.key){setProcessed(location.key);void state.applyEntry(entry);}},[location.key,location.state,processed,state.applyEntry]);
  const active=state.active,file=active?state.files[active.key]:undefined;
  const selectedRepo=state.catalog?.repositories.find(r=>r.id===active?.repositoryId);
  const treeRepositories=useMemo<RepositoryTreeScope[]>(()=>state.selectedIds.map(id=>{
    const source=state.locationFor(id),prefix=codeLocationKey(source)+':'+String(state.showIgnored)+':';
    const directories=Object.entries(state.directories).filter(([key])=>key.startsWith(prefix)).map(([,value])=>value);
    const items=new Map<string,RepositoryPreviewFile>();
    for(const directory of directories)for(const item of directory.entries)items.set(item.path,{path:item.path,content:'',kind:'text',directory:item.kind==='directory',link:item.kind==='link',ignored:item.ignored});
    const observed=directories.find(dir=>dir.path==='');
    const unresolvedLocation=source.taskId||source.commitHash?(state.directoryErrors[state.directoryKey(source,'')]?'查看位置暂不可读取':'正在读取查看位置…'):state.catalog?.repositories.find(r=>r.id===id)?.location;
    return {id,name:state.catalog?.repositories.find(r=>r.id===id)?.name||id,location:observed?(observed.source.kind==='task'?'任务工作树':observed.source.kind==='commit'?'历史版本':'本机目录')+' · '+observed.source.location+' · '+observed.source.version:unresolvedLocation,files:[...items.values()]};
  }),[state.selectedIds.join(','),state.catalog,state.locations,state.directories,state.directoryErrors,state.showIgnored,state.locationFor,state.directoryKey]);
  const loadedKeys=Object.values(state.directories).filter(dir=>state.selectedIds.includes(dir.source.repositoryId)&&state.directories[state.directoryKey(state.locationFor(dir.source.repositoryId),dir.path)]===dir).map(dir=>dir.source.repositoryId+'::'+dir.path);
  for(const id of state.selectedIds){const prefix=state.directoryKey(state.locationFor(id),'');for(const key of Object.keys(state.directoryErrors))if(key.startsWith(prefix))loadedKeys.push(id+'::'+key.slice(prefix.length));}
  const files:RepositoryPreviewFile[]=file?[{path:file.path,kind:file.kind,content:file.content,image:file.kind==='image'?file.content:undefined}]:[];
  const searchResults=state.searchResults.flatMap(result=>result.matches.map(match=>({path:match.path,kind:'text' as const,content:'',repositoryId:result.repositoryId,repositoryName:state.catalog?.repositories.find(r=>r.id===result.repositoryId)?.name||'',line:match.line||undefined,excerpt:match.excerpt,occurrences:match.occurrences})));
  const diagnostics=[...(state.catalog?.diagnostics.map(d=>d.message)||[]),...state.searchErrors,...state.searchResults.flatMap(result=>result.diagnostics.map(d=>d.message))];
  const searchPartial=state.searchResults.some(result=>result.truncated);
  const directoryFailures=state.selectedIds.flatMap(id=>{
    const prefix=state.directoryKey(state.locationFor(id),'');return Object.entries(state.directoryErrors).filter(([key])=>key.startsWith(prefix)).map(([key,error])=>(key.slice(prefix.length)||'根目录')+'：'+error);
  });
  const partial=Object.entries(state.directories).some(([key,dir])=>dir.truncated&&key===state.directoryKey(state.locationFor(dir.source.repositoryId),dir.path));
  const returnTask=()=>{const from=state.entry?.from;if(from?.pathname.startsWith(`/workspaces/${workspaceId}/`))navigate({pathname:from.pathname,search:from.search,hash:from.hash},{state:from.state});};
  const openFile=(id:string,path:string,line?:number,matchQuery?:string)=>{state.open(state.locationFor(id),path,line,false,matchQuery);if(window.innerWidth<680)setTreeHidden(true);};
  const onSearch=useCallback((query:string,mode:'name'|'content')=>state.search(query,mode),[state.search]);
  // Resolve relative document media through the same repository/version reader; never construct filesystem URLs.
  useEffect(()=>{
    setMedia({});if(!active||file?.kind!=='markdown'||file.page||!workspaceId)return;
    const controller=new AbortController();let alive=true;
    const hrefs=[...new Set([...file.content.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(match=>match[1]))].slice(0,8);
    void Promise.allSettled(hrefs.map(async href=>{const path=relativeCodeLink(active.path,href);if(!path)return;const image=await codeApi.file(workspaceId,{repositoryId:active.repositoryId,taskId:active.taskId,commitHash:active.commitHash,path},controller.signal);if(image.kind==='image'&&alive)setMedia(previous=>({...previous,[href]:image.content}));}));
    return()=>{alive=false;controller.abort();};
  },[workspaceId,active?.key,file?.digest]);
  const fileTabs=state.tabs.map(tab=>{
    const name=tab.path.split('/').at(-1)||tab.path;
    const repo=state.catalog?.repositories.find(r=>r.id===tab.repositoryId);
    const duplicate=state.tabs.some(other=>other.key!==tab.key&&other.path.split('/').at(-1)===name);
    const sourceLabel=tab.commitHash?tab.commitHash.slice(0,7):duplicate?(repo?.code||repo?.name||tab.repositoryId)+' · '+(tab.taskId?'任务':'默认'):'';
    return {key:tab.key,kind:/\.md$/i.test(tab.path)?'doc' as const:'svc' as const,
      title:(repo?.name||'')+' / '+tab.path+' · '+(tab.commitHash||tab.taskId||'当前文件'),
      label:<>{name}{sourceLabel&&<Tag color={tab.commitHash?'gold':undefined}>{sourceLabel}</Tag>}</>,
      accessibleLabel:name+(sourceLabel?' '+sourceLabel:''),closeLabel:'关闭文件 '+tab.path};
  });
  const locationIds=active?[active.repositoryId]:state.selectedIds;
  const locationSources=locationIds.map(id=>state.locationFor(id));
  const historyHashes=[...new Set(locationSources.flatMap(source=>source.commitHash?[source.commitHash]:[]))];
  const historyHash=historyHashes.length===1?historyHashes[0]:undefined;
  const locationModes=locationSources.map(source=>source.commitHash?(historyHash?'history':'mixed'):source.taskId?'task':'default');
  const locationMode=locationModes.every(mode=>mode===locationModes[0])?(locationModes[0]||'default'):'mixed';
  const observedLocations=locationSources.map(source=>state.directories[state.directoryKey(source,'')]);
  const singleLocation=locationSources.length===1?locationSources[0]:undefined;
  const observedFileSource=singleLocation&&file?.source&&codeLocationKey({repositoryId:file.source.repositoryId,taskId:file.source.taskId||undefined,commitHash:file.source.commitHash||undefined})===codeLocationKey(singleLocation)?file.source:undefined;
  const locationPath=singleLocation?(observedLocations[0]?.source.location||observedFileSource?.location||(!singleLocation.taskId&&!singleLocation.commitHash?state.catalog?.repositories.find(repo=>repo.id===singleLocation.repositoryId)?.location:undefined)):undefined;
  const locationUnavailable=singleLocation&&Boolean(state.directoryErrors[state.directoryKey(singleLocation,'')]);
  const taskFallback=locationMode==='task'&&observedLocations.length>0&&observedLocations.every(directory=>directory?.source.kind==='default');
  const canSelectTaskLocation=Boolean(state.entry&&locationIds.some(id=>state.catalog?.selectedRepositoryIds.includes(id)));
  const canSelectLocation=canSelectTaskLocation||historyHashes.length>0;
  const locationExplanation=locationMode==='history'?'查看该提交保存的文件。':taskFallback?'任务没有独立工作树，当前使用代码库登记的本机目录。':locationMode==='task'?'查看任务对应的实际目录，不汇总其他工作树。':locationMode==='mixed'?'各代码库使用不同位置，实际路径见下方根节点。':'查看代码库登记路径中的实时文件，包含未提交修改。';
  const switchLocation=(value:string)=>{
    if(value==='history'||value==='mixed')return;
    for(const id of locationIds){
      const source={repositoryId:id,...(value==='task'&&state.entry&&state.catalog?.selectedRepositoryIds.includes(id)?{taskId:state.entry.taskId}:{})};
      state.setLocation(id,source);
      if(active?.repositoryId===id)state.open(source,active.path);
    }
  };
  const context=<div className="code-root-selectors">
    <Select mode="multiple" allowClear maxTagCount={1} aria-label="筛选代码库" placeholder="全部代码库" value={state.scope} onChange={state.setScope} options={state.catalog?.repositories.map(r=>({value:r.id,label:r.name}))} />
    <small>{state.origin} · 清空选择查看全部</small>
    <section className="code-location-controls" aria-label="查看位置">
      <small className="code-location-label">查看位置{canSelectLocation&&<span>{active?'当前文件所属代码库':'所选代码库'}</span>}</small>
      {canSelectLocation?<Tooltip title={locationExplanation+' '+(active?'切换只影响当前文件所属的代码库。':'切换所选代码库；任务范围之外的代码库继续使用本机目录。')}><Select size="small" aria-label="查看位置与版本" value={locationMode} options={[{value:'default',label:'本机目录'},...(canSelectTaskLocation?[{value:'task',label:'任务目录'}]:[]),...(historyHash?[{value:'history',label:'历史提交 · '+historyHash.slice(0,10)}]:[]),...(locationMode==='mixed'?[{value:'mixed',label:'多个查看位置',disabled:true}]:[])]} onChange={switchLocation} /></Tooltip>:<strong className="code-location-value">本机目录</strong>}
      <small className="code-location-explanation">{locationExplanation}</small>
      {locationPath?<small className="code-location-path" title={locationPath}>{locationPath}</small>:locationIds.length>1?<small className="code-location-path">各代码库的实际路径见下方根节点</small>:singleLocation&&<small className="code-location-path" role="status">{locationUnavailable?'查看位置暂不可读取':'正在读取查看位置…'}</small>}
    </section>
  </div>;
  return <div className="code-explorer-stage">
    <CodeTreePane hidden={treeHidden} onHost={setHost} storageKey={`buildr.code.tree-width.${workspaceId}`} />
    <div className="code-file-stage">
      <div className="code-file-tabstrip">
        <ObjectTabStrip className="code-open-files" label="打开的文件" tabs={fileTabs} active={active?.key} onActivate={key=>{const tab=state.tabs.find(item=>item.key===key);if(tab)state.activate(tab);}} onClose={state.close} />
        {state.entry&&<Button size="small" type="text" onClick={returnTask}>返回任务</Button>}
        <ReadingToggle className="code-reading-toggle" expanded={treeHidden} onToggle={()=>setTreeHidden(value=>!value)} />
      </div>
      {state.catalogError&&<Alert type="warning" message={state.catalogError} action={<Button onClick={()=>void state.refresh().catch(error=>message.error(String(error)))}>重试</Button>} />}
      {active&&!state.selectedIds.includes(active.repositoryId)&&<div className="code-range-outside">当前文件不在筛选范围内。<Button type="link" size="small" onClick={()=>state.setScope([...state.scope,active.repositoryId])}>加入范围</Button></div>}
      {!state.catalog&&!state.catalogError&&<div className="repository-reading-empty"><Spin />正在读取代码库…</div>}
      {state.catalog?.repositories.length===0&&<Empty description="工作空间尚未登记代码库" />}
      <RepositoryFileBrowser global readerActive sidebarHost={host} treeRepositories={treeRepositories} files={files} repositoryName={selectedRepo?.name} repositoryId={active?.repositoryId} observedDigest={file?.digest} observedRevision={file?.revision} observedAt={file?.observedAt} selectedRepositoryId={active?.repositoryId} selectedPath={active?.path||''} selectionKey={active?.key}
        onSelect={(path,line,matchQuery)=>active&&openFile(active.repositoryId,path,line,matchQuery)} onSelectRepositoryFile={openFile} context={context}
        location={file?.source.location||selectedRepo?.location||''} version={file?.source.version||active?.commitHash||'当前文件'} historical={Boolean(active?.commitHash)} focusLine={active?.line} focusRequest={active?.focusRequest}
        readLoading={Boolean(active&&state.loading.includes(active.key))} readError={active?state.fileErrors[active.key]:undefined} readMessage={file?.message||undefined} readPage={file?.page} readMatchQuery={file?.observedMatch?.query} sizeBytes={file?.sizeBytes} onReadPage={state.readPage} canModify={Boolean(file&&!file.truncated&&file.kind!=='unsupported'&&!state.fileErrors[active?.key||''])} taskTitle={state.entry?.taskTitle}
        onLoadDirectory={state.loadDirectory} loadedDirectoryKeys={loadedKeys} onSearch={onSearch} onShowIgnored={state.setShowIgnored} searchResults={searchResults} searchLoading={state.searchLoading} searchIncomplete={searchPartial||state.searchErrors.length>0}
        treeNotice={<>
          {(searchPartial||partial)&&<div className="code-tree-coverage" role="status"><InfoCircleOutlined /><span>{searchPartial?'搜索未完整返回。每个代码库最多 100 个文件、200 条匹配行，请缩小关键词或范围。':'目录达到读取上限，显示部分文件。'}</span></div>}
          {(diagnostics.length>0||directoryFailures.length>0)&&<Alert type="warning" showIcon message="部分内容不可读取" description={[...new Set([...diagnostics,...directoryFailures])].join('；')} action={<Button size="small" onClick={()=>void state.refresh().catch(error=>message.error(String(error)))}>重试</Button>} />}
        </>}
        onRetry={()=>void state.refresh().catch(error=>message.error(String(error)))} onViewCurrent={()=>active&&state.open({repositoryId:active.repositoryId,taskId:active.taskId},active.path)} onHideTree={()=>setTreeHidden(true)}
        markdownRevision={Object.keys(media).join(',')} markdownOptions={{allowRelativeLinks:true,imageResolver:href=>media[href]?{href:media[href]}:null,onRelativeLinkClick:href=>{if(!active)return;const path=relativeCodeLink(active.path,href);if(path)state.open(active,path);else message.info('此链接不在当前代码库内。');}}} />
    </div>
  </div>;
}
export function CodeSourceControlPage() {
  return <div className="code-scm-pending"><FolderOpenOutlined /><h2>源代码管理</h2><p>这里将提供代码库的改动、提交记录与历史详情。</p><Space><Tag>下一子任务</Tag><span>资源管理器已可使用</span></Space></div>;
}
