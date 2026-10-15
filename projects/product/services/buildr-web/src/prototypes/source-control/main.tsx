import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BranchesOutlined, FolderOpenOutlined, HistoryOutlined, HomeOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppShellContext, type AppShellContextValue } from '../../app/AppShellContext';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { ObjectTabStrip } from '../../components/ObjectTabStrip';
import { WorkbenchTaskRow } from '../../features/workbench/components/WorkbenchTaskRow';
import { TaskOverview } from '../../features/task/components/TaskOverview';
import { TaskWorkPath } from '../../features/task/components/TaskWorkPath';
import type { RailCommit, RailRepository } from '../../features/task/components/TaskDiffReader';
import { RepositoryFileBrowser } from '../../features/workspace/components/RepositoryFileBrowser';
import type { TaskNodeStage } from '../../features/task/components/taskWorkContent';
import { type SourceControlChange, type SourceControlScene, type SourceControlState } from '../../features/code/components/SourceControlWorkbench';
import { TaskChangesPreview, taskChangeCount, taskCurrentFile } from './TaskChangesPreview';
import { sourceControlRepositories } from './fixtures';
import { MockSourceControlWorkbench } from './MockSourceControlWorkbench';
import { taskRecord, parentRecord, parentItem, taskContext } from './context-fixtures';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/workbench/workbench.css';
import '../../features/task/task-detail.css';
import '../../features/task/components/composite-task.css';
import './preview.css';

function Preview() {
  const { message } = App.useApp();
  const navigate = useNavigate(), location = useLocation();
  const [page, setPage] = useState('changes'), [state, setState] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const [stage, setStage] = useState<TaskNodeStage | 'changes'>('design');
  const [taskFile, setTaskFile] = useState<{ file: SourceControlChange; repository: RailRepository; commit?: RailCommit } | null>(null);
  const [codeFromTask, setCodeFromTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState('code-source-control');
  const previousCode = useRef({ page: 'changes', state: '' });
  const current = useRef({ page: 'changes', state: '' });
  const isTask = page === 'task-context', isWorkbench = page === 'workbench';
  const isTaskFile = page === 'task-file';
  const isCode = !isTask && !isWorkbench;
  const parent = selectedTask === 'code-workspace';
  const record = parent ? parentRecord : selectedTask === 'code-workspace-explorer' ? { ...taskRecord, taskId: selectedTask, title: '建立代码板块、资源管理器与任务文件关联', status: 'completed' as const } : taskRecord;
  function select(nextPage: string, nextState = '') {
    setPage(nextPage); setState(nextState);
    if (nextPage === 'task-context') { setSelectedTask(nextState === 'parent' ? 'code-workspace' : 'code-source-control'); setStage(nextState === 'changes' ? 'changes' : 'design'); }
    if (nextPage === 'task-file' && !taskFile) {
      const repository = sourceControlRepositories[0], file = repository.taskChanges![0];
      setTaskFile({ file, repository: { id: repository.id, label: repository.name, root: repository.taskLocation!, branch: repository.taskBranch!, ahead: repository.ahead, status: 'complete', changes: [file], commits: [] } });
      setStage('changes');
    }
    navigate('/scene/' + nextPage);
  }
  const bridge = usePrototypeBridge(scenes.pages, current, select);
  useEffect(() => { bridge.report(page, state); }, [page, state]);
  useEffect(() => {
    if (location.pathname.includes('/tasks/code-workspace')) {
      setSelectedTask(location.pathname.endsWith('/code-workspace') ? 'code-workspace' : 'code-workspace-explorer');
      setPage('task-context'); setState(location.pathname.endsWith('/code-workspace') ? 'parent' : '');
    } else if (location.pathname === '/workbench' || location.pathname === '/workspace') select('workbench');
    else if (location.pathname === '/code/source-control') { if (isTask || isTaskFile) setCodeFromTask(true); select(previousCode.current.page, previousCode.current.state); }
    else if (location.pathname === '/code/explorer') select('full-file');
  }, [location.pathname]);
  function openTask(taskId: string) {
    if (isCode && !isTaskFile) previousCode.current = { page, state };
    if (taskId !== selectedTask) setStage('design');
    setSelectedTask(taskId); setPage('task-context'); setState(taskId === 'code-workspace' ? 'parent' : taskId === selectedTask && stage === 'changes' ? 'changes' : '');
    navigate('/scene/task-context');
  }
  function selectTaskStage(next: TaskNodeStage | 'changes') {
    setStage(next); setState(next === 'changes' ? 'changes' : parent ? 'parent' : '');
  }
  function openTaskFile(file: SourceControlChange, repository: RailRepository, commit?: RailCommit) {
    setTaskFile({ file, repository, commit }); setPage('task-file'); setState(''); navigate('/scene/task-file');
  }
  const info = () => message.info('此原型使用模拟数据，仅演示查看与定位。');
  const shell: AppShellContextValue = {
    workspaceId: 'prototype', workspace: { name: 'Buildr', rootPath: '/模拟工作空间/Buildr' },
    navigationRevision: 0, refreshNavigation: info, setWorkspace: info, openWorkspaceSettings: info,
    workspaceRegistryRevision: 0, openAgentAction: info, breadcrumbParts: [], setBreadcrumbParts: () => {},
    taskListResetToken: 0, resetTaskList: info, workspaceMenuTarget: () => ({ to: '/workspace' }), forgetWorkspacePage: () => {},
  };
  const nav: Array<[string, string, ReactNode]> = isCode
    ? [['explorer', '资源管理器', <FolderOpenOutlined />], ['source-control', '源代码管理', <BranchesOutlined />]]
    : [['overview', '概览', <HomeOutlined />], ['tasks', '任务', <UnorderedListOutlined />], ['activity', '动态', <HistoryOutlined />]];
  const codePage = isCode && !isTaskFile ? page : previousCode.current.page;
  const scene = (codePage === 'task-source' ? 'task' : codePage) as SourceControlScene;
  return <AppShellContext.Provider value={shell}><div className={'app-shell source-control-preview area-' + (isCode ? 'code' : 'workbench')}>
    <AppShellHeader development brandHref="/workbench" workspaceName="Buildr" workspaceMenuItems={[{ key: 'preview', label: 'Buildr · 原型数据', onClick: info }]}
      area={isCode ? 'code' : 'workbench'} codeHref="/code/source-control" workbenchHref="/workbench" workspaceDestination={{ to: '/workspace' }}
      actions={<><Tag bordered={false}>原型数据</Tag><Button type="text" aria-label="搜索" icon={<SearchOutlined />} onClick={info} /><Button type="text" onClick={info}>退出</Button><Button type="primary" icon={<PlusOutlined />} onClick={info}>提出新目标</Button></>} />
    <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)}
      navigation={<nav className="shell-navigation" aria-label={isCode ? '代码导航' : '工作台导航'}><p className="shell-nav-caption">{isCode ? '代码' : '工作台'}</p>{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={isCode ? '/code/' + key : '/' + key} path={'/' + key}
        active={isCode ? (page === 'full-file' || isTaskFile ? key === 'explorer' : key === 'source-control') : isWorkbench ? key === 'overview' : key === 'tasks'}
        onClick={event => { event.preventDefault(); if (key === 'explorer') select('full-file'); else if (key === 'source-control') select('changes'); else if (key === 'overview') select('workbench'); else if (key === 'tasks') openTask(selectedTask); else info(); }} />)}</nav>}>
      {<div hidden={!isCode || isTaskFile} className="workspace-pages scm-page-shell"><div className="scm-object-tabs"><ObjectTabStrip tabs={[{ key: 'scm', kind: 'svc', title: page === 'full-file' ? '完整文件' : '源代码管理' }]} active="scm" onActivate={() => {}} onClose={() => select('workbench')} />{codeFromTask && scene !== 'task' && <Button type="text" size="small" onClick={() => openTask(selectedTask)}>返回任务</Button>}<span className="scm-context-label">{page === 'history' ? '提交历史' : page === 'full-file' ? '文件阅读' : '未提交变更'}</span></div>
        <MockSourceControlWorkbench repositories={sourceControlRepositories} scene={scene} state={(isCode && !isTaskFile ? state : previousCode.current.state) as SourceControlState}
          onScene={(next, nextState = '') => { const nextPage = next === 'task' ? 'task-source' : next; setPage(nextPage); setState(nextState); previousCode.current = { page: nextPage, state: nextState }; }} onOpenTask={openTask} />
      </div>}{isTaskFile && taskFile && <section className="workspace-pages scm-page-shell scm-task-full-file" data-prototype-position="task-full-file">
        <div className="scm-object-tabs"><ObjectTabStrip tabs={[{ key: taskFile.file.path, kind: 'svc', title: taskFile.file.path, label: taskFile.file.path.split('/').at(-1) }]} active={taskFile.file.path} onActivate={() => {}} onClose={() => openTask(selectedTask)} /><Button type="text" size="small" onClick={() => openTask(selectedTask)}>返回任务</Button></div>
        <RepositoryFileBrowser global readerActive files={[{ path: taskFile.file.path, kind: taskFile.file.path.endsWith('.md') ? 'markdown' : 'text', content: taskFile.file.content }]}
          selectedPath={taskFile.file.path} onSelect={() => {}} repositoryName={taskFile.repository.label} context={null} location={taskFile.repository.root}
          version={taskFile.commit ? taskFile.commit.commit.hash + ' · 历史文件' : taskFile.repository.branch + ' · 当前文件'} historical={Boolean(taskFile.commit)} canModify={false}
          observedRevision={taskFile.commit?.commit.hash || 'prototype-task-file'} onRetry={() => { info(); }} onViewCurrent={() => {
            const file = taskCurrentFile(selectedTask, taskFile.repository.id, taskFile.file.path);
            if (file) setTaskFile({ file, repository: taskFile.repository });
          }} />
      </section>}{isWorkbench ? <div className="workbench-page scm-workbench-demo">
        <header className="workbench-page-heading"><div><p className="workbench-eyebrow">10月2日星期五</p><h1>工作概览</h1><p className="workbench-subtitle">0 件事等待你回应，1 项工作正在推进。</p></div></header>
        <section className="workbench-attention"><div className="workbench-section-heading"><h2>等我回应 <span className="workbench-count">0</span></h2><span className="workbench-attention-empty"><span className="workbench-quiet-dot" />暂无等待回应的事项</span></div><p className="workbench-attention-description">需要你决定、验收或补充信息的事项。</p></section>
        <div className="workbench-home-grid"><section><div className="workbench-section-heading"><h2>继续推进 <span className="workbench-count">1</span></h2><Button type="link" onClick={() => select('task-context', 'parent')}>全部任务 →</Button></div><div className="workbench-task-list" data-prototype-position="composite-badge"><WorkbenchTaskRow item={parentItem} projectNames={{ product: 'Buildr 产品' }} compact onError={value => message.error(value)} /></div></section>
          <section><div className="workbench-section-heading"><h2>近期完成</h2></div><p className="scm-recent-title">建立代码板块、资源管理器与任务文件关联</p><p className="workbench-muted">已完成文件浏览、搜索及任务定位。源代码管理接续建设。</p><Button type="link" onClick={() => select('changes')}>查看源代码管理 →</Button></section></div>
      </div> : null}<div hidden={!isTask} className="workspace-page scm-task-demo"><article className={'task-detail-page' + (stage === 'changes' ? ' is-wide' : '')}>
        <TaskOverview record={record} onRelativeLink={info} metadata={<div className="task-metadata-line"><span>{record.taskId}</span><span>Buildr 产品</span><span>最后更新 2026/10/2 17:10</span></div>}
          actions={<Button onClick={() => select(previousCode.current.page, previousCode.current.state)}>返回源代码管理</Button>} />
        <TaskWorkPath record={record} context={taskContext} selected={stage === 'changes' ? null : stage} onSelect={selectTaskStage}
          contentTabs={parent ? [] : [{ key: 'changes', label: <span data-prototype-position="changes-entry">改动与提交 <span className="task-badge">{taskChangeCount(selectedTask)}</span></span>, selected: stage === 'changes', onSelect: () => selectTaskStage('changes') }]} />
        <div hidden={stage !== 'changes' || parent} className="task-detail-layout scm-task-changes" data-prototype-position="task-changes"><div className="task-detail-reading"><div className="task-node-content"><div className="task-node-reading"><TaskChangesPreview key={selectedTask} taskId={selectedTask} onOpenFile={openTaskFile} /></div></div></div></div>
        <section hidden={stage === 'changes' && !parent} className="scm-task-copy" data-prototype-position="task-source-entry">{parent ? <><h2>子任务与当前成果</h2><p>资源管理器已交付，源代码管理正在方案设计。组合任务依据整体目标验收。</p><div className="scm-child-row"><Tag color="success">已完成</Tag><Button type="link" onClick={() => openTask('code-workspace-explorer')}>建立代码板块、资源管理器与任务文件关联</Button></div><div className="scm-child-row"><Tag color="processing">进行中</Tag><Button type="link" onClick={() => openTask('code-source-control')}>{taskRecord.title}</Button></div></> : <><h2>{stage === 'design' ? '源代码管理方案' : stage === 'requirements' ? '任务说明' : stage === 'implementation' ? '开发实现' : '任务收尾'}</h2><p>从全部代码库开始，查看当前未提交内容；按代码库选择提交历史，继续阅读对应文件。任务内“改动与提交”保留原来的文件与提交列表、差异阅读及完整文件入口。</p><p>顶部“代码”进入源代码管理，补充跨代码库查看。所属组合任务：建设代码板块与代码查看能力。</p></>}</section>
      </article></div>
    </AppShellFrame>
  </div></AppShellContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/scene/changes']}><Preview /></MemoryRouter></App></ConfigProvider>);
