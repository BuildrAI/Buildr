import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, BranchesOutlined, DatabaseOutlined, FileTextOutlined, FolderOutlined, HomeOutlined, PlusOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { PageTabStrip } from '../../app/PageTabStrip';
import { WorkspaceTabsContext, type WorkspacePageTab } from '../../app/pageTabs';
import { reorderPageTabs } from '../../app/workspace-pages';
import { useFileEditingController } from '../../app/FileEditingContext';
import { WorkspaceStage } from '../../components/WorkspaceStage';
import { FileEditingPane } from '../../components/file-editing/FileEditingPane';
import type { FileEditingDocument, FileEditingOperations } from '../../components/file-editing/file-editing-types';
import { PrototypePageContent, projectTab, initialPageTabs, pageCatalog, pageForNavigation } from './pages';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';

const chapters = [
  ['共同的工作现场', '代码、文档与工作成果可以独立查看，人和智能体（Agent）依据当前事实继续工作。', '需要讨论时，回到同一份资料；需要继续时，从已有成果和当前状态接续。'],
  ['以目标组织工作', '从用户希望达成的结果出发，保留必要背景、约束与验收方式。', '任务串起相关页面、资料和执行结果，让后续参与者能够理解目标与当前进展。'],
  ['查看项目组成', '项目关联服务与代码库。查看资料时，可以保留项目页面进行对照。', '服务说明各部分的实现职责，代码库保留可以查看、修改和验证的实际代码。'],
  ['保留阅读位置', '阅读较长的资料时，可以收起暂时不用的区域，为当前内容留出更多空间。', '重新展开时，继续原来的阅读位置，无需再次寻找刚才看到的段落。'],
  ['处理文件内容', 'Markdown 默认以阅读方式打开，进入编辑后可修改完整原文。', '正文沿用已有自动保存方式，修改状态显示在资料旁边，保存反馈与实际进展一致。'],
  ['继续编辑', '暂时收起内容区域后，正文、编辑模式与撤销记录继续保留。', '可以先查看另一份资料，再回到当前文件继续输入，不必重新建立工作上下文。'],
  ['对照多个资料', '打开的资料各自保留一个标签，可按需要切换查看。', '收起后，标签仍在原来的区域边缘；悬停临时查看，展开图标则将对应资料放回分屏。'],
  ['回到项目页面', '项目页面集中展示项目知识、文章、动态及关联资料。', '从左侧菜单打开页面，会直接定位到对应标签，已经打开的资料继续保留。'],
  ['专注阅读', '当前内容需要更多宽度时，可以就地收起旁边的页面。', '顶部按钮保留整个区域的恢复入口；标签旁的操作则可以直接打开指定内容。'],
  ['保存与关闭', '收起区域只改变显示方式，文件原有的自动保存继续运行。', '关闭资料标签表示结束这次查看；保存状态及未完成的输入仍按文件原有规则处理。'],
  ['变化与反馈', '界面状态对应当前操作，尚未保存完成的内容保留修改提示。', '鼠标停在边缘标签上可以快速查看，进入浮窗后仍可搜索、阅读或继续编辑。'],
  ['日常协作', '企业沉淀可以持续使用的知识与工作资产，人和智能体（Agent）共同贡献成果。', '保留清楚的背景、判断与结果，让下一次工作从已有积累出发。'],
];
const readme = '# Buildr 产品\n\nBuildr 为人和智能体（Agent）提供共同的工作现场。\n\n' + chapters.map(([title, text, detail], index) => `## ${index + 1}. ${title}\n\n${text}\n\n${detail}\n`).join('\n');
const files: FileEditingDocument[] = [
  { id: 'readme', path: 'projects/product/README.md', content: readme, kind: 'markdown', location: '/演示工作空间', locationLabel: '主目录', versionLabel: 'dev', revision: 'demo:1' },
  { id: 'guide', path: 'projects/product/协作约定.md', content: '# 协作约定\n\n## 目标与约束\n\n人负责目标、约束、判断、授权与结果验收。\n\n## 当前事实\n\n依据当前代码、文档与数据继续工作。\n\n## 工作成果\n\n成果能够独立查看、修改与接续。\n\n## 沟通方式\n\n用简短、直接的表达说明结果和下一步。\n', kind: 'markdown', location: '/演示工作空间', locationLabel: '主目录', versionLabel: 'dev', revision: 'demo:1' },
];

function Preview() {
  const { message } = App.useApp();
  const location = useLocation(), navigate = useNavigate();
  const [pageTabs, setPageTabs] = useState<WorkspacePageTab[]>([projectTab]);
  const activePage = pageTabs.find(tab => tab.path === location.pathname) || pageTabs[0];
  const [peekPageKey, setPeekPageKey] = useState<string | null>(null);
  const peekPageRef = useRef<string | null>(null);
  const [peekObjectKey, setPeekObjectKey] = useState<string | null>(null);
  const peekObjectRef = useRef<string | null>(null);
  const disk = useRef(new Map(files.map(file => [file.id, file])));
  const operations = useMemo<FileEditingOperations>(() => ({
    read: async file => disk.current.get(file.id)!,
    save: async (file, content, expectedRevision) => {
      // Only memory is changed. A visible delay makes pending input reviewable.
      const targetDisk = disk.current;
      await new Promise(resolve => setTimeout(resolve, 6000));
      const latest = targetDisk.get(file.id)!;
      if (latest.revision !== expectedRevision) throw Error('演示内容已变化，请重新核对。');
      const next = { ...latest, content, revision: `demo:${Number(latest.revision.split(':').at(-1)) + 1}` };
      targetDisk.set(file.id, next);
      return next;
    },
  }), []);
  const { controller: editing, store } = useFileEditingController(operations, files);
  const [{ open, active }, setReading] = useState<{ open: string[]; active: string | null }>({ open: [], active: null });
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [pageCollapsed, setPageCollapsed] = useState(false);
  const [pagePeekOpen, setPagePeekOpen] = useState(false);
  const [objectPeekOpen, setObjectPeekOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(192);
  const [ratio, setRatio] = useState<number | null>(0.58);
  const [paneWidth, setPaneWidth] = useState(0);
  const current = useRef({ page: 'project-docs', state: '' });
  const info = () => message.info('这里使用演示数据，只体验本次布局与阅读交互。');
  const visiblePageKey = pageCollapsed && pagePeekOpen ? peekPageKey || activePage?.key : activePage?.key;
  const visibleObjectKey = rightCollapsed && objectPeekOpen ? peekObjectKey || active : active;
  const selected = visibleObjectKey ? editing.sessions[visibleObjectKey] : undefined;
  const dirty = open.some(id => editing.sessions[id]?.content !== editing.sessions[id]?.diskContent);
  const editingMode = selected?.mode === 'edit';
  const state = !open.length ? sidebarCollapsed ? '' : 'navigation-expanded'
    : pageCollapsed ? pagePeekOpen ? 'page-peek' : pageTabs.length > 3 ? 'many-tabs' : sidebarCollapsed ? 'page-collapsed' : 'navigation-page-collapsed'
    : rightCollapsed ? objectPeekOpen ? 'content-peek' : editingMode ? 'editing-collapsed' : sidebarCollapsed ? 'collapsed' : 'navigation-content-collapsed'
    : editingMode ? 'editing' : 'split';
  useEffect(() => {
    if (!open.length) { setRightCollapsed(false); setPageCollapsed(false); setPagePeekOpen(false); setObjectPeekOpen(false); }
  }, [open.length]);

  function selectPage(key: string) {
    if (pageCollapsed) { peekPageRef.current = key; setPeekPageKey(key); }
    else { const tab = pageTabs.find(item => item.key === key); if (tab) navigate(tab.path); }
  }
  function collapsePage(next: boolean) {
    if (next && !open.length) return;
    if (!next) {
      const tab = pageTabs.find(item => item.key === peekPageRef.current) || pageCatalog.find(item => item.key === peekPageRef.current);
      if (tab) navigate(tab.path);
      peekPageRef.current = null; setPeekPageKey(null);
    } else { peekPageRef.current = activePage?.key || null; setPeekPageKey(activePage?.key || null); }
    setPageCollapsed(next); setPagePeekOpen(false);
    if (next) { setRightCollapsed(false); setObjectPeekOpen(false); }
  }
  function openPage(key: string) {
    const tab = pageCatalog.find(item => item.key === key)!;
    setPageTabs(previous => previous.some(item => item.key === tab.key) ? previous : [...previous, tab]);
    peekPageRef.current = tab.key; setPeekPageKey(tab.key); collapsePage(false);
  }
  function openNavigationPage(key: string) { openPage(pageForNavigation(key).key); }
  function closePage(key: string) {
    if (pageTabs.length < 2) { info(); return; }
    const next = pageTabs.filter(tab => tab.key !== key); setPageTabs(next);
    if (activePage?.key === key) navigate(next.at(-1)!.path);
    if (peekPageRef.current === key) { const fallback = activePage?.key === key ? next.at(-1)!.key : activePage?.key || next[0].key; peekPageRef.current = fallback; setPeekPageKey(fallback); }
  }
  function selectFile(id: string) {
    if (rightCollapsed) { peekObjectRef.current = id; setPeekObjectKey(id); }
    else setReading(previous => ({ ...previous, active: id }));
  }
  function collapseRight(next: boolean) {
    if (!next) {
      const id = peekObjectRef.current;
      if (id) setReading(previous => ({ ...previous, active: previous.open.includes(id) ? id : previous.active }));
      peekObjectRef.current = null; setPeekObjectKey(null);
    } else { peekObjectRef.current = active; setPeekObjectKey(active); }
    setRightCollapsed(next); setObjectPeekOpen(false);
    if (next) { setPageCollapsed(false); setPagePeekOpen(false); }
  }
  function openFile(id: string) {
    setReading(previous => ({ open: previous.open.includes(id) ? previous.open : [...previous.open, id], active: id }));
    setRightCollapsed(false); setObjectPeekOpen(false); peekObjectRef.current = null; setPeekObjectKey(null);
  }
  function closeFile(id: string) {
    void editing.saveNow(id);
    if (peekObjectRef.current === id) { peekObjectRef.current = null; setPeekObjectKey(null); }
    setReading(previous => {
      const next = previous.open.filter(value => value !== id);
      return { open: next, active: previous.active === id ? next.at(-1) || null : previous.active };
    });
  }
  const bridge = usePrototypeBridge(scenes.pages, current, (_page, nextState) => {
    disk.current = new Map(files.map(file => [file.id, file]));
    store.reset(files);
    const isEditing = nextState.startsWith('editing');
    if (isEditing) editing.setMode('readme', 'edit');
    const noContent = nextState === '' || nextState === 'navigation-expanded';
    setReading({ open: noContent ? [] : ['readme', 'guide'], active: noContent ? null : 'readme' });
    setRightCollapsed(['collapsed', 'content-peek', 'editing-collapsed', 'navigation-content-collapsed'].includes(nextState));
    setPageCollapsed(['page-collapsed', 'page-peek', 'navigation-page-collapsed', 'many-tabs'].includes(nextState));
    setPagePeekOpen(nextState === 'page-peek'); setObjectPeekOpen(nextState === 'content-peek');
    peekPageRef.current = projectTab.key; setPeekPageKey(projectTab.key);
    peekObjectRef.current = 'readme'; setPeekObjectKey('readme');
    setPageTabs(nextState === 'many-tabs' ? pageCatalog : noContent ? [projectTab] : initialPageTabs);
    navigate(projectTab.path);
    setSidebarCollapsed(!nextState.startsWith('navigation-'));
  });
  useEffect(() => { bridge.report('project-docs', state); }, [state]);
  const nav: Array<[string, string, ReactNode]> = [
    ['workspace-overview', '总览', <HomeOutlined />], ['projects', '项目', <FolderOutlined />],
    ['services', '服务', <AppstoreOutlined />], ['repositories', '代码库', <BranchesOutlined />],
    ['connections', '连接', <DatabaseOutlined />], ['skills', '技能', <ThunderboltOutlined />], ['articles', '文章', <FileTextOutlined />],
  ];

  return <WorkspaceTabsContext.Provider value={{ tabs: pageTabs, register: () => {}, close: closePage, reorder: (key, index) => setPageTabs(previous => reorderPageTabs(previous, key, index)), reportPaneWidth: (_path, width) => setPaneWidth(width), ratio, setRatio }}>
    <div className="app-shell area-workspace right-pane-prototype">
      <AppShellHeader development brandHref="/projects/product" workspaceName="Buildr" workspaceMenuItems={[{ key: 'demo', label: 'Buildr · 演示数据' }]} area="workspace" codeHref="/projects/product" workbenchHref="/projects/product" workspaceDestination={{ to: '/projects/product' }} actions={<><Button type="text" aria-label="搜索" icon={<SearchOutlined />} onClick={info} /><Button type="text" onClick={info}>退出</Button><Button type="primary" icon={<PlusOutlined />} onClick={info}>交给 Agent</Button></>} />
      <AppShellFrame sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} onSidebarResize={setSidebarWidth} onToggleSidebar={() => setSidebarCollapsed(value => !value)} navigation={<nav className="shell-navigation" aria-label="工作空间导航" data-prototype-position="menu-navigation">{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={'/' + key} path={'/' + key} active={key === 'projects' ? location.pathname.startsWith('/projects') : pageForNavigation(key).path === location.pathname} onClick={event => { event.preventDefault(); openNavigationPage(key); }} />)}</nav>}>
        <div className="workspace-pages">
          <div className={`workspace-page-tabs ${pageCollapsed && open.length ? 'page-tabs-collapsed' : 'page-tabs-can-collapse'}`} style={{ width: `calc(100% - ${paneWidth}px)` }}><div hidden={pageCollapsed && open.length > 0}><PageTabStrip tabs={pageTabs} onClose={closePage} onReorder={(key, index) => setPageTabs(previous => reorderPageTabs(previous, key, index))} /></div></div>
          <div className="workspace-page-stack"><div className="workspace-page">
            <WorkspaceStage pageTabs={pageTabs} activePage={visiblePageKey} onActivatePage={selectPage} onClosePageTab={closePage}
              objectTabs={open.map(id => { const file = files.find(item => item.id === id)!; const pending = editing.sessions[id]?.content !== editing.sessions[id]?.diskContent; return { key: id, kind: 'doc' as const, title: file.path.split('/').at(-1)!, dirty: pending, label: <>{file.path.split('/').at(-1)}{pending && <span className="right-pane-demo-dirty" title="有尚未保存的输入" aria-label="尚未保存" />}</> }; })}
              activeObject={visibleObjectKey} onActivateObject={selectFile} onCloseObject={closeFile}
              pageCollapse={{ collapsed: pageCollapsed, onChange: collapsePage, label: pageTabs.find(tab => tab.key === visiblePageKey)?.title }}
              objectCollapse={{ collapsed: rightCollapsed, onChange: collapseRight, dirty }}
              collapsePresentation="peek" pagePeek={{ open: pagePeekOpen, onChange: setPagePeekOpen }} objectPeek={{ open: objectPeekOpen, onChange: setObjectPeekOpen }}
              objectContentLayout="fill" objectLabel="阅读材料"
              objectContent={<div className="right-pane-demo-files" data-prototype-position="document-content">{open.map(id => <div key={id} className="right-pane-demo-file" hidden={visibleObjectKey !== id}><FileEditingPane file={files.find(file => file.id === id)!} editing={editing} active={active === id} markdownOptions={{ allowRelativeLinks: false }} /></div>)}</div>}>
              <div className="right-pane-demo-pages" data-prototype-position="middle-pages">{pageTabs.map(tab => <div key={tab.key} className="right-pane-demo-page" hidden={visiblePageKey !== tab.key}><PrototypePageContent pageKey={tab.key} files={files} onOpenFile={openFile} onOpenPage={openPage} onInfo={info} /></div>)}</div>
            </WorkspaceStage>
          </div></div>
        </div>
      </AppShellFrame>
    </div>
  </WorkspaceTabsContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/projects/product']}><Preview /></MemoryRouter></App></ConfigProvider>);
