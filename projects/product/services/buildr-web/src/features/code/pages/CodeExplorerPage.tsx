import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Select, Space, Spin, Tag } from 'antd';
import { FolderOpenOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { ReadingToggle } from '../../../components/ReadingToggle';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { RepositoryFileBrowser, type RepositoryPreviewFile, type RepositoryTreeScope } from '../../workspace/components/RepositoryFileBrowser';
import { CodeTreePane } from '../components/CodeTreePane';
import { useCodeExplorer } from '../hooks/useCodeExplorer';
import { codeApi } from '../api/code-api';
import { codeBrowserKey, codeLocationKey, relativeCodeLink, type CodeTaskEntry } from '../code-navigation';
import { codeWorktreeGroupScope } from '../code-filters';
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
  const selectedMember=state.catalog?.worktrees.find(member=>member.repositoryId===active?.repositoryId&&member.id===active?.checkoutId);
  const treeRepositories=useMemo<RepositoryTreeScope[]>(()=>state.sources.map(({id,source,member})=>{
    const prefix=state.directoryKey(source,'');
    const directories=Object.entries(state.directories).filter(([key])=>key.startsWith(prefix)).map(([,value])=>value);
    const items=new Map<string,RepositoryPreviewFile>();
    for(const directory of directories)for(const item of directory.entries)items.set(item.path,{path:item.path,content:'',kind:'text',directory:item.kind==='directory',link:item.kind==='link',ignored:item.ignored});
    const observed=directories.find(dir=>dir.path===''),group=state.catalog?.worktreeGroups.find(group=>group.id===member.groupId);
    const version=source.commitHash?'历史提交 · '+source.commitHash.slice(0,10):group?.name||'工作树';
    return {id,repositoryId:member.repositoryId,name:state.catalog?.repositories.find(r=>r.id===member.repositoryId)?.name||member.repositoryId,
      location:version+' · '+(observed?.source.location||member.path)+(observed?' · '+observed.source.version:''),files:[...items.values()]};
  }),[state.sources.map(item=>item.id+':'+item.member.available).join(','),state.catalog,state.directories,state.showIgnored,state.directoryKey]);
  const loadedKeys=state.sources.flatMap(({id,source})=>{
    const prefix=state.directoryKey(source,'');
    return [...new Set([...Object.keys(state.directories),...Object.keys(state.directoryErrors)])].filter(key=>key.startsWith(prefix)).map(key=>id+'::'+key.slice(prefix.length));
  });
  const files:RepositoryPreviewFile[]=file?[{path:file.path,kind:file.kind,content:file.content,image:file.kind==='image'?file.content:undefined}]:[];
  const sourceName=(browserId:string)=>{
    const item=state.sources.find(source=>source.id===browserId),repo=state.catalog?.repositories.find(r=>r.id===item?.source.repositoryId);
    const group=state.catalog?.worktreeGroups.find(group=>group.id===item?.member.groupId);
    return (repo?.name||'')+(group?' · '+group.name:'')+(item?.source.commitHash?' · '+item.source.commitHash.slice(0,7):'');
  };
  const searchResults=state.searchResults.flatMap(result=>result.matches.map(match=>({path:match.path,kind:'text' as const,content:'',repositoryId:result.browserId,sourceRepositoryId:result.repositoryId,repositoryName:sourceName(result.browserId),line:match.line||undefined,excerpt:match.excerpt,occurrences:match.occurrences})));
  const diagnostics=[...(state.catalog?.diagnostics.map(d=>d.message)||[]),...state.searchErrors,...state.searchResults.flatMap(result=>result.diagnostics.map(d=>d.message))];
  const searchPartial=state.searchResults.some(result=>result.truncated);
  const directoryFailures=state.sources.flatMap(({source,id})=>{
    const prefix=state.directoryKey(source,'');return Object.entries(state.directoryErrors).filter(([key])=>key.startsWith(prefix)).map(([key,error])=>sourceName(id)+' / '+(key.slice(prefix.length)||'根目录')+'：'+error);
  });
  const partial=state.sources.some(({source})=>Object.entries(state.directories).some(([key,dir])=>key.startsWith(state.directoryKey(source,''))&&dir.truncated));
  const returnTask=()=>{const from=state.entry?.from;if(from?.pathname.startsWith(`/workspaces/${workspaceId}/`))navigate({pathname:from.pathname,search:from.search,hash:from.hash},{state:from.state});};
  const openFile=(id:string,path:string,line?:number,matchQuery?:string)=>{const source=state.locationFor(id);if(!source)return;state.open(source,path,line,false,matchQuery);if(window.innerWidth<680)setTreeHidden(true);};
  const onSearch=useCallback((query:string,mode:'name'|'content')=>state.search(query,mode),[state.search]);
  // Resolve relative document media through the same repository/version reader; never construct filesystem URLs.
  useEffect(()=>{
    setMedia({});if(!active||file?.kind!=='markdown'||file.page||!workspaceId)return;
    const controller=new AbortController();let alive=true;
    const hrefs=[...new Set([...file.content.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(match=>match[1]))].slice(0,8);
    void Promise.allSettled(hrefs.map(async href=>{const path=relativeCodeLink(active.path,href);if(!path)return;const image=await codeApi.file(workspaceId,{repositoryId:active.repositoryId,checkoutId:active.checkoutId,taskId:active.taskId,commitHash:active.commitHash,path},controller.signal);if(image.kind==='image'&&alive)setMedia(previous=>({...previous,[href]:image.content}));}));
    return()=>{alive=false;controller.abort();};
  },[workspaceId,active?.key,file?.digest]);
  const fileTabs=state.tabs.map(tab=>{
    const name=tab.path.split('/').at(-1)||tab.path;
    const repo=state.catalog?.repositories.find(r=>r.id===tab.repositoryId);
    const duplicate=state.tabs.some(other=>other.key!==tab.key&&other.path.split('/').at(-1)===name);
    const member=state.catalog?.worktrees.find(item=>item.id===tab.checkoutId),group=state.catalog?.worktreeGroups.find(item=>item.id===member?.groupId);
    const sourceLabel=duplicate?(repo?.code||repo?.name||tab.repositoryId)+' · '+(group?.name||'未知工作树')+(tab.commitHash?' · '+tab.commitHash.slice(0,7):''):tab.commitHash?tab.commitHash.slice(0,7):'';
    return {key:tab.key,kind:/\.md$/i.test(tab.path)?'doc' as const:'svc' as const,
      title:(repo?.name||'')+' / '+tab.path+' · '+(group?.name||'')+' · '+(tab.commitHash||member?.path||'当前文件'),
      label:<>{name}{sourceLabel&&<Tag color={tab.commitHash?'gold':undefined}>{sourceLabel}</Tag>}</>,
      accessibleLabel:name+(sourceLabel?' '+sourceLabel:''),closeLabel:'关闭文件 '+tab.path};
  });
  const repositoryOptions=[...state.filterOptions.repositories.map(repo=>({value:repo.id,label:repo.name})),...state.scope.filter(id=>!state.filterOptions.repositories.some(repo=>repo.id===id)).map(id=>({value:id,label:state.catalog?(state.catalog.repositories.find(repo=>repo.id===id)?.name||id)+'（不在所选工作树中）':'正在读取代码库…',disabled:true}))];
  const groupOptions=[...state.filterOptions.groups.map(group=>({value:group.id,label:group.name})),...(state.worktreeScope&&!state.filterOptions.groups.some(group=>group.id===state.worktreeScope)?[state.worktreeScope]:[]).map(id=>({value:id,label:id==='main'?'主目录':state.catalog?(state.catalog.worktreeGroups.find(group=>group.id===id)?.name||id)+'（不在所选代码库中）':'正在读取工作树…',disabled:true}))];
  const taskFallback=Boolean(state.entry&&state.catalog&&!state.catalog.worktreeGroups.some(group=>group.kind==='task'&&group.taskId===state.entry!.taskId));
  const inScope=Boolean(active&&state.sources.some(item=>codeLocationKey(item.source)===codeLocationKey(active)));
  const includeActive=()=>{
    if(!active)return;const member=state.catalog?.worktrees.find(item=>item.id===active.checkoutId);
    if(!member){message.info('此文件的工作树暂不可确认，请从目录选择实际来源。');return;}
    if(state.scope.length&&!state.scope.includes(active.repositoryId))state.setScope([...state.scope,active.repositoryId]);
    if(codeWorktreeGroupScope(state.worktreeScope)!==member.groupId)state.setWorktreeScope(member.groupId);
  };
  const context=<section className="code-root-selectors" aria-label="代码库与工作树筛选">
    <Select mode="multiple" allowClear maxTagCount={1} aria-label="筛选代码库" placeholder="全部代码库" value={state.scope} onChange={state.setScope} options={repositoryOptions} />
    <Select allowClear showSearch optionFilterProp="label" aria-label="筛选工作树" placeholder="主目录" value={state.worktreeScope} onChange={state.setWorktreeScope} options={groupOptions} />
    <small>{taskFallback?'任务没有独立工作树，默认查看主目录。':'代码库不选时查看全部；工作树不选时查看主目录'}</small>
  </section>;
  return <div className="code-explorer-stage">
    <CodeTreePane hidden={treeHidden} onHost={setHost} storageKey={`buildr.code.tree-width.${workspaceId}`} />
    <div className="code-file-stage">
      <div className="code-file-tabstrip">
        <ObjectTabStrip className="code-open-files" label="打开的文件" tabs={fileTabs} active={active?.key} onActivate={key=>{const tab=state.tabs.find(item=>item.key===key);if(tab)state.activate(tab);}} onClose={state.close} />
        {state.entry&&<Button size="small" type="text" onClick={returnTask}>返回任务</Button>}
        <ReadingToggle className="code-reading-toggle" expanded={treeHidden} onToggle={()=>setTreeHidden(value=>!value)} />
      </div>
      {state.catalogError&&<Alert type="warning" message={state.catalogError} action={<Button onClick={()=>void state.refresh().catch(error=>message.error(String(error)))}>重试</Button>} />}
      {active&&!inScope&&<div className="code-range-outside">当前文件不在筛选范围内。<Button type="link" size="small" onClick={includeActive}>加入范围</Button></div>}
      {!state.catalog&&!state.catalogError&&<div className="repository-reading-empty"><Spin />正在读取代码库…</div>}
      {state.catalog?.repositories.length===0&&<Empty description="工作空间尚未登记代码库" />}
      {state.catalog&&state.catalog.repositories.length>0&&!state.sources.length&&<div className="code-range-outside" role="status">所选代码库与工作树没有共同目录，请调整筛选。</div>}
      <RepositoryFileBrowser global readerActive sidebarHost={host} treeRepositories={treeRepositories} files={files} repositoryName={selectedRepo?.name} repositoryId={active?.repositoryId} checkoutId={active?.checkoutId||undefined} observedDigest={file?.digest} observedRevision={file?.revision} observedAt={file?.observedAt} selectedRepositoryId={active?codeBrowserKey(active):undefined} selectedPath={active?.path||''} selectionKey={active?.key}
        onSelect={(path,line,matchQuery)=>active&&state.open(active,path,line,false,matchQuery)} onSelectRepositoryFile={openFile} context={context}
        location={file?.source.location||selectedMember?.path||''} version={file?.source.version||active?.commitHash||'当前文件'} historical={Boolean(active?.commitHash)} focusLine={active?.line} focusRequest={active?.focusRequest}
        readLoading={Boolean(active&&state.loading.includes(active.key))} readError={active?state.fileErrors[active.key]:undefined} readMessage={file?.message||undefined} readPage={file?.page} readMatchQuery={file?.observedMatch?.query} sizeBytes={file?.sizeBytes} onReadPage={state.readPage} canModify={Boolean(file&&!file.truncated&&file.kind!=='unsupported'&&!state.fileErrors[active?.key||''])} taskTitle={state.entry?.taskTitle}
        onLoadDirectory={state.loadDirectory} loadedDirectoryKeys={loadedKeys} onSearch={onSearch} onShowIgnored={state.setShowIgnored} searchResults={searchResults} searchLoading={state.searchLoading} searchIncomplete={searchPartial||state.searchErrors.length>0}
        treeNotice={<>
          {(searchPartial||partial)&&<div className="code-tree-coverage" role="status"><InfoCircleOutlined /><span>{searchPartial?'搜索未完整返回。每个工作树最多 100 个文件、200 条匹配行，请缩小关键词或范围。':'目录达到读取上限，显示部分文件。'}</span></div>}
          {(diagnostics.length>0||directoryFailures.length>0)&&<Alert type="warning" showIcon message="部分内容不可读取" description={[...new Set([...diagnostics,...directoryFailures])].join('；')} action={<Button size="small" onClick={()=>void state.refresh().catch(error=>message.error(String(error)))}>重试</Button>} />}
        </>}
        onRetry={()=>state.refresh()} onViewCurrent={()=>{if(!active)return;if(!active.checkoutId){message.info('此历史文件的当前工作树尚未确认，请从目录选择实际来源。');return;}state.open({repositoryId:active.repositoryId,checkoutId:active.checkoutId},active.path);}} onHideTree={()=>setTreeHidden(true)}
        markdownRevision={Object.keys(media).join(',')} markdownOptions={{allowRelativeLinks:true,imageResolver:href=>media[href]?{href:media[href]}:null,onRelativeLinkClick:href=>{if(!active)return;const path=relativeCodeLink(active.path,href);if(path)state.open(active,path);else message.info('此链接不在当前代码库内。');}}} />
    </div>
  </div>;
}
export function CodeSourceControlPage() {
  return <div className="code-scm-pending"><FolderOpenOutlined /><h2>源代码管理</h2><p>这里将提供代码库的改动、提交记录与历史详情。</p><Space><Tag>下一子任务</Tag><span>资源管理器已可使用</span></Space></div>;
}
