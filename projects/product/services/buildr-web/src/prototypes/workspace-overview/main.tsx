import { usePrototypeBridge } from '../prototype-bridge';
import { PageTabStrip } from '../../app/PageTabStrip';
import { ResourceDirectory } from '../../components/ResourceDirectory';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { AppstoreOutlined, FolderOutlined, BranchesOutlined, HomeOutlined, ThunderboltOutlined, FileTextOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined, HistoryOutlined } from '@ant-design/icons';
import { ProjectHomeEntries } from '../../features/project/components/ProjectHomeEntries';
import { AssetDocumentList } from '../../features/workspace/components/AssetDocumentList';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Empty, Tabs } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { softProductTheme } from '../../theme';
import { WorkspaceStage } from '../../components/WorkspaceStage';
import { WorkspaceTabsContext } from '../../app/pageTabs';
import { WorkspaceComposition, type CompositionData } from '../../features/workspace/components/WorkspaceComposition';
import { ProjectServicesView } from '../../features/project/components/ProjectServicesView';
import { ProjectHomeHeader } from '../../features/project/components/ProjectHomeHeader';
import { AssetHomeView } from '../../features/workspace/components/AssetHomeView';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';
const seed:CompositionData = {
  projects:[{id:'customer',code:'customer',name:'客户服务平台',description:'让客户获得及时、一致的服务体验。',serviceIds:['portal','identity']},{id:'collaboration',code:'collaboration',name:'团队协作',description:'让成员在同一处推进工作与交流。',serviceIds:['collab','identity']}],
  services:[{id:'portal',code:'portal',name:'客户门户',description:'面向客户的服务入口与业务页面。',repositoryId:'business'},{id:'identity',code:'identity',name:'统一身份',description:'登录与成员身份，在多个项目间共用。',repositoryId:'foundation'},{id:'collab',code:'collab',name:'协作前端',description:'成员日常协作与工作呈现。',repositoryId:'business'},{id:'files',code:'files',name:'文件服务',description:'提供附件存储与文件访问。',repositoryId:'foundation'}],
  repositories:[{id:'business',code:'business',name:'业务应用',description:'客户门户与协作前端的代码。'},{id:'foundation',code:'foundation',name:'基础服务',description:'身份与文件服务的代码。'}],
};
type Scene = typeof scenes.pages[number]['id'];
function Preview() {
  const {message} = App.useApp();
  const location=useLocation(),navigate=useNavigate();
  const base='/workspaces/preview';
  const [paneWidth,setPaneWidth]=useState(0);
  const [collapsed,setCollapsed]=useState(false),[directory,setDirectory]=useState<string|null>(null);
  const area=location.pathname.includes('/workbench')?'workbench':'workspace';
  useEffect(()=>{
    const leaf=location.pathname.split('/').at(-1)!;
    setDirectory(['projects','services','repositories','workbench'].includes(leaf)?leaf:null);
    if(leaf==='workspace-overview'){setMainView('workspace');if(current.current.page!=='workspace-overview')report('workspace-overview');}
    if(location.search.includes('view=overview')){setProjectId(leaf);report('project-overview');}
    const target=new URLSearchParams(location.search).get('selected');if(target&&(leaf==='services'||leaf==='repositories'))open(leaf==='services'?'service':'repository',target);
  },[location.pathname,location.search]);
  const [data,setData]=useState(seed),[,setScene]=useState<Scene>('workspace-overview'),[state,setState]=useState('');
  const [mainView,setMainView]=useState('workspace');
  const [projectId,setProjectId]=useState('customer'),[objects,setObjects]=useState<Array<{kind:'service'|'repository';id:string}>>([]),[active,setActive]=useState<string|null>(null),[document,setDocument]=useState<string|null>(null),[ratio,setRatio]=useState<number|null>(null);
  const current=useRef({page:'workspace-overview',state:''});
  const project=data.projects.find(p=>p.id===projectId)||data.projects[0];
  const reset=(page:string,nextState:string)=>{current.current={page,state:nextState};setDirectory(null);navigate(base+(page==='workspace-overview'?'/workspace-overview':'/projects/customer'));
    const next=structuredClone(seed);if(nextState==='saved')next.projects[0].serviceIds!.push('files');setData(next);setMainView(page==='workspace-overview'?'workspace':page==='project-composition'||page==='object-detail'?'composition':'overview');setScene(page);setState(nextState);setProjectId('customer');setDocument(null);setObjects(page==='object-detail'?[{kind:'service',id:'identity'}]:[]);setActive(page==='object-detail'?'service':null);
  };
  const bridge=usePrototypeBridge(scenes.pages,current,reset);
  const report=(page:string,nextState='')=>{current.current={page,state:nextState};setScene(page);setState(nextState);if(page==='workspace-overview')setMainView('workspace');else if(page==='project-composition')setMainView('composition');else if(page==='project-overview'||page==='project-associate')setMainView('overview');bridge.report(page,nextState);};
  const open=(kind:'project'|'service'|'repository',id:string)=>{setDocument(null);if(kind==='project'){setProjectId(id);setObjects([]);setActive(null);setDirectory(null);navigate(base+'/projects/'+id);report('project-composition');return;}setObjects(current=>[...current.filter(o=>o.kind!==kind),{kind,id}]);setActive(kind);report('object-detail');};
  const previousObjectCount=useRef(0);
  useEffect(()=>{
    if(previousObjectCount.current>0&&!objects.length&&current.current.page==='object-detail') report(mainView==='workspace'?'workspace-overview':mainView==='composition'?'project-composition':'project-overview');
    previousObjectCount.current=objects.length;
  },[objects.length,mainView]);
  const isWorkspace=mainView==='workspace';
  const selected=objects.find(o=>o.kind===active);
  const item=selected?.kind==='service'?data.services.find(s=>s.id===selected.id):data.repositories.find(r=>r.id===selected?.id);
  const service=selected?.kind==='service'?data.services.find(s=>s.id===selected.id):undefined;
  const repository=data.repositories.find(r=>r.id===(service?.repositoryId||selected?.id));
  const associations=<div data-prototype-position="association"><ProjectServicesView compact={mainView==='composition'} onReload={()=>report('project-associate')} services={data.services} linkedIds={project?.serviceIds||[]} serviceHref={id=>`#service-${id}`} onOpen={id=>open('service',id)} onCreate={()=>message.info('新增表单沿用现有实现，本轮演示只覆盖关联已有服务。')} onSave={async ids=>{await new Promise(resolve=>setTimeout(resolve,250));if(state==='failure')throw Error('演示：保存失败，已有关联保持不变。');setData(current=>({...current,projects:current.projects.map(p=>p.id===projectId?{...p,serviceIds:ids}:p)}));report('project-associate','saved');}} /></div>;
  const objectContent=item&&selected?<div data-prototype-position="object">{document?<><Button type="text" onClick={()=>setDocument(null)}>← 返回详情</Button><h2>{document}</h2><p>{item.name}负责{item.description}</p><p>这是用于阅读交互的模拟文档。</p></>:<AssetHomeView kind={selected.kind} item={item} hideRelated={!isWorkspace&&selected.kind==='service'} related={selected.kind==='service'?data.projects.filter(p=>p.serviceIds?.includes(item.id)):data.services.filter(s=>s.repositoryId===item.id)} relationHref={o=>`#${o.id}`} onRelation={o=>open(selected.kind==='service'?'project':'service',o.id)} actions={<Button onClick={()=>message.info('本轮保持已有编辑表单，不在演示中修改登记。')}>编辑{selected.kind==='service'?'服务':'代码库'}</Button>} documents={service&&<section className="resource-section"><div className="resource-section-head"><h2>文档</h2></div><AssetDocumentList active={document} onOpen={setDocument} /></section>} repositoryContent={<section className="resource-section" data-prototype-position="repository-entry"><div className="resource-section-head"><h2>{selected.kind==='service'?'代码库':'代码来源'}</h2></div>{repository&&<><Button type="link" onClick={()=>open('repository',repository.id)}>{repository.name} →</Button><dl className="asset-facts"><div><dt>目录</dt><dd><code>repositories/{repository.code}</code></dd></div><div><dt>集成分支</dt><dd>main</dd></div></dl></>}<p className="page-copy">代码状态：演示数据，未读取真实代码库。</p></section>} />}</div>:null;
  const navigationItems: Array<[string,string,React.ReactNode]> = area==='workspace' ? [
    ['workspace-overview','总览',<HomeOutlined />],['projects','项目',<FolderOutlined />],['services','服务',<AppstoreOutlined />],['repositories','代码库',<BranchesOutlined />],['skills','技能',<ThunderboltOutlined />],['articles','文章',<FileTextOutlined />],
  ] : [['workbench','概览',<HomeOutlined />],['tasks','任务',<UnorderedListOutlined />],['activity','动态',<HistoryOutlined />]];
  const navigation=<nav className="shell-navigation" aria-label={area==='workspace'?'工作空间导航':'工作台导航'}><p className="shell-nav-caption">{area==='workspace'?'工作空间':'工作台'}</p>{navigationItems.map(([name,label,icon])=>['skills','articles','tasks','activity'].includes(name)?<button className="shell-nav-item" key={name} disabled title="沿用现有功能，本次原型不展开">{icon}<span>{label}</span></button>:<AppNavigationItem key={name} to={base+'/'+name} path={'/'+name} name={name} label={label} icon={icon} active={location.pathname===base+'/'+name||(name==='projects'&&location.pathname.includes('/projects/'))} onClick={()=>{setObjects([]);setActive(null);}} />)}</nav>;
  const title=directory?({projects:'项目',services:'服务',repositories:'代码库',workbench:'工作台'}[directory]||directory):isWorkspace?'工作空间总览':project.name;
  const tab={key:location.pathname,kind:directory||isWorkspace?'dir' as const:'proj' as const,title,path:location.pathname};
  return <WorkspaceTabsContext.Provider value={{tabs:[tab],register:()=>{},close:()=>{},reorder:()=>{},reportPaneWidth:(_path,width)=>setPaneWidth(width),ratio,setRatio}}>
    <div className={'app-shell area-'+area}>
      <AppShellHeader brandHref={base+'/workspace-overview'} workspaceName="产品研发" workspaceMenuItems={[{key:'preview',label:'产品研发 · 演示数据'}]} area={area} workbenchHref={base+'/workbench'} workspaceDestination={{to:base+'/workspace-overview'}} actions={<><Button type="text" icon={<SearchOutlined />} disabled title="本次原型不模拟全局查找" /><Button type="text" disabled>退出</Button><Button type="primary" icon={<PlusOutlined />} disabled>交给 Agent</Button></>} />
      <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(v=>!v)} navigation={navigation}>
        <div className="workspace-pages"><div className="workspace-page-tabs" style={{width:`calc(100% - ${paneWidth}px)`}}><PageTabStrip tabs={tab.kind==='dir'?[]:[tab]} onClose={()=>{setObjects([]);setActive(null);navigate(base+'/workspace-overview');}} onReorder={()=>{}} /></div><div className="workspace-page-stack"><div className="workspace-page"><WorkspaceStage pageTabs={[tab]} onClosePageTab={()=>navigate(base+'/workspace-overview')} objectTabs={objects.map(o=>({key:o.kind,kind:'svc',title:(o.kind==='service'?data.services:data.repositories).find(v=>v.id===o.id)?.name||o.id}))} activeObject={active} onActivateObject={key=>{setActive(key);setDocument(null);}} onCloseObject={key=>{setObjects(current=>current.filter(o=>o.kind!==key));setActive(objects.find(o=>o.kind!==key)?.kind||null);}} objectContent={objectContent}>
    {directory?<>{directory==='workbench'?<Empty description="工作台沿用现有页面，本次原型聚焦工作空间总览。"><Button onClick={()=>navigate(base+'/workspace-overview')}>返回总览</Button></Empty>:<ResourceDirectory title={title} description={directory==='projects'?'业务目标与项目资料':directory==='services'?'实现职责与关联项目':'代码位置与引用服务'} noun={title} data={directory==='projects'?data.projects:directory==='services'?data.services:data.repositories} rowKey={item=>item.id} name={item=>item.name} summary={item=>item.description || ''} href={item=>directory==='projects'?base+'/projects/'+item.id+'?view=overview':base+'/'+directory+'?selected='+item.id} onOpen={item=>navigate(directory==='projects'?base+'/projects/'+item.id+'?view=overview':base+'/'+directory+'?selected='+item.id)} onEdit={()=>{}} editDisabled />}</>:isWorkspace?<><header className="page-header"><div><p className="eyebrow">产品研发</p><h1>工作空间总览</h1><p className="page-copy">了解项目的用途、实现组成和代码位置。</p></div></header><WorkspaceComposition data={state==='empty'?{projects:[],services:[],repositories:[]}:data} error={state==='partial'?'部分信息暂时无法读取，以下保留已知内容。':undefined} onRetry={()=>report('workspace-overview')} onOpen={open} /></>:<div className="project-home" data-prototype-position="project"><ProjectHomeHeader project={project} workspaceName="产品研发" serviceCount={project.serviceIds?.length||0} href={path=>base+path} onWork={()=>message.info('正式页面继续进入该项目的任务列表。')} actions={<Button onClick={()=>message.info('编辑项目沿用现有表单。')}>编辑项目</Button>} /><div data-prototype-position="project-view"><Tabs activeKey={mainView==='composition'?'composition':'overview'} items={[{key:'overview',label:'概览'},{key:'composition',label:'项目组成'}]} onChange={key=>report(key==='composition'?'project-composition':'project-overview')} /></div>{mainView==='composition'?<><div className="composition-associate">{associations}</div><WorkspaceComposition data={data} projectId={projectId} onOpen={open} /></>:<><ProjectHomeEntries projectCode={project.code} href={()=>'#'} onKnowledge={event=>{event.preventDefault();message.info('该入口沿用现有功能。');}} onOther={event=>{event.preventDefault();message.info('该入口沿用现有功能。');}} /><div className="project-home-details">{associations}<section className="resource-section"><h2>项目资料</h2><p>README.md　→</p><p>AGENTS.md　→</p></section></div></>}</div>}
  </WorkspaceStage></div></div></div></AppShellFrame></div></WorkspaceTabsContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/workspaces/preview/workspace-overview']}><Preview /></MemoryRouter></App></ConfigProvider>);
