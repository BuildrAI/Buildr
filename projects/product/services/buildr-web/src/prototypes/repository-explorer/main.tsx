import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Empty, Select, Space, Tag, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, BranchesOutlined, FileTextOutlined, FolderOpenOutlined, FolderOutlined, HistoryOutlined, HomeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { ObjectTabStrip } from '../../components/ObjectTabStrip';
import { ReadingToggle } from '../../components/ReadingToggle';
import type { WorkspacePageTab } from '../../app/workspace-pages';
import { AssetHomeView } from '../../features/workspace/components/AssetHomeView';
import { RepositoryFileBrowser, type RepositoryFilePage, type RepositoryPreviewFile } from '../../features/workspace/components/RepositoryFileBrowser';
import { TaskOverview } from '../../features/task/components/TaskOverview';
import { TaskWorkPath } from '../../features/task/components/TaskWorkPath';
import { TaskDiffReader } from '../../features/task/components/TaskDiffReader';
import { changedFileKey } from '../../features/task/components/TaskChangedFiles';
import { taskStageLabels, type TaskNodeStage } from '../../features/task/components/taskWorkContent';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import { changes, context, defaultFiles, documentPath, files, historicalFiles, imagePath, rail, record, repository, sampleRepositories, services, sourcePath } from './fixtures';
import { ExplorerDock } from './ExplorerDock';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/task/task-detail.css';
import './preview.css';
import '../../features/code/code-explorer.css';

type Checkout = 'default' | 'task' | 'commit';
type FileTab = WorkspacePageTab & { file: string; repository: string; checkout: Checkout; line?: number };
const taskRoute = '/tasks/repository-explorer';
const repositoryRoute = '/repositories/buildr';
const scmRoute = '/code/source-control';
const largeDemoPath='docs/large-read-demo.txt';
const demoPageBytes=512*1024,demoPageCount=12;
function demoContent(index:number) {
  const header='// Large-file preview, segment '+String(index+1).padStart(2,'0')+'\n';
  return (header+('x'.repeat(8190)+'\n').repeat(63)).padEnd(demoPageBytes,' ');
}
function createFileTab(file: string, repository: string, checkout: Checkout, line?: number): FileTab {
  const repo = sampleRepositories.find(item => item.id === repository)!;
  const key = repository + ':' + checkout + ':' + file;
  return { key, kind: 'svc', title: file.split('/').at(-1)! + (checkout === 'commit' ? ' · a13c8f' : checkout === 'task' ? ' · 任务目录' : repository !== 'buildr' ? ' · ' + repo.name : ''), path: '/code/explorer/' + repository + '/' + checkout + '/' + encodeURIComponent(file), file, repository, checkout, line };
}
const initial = createFileTab(sourcePath, 'buildr', 'default');
function Preview() {
  const { message } = App.useApp();
  const navigate = useNavigate(), route = useLocation();
  const [fileTabs, setFileTabs] = useState<FileTab[]>([initial]);
  const [lastCodePath, setLastCodePath] = useState(initial.path);
  const [stage, setStage] = useState<TaskNodeStage | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [treeHidden, setTreeHidden] = useState(() => window.innerWidth < 680);
  const [sidebarHost, setSidebarHost] = useState<HTMLDivElement | null>(null);
  const [selectedPath, setSelectedPath] = useState(sourcePath);
  const [selectedRepository, setSelectedRepository] = useState('buildr');
  const [repositoryScope, setRepositoryScope] = useState<string[]>([]);
  const [scopeOrigin, setScopeOrigin] = useState<'all' | 'task' | 'manual'>('all');
  const [treeCheckouts, setTreeCheckouts] = useState<Record<string, Checkout>>({ buildr: 'default' });
  const [selectedChange, setSelectedChange] = useState(changedFileKey(changes[0]));
  const [checkout, setCheckout] = useState<Checkout>('default');
  const [state, setState] = useState('');
  const [fromTask, setFromTask] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [searchSeed, setSearchSeed] = useState('');
  const [demoPageIndex,setDemoPageIndex]=useState(0);
  const current = useRef({ page: 'files', state: '' });
  const isCode = route.pathname.startsWith('/code/');
  const isSCM = route.pathname === scmRoute;
  const isRepository = route.pathname === repositoryRoute;
  const area = isCode ? 'code' : isRepository ? 'workspace' : 'workbench';
  const page = isSCM ? 'source-control' : isCode ? 'files' : isRepository ? 'repository' : stage ? 'task' : 'task-changes';
  const active = fileTabs.find(tab => tab.path === route.pathname);
  const repo = sampleRepositories.find(item => item.id === selectedRepository)!;
  const historical = checkout === 'commit';
  const scopedRepositories = sampleRepositories.filter(item => !repositoryScope.length || repositoryScope.includes(item.id));
  const demoFile:RepositoryPreviewFile={path:largeDemoPath,kind:'text',content:demoContent(demoPageIndex)};
  const demoActive=selectedRepository==='buildr'&&selectedPath===largeDemoPath;
  const demoPage:RepositoryFilePage={index:demoPageIndex,total:demoPageCount,offset:demoPageIndex*demoPageBytes,endOffset:(demoPageIndex+1)*demoPageBytes,startLine:demoPageIndex*64+1,endLine:demoPageIndex*64+65,startsMidLine:demoPageIndex>0,endsMidLine:demoPageIndex<demoPageCount-1};
  const treeRepositories = scopedRepositories.map(item => ({ ...item, location: item.id === 'buildr' && treeCheckouts[item.id] === 'task' ? '.worktrees/repository-explorer' : item.id === 'buildr' && treeCheckouts[item.id] === 'commit' ? '历史 a13c8f294d50' : item.location, files: item.id === 'buildr' ? [...(treeCheckouts[item.id] === 'commit' ? historicalFiles : treeCheckouts[item.id] === 'task' ? files : defaultFiles),demoFile] : item.files }));
  const content = selectedRepository === 'buildr' ? [...(historical ? historicalFiles : checkout === 'task' ? files : defaultFiles),demoFile] : repo.files;
  const locationText = checkout === 'task' ? 'Buildr / .worktrees/repository-explorer' : historical ? 'Buildr / 提交 a13c8f294d50' : repo.location;
  const version = historical ? 'a13c8f294d50 · 历史文件' : checkout === 'task' ? 'codex/repository-explorer · 当前文件' : 'dev · 当前文件';
  const info = () => message.info('此原型使用示例数据，操作只影响当前演示。');
  function openFile(file: string, repositoryId = selectedRepository, scope: Checkout = checkout, line?: number, taskOrigin = fromTask) {
    if(file===largeDemoPath)setDemoPageIndex(line?Math.max(0,Math.min(demoPageCount-1,Math.floor((line-1)/64))):0);
    const tab = createFileTab(file, repositoryId, scope, line);
    setFileTabs(existing => existing.some(item => item.key === tab.key) ? existing.map(item => item.key === tab.key ? tab : item) : [...existing, tab]);
    setTreeCheckouts(previous => ({ ...previous, [repositoryId]: scope })); setSelectedPath(file); setSelectedRepository(repositoryId); setCheckout(scope); setLastCodePath(tab.path); setFromTask(taskOrigin);
    setState(scope === 'commit' ? 'history' : file === documentPath ? 'markdown' : file === imagePath ? 'image' : '');
    navigate(tab.path);
    if (window.innerWidth < 680) setTreeHidden(true);
  }
  function openTask(nextStage: TaskNodeStage | null = stage) { setStage(nextStage); navigate(taskRoute); }
  function locateTaskFile(file = sourcePath, scope: Checkout = 'task', line?: number) {
    setRepositoryScope(['buildr']); setScopeOrigin('task');
    setSearchSeed(''); setResetKey(value => value + 1); setTreeHidden(false);
    openFile(file, 'buildr', scope, line, true);
  }
  function enterTaskScope() {
    setRepositoryScope(['buildr']); setScopeOrigin('task'); setFromTask(true); setTreeHidden(false);
    setTreeCheckouts(previous => ({ ...previous, buildr: 'task' }));
    setSelectedRepository('buildr'); setCheckout('task'); setSelectedPath('');
    setSearchSeed(''); setResetKey(value => value + 1); setState('task-origin');
    setLastCodePath('/code/explorer'); navigate('/code/explorer');
  }
  function selectScene(nextPage: string, nextState: string) {
    setSearchSeed(nextState === 'search' ? 'Task' : ''); setResetKey(value => value + 1); setTreeHidden(nextState === 'collapsed');
    if (nextPage === 'files') {
      setRepositoryScope(nextState === 'task-origin' ? ['buildr'] : nextState === 'multi-repository' ? ['buildr', 'demo-web'] : []); setScopeOrigin(nextState === 'task-origin' ? 'task' : 'all');
      if (nextState === 'task-origin') { enterTaskScope(); return; }
      const repoId = nextState === 'multi-repository' ? 'demo-web' : 'buildr';
      const file = nextState === 'large-file' ? largeDemoPath : nextState === 'markdown' ? documentPath : nextState === 'image' ? imagePath : repoId === 'buildr' ? sourcePath : 'README.md';
      openFile(file, repoId, nextState === 'history' ? 'commit' : nextState === 'task-origin' ? 'task' : 'default', nextState === 'task-origin' ? 190 : undefined, ['task-origin', 'history'].includes(nextState));
      setState(nextState); setTreeHidden(nextState === 'collapsed');
    } else if (nextPage === 'source-control') navigate(scmRoute);
    else if (nextPage === 'repository') navigate(repositoryRoute);
    else openTask(nextPage === 'task' ? (nextState || 'requirements') as TaskNodeStage : null);
  }
  const bridge = usePrototypeBridge(scenes.pages, current, selectScene);
  const fileState = state === 'unavailable' ? 'unavailable' : treeHidden ? 'collapsed' : demoActive ? 'large-file' : historical ? 'history' : state === 'search' ? 'search' : scopeOrigin === 'task' && fromTask ? 'task-origin' : selectedRepository !== 'buildr' ? 'multi-repository' : selectedPath === documentPath ? 'markdown' : selectedPath === imagePath ? 'image' : '';
  useEffect(() => { bridge.report(page, page === 'files' ? fileState : page === 'task' ? stage! : ''); }, [page, fileState, stage]);
  useEffect(() => {
    const target = fileTabs.find(tab => tab.path === route.pathname);
    if (!target) return;
    setTreeCheckouts(previous => ({ ...previous, [target.repository]: target.checkout })); setSelectedPath(target.file); setSelectedRepository(target.repository); setCheckout(target.checkout); setLastCodePath(target.path);
  }, [route.pathname]);
  function closeFile(key: string) {
    const index = fileTabs.findIndex(tab => tab.key === key);
    const next = fileTabs.filter(tab => tab.key !== key);
    if (!next.length) { setFileTabs([]); setSelectedPath(''); setLastCodePath('/code/explorer'); navigate('/code/explorer'); return; }
    setFileTabs(next);
    if (active?.key === key) { const target = next[Math.min(index, next.length - 1)]; setLastCodePath(target.path); navigate(target.path); }
  }
  const nav: Array<[string, string, ReactNode]> = area === 'code'
    ? [['explorer', '资源管理器', <FolderOpenOutlined />], ['source-control', '源代码管理', <BranchesOutlined />]]
    : area === 'workbench' ? [['overview', '概览', <HomeOutlined />], ['tasks', '任务', <UnorderedListOutlined />], ['activity', '动态', <HistoryOutlined />]]
    : [['overview', '总览', <HomeOutlined />], ['projects', '项目', <FolderOutlined />], ['services', '服务', <AppstoreOutlined />], ['repositories', '代码库', <BranchesOutlined />], ['knowledge', '文章', <FileTextOutlined />]];
  const navigation = <nav className="shell-navigation" aria-label={area === 'code' ? '代码导航' : area === 'workbench' ? '工作台导航' : '工作空间导航'} data-prototype-position="code-menu"><p className="shell-nav-caption">{area === 'code' ? '代码' : area === 'workbench' ? '工作台' : '工作空间'}</p>{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={key === 'source-control' ? scmRoute : area === 'code' ? lastCodePath : area === 'workbench' ? taskRoute : repositoryRoute} path={'/' + key} active={key === (area === 'code' ? isSCM ? 'source-control' : 'explorer' : area === 'workbench' ? 'tasks' : 'repositories')} onClick={event => { if (!['explorer', 'source-control', 'tasks', 'repositories'].includes(key)) { event.preventDefault(); info(); } }} />)}</nav>;
  return <div className={'app-shell repository-explorer-preview area-' + area}>
    <AppShellHeader development brandHref={taskRoute} workspaceName="Buildr" workspaceMenuItems={[{ key: 'mock', label: 'Buildr · 原型数据', onClick: info }]} area={area} codeHref={lastCodePath} workbenchHref={taskRoute} workspaceDestination={{ to: repositoryRoute }} actions={<><Button type="text" aria-label="搜索" icon={<SearchOutlined />} onClick={info} /><Button className="nav-quit" type="text" onClick={info}>退出</Button><Button type="primary" icon={<PlusOutlined />} onClick={info}>提出新目标</Button></>} />
    <AppShellFrame sidebarCollapsed={collapsed} sidebarWidth={200} onToggleSidebar={() => setCollapsed(value => !value)} navigation={navigation}>
      <div className="workspace-pages">
        <div hidden={!isCode || isSCM} className="code-explorer-stage">
          <ExplorerDock hidden={treeHidden} onHost={setSidebarHost} />
          <section className="code-file-stage" aria-label="文件阅读区">
            <div className="code-file-tabstrip" data-prototype-position="file-tabs"><ObjectTabStrip className="code-open-files" label="打开的文件" tabs={fileTabs.map(tab=>({...tab,kind:/\.md$/i.test(tab.file)?'doc' as const:'svc' as const,label:tab.title,accessibleLabel:tab.title,title:(sampleRepositories.find(item=>item.id===tab.repository)?.name||'')+' / '+tab.file+' · '+tab.checkout,closeLabel:'关闭文件 '+tab.file}))} active={active?.key} onClose={closeFile} onActivate={key=>{const tab=fileTabs.find(item=>item.key===key);if(tab)navigate(tab.path);}} />{fromTask && <Button size="small" type="text" onClick={() => openTask()} data-prototype-position="return-task">返回任务</Button>}<ReadingToggle className="code-reading-toggle" expanded={treeHidden} onToggle={()=>setTreeHidden(value=>!value)} /></div>
            {selectedPath && !scopedRepositories.some(item => item.id === selectedRepository) && <div className="code-range-outside">当前文件在筛选范围外：{repo.name}<Button size="small" type="link" onClick={() => setRepositoryScope(ids => [...new Set([...ids, selectedRepository])])}>加入范围</Button></div>}
            <RepositoryFileBrowser global sidebarHost={sidebarHost} readerActive={isCode && !isSCM} onHideTree={() => setTreeHidden(true)}
              files={content} repositoryName={repo.name} treeRepositories={treeRepositories} selectedRepositoryId={selectedRepository} onSelectRepositoryFile={(id, path, line) => openFile(path, id, treeCheckouts[id] || 'default', path===largeDemoPath&&line?line+demoPageIndex*64:line)} selectedPath={selectedPath} onSelect={(file, line) => openFile(file, selectedRepository, checkout, file===largeDemoPath&&line?line+demoPageIndex*64:line)}
              context={<Space direction="vertical" size={6} className="code-root-selectors"><Select mode="multiple" allowClear maxTagCount="responsive" aria-label="筛选代码库范围" placeholder="全部代码库" value={repositoryScope} onChange={ids => { setRepositoryScope(ids); setScopeOrigin(ids.length ? 'manual' : 'all'); }} options={sampleRepositories.map(item => ({ value: item.id, label: item.name }))} /><small>{scopeOrigin === 'task' ? '由任务服务预选，已按代码库去重' : '显示 ' + scopedRepositories.length + ' 个代码库的完整文件树'}</small>{selectedPath&&<><Tooltip title="代码库目录显示登记位置的实时文件，任务关联目录显示对应任务工作树，历史提交显示该提交的文件；各目录分别读取。"><Select size="small" aria-label="查看位置与版本" value={checkout} options={[{value:'default',label:'代码库目录'},...(fromTask?[{value:'task',label:'任务关联目录'}]:[]),...(historical?[{value:'commit',label:'历史提交 · a13c8f294d'}]:[])]} onChange={value=>{if(value!=='commit')openFile(selectedPath,selectedRepository,value);}} /></Tooltip><small className="code-location-path" title={locationText}>{locationText}</small></>}{repositoryScope.length > 0 && <Button size="small" type="text" onClick={() => { setRepositoryScope([]); setScopeOrigin('all'); }}>查看全部代码库</Button>}</Space>}

              location={locationText} version={version} historical={historical} focusLine={active?.line}
              readPage={demoActive?demoPage:null} sizeBytes={demoActive?demoPageCount*demoPageBytes:undefined} readMessage={demoActive?'模拟大文件超过 5 MiB，当前显示一段。':undefined} observedRevision={demoActive?'prototype-large-v1':undefined} canModify={!demoActive} onReadPage={demoActive?setDemoPageIndex:undefined}
              unavailable={state === 'unavailable'} resetKey={resetKey} searchSeed={searchSeed} onRetry={() => setState('')}
              onViewCurrent={() => openFile(selectedPath, selectedRepository, fromTask ? 'task' : 'default')}
              onChanges={checkout === 'task' && selectedRepository === 'buildr' ? file => { const entry = changes.find(item => item.path === file); if (entry) { setSelectedChange(changedFileKey(entry)); openTask(null); } } : undefined}
              onScene={next => { if (state !== 'unavailable') setState(historical ? 'history' : next); }} />
          </section>
        </div>
        <div hidden={!isSCM} className="workspace-page code-scm-pending" data-prototype-position="source-control-pending"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><h2>源代码管理</h2><p>下一步建设：全部代码库的改动、提交历史与提交详情。</p><Tag>待建设</Tag></>} /><Button onClick={() => navigate(lastCodePath)}>返回资源管理器</Button></div>
        <div hidden={isCode || isRepository} className="workspace-page repository-task-page">
          <div className="workspace-page-tabs task-preserved-tab" data-prototype-position="task-context"><span>为 Buildr 增加资源管理器</span></div>
          <article className="task-detail-page repository-task-header"><TaskOverview record={record} metadata={<section className="task-header-context"><div className="task-metadata-line"><span>项目：<Button type="link" onClick={info}>product</Button></span><span>服务：buildr、buildr-web</span><Tag bordered={false}>原型数据</Tag></div></section>} onRelativeLink={info} actions={<><Button type="text" size="small" aria-label="刷新任务" icon={<ReloadOutlined />} onClick={info} /><Button size="small" onClick={enterTaskScope} data-prototype-position="task-file-entry">查看源文件</Button></>} /><TaskWorkPath record={record} context={context} selected={stage} onSelect={value => openTask(value)} contentTabs={[{ key: 'changes', label: <span>改动与提交 <span className="task-badge">{changes.length}</span></span>, selected: !stage, onSelect: () => openTask(null) }]} actions={<Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={info}>实施清单</Button>} /></article>
          <div hidden={Boolean(stage)} className="repository-changes-slot"><TaskDiffReader repositories={rail} selected={selectedChange} onSelect={key => { if (key) setSelectedChange(key); }} onOpenFile={(file, _repo, commit) => locateTaskFile(file.path, commit ? 'commit' : 'task', commit ? 1 : 190)} notice="示例数据 · 打开完整文件后，可以返回原来的任务审阅。" /></div>
          {stage && <section className="repository-stage-context"><h2>{taskStageLabels[stage].title}</h2><p>{stage === 'requirements' ? record.intent : stage === 'design' ? '顶栏新增代码板块，资源管理器和源代码管理使用独立菜单；任务直接定位相关文件并保留返回现场。' : stage === 'implementation' ? '先建设代码框架与完整文件浏览，再接全局源代码管理。' : '核对实际成果、检查与交付结果。'}</p><Space><Button onClick={() => openTask(null)}>查看改动与提交</Button><Button onClick={enterTaskScope}>查看源文件</Button></Space></section>}
        </div>
        <div hidden={!isRepository} className="workspace-page repository-overview-page"><AssetHomeView kind="repository" item={repository} related={services} relationHref={() => repositoryRoute} onRelation={info} actions={<Space><Button onClick={info}>收藏</Button><Button onClick={() => openFile(sourcePath, 'buildr', 'default')}>浏览源文件</Button></Space>} repositoryContent={<div className="repository-overview-facts"><h2>代码来源</h2><dl className="asset-facts"><div><dt>默认目录</dt><dd>Buildr</dd></div><div><dt>当前分支（Branch）</dt><dd><code>dev</code></dd></div></dl></div>} /></div>
      </div>
    </AppShellFrame>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={[initial.path]}><Preview /></MemoryRouter></App></ConfigProvider>);
