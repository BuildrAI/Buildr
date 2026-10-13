import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import { App, Button, ConfigProvider, Drawer, Segmented, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BranchesOutlined, CloudDownloadOutlined, FolderOpenOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { ObjectTabStrip } from '../../components/ObjectTabStrip';
import { SourceControlWorkbench, type SourceControlBranchExtension } from '../../features/code/components/SourceControlWorkbench';
import type { SourceControlScene, SourceControlWorktree } from '../../features/code/source-control-model';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import { densityRepositories } from './fixtures';
import { densityReader } from './mock-reader';
import { LegacyStatus, legacyCatalogColumns } from './LegacyStatus';
import { MockBranchControl } from './MockBranchControl';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';

function Preview() {
  const {message} = App.useApp();
  const [page, setPage] = useState('compact'), [state, setState] = useState('');
  const [repositories, setRepositories] = useState(() => densityRepositories());
  const [scene, setScene] = useState<SourceControlScene>('changes');
  const [task, setTask] = useState<string|null>(null), [collapsed, setCollapsed] = useState(true);
  const [selection, setSelection] = useState<SourceControlBranchExtension['selection']>();
  const [slots, setSlots] = useState<Array<{element:Element; worktree:SourceControlWorktree}>>([]);
  const root = useRef<HTMLDivElement>(null), current = useRef({page:'compact',state:''});
  const select = (nextPage:string, nextState:string) => {setPage(nextPage);setState(nextState);setRepositories(densityRepositories(nextState));};
  const bridge = usePrototypeBridge(scenes.pages, current, select);
  useEffect(() => {bridge.report(page, state);}, [page, state]);
  useLayoutEffect(() => {
    const targets:Array<{element:Element;worktree:SourceControlWorktree}> = [];
    if (page === 'current') for (const repository of repositories) for (const worktree of repository.worktrees) {
      const row = root.current?.querySelector(`[data-source-repository="${repository.id}"] [data-source-worktree="${worktree.worktreeId}"]`);
      const element = row?.querySelector('.source-control-worktree-status');
      if (element) targets.push({element,worktree});
    }
    setSlots(targets);
    root.current?.querySelectorAll('.resizable-panels-divider').forEach(divider => {divider.setAttribute('aria-disabled', 'true');divider.setAttribute('tabindex', '-1');});
  }, [repositories, page]);
  const reader = useMemo(() => densityReader(repositories), [repositories]);
  const branches:SourceControlBranchExtension = {historyRange:() => ({}), historyControls:() => null, selection,
    rowControl:(repository, worktree) => <MockBranchControl repository={repository} worktree={worktree} onSwitch={branch => setRepositories(previous => previous.map(item => item.id !== repository.id ? item : {...item, worktrees:item.worktrees.map(tree => tree.worktreeId === worktree.worktreeId ? {...tree,branch} : tree), ...(worktree.isRegistered ? {branch} : {})}))}
      onPosition={id => setSelection({key:String(Date.now()), repositoryId:repository.id, worktreeId:id, scene:'history'})} />};
  const info = () => {void message.info('交互只影响演示数据。');};
  const narrow = state === 'narrow';
  return <div ref={root} className={'app-shell area-code density-preview density-mode-' + page + (narrow ? ' density-narrow' : '')}>
    <AppShellHeader development brandHref="/" workspaceName="集鲜" workspaceMenuItems={[{key:'demo',label:'集鲜 · 演示',onClick:info}]} area="code" codeHref="/code" workbenchHref="/" workspaceDestination={{to:'/workspace'}}
      actions={<><Tag bordered={false}>交互原型</Tag><Button type="text" icon={<SearchOutlined />} onClick={info} /><Button type="text" onClick={info}>智能体</Button><Button type="primary" icon={<PlusOutlined />} onClick={info}>交给 Agent</Button></>} />
    <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={<nav className="shell-navigation" aria-label="代码导航">
      <AppNavigationItem name="explorer" label="资源管理器" icon={<FolderOpenOutlined />} to="/explorer" path="/explorer" active={false} onClick={event => {event.preventDefault();info();}} />
      <AppNavigationItem name="source-control" label="源代码管理" icon={<BranchesOutlined />} to="/code" path="/code" active onClick={event => event.preventDefault()} />
    </nav>}>
      <section className="workspace-pages density-page"><ObjectTabStrip tabs={[{key:'scm',kind:'svc',title:'源代码管理'}]} active="scm" onActivate={() => {}} closable={false} />
        <div className="density-controls" data-prototype-position="density-controls"><Segmented size="small" aria-label="对照方案" value={page} options={[{value:'current',label:'改造前'},{value:'compact',label:'紧凑'}]} onChange={value => setPage(String(value))} />
          <Segmented size="small" aria-label="目录宽度" value={narrow ? '260' : '440'} options={[{value:'260',label:'260px'},{value:'440',label:'440px'}]} onChange={value => setState(value === '260' ? 'narrow' : '')} />
          <span>模拟数据 · 可选择来源、查看状态和管理分支</span>
        </div>
        <div className="density-workbench" style={{'--density-sidebar-width':narrow ? '260px' : '440px', ...(page === 'current' ? legacyCatalogColumns(repositories) : {})} as React.CSSProperties}>
          <SourceControlWorkbench repositories={repositories} reader={reader} readKey="density-demo" scene={scene} onScene={setScene}
            observation={{loading:false,error:'',readAt:'2026-10-13T12:00:00.000Z',diagnostics:[]}} onRefresh={info} onOpenTask={id => setTask(id)} branchExtension={branches}
            scopeSelection={{key:'density-initial',repositoryIds:['base'],worktrees:[{repositoryId:'base',worktreeId:'demo-base-task'}],reason:'模拟预选'}}
            catalogActions={<Button type="text" size="small" icon={<CloudDownloadOutlined />} onClick={() => message.success('演示：当前已观察的远程记录已更新。')}>全部获取远程</Button>} />
        </div>
      </section>
    </AppShellFrame>
    {page === 'current' && slots.map(({element,worktree}) => createPortal(<LegacyStatus worktree={worktree} />, element, worktree.worktreeId))}
    <Drawer open={Boolean(task)} title="任务" onClose={() => setTask(null)} width={380}><h2>{repositories.flatMap(item => item.worktrees).find(tree => tree.taskId === task)?.taskTitle}</h2><p>模拟任务的直接入口。关闭后保留所选工作树及文件阅读位置。</p><Tag>进行中</Tag></Drawer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/code']}><Preview /></MemoryRouter></App></ConfigProvider>);
