import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Segmented, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, FolderOutlined, BranchesOutlined, HomeOutlined, ThunderboltOutlined, FileTextOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { PageTabStrip } from '../../app/PageTabStrip';
import { WorkspaceTabsContext } from '../../app/pageTabs';
import { WorkspaceStage } from '../../components/WorkspaceStage';
import { ResourceDirectory } from '../../components/ResourceDirectory';
import { AssetHomeView } from '../../features/workspace/components/AssetHomeView';
import { softProductTheme } from '../../theme';
import { mountFeatureNotes, createRegionHighlighter, connectPrototype } from '../../../../buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.js';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';

function usePreviewBridge(current:RefObject<{page:string;state:string}>,onSelect:(page:string,state:string)=>void) {
  const select=useRef(onSelect),bridge=useRef<ReturnType<typeof connectPrototype>|null>(null);
  select.current=onSelect;
  useEffect(()=>{
    if(window.parent===window)return;
    bridge.current=connectPrototype({pages:scenes.pages,getSelection:()=>current.current,onSelect:(page,state)=>select.current(page,state)});
    return ()=>{bridge.current?.destroy();bridge.current=null;};
  },[current]);
  return {report(page:string,state:string){current.current={page,state};bridge.current?.report(page,state);}};
}
type Item = { id:string; code:string; name:string; description:string };
const projects:Item[] = [
  {id:'demo',code:'demo',name:'客户服务平台',description:'让客户获得及时、一致的服务体验。'},
  {id:'team',code:'team',name:'团队协作',description:'让成员在同一处推进工作与交流。'},
];
const services:Item[] = [
  {id:'portal',code:'portal',name:'客户门户',description:'面向客户的服务入口与业务页面。'},
  {id:'identity',code:'identity',name:'统一身份',description:'登录与成员身份，在多个项目间共用。'},
  {id:'collab',code:'collab',name:'协作前端',description:'成员日常协作与工作呈现。'},
];
const repositories:Item[] = [
  {id:'business',code:'business',name:'业务应用',description:'客户门户与协作前端的代码。'},
  {id:'foundation',code:'foundation',name:'基础服务',description:'身份与文件服务的代码。'},
];
function FeatureNotes({page,wide}:{page:string;wide:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!root.current)return;
    const paint=createRegionHighlighter(document);
    const scene=scenes.pages.find(item=>item.id===page)!;
    const items=wide?scene.notes:[...scene.states[0].notes,...scene.notes.filter(item=>item.id!=='space')];
    const notes=mountFeatureNotes(root.current,{notes:items,onHighlight:paint});
    return ()=>notes.destroy();
  },[page,wide]);
  return <div ref={root} />;
}
function Preview() {
  const {message}=App.useApp();
  const navigate=useNavigate(),location=useLocation();
  const [wide,setWide]=useState(true),[notes,setNotes]=useState(false),[collapsed,setCollapsed]=useState(false);
  const [ratio,setRatio]=useState<number|null>(null),[paneWidth,setPaneWidth]=useState(0);
  const [selected,setSelected]=useState<Item|null>(null),[query,setQuery]=useState('');
  const directory=location.pathname.split('/').at(-1)||'projects';
  const noun=directory==='services'?'服务':directory==='repositories'?'代码库':'项目';
  const data=directory==='services'?services:directory==='repositories'?repositories:projects;
  useEffect(()=>{const id=new URLSearchParams(location.search).get('selected');if(id&&directory!=='projects')setSelected(data.find(item=>item.id===id)||null);},[location.pathname,location.search]);
  const current=useRef({page:'projects',state:''});
  const scene=selected?'split':directory;
  const bridge=usePreviewBridge(current,(page,state)=>{
    setWide(state!=='current');setQuery('');
    navigate('/'+(page==='split'?'services':page));
    setSelected(page==='split'?services[1]:null);
  });
  useEffect(()=>{bridge.report(scene,wide?'':'current');},[scene,wide]);
  const info=()=>message.info('这里只演示布局和浏览，不修改真实数据。');
  const inactive=(label:string,icon?:ReactNode)=><Tooltip title="沿用现有入口，本次仅演示布局"><Button type="text" icon={icon} onClick={info}>{label}</Button></Tooltip>;
  const navigationItems:Array<[string,string,ReactNode]>=[['overview','总览',<HomeOutlined/>],['projects','项目',<FolderOutlined/>],['services','服务',<AppstoreOutlined/>],['repositories','代码库',<BranchesOutlined/>],['skills','技能',<ThunderboltOutlined/>],['articles','文章',<FileTextOutlined/>]];
  const tab={key:'project:demo',kind:'proj' as const,title:'客户服务平台',path:'/projects'};
  return <WorkspaceTabsContext.Provider value={{tabs:[tab],register:()=>{},close:()=>{},reorder:()=>{},reportPaneWidth:(_path,width)=>setPaneWidth(width),ratio,setRatio}}>
    <div className={'app-shell area-workspace width-preview '+(wide?'width-preview-fluid':'')}>
      <AppShellHeader development brandHref="/projects" workspaceName="overview-review" workspaceMenuItems={[{key:'preview',label:'overview-review · 演示数据'}]} area="workspace" workbenchHref="/projects" workspaceDestination={{to:'/projects'}} actions={<>{inactive('',<SearchOutlined/>)}{inactive('退出')}<Button type="primary" icon={<PlusOutlined/>} onClick={info}>交给 Agent</Button></>} />
      <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(value=>!value)} navigation={<nav className="shell-navigation" aria-label="工作空间导航"><p className="shell-nav-caption">工作空间</p>{navigationItems.map(([key,label,icon])=><AppNavigationItem key={key} name={key} label={label} icon={icon} to={'/'+key} path={'/'+key} active={directory===key} onClick={event=>{if(!['projects','services','repositories'].includes(key)){event.preventDefault();info();return;}setSelected(null);setQuery('');}}/>)}</nav>}>
        <div className="workspace-pages"><div className="workspace-page-tabs" style={{width:`calc(100% - ${paneWidth}px)`}}><PageTabStrip tabs={[tab]} onClose={info} onReorder={()=>{}}/></div>
          <div className="workspace-page-stack"><div className="workspace-page"><WorkspaceStage pageTabs={[tab]} onClosePageTab={info} objectTabs={selected?[{key:selected.id,kind:'svc',title:selected.name}]:[]} activeObject={selected?.id} onActivateObject={()=>{}} onCloseObject={()=>{setSelected(null);navigate("/"+directory);}} objectContent={selected&&<div data-prototype-position="reading"><AssetHomeView kind={directory==='repositories'?'repository':'service'} item={selected} related={projects} relationHref={()=>'/projects'} onRelation={()=>{setSelected(null);setQuery('');navigate('/projects');}} actions={<Button onClick={info}>编辑{noun}</Button>} repositoryContent={<section className="resource-section"><h2>代码库</h2><p>基础服务</p><p className="page-copy">身份与文件服务的代码。</p></section>} /></div>}>
            <div data-prototype-position="directory"><ResourceDirectory title={noun} noun={noun} description={directory==='projects'?'组织业务目标，连接服务与工作成果。':directory==='services'?'管理实现职责，连接项目与代码库。':'查看代码位置与引用服务。'} data={data} rowKey={item=>item.id} name={item=>item.name} summary={item=>item.description} searchText={item=>`${item.name} ${item.code} ${item.description}`} query={query} onQueryChange={setQuery} href={item=>'/'+directory+'?selected='+item.id} onOpen={item=>directory==='projects'?info():setSelected(item)} onEdit={info} onDelete={info} onRefresh={()=>message.success('已刷新演示列表')} columns={[{title:noun+'标识',width:160,render:(_,item)=><code className="resource-code">{item.code}</code>}]} actions={<Button type="primary" onClick={info}>新增{noun}</Button>} /></div>
          </WorkspaceStage></div></div>
        </div>
      </AppShellFrame>
    </div>
    {window.parent===window&&<aside className="width-preview-controls" aria-label="原型查看工具">
      {notes&&<section className="width-preview-notes" aria-label="功能说明"><h2>功能说明</h2><FeatureNotes page={scene} wide={wide}/></section>}
      <span>布局预览</span><Segmented aria-label="内容宽度" value={wide?'fluid':'current'} options={[{label:'当前宽度',value:'current'},{label:'铺满主区域',value:'fluid'}]} onChange={value=>setWide(value==='fluid')}/><Button aria-expanded={notes} onClick={()=>setNotes(value=>!value)}>功能说明</Button>
    </aside>}
  </WorkspaceTabsContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/projects']}><Preview/></MemoryRouter></App></ConfigProvider>);
