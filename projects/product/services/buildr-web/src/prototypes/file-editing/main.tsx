import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Select, Space, Tabs } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, BranchesOutlined, FileTextOutlined, FolderOpenOutlined, FolderOutlined, HomeOutlined, MoreOutlined, PlusOutlined, RightOutlined, SearchOutlined, StarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { WorkspaceTabsContext } from '../../app/pageTabs';
import { PageTabStrip } from '../../app/PageTabStrip';
import { WorkspaceStage } from '../../components/WorkspaceStage';
import { ObjectTabStrip } from '../../components/ObjectTabStrip';
import { ReadingToggle } from '../../components/ReadingToggle';
import { ProjectHomeHeader } from '../../features/project/components/ProjectHomeHeader';
import { ProjectHomeEntries } from '../../features/project/components/ProjectHomeEntries';
import { ProjectServicesView } from '../../features/project/components/ProjectServicesView';
import { RepositoryFileBrowser } from '../../features/workspace/components/RepositoryFileBrowser';
import { CodeTreePane } from '../../features/code/components/CodeTreePane';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import { FileEditingPane } from './FileEditingPane';
import { useFileEditing, type FileEditingDocument } from './useFileEditing';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/code/code-explorer.css';
import '../repository-explorer/preview.css';
import './preview.css';

const root = '/Users/chenjun/workspaces/BuildrAI/Buildr';
const readme = '# Buildr 产品\n\nBuildr 为人和智能体（Agent）提供共同的工作现场。\n\n## 产品目标\n\n围绕代码、文档与工作成果，让目标可以持续推进，让结果可以独立查看和接续。\n\n## 日常工作\n\n- 在项目中理解目标、组成与约束。\n- 在资源管理器（Explorer）中查看当前文件。\n- 直接调整明确的细节，或交给智能体（Agent）处理目标。\n\n## 文件编辑\n\n编辑后的内容会自动保存到当前文件。\n\n通过撤销（Undo）和重做（Redo）调整最近的输入；文件被其他工具修改时，先对照双方内容。\n\n## 相关资料\n\n- [项目规则](AGENTS.md)\n- [更新记录](../../CHANGELOG.md)\n';
const agents = '# AGENTS.md\n\n规则与授权边界。\n\n## 项目定位\n\n本项目维护 Buildr 产品本身。\n\n所有面向用户的回复和说明默认使用中文。\n\n## 协作原则\n\n1. 人负责目标、约束、判断、授权和验收。\n2. 智能体（Agent）依据当前文件继续工作。\n3. 不同入口修改同一个文件时，先核对已观察版本。\n\n## 文档约定\n\n使用清楚、简练的表达，说明实际结果和下一步。\n\n文件末尾保留一个换行符。\n';
const changelog = '# Changelog\n\n本项目遵循语义化版本。\n\n## 待发布\n\n### 文件编辑\n\n- 项目资料与资源管理器（Explorer）支持编辑当前文本文件。\n- 编辑默认自动保存。\n- 支持撤销（Undo）和重做（Redo）。\n- 保存冲突时保留双方内容，供对照和合并。\n\n## 0.1.0-rc.38\n\n- 优化代码工作区的文件阅读体验。\n- 统一项目资料与关联服务入口。\n- 保留文件位置和任务上下文。\n';
const source = "import { readFile } from 'node:fs/promises';\n\nexport async function readProjectDocument(path: string) {\n  const content = await readFile(path, 'utf8');\n  return { path, content };\n}\n\nexport const saveDelayMs = 700;\n";
const documents: FileEditingDocument[] = [
  { id: 'project-readme', path: 'projects/product/README.md', content: readme, kind: 'markdown', location: root, version: 'dev · 当前文件', locationLabel: '主目录', versionLabel: 'dev' },
  { id: 'project-agents', path: 'projects/product/AGENTS.md', content: agents, kind: 'markdown', location: root, version: 'dev · 当前文件', locationLabel: '主目录', versionLabel: 'dev' },
  { id: 'changelog', path: 'CHANGELOG.md', content: changelog, kind: 'markdown', location: root, version: 'dev · 当前文件', locationLabel: '主目录', versionLabel: 'dev' },
  { id: 'source', path: 'projects/product/services/buildr/src/read-document.ts', content: source, kind: 'text', location: root, version: 'dev · 当前文件', locationLabel: '主目录', versionLabel: 'dev' },
  { id: 'managed', path: 'AGENTS.md', content: '# 工作空间规则\n\n<!-- buildr:required begin -->\nBuildr 管理的核心规则。\n人和智能体（Agent）对齐当前文件与已观察版本。\n<!-- buildr:required end -->\n\n## 用户约定\n\n面向用户的说明默认使用中文。\n', kind: 'markdown', location: root, version: 'dev · 当前文件', locationLabel: '主目录', versionLabel: 'dev', protectedLines: [{ start: 3, end: 6 }] },
  { id: 'historical', path: 'CHANGELOG.md', content: changelog.replace('## 待发布', '## 历史记录').replace('### 文件编辑', '### 文件查看'), kind: 'markdown', location: root, version: '2b83e8c · 历史文件', locationLabel: '历史版本', versionLabel: '2b83e8c', readOnlyReason: '这是历史版本。要修改文件，请打开当前版本。' },
];
const services = [
  { id: 'buildr', code: 'buildr', name: 'Buildr 后端', description: 'Buildr 的命令行、本机运行、验证与维护实现。' },
  { id: 'buildr-web', code: 'buildr-web', name: 'Buildr 前端', description: 'Buildr Web 页面、交互与样式。' },
  { id: 'dsh-plugin', code: 'dsh-plugin', name: 'Buildr DSH 插件', description: '独立桌面插件的构建、验证与发布准备。' },
];
const projectTab = { key: 'project:product', kind: 'proj' as const, title: 'Buildr 产品', path: '/projects/product' };

function Preview() {
  const { message } = App.useApp();
  const route = useLocation(), navigate = useNavigate();
  const isCode = route.pathname.startsWith('/code');
  const page = isCode ? 'explorer' : 'project-docs';
  const editing = useFileEditing(documents);
  const [projectId, setProjectId] = useState<string | null>('project-readme');
  const [projectOpen, setProjectOpen] = useState(['project-readme']);
  const [fileId, setFileId] = useState('changelog');
  const [fileTabs, setFileTabs] = useState(['changelog']);
  const [collapsed, setCollapsed] = useState(true);
  const [treeHidden, setTreeHidden] = useState(false);
  const [sidebarHost, setSidebarHost] = useState<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState<number | null>(0.62);
  const [paneWidth, setPaneWidth] = useState(0);
  const current = useRef({ page: 'project-docs', state: '' });
  const selectedId = isCode ? fileId : projectId;
  const selected = documents.find(item => item.id === selectedId);
  const session = selectedId ? editing.sessions[selectedId] : undefined;
  const info = () => message.info('本次只演示文件编辑，其他入口保留现有布局。');

  const flush = () => { if (selectedId) editing.saveNow(selectedId); };
  function openProject(id: string) {
    flush(); setProjectId(id); setProjectOpen(value => value.includes(id) ? value : [...value, id]); navigate('/projects/product');
  }
  function openFile(id: string) {
    flush(); setFileId(id); setFileTabs(value => value.includes(id) ? value : [...value, id]); navigate('/code/explorer');
  }
  function selectScene(nextPage: string, state: string) {
    editing.reset();
    const id = nextPage === 'explorer' ? state === 'readonly' ? 'historical' : 'changelog' : state === '' ? 'project-readme' : 'project-agents';
    const file = documents.find(item => item.id === id)!;
    if (nextPage === 'explorer') openFile(id); else openProject(id);
    if (state && state !== 'readonly') editing.setMode(id, 'edit');
    if (state === 'saved' || state === 'failure' || state === 'conflict') {
      editing.change(id, file.content + '\n补充：文件修改后自动保存。\n');
      if (state === 'failure') editing.simulateSaveFailure(id);
      else if (state === 'conflict') editing.simulateExternalChange(id, file.content.replace('默认使用中文', '默认使用中文，并注明引用来源').replace('编辑默认自动保存。', '编辑默认自动保存，并显示保存时间。'));
      else editing.saveNow(id);
    }
  }
  const bridge = usePrototypeBridge(scenes.pages, current, selectScene);
  const state = selected?.readOnlyReason ? 'readonly' : session?.status === 'conflict' ? 'conflict' : session?.status === 'error' ? 'failure' : session?.mode === 'edit' ? session.status === 'saved' && session.historyIndex > 0 ? 'saved' : 'editing' : '';
  useEffect(() => { bridge.report(page, page === 'project-docs' && state === 'readonly' ? '' : state); }, [page, state]);

  const area = isCode ? 'code' : 'workspace';
  const nav: Array<[string, string, ReactNode]> = isCode
    ? [['explorer', '资源管理器', <FolderOpenOutlined />], ['source-control', '源代码管理', <BranchesOutlined />]]
    : [['overview', '总览', <HomeOutlined />], ['projects', '项目', <FolderOutlined />], ['services', '服务', <AppstoreOutlined />], ['repositories', '代码库', <BranchesOutlined />], ['skills', '技能', <ThunderboltOutlined />], ['articles', '文章', <FileTextOutlined />]];
  const navigation = <nav className="shell-navigation" aria-label={isCode ? '代码导航' : '工作空间导航'}><p className="shell-nav-caption">{isCode ? '代码' : '工作空间'}</p>{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={isCode ? '/code/explorer' : '/projects/product'} path={'/' + key} active={key === (isCode ? 'explorer' : 'projects')} onClick={event => { if (!['explorer', 'projects'].includes(key)) { event.preventDefault(); info(); } }} />)}</nav>;
  const surface = selected ? <FileEditingPane key={selected.id} file={{ ...selected, revision: selected.revision || 'prototype:1' }} editing={editing} onOpenInExplorer={!isCode ? () => openFile(selected.id) : undefined} onViewCurrent={selected.id === 'historical' ? () => openFile('changelog') : undefined} markdownOptions={{ allowRelativeLinks: true, onRelativeLinkClick: () => info() }} /> : null;
  const previewFiles = documents.filter(item => item.id !== 'historical').map(item => ({ path: item.path, kind: item.kind, content: editing.sessions[item.id]?.content ?? item.content }));
  const treeFiles = selected?.id === 'historical' ? previewFiles.map(item => item.path === selected.path ? { ...item, content: selected.content } : item) : previewFiles;
  const closeFile = (id: string) => {
    flush(); const next = fileTabs.filter(item => item !== id); setFileTabs(next);
    if (fileId === id) { if (next.length) setFileId(next.at(-1)!); else { setFileId('changelog'); setFileTabs(['changelog']); } }
  };

  return <WorkspaceTabsContext.Provider value={{ tabs: [projectTab], register: () => {}, close: () => {}, reorder: () => {}, reportPaneWidth: (_path, width) => setPaneWidth(width), ratio, setRatio }}>
    <div className={'app-shell repository-explorer-preview file-editing-prototype area-' + area}>
      <AppShellHeader development brandHref="/projects/product" workspaceName="Buildr" workspaceMenuItems={[{ key: 'preview', label: 'Buildr · 演示数据' }]} area={area} codeHref="/code/explorer" workbenchHref="/projects/product" workspaceDestination={{ to: '/projects/product' }} actions={<><Button type="text" aria-label="搜索" icon={<SearchOutlined />} onClick={info} /><Button type="text" className="nav-quit" onClick={info}>退出</Button><Button type="primary" icon={<PlusOutlined />} onClick={info}>交给 Agent</Button></>} />
      <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={navigation}>
        <div className="workspace-pages">
          {isCode ? <div className="code-explorer-stage">
            <div data-prototype-position="file-tree" className="file-editing-tree"><CodeTreePane hidden={treeHidden} onHost={setSidebarHost} /></div>
            <section className="code-file-stage" aria-label="文件编辑区">
              <div className="code-file-tabstrip"><ObjectTabStrip className="code-open-files" label="打开的文件" tabs={fileTabs.map(id => { const doc = documents.find(item => item.id === id)!; return { key: id, kind: 'doc' as const, title: doc.path.split('/').at(-1)! + (id === 'historical' ? ' · 历史' : '') }; })} active={fileId} onActivate={openFile} onClose={closeFile} /><ReadingToggle className="code-reading-toggle" expanded={treeHidden} onToggle={() => setTreeHidden(value => !value)} /></div>
              <RepositoryFileBrowser global sidebarHost={sidebarHost} readerActive files={treeFiles} selectedPath={selected?.path || ''} onSelect={path => { const doc = documents.find(item => item.id !== 'historical' && item.path === path); if (doc) openFile(doc.id); }} repositoryName="Buildr 源码库" location={root} version={selected?.version || ''} historical={fileId === 'historical'} onRetry={() => {}} onViewCurrent={() => openFile('changelog')} readerSurface={surface}
                context={<Space direction="vertical" size={7} className="code-root-selectors"><Select aria-label="选择代码库" value="buildr" options={[{ value: 'buildr', label: 'Buildr 源码库' }]} /><Select aria-label="查看文件版本" value={fileId === 'historical' ? 'history' : 'current'} options={[{ value: 'current', label: '主目录 · 当前文件' }, { value: 'history', label: '历史版本 · 2b83e8c' }]} onChange={value => openFile(value === 'history' ? 'historical' : 'changelog')} /><small>当前目录内的文本文件可编辑</small></Space>} />
            </section>
          </div> : <>
            <div className="workspace-page-tabs" style={{ width: `calc(100% - ${paneWidth}px)` }}><PageTabStrip tabs={[projectTab]} onClose={info} onReorder={() => {}} /></div>
            <div className="workspace-page-stack"><div className="workspace-page file-editing-project-page"><WorkspaceStage pageTabs={[projectTab]} onClosePageTab={info} objectTabs={projectOpen.map(id => ({ key: id, kind: 'doc' as const, title: id === 'project-agents' ? 'AGENTS.md' : 'README.md' }))} activeObject={projectId} onActivateObject={id => openProject(id)} onCloseObject={id => { flush(); const next = projectOpen.filter(item => item !== id); setProjectOpen(next); if (projectId === id) setProjectId(next.at(-1) || null); }} objectContent={surface}>
              <div className="project-home"><ProjectHomeHeader project={{ name: 'Buildr 产品', description: 'Buildr 自身产品实现、随包工作资产、智能体（Agent）接入与协作工作流。' }} workspaceName="Buildr" serviceCount={3} href={() => '/projects/product'} onWork={info} actions={<><Button icon={<StarOutlined />} onClick={info}>关注项目</Button><Button onClick={info}>编辑项目</Button><Button icon={<MoreOutlined />} aria-label="更多项目操作" onClick={info} /></>} />
                <Tabs activeKey="overview" items={[{ key: 'overview', label: '概览' }, { key: 'composition', label: '项目组成' }]} onChange={info} />
                <ProjectHomeEntries projectCode="product" href={() => '/projects/product'} onEntry={(_ref, event) => { event.preventDefault(); info(); }} />
                <div className="project-home-details"><section className="resource-section" aria-label="项目资料" data-prototype-position="project-documents"><div className="ws-section-head"><h2>项目资料 <span className="ws-count">2 个入口</span></h2></div><div className="ws-obj-list">
                  {[['project-readme', '项目文档', '使用、开发与参考 · README.md'], ['project-agents', 'AGENTS.md', '规则与授权边界']].map(([id, label, hint]) => <button key={id} type="button" className="ws-obj-row" data-doc-row={id} onClick={() => openProject(id)}><span className="ws-obj-ico"><FileTextOutlined /></span><span className="ws-obj-name">{label}</span><small>{hint}</small><RightOutlined className="ws-go" /></button>)}
                </div></section><section className="resource-section"><ProjectServicesView services={services} linkedIds={services.map(item => item.id)} disabled onReload={info} onSave={async () => {}} onCreate={info} serviceHref={() => '#'} onOpen={info} /></section></div>
              </div>
            </WorkspaceStage></div></div>
          </>}
        </div>
      </AppShellFrame>
    </div>
  </WorkspaceTabsContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/projects/product']}><Preview /></MemoryRouter></App></ConfigProvider>);
