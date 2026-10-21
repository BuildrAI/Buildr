import { useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Select, Spin, Tag } from 'antd';
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { ReadingToggle } from '../../../components/ReadingToggle';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { tabElementId } from '../../../lib/tab-navigation';
import { RepositoryFileBrowser, type RepositoryPreviewFile, type RepositoryTreeScope } from '../../workspace/components/RepositoryFileBrowser';
import { CodeTreePane } from '../components/CodeTreePane';
import { CodeExplorerNotices } from '../components/CodeExplorerNotices';
import { useCodeExplorer } from '../hooks/useCodeExplorer';
import { codeApi } from '../api/code-api';
import { useEditableFile } from '../hooks/useEditableFile';
import { useFileEditingContext } from '../../../app/FileEditingContext';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { FileEditingPane } from '../../../components/file-editing/FileEditingPane';
import { codeBrowserKey, codeLocationKey, codeReturnTarget, relativeCodeLink, type CodeTaskEntry } from '../code-navigation';
import { sourceControlDecorations } from '../source-control-decorations';
import { codeRepositoryCode, codeRepositoryLabel, codeWorktreeLabel } from '../code-source-labels';
import { workspaceHref } from '../../../lib/labels';
import type { MarkdownRenderOptions } from '../../../markdown';
import '../code-explorer.css';

export function CodeExplorerPage() {
  const panelId = useId();
  const {workspaceId,workspace,setBreadcrumbParts}=useAppShell();
  const viewActive=useContext(WorkspaceViewActiveContext);
  const location=useLocation(),navigate=useNavigate(),{message}=App.useApp();
  const state=useCodeExplorer(workspaceId||'',workspace?.rootPath,viewActive,location.state?.codeEntry?location.key:undefined);
  const [host,setHost]=useState<HTMLDivElement|null>(null),[treeHidden,setTreeHidden]=useState(()=>window.innerWidth<680);
  const [processed,setProcessed]=useState(''),[media,setMedia]=useState<Record<string,string>>({});
  const [selection,setSelection]=useState<{key:string;lines:[number,number]|null}>({key:'',lines:null});
  const [readQuery,setReadQuery]=useState('');
  useEffect(()=>{setBreadcrumbParts(['代码','资源管理器']);},[setBreadcrumbParts]);
  useEffect(()=>{if(processed===location.key)return;setProcessed(location.key);const entry=location.state?.codeEntry as CodeTaskEntry|undefined;if(entry)void state.applyEntry(entry);else state.clearEntry();},[location.key,location.state,processed,state.applyEntry,state.clearEntry]);
  const active=state.active,file=active?state.files[active.key]:undefined;
  const editing=useFileEditingContext();
  const currentText=Boolean(active?.checkoutId&&!active.commitHash&&file&&!file.page&&!file.truncated&&(file.kind==='markdown'||file.kind==='text')&&!state.fileErrors[active.key]);
  const editable=useEditableFile(workspaceId,currentText&&active?.checkoutId?{kind:'code',repositoryId:active.repositoryId,checkoutId:active.checkoutId,path:active.path}:null,file?.observedAt,file?.editorSnapshot);
  const editorSession=editable.file?editing.sessions[editable.file.id]:undefined;
  const markdownContent=editorSession?.content??file?.content??'';
  const imageHrefs=useMemo(()=>[...new Set([...markdownContent.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(match=>match[1]))].slice(0,8),[markdownContent]);
  const selectedRepo=state.catalog?.repositories.find(r=>r.id===active?.repositoryId);
  const selectedMember=state.catalog?.worktrees.find(member=>member.repositoryId===active?.repositoryId&&member.id===active?.checkoutId);
  const treeRepositories=useMemo<RepositoryTreeScope[]>(()=>state.sources.map(({id,source,member})=>{
    const prefix=state.directoryKey(source,'');
    const directories=Object.entries(state.directories).filter(([key])=>key.startsWith(prefix)).map(([,value])=>value);
    const items=new Map<string,RepositoryPreviewFile>();
    const decoration=sourceControlDecorations(state.sourceControl.data,source.repositoryId,source.checkoutId,Boolean(source.commitHash));
    for(const directory of directories)for(const item of directory.entries)items.set(item.path,{path:item.path,content:'',kind:'text',directory:item.kind==='directory',link:item.kind==='link',ignored:item.ignored,status:item.kind==='directory'?undefined:decoration.files.get(item.path),hasChanges:item.kind==='directory'&&decoration.directories.has(item.path)});
    const observed=directories.find(dir=>dir.path===''),label=codeWorktreeLabel(member,state.catalog?.worktrees);
    const locationLabel=(source.commitHash?'历史提交 · ':'')+label.name,repository=state.catalog?.repositories.find(r=>r.id===member.repositoryId);
    return {id,repositoryId:member.repositoryId,name:repository?codeRepositoryCode(repository):member.repositoryId,fullName:repository?codeRepositoryLabel(repository):member.repositoryId,
      location:observed?.source.location||member.path,locationLabel,version:source.commitHash||observed?.source.version,files:[...items.values()],hasChanges:decoration.hasChanges};
  }),[state.sources.map(item=>item.id+':'+item.member.available).join(','),state.catalog,state.directories,state.showIgnored,state.directoryKey,state.sourceControl.data]);
  const loadedKeys=state.sources.flatMap(({id,source})=>{
    const prefix=state.directoryKey(source,'');
    return [...new Set([...Object.keys(state.directories),...Object.keys(state.directoryErrors)])].filter(key=>key.startsWith(prefix)).map(key=>id+'::'+key.slice(prefix.length));
  });
  const files:RepositoryPreviewFile[]=file?[{path:file.path,kind:file.kind,content:file.content,image:file.kind==='image'?file.content:undefined}]:[];
  const sourceName=(browserId:string)=>{
    const item=state.sources.find(source=>source.id===browserId),repo=state.catalog?.repositories.find(r=>r.id===item?.source.repositoryId);
    return (repo?codeRepositoryLabel(repo):'')+(item?' · '+codeWorktreeLabel(item.member,state.catalog?.worktrees).name:'')+(item?.source.commitHash?' · '+item.source.commitHash.slice(0,7):'');
  };
  const searchResults=state.searchResults.flatMap(result=>result.matches.map(match=>({path:match.path,kind:'text' as const,content:'',repositoryId:result.browserId,sourceRepositoryId:result.repositoryId,repositoryName:sourceName(result.browserId),line:match.line||undefined,excerpt:match.excerpt,occurrences:match.occurrences})));
  const searchPartial=state.searchResults.some(result=>result.truncated);
  const directoryFailures=state.sources.flatMap(({source,id,member})=>{
    const prefix=state.directoryKey(source,'');return Object.entries(state.directoryErrors).filter(([key])=>key.startsWith(prefix)).map(([key,error])=>sourceName(id)+' · '+member.path+(key.slice(prefix.length)?'/'+key.slice(prefix.length):'')+'：'+error);
  });
  const partial=state.sources.some(({source})=>Object.entries(state.directories).some(([key,dir])=>key.startsWith(state.directoryKey(source,''))&&dir.truncated));
  const returnTarget=codeReturnTarget(state.entry,workspaceHref(workspaceId,''));
  const returnToSource=()=>{if(!returnTarget)return;const {from}=returnTarget;navigate({pathname:from.pathname,search:from.search,hash:from.hash},{state:from.state});};
  const openFile=(id:string,path:string,line?:number,matchQuery?:string)=>{const source=state.locationFor(id);if(!source)return;state.open(source,path,line,false,matchQuery);if(window.innerWidth<680)setTreeHidden(true);};
  const onSearch=useCallback((query:string,mode:'name'|'content')=>{setReadQuery(mode==='content'?query:'');state.search(query,mode);},[state.search]);
  const markdownOptions: MarkdownRenderOptions = {
    allowRelativeLinks: true,
    allowParentRelativeLinks: true,
    imageResolver: href => media[href] ? { href: media[href] } : null,
    onRelativeLinkClick: href => {
      if (!active) return;
      const path = relativeCodeLink(active.path, href);
      if (path) state.open(active, path);
      else message.info('此链接不在当前代码库内。');
    },
  };
  // Resolve relative document media through the same repository/version reader; never construct filesystem URLs.
  useEffect(()=>{
    setMedia({});if(!active||file?.kind!=='markdown'||file.page||!workspaceId)return;
    const controller=new AbortController();let alive=true;
    void Promise.allSettled(imageHrefs.map(async href=>{const path=relativeCodeLink(active.path,href);if(!path)return;const image=await codeApi.file(workspaceId,{repositoryId:active.repositoryId,checkoutId:active.checkoutId,taskId:active.taskId,commitHash:active.commitHash,path},controller.signal);if(image.kind==='image'&&alive)setMedia(previous=>({...previous,[href]:image.content}));}));
    return()=>{alive=false;controller.abort();};
  },[workspaceId,active?.key,imageHrefs.join('\n')]);
  const fileTabs=state.tabs.map(tab=>{
    const name=tab.path.split('/').at(-1)||tab.path;
    const repo=state.catalog?.repositories.find(r=>r.id===tab.repositoryId);
    const duplicate=state.tabs.some(other=>other.key!==tab.key&&other.path.split('/').at(-1)===name);
    const member=state.catalog?.worktrees.find(item=>item.id===tab.checkoutId),worktreeName=member?codeWorktreeLabel(member,state.catalog?.worktrees).name:'未知工作树';
    const sourceLabel=duplicate?(repo?.code||repo?.name||tab.repositoryId)+' · '+worktreeName+(tab.commitHash?' · '+tab.commitHash.slice(0,7):''):tab.commitHash?tab.commitHash.slice(0,7):'';
    return {key:tab.key,kind:/\.md$/i.test(tab.path)?'doc' as const:'svc' as const,
      title:(repo?codeRepositoryLabel(repo):'')+' / '+tab.path+' · '+worktreeName+' · '+(tab.commitHash||member?.path||'当前文件'),
      label:<>{name}{sourceLabel&&<Tag color={tab.commitHash?'gold':undefined}>{sourceLabel}</Tag>}</>,
      accessibleLabel:name+(sourceLabel?' '+sourceLabel:''),closeLabel:'关闭文件 '+tab.path};
  });
  const repositoryOptions=(state.catalog?.repositories||[]).map(repo=>({value:repo.id,label:codeRepositoryCode(repo),title:codeRepositoryLabel(repo)}));
  const singleRepository=state.scope.length===1;
  const worktreeMembers=(state.catalog?.worktrees||[]).filter(member=>singleRepository&&member.repositoryId===state.scope[0]);
  const selectedWorktree=singleRepository&&state.sources.length===1?state.sources[0].member:undefined;
  const worktreeOptions=worktreeMembers.map(member=>{
    const label=codeWorktreeLabel(member,worktreeMembers);
    return {value:member.id,label:label.name,role:[label.role,member.branch,member.available?'':'暂不可用'].filter(Boolean).join(' · '),title:member.path,disabled:!member.available};
  });
  const taskFallback=Boolean(state.entry?.taskId&&state.catalog&&!state.catalog.worktreeGroups.some(group=>group.kind==='task'&&group.taskId===state.entry!.taskId));
  const inScope=Boolean(active&&state.sources.some(item=>codeLocationKey(item.source)===codeLocationKey(active)));
  const includeActive=()=>{
    if(!active)return;const member=state.catalog?.worktrees.find(item=>item.id===active.checkoutId);
    if(!member){message.info('此文件的工作树暂不可确认，请从目录选择实际来源。');return;}
    state.setSourceFilters([active.repositoryId],'checkout:'+member.id);
  };
  const context=<section className="code-root-selectors" aria-label="代码库与工作树筛选">
    <Select mode="multiple" optionFilterProp="title" allowClear maxTagCount={1} classNames={{popup:{root:'code-source-picker-popup'}}} aria-label="筛选代码库" placeholder="全部代码库" value={state.scope} onChange={state.setScope} options={repositoryOptions} />
    <Select allowClear showSearch optionFilterProp="label" classNames={{popup:{root:'code-source-picker-popup'}}} aria-label="筛选工作树" placeholder={singleRepository?"选择工作树":"先选择一个代码库"} disabled={!singleRepository} value={selectedWorktree?.id} onChange={id=>state.setWorktreeScope(id?'checkout:'+id:undefined)} options={worktreeOptions} optionRender={option=><div className="code-worktree-option" data-code-worktree-id={option.value} data-code-worktree-group={worktreeMembers.find(member=>member.id===option.value)?.groupId} title={option.data.title}><span>{option.data.label}</span>{option.data.role&&<small>{option.data.role}</small>}</div>} />
    <small>{taskFallback?'任务没有独立目录，可在上方选择其他目录。':'选择代码库和工作树，查看对应文件'}</small>
  </section>;
  return <div className="code-explorer-stage">
    <CodeTreePane hidden={treeHidden} onHost={setHost} storageKey={`buildr.code.tree-width.${workspaceId}`} />
    <div className="code-file-stage">
      <div className="code-file-tabstrip">
        <ObjectTabStrip panelId={panelId} className="code-open-files" label="打开的文件" tabs={fileTabs} active={active?.key} onActivate={key=>{const tab=state.tabs.find(item=>item.key===key);if(tab)state.activate(tab);}} onClose={state.close} />
        {returnTarget&&<Button size="small" type="text" onClick={returnToSource}>{returnTarget.label}</Button>}
        <ReadingToggle className="code-reading-toggle" expanded={treeHidden} onToggle={()=>setTreeHidden(value=>!value)} />
      </div>
      {state.catalogError&&<Alert type="warning" message={state.catalogError} action={<Button onClick={()=>void state.refreshCatalog().catch(error=>message.error(String(error)))}>重试</Button>} />}
      {active&&!inScope&&<div className="code-range-outside">当前文件不在筛选范围内。<Button type="link" size="small" onClick={includeActive}>加入范围</Button></div>}
      {!state.catalog&&!state.catalogError&&<div className="repository-reading-empty"><Spin />正在读取代码库…</div>}
      {state.catalog?.repositories.length===0&&<Empty description="工作空间尚未登记代码库" />}
      {state.catalog&&state.catalog.repositories.length>0&&!state.sources.length&&<div className="code-range-outside" role="status">所选代码库与工作树没有共同目录，请调整筛选。</div>}
      <div className="object-tab-panel" id={panelId} role={active ? 'tabpanel' : undefined} aria-labelledby={active ? tabElementId(panelId, active.key) : undefined} tabIndex={active ? 0 : undefined}>
      <RepositoryFileBrowser global readerActive={viewActive} defaultCollapsedTree revealSelectionRequest={state.selectionRequest} sidebarHost={host} treeRepositories={treeRepositories} files={files} repositoryName={selectedRepo?codeRepositoryCode(selectedRepo):undefined} repositoryTitle={selectedRepo?codeRepositoryLabel(selectedRepo):undefined} repositoryId={active?.repositoryId} checkoutId={active?.checkoutId||undefined} observedDigest={currentText?undefined:file?.digest} observedRevision={currentText?editorSession?.file.revision||editable.file?.revision:file?.revision} observedAt={currentText?editorSession?.file.observedAt||editable.file?.observedAt:file?.observedAt} selectedRepositoryId={active?codeBrowserKey(active):undefined} selectedPath={active?.path||''} selectionKey={active?.key}
        readerSurface={currentText ? editable.file ? <FileEditingPane file={{...editable.file,locationLabel:selectedMember?codeWorktreeLabel(selectedMember,state.catalog?.worktrees).name:editable.file.locationLabel}} editing={editing} active={viewActive} focusLine={active?.line} focusRequest={active?.focusRequest}
          toolbarEnd={<Button size="small" type="text" aria-label="刷新当前文件" icon={<ReloadOutlined />} loading={Boolean(active&&state.loading.includes(active.key))} onClick={()=>void state.refreshFile()} />}
          searchQuery={readQuery} onSelectLines={lines=>{if(active)setSelection({key:active.key,lines});}}
          markdownRevision={Object.keys(media).join(',')} markdownOptions={markdownOptions} /> : editable.error ? <Alert type="error" showIcon message={editable.error} action={<Button onClick={()=>void state.refresh()}>重试</Button>} /> : <div className="repository-reading-empty"><Spin />正在读取文件…</div> : undefined}
        readerContent={currentText?editorSession?.content:undefined} readerSelectedLines={selection.key===active?.key?selection.lines:null}
        onSelect={(path,line,matchQuery)=>active&&state.open(active,path,line,false,matchQuery)} onSelectRepositoryFile={openFile} context={context}
        location={file?.source.location||selectedMember?.path||''} version={file?.source.version||active?.commitHash||'当前文件'} historical={Boolean(active?.commitHash)} focusLine={active?.line} focusRequest={active?.focusRequest}
        readLoading={Boolean(active&&state.loading.includes(active.key))} readError={active?state.fileErrors[active.key]:undefined} readMessage={file?.message||undefined} readPage={file?.page} readMatchQuery={file?.observedMatch?.query} sizeBytes={file?.sizeBytes} onReadPage={state.readPage} canModify={Boolean(file&&!file.truncated&&file.kind!=='unsupported'&&!state.fileErrors[active?.key||''])} taskTitle={state.entry?.taskTitle}
        onLoadDirectory={state.loadDirectory} onDirectoryExpansionChange={state.setExpandedDirectories} loadedDirectoryKeys={loadedKeys} onSearch={onSearch} onShowIgnored={state.setShowIgnored} searchResults={searchResults} searchLoading={state.searchLoading} searchIncomplete={searchPartial||state.searchErrors.length>0}
        treeNotice={<>
          {(searchPartial||partial)&&<div className="code-tree-coverage" role="status"><InfoCircleOutlined /><span>{searchPartial?'搜索未完整返回。每个工作树最多 100 个文件、200 条匹配行，请缩小关键词或范围。':'目录达到读取上限，显示部分文件。'}</span></div>}
          <CodeExplorerNotices notices={[
            {kind:'updates',title:'自动更新暂时中断',details:state.sourceControl.updateDiagnostics},
            {kind:'status',title:'代码状态暂未更新',details:state.sourceControl.readDiagnostics},
            {kind:'sources',title:'部分来源信息未能确认',details:state.catalog?.diagnostics.map(d=>d.message)||[]},
            {kind:'search',title:'部分搜索范围未完整读取',details:[...state.searchErrors,...state.searchResults.flatMap(result=>result.diagnostics.map(d=>d.message))]},
            {kind:'directories',title:'部分目录暂不可读取',details:directoryFailures},
          ]} onRetry={kind=>{
            if(kind==='updates'||kind==='status')state.sourceControl.retry();
            else if(kind==='sources')void state.refreshCatalog().catch(error=>message.error(String(error)));
            else void state.refresh().catch(error=>message.error(String(error)));
          }} />
        </>}
        onRefreshDirectories={state.refresh} onRetry={state.refreshFile} onViewCurrent={()=>{if(!active)return;if(!active.checkoutId){message.info('此历史文件的当前工作树尚未确认，请从目录选择实际来源。');return;}state.open({repositoryId:active.repositoryId,checkoutId:active.checkoutId},active.path);}} onHideTree={()=>setTreeHidden(true)}
        markdownRevision={Object.keys(media).join(',')} markdownOptions={markdownOptions} />
      </div>
    </div>
  </div>;
}
export { CodeSourceControlPage } from './CodeSourceControlPage';
