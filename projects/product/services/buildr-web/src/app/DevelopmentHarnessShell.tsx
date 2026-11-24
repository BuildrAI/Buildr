import {useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {useLocation, useNavigate, type Location} from 'react-router-dom';
import {Button} from 'antd';
import {ApartmentOutlined, CloseOutlined, FolderOpenOutlined, PlusOutlined} from '@ant-design/icons';
import {WorkspacePanelIcon} from '../../../buildr-harness-web/src/shell';
import {useAgentConversations} from '../features/harness-ui/AgentConversationsContext';
import {WorkEnvironmentVisibleContext} from './work-environment-visibility';
import {toggleDesktopRightSidebar, useDesktopNativeSidebar} from './dsh-desktop';
import './development-harness-shell.css';

const tools = {
  explorer: {title: '资源管理器', icon: <FolderOpenOutlined />},
  'source-control': {title: '源代码管理', icon: <ApartmentOutlined />},
};
type Tool = keyof typeof tools;
type Mode = 'workbench' | 'workspace';
type HeaderLayout = {mode: Mode; onModeChange(mode: Mode): void};

export function DevelopmentHarnessShell({header, children, conversation, workspaceId, workspaceName}: {
  header: (layout: HeaderLayout) => ReactNode;
  children: (visible: boolean) => ReactNode;
  conversation: (headerAction: ReactNode) => ReactNode;
  workspaceId: string | null;
  workspaceName?: string;
}) {
  const context = useAgentConversations();
  const location = useLocation(), navigate = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [launcher, setLauncher] = useState(true);
  const [tabs, setTabs] = useState<Tool[]>([]);
  const [tool, setTool] = useState<Tool>();
  const management = useRef<Location | null>(null), toolLocations = useRef<Partial<Record<Tool, Location>>>({});
  const previous = useRef(location);
  const modeTransition = useRef(false);
  const lastWorkspace = useRef(workspaceId);
  const expectedToolRoute = useRef<string | null>(null);
  const desktopSidebar = useDesktopNativeSidebar();
  const workbench = context.open && context.full;
  const effectiveToolsOpen = toolsOpen && !desktopSidebar;
  const scopeId = context.conversation?.workspaceId;
  const codePath = workspaceId ? `/workspaces/${workspaceId}/code/` : '';
  const fileScopeReady = Boolean(workspaceId && (!scopeId || scopeId === workspaceId));
  const routeTool = codePath && location.pathname.startsWith(codePath) ? Object.keys(tools).find(key => codePath + key === location.pathname) as Tool | undefined : undefined;
  const showCode = workbench && effectiveToolsOpen && !launcher && fileScopeReady && Boolean(routeTool);
  const showEngineering = !workbench || showCode;

  useLayoutEffect(() => {
    const changedWorkspace = lastWorkspace.current !== workspaceId;
    const changedRoute = previous.current.pathname !== location.pathname || previous.current.search !== location.search;
    previous.current = location;
    const fromMode = modeTransition.current;
    modeTransition.current = false;
    if (changedWorkspace) {
      lastWorkspace.current = workspaceId;
      management.current = null;
      toolLocations.current = {};
      expectedToolRoute.current = null;
      setTabs([]);setTool(undefined);setLauncher(true);setToolsOpen(false);
      context.setFull(false);
      return;
    }
    if (!workbench) { management.current = location; expectedToolRoute.current = null; return; }
    if (changedRoute && !fromMode && expectedToolRoute.current !== location.pathname && !(toolsOpen && routeTool)) {
      management.current = location;
      context.setFull(false);
      return;
    }
    expectedToolRoute.current = null;
    if (toolsOpen && !launcher && routeTool && !fromMode) {
      toolLocations.current[routeTool] = location;
      setTool(routeTool);
      setTabs(old => old.includes(routeTool) ? old : [...old, routeTool]);
    }
  }, [location, workspaceId, workbench, toolsOpen, launcher, routeTool, context.setFull]);

  const go = (entry: Location) => {
    expectedToolRoute.current = entry.pathname;
    navigate({pathname: entry.pathname, search: entry.search, hash: entry.hash}, {state: entry.state});
  };
  const selectMode = (mode: Mode) => {
    const next = mode === 'workbench';
    if (next === workbench) return;
    modeTransition.current = true;
    if (next) {
      management.current = location;
      context.setFull(true);
      const entry = tool && toolLocations.current[tool];
      if (toolsOpen && !launcher && fileScopeReady && entry && entry.key !== location.key) go(entry);
    } else {
      context.setFull(false);
      const entry = management.current;
      if (entry && entry.key !== location.key) go(entry);
    }
  };
  const activateTool = (id: Tool) => {
    if (!fileScopeReady || !codePath) return;
    setTabs(previous => previous.includes(id) ? previous : [...previous, id]);
    setTool(id);setLauncher(false);
    if (routeTool !== id) {
      const entry = toolLocations.current[id];
      if (entry) go(entry);
      else { expectedToolRoute.current = codePath + id; navigate(codePath + id); }
    }
  };
  const closeTool = (id: Tool) => {
    const next = tabs.filter(tab => tab !== id);
    if (id === tool) {
      const successor = next[Math.min(tabs.indexOf(id), next.length - 1)];
      if (successor) activateTool(successor);
      else {setTool(undefined);setLauncher(true);}
    }
    setTabs(next);
  };
  const label = effectiveToolsOpen ? '收起对话工作区' : '打开对话工作区';
  const headerAction = workbench ? (desktopSidebar
    ? <Button type="text" className="harness-workspace-toggle" title="切换 DSH 工作区侧栏" aria-label="切换 DSH 工作区侧栏"
      icon={<WorkspacePanelIcon open={false}/>} onClick={toggleDesktopRightSidebar} />
    : <Button type="text" className="harness-workspace-toggle" title={label} aria-label={label}
      aria-expanded={effectiveToolsOpen} aria-controls="development-conversation-workspace" icon={<WorkspacePanelIcon open={effectiveToolsOpen}/>} onClick={() => setToolsOpen(open => !open)} />) : null;

  return <div className={'development-work-environment-shell app-shell' + (workbench ? ' is-workbench' : ' is-workspace')
    + (workbench && effectiveToolsOpen ? ' has-workbench-tools' : '') + (!context.open ? ' is-conversation-collapsed' : '') + (context.side === 'left' ? ' is-conversation-left' : '')}
    style={{'--development-conversation-width': `${context.width}px`} as CSSProperties}>
    {header({mode: workbench ? 'workbench' : 'workspace', onModeChange: selectMode})}
    <div className="development-shell-body">
      <div className="development-conversation-slot">{conversation(headerAction)}</div>
      <section className="development-engineering-region" id="development-conversation-workspace" aria-label={workbench ? '对话工作区' : '工作空间管理'} hidden={workbench && !effectiveToolsOpen}>
        {workbench && effectiveToolsOpen && <><header className="harness-workspace-bar">
          {tabs.length ? <div className="harness-workspace-tabs" aria-label="已打开的工作区模块">{tabs.map(id => <div key={id} className={'harness-workspace-tab' + (!launcher && id === tool ? ' is-active' : '')}>
            <button type="button" className="development-tool-tab" aria-label={tools[id].title} aria-pressed={!launcher && id === tool} onClick={() => activateTool(id)}>{tools[id].icon}<span>{tools[id].title}</span></button>
            <Button type="text" size="small" aria-label={'关闭' + tools[id].title + '标签'} icon={<CloseOutlined/>} onClick={() => closeTool(id)} />
          </div>)}</div> : <span className="harness-workspace-view-label">工作区</span>}
          <Button className="harness-workspace-add" type="text" size="small" aria-label="打开工作区模块" title="打开工作区模块" aria-expanded={launcher} icon={<PlusOutlined/>} onClick={() => setLauncher(true)} />
          {workspaceName && <span className="harness-workspace-location">{workspaceName}</span>}
        </header>
        {!showCode && <div className="harness-workspace-home">
          <h2>对话工作区</h2><p>{fileScopeReady ? '在同一工作空间里浏览文件、查看变更。' : '请在顶栏选择与对话相同的工作空间。'}</p>
          <nav aria-label="工作区内容">{(Object.keys(tools) as Tool[]).map(id => <button key={id} type="button" disabled={!fileScopeReady} onClick={() => activateTool(id)}>
            <span aria-hidden="true">{tools[id].icon}</span><strong>{tools[id].title}</strong>{tabs.includes(id) && <small>已打开</small>}
          </button>)}</nav>
        </div>}</>}
        <div className="development-engineering-content" hidden={!showEngineering}>
          <WorkEnvironmentVisibleContext.Provider value={showEngineering}>{children(showEngineering)}</WorkEnvironmentVisibleContext.Provider>
        </div>
      </section>
    </div>
  </div>;
}
