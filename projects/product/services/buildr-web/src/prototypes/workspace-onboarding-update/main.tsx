import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Alert, App, Button, ConfigProvider, Dropdown, Modal, Space, Tag, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { CheckCircleOutlined, ClockCircleOutlined, CopyOutlined, DownloadOutlined, EllipsisOutlined, ExclamationCircleOutlined, FolderOpenOutlined, HomeOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, SyncOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { WorkspacesCatalogView } from '../../features/workspace/components/WorkspacesCatalogView';
import { UpdateDialog } from '../../features/installation/components/UpdateDialog';
import type { UpdateView } from '../../features/installation/lib/update-view';
import { WorkspaceComposition } from '../../features/workspace/components/WorkspaceComposition';
import { softProductTheme } from '../../theme';
import { copyText } from '../../lib/copyText';
import { usePrototypeBridge } from '../prototype-bridge';
import { AddWorkspaceDialog } from './AddWorkspaceDialog';
import { TARGET, statusText, useLifecycleDemo, type DemoSpace } from './model';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/workspace/workspace-settings.css';
import './prototype.css';

function Preview() {
  const {message,modal}=App.useApp();
  const d=useLifecycleDemo();
  const [page,setPage]=useState('workspaces'),[sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [details,setDetails]=useState<DemoSpace|null>(null);
  const selection=useRef({page:'workspaces',state:''});
  const bridge=usePrototypeBridge(scenes.pages,selection,(next,state)=>{setPage(next);setDetails(null);d.reset(next,state);});
  useEffect(()=>{
    const state=page==='add'?(d.addStage==='select'?'':d.addStage==='confirm'?(d.selected?.kind==='existing'?'existing':d.selected?.kind==='registered'?'registered':'confirm'):d.addStage):['update','recovery'].includes(page)?(d.stage==='available'?'':d.stage):'';
    const known=scenes.pages.find(p=>p.id===page)?.states.some(s=>s.id===state);
    bridge.report(page,state===''||known?state:'');
  },[page,d.stage,d.addStage,d.selected?.kind]);
  const opened=d.spaces.find(s=>s.id===d.opened);
  const done=d.stage==='completed',partial=d.stage==='partial',started=d.stage!=='available';
  const titles:Record<string,string>={available:'更新 Buildr',downloading:'正在下载更新',installing:'正在安装新版',restarting:'正在恢复网页',spaces:'正在更新工作空间',partial:'软件已更新，还有空间待完成',completed:'更新完成','download-error':'下载未完成','install-error':'安装未完成','reconnect-error':'新版已安装，网页尚未恢复'};
  const descriptions:Record<string,string>={available:`本次将一起更新 Buildr 和全部 ${d.spaces.length} 个已登记工作空间。`,downloading:'正在下载并校验。下载后自动安装，无需再次操作。',installing:'正在安装 Buildr。接下来会自动恢复网页，并更新全部工作空间。',restarting:'新版已安装。正在恢复网页和已有桌面启动入口，无需重新安装。',spaces:'正在为每个目录准备新版所需内容。无需打开每个空间手动处理。',partial:`${d.readyCount} 个工作空间已完成，${d.pending.length} 个待完成。已完成的空间可以继续使用。`,completed:`Buildr 和全部 ${d.spaces.length} 个工作空间均已准备好，可以继续工作。`,'download-error':'网络连接中断，更新包尚未准备好。当前版本可以继续使用。','install-error':'安装过程未完成。已下载的更新包会保留，可以直接重试安装。','reconnect-error':'软件安装已完成，尚未确认新版网页恢复。重试只恢复连接。'};
  const phase=({spaces:'verifying',partial:'completed'} as Record<string,string>)[d.stage]||d.stage;
  const view:UpdateView={phase:phase as UpdateView['phase'],title:titles[d.stage],description:descriptions[d.stage],currentVersion:d.installed,installedVersion:d.installed===TARGET?TARGET:null,target:{track:'stable',version:TARGET,label:'正式版'},targets:[{track:'stable',version:TARGET,label:'正式版'}],steps:null,error:d.stage==='download-error'?'下载连接中断。':d.stage==='install-error'?'安装未完成，请重试。':d.stage==='reconnect-error'?'等待网页恢复超过预期。':null,launcherError:null,simulated:false,recoveryCommand:''};
  const openUpdate=()=>{setPage(partial?'recovery':'update');d.setUpdateOpen(true);};
  const add=()=>{setPage('add');d.beginAdd();};
  const pendingAdd=(s:DemoSpace)=>d.selected?.id===s.id&&['preparing','failed'].includes(d.addStage)&&['running','failed'].includes(s.status);
  const openSpace=(s:DemoSpace)=>{if(pendingAdd(s)){setPage('add');d.setAddOpen(true);return;}d.openSpace(s.id);d.setUpdateOpen(false);d.setAddOpen(false);};
  const copyPath=(path:string)=>void copyText(path).then(ok=>ok?message.success('目录路径已复制。'):message.info('当前浏览器限制复制，请选中目录文字复制。'));
  const scope=<div className="lifecycle-scope" data-prototype-position="update-scope"><div><CheckCircleOutlined/><span>Buildr 程序、网页和已有桌面启动入口</span></div><div><CheckCircleOutlined/><span>全部 {d.spaces.length} 个已登记工作空间所需的新版内容</span></div>{!started&&<small>更新期间网页会短暂重新连接。请先保存正在编辑的内容。</small>}</div>;
  const progress=started&&<div className="lifecycle-update-progress" data-prototype-position="update-progress">{['安装新版 Buildr','恢复网页与启动入口','更新全部已登记工作空间'].map((label,index)=>{
    const position=['downloading','download-error','installing','install-error'].includes(d.stage)?0:['restarting','reconnect-error'].includes(d.stage)?1:2;
    const ready=index<position||(index===2&&done),running=index===position&&d.active,failed=index===position&&(partial||d.stage.endsWith('error'));
    return <div className={'lifecycle-step '+(ready?'done':running?'active':failed?'failed':'')} key={label}>{ready?<CheckCircleOutlined/>:running?<SyncOutlined spin/>:failed?<ExclamationCircleOutlined/>:<ClockCircleOutlined/>}<span>{label}</span><small>{ready?'已完成':running?'进行中':failed?'待完成':'等待中'}</small></div>;
  })}</div>;
  const spaceResults=(compact=false)=><section className={'lifecycle-space-results'+(compact?' is-compact':'')} data-prototype-position="workspace-results"><div className="lifecycle-section-heading"><h3>工作空间</h3><span>{d.readyCount} / {d.spaces.length} 已完成</span></div>{d.spaces.map(s=><div key={s.id} className="lifecycle-space-result" data-space-result={s.id}>
    <div className={'lifecycle-result-icon is-'+s.status}>{s.status==='ready'?<CheckCircleOutlined/>:s.status==='running'?<SyncOutlined spin/>:['failed','offline','conflict'].includes(s.status)?<ExclamationCircleOutlined/>:<FolderOpenOutlined/>}</div>
    <div className="lifecycle-space-name"><strong>{s.name}</strong><small>{s.status==='offline'?'暂时无法访问此目录':s.status==='failed'?'目录暂时无法写入，已完成的内容保留':s.status==='conflict'?'发现你修改过的内容，需要确认':s.status==='ready'?(s.custom?'已准备好，保留了自定义方法':`已准备好 · ${TARGET}`):s.status==='running'?'正在准备新版内容':s.path}</small></div>
    <div className="lifecycle-space-action">{['failed','offline'].includes(s.status)?<Button size="small" onClick={()=>d.retry(s.id)}>重试</Button>:s.status==='conflict'?<Button size="small" onClick={()=>d.setConflict(s.id)}>查看并处理</Button>:<span className={s.status==='ready'?'lifecycle-ready':''}>{statusText[s.status]}</span>}</div>
  </div>)}</section>;
  const showResults=['spaces','partial','completed'].includes(d.stage);
  const updateFooter=<div className="buildr-update-flow-actions" data-prototype-position="update-actions">
    {d.stage==='available'?<><span className="buildr-update-footer-spacer"/><Button onClick={()=>d.setUpdateOpen(false)}>稍后</Button><Button type="primary" onClick={()=>d.beginUpdate()}>更新到 {TARGET}</Button></>:done?<Button type="primary" onClick={()=>{d.setUpdateOpen(false);setPage('workspaces');}}>继续工作</Button>:partial?<><Button onClick={()=>d.setUpdateOpen(false)}>稍后处理</Button><Button type="primary" onClick={()=>d.retry()} disabled={!d.spaces.some(s=>['failed','offline'].includes(s.status))}>重试未完成</Button></>:d.stage.endsWith('error')?<><Button onClick={()=>d.setUpdateOpen(false)}>稍后</Button><Button type="primary" onClick={()=>d.retry()}>{d.stage==='download-error'?'重新下载':d.stage==='install-error'?'重试安装':'重新连接'}</Button></>:<Button onClick={()=>d.setUpdateOpen(false)}>收起，继续工作</Button>}
  </div>;
  const emptyAction=<Button type="primary" icon={<PlusOutlined/>} onClick={add}>添加工作空间</Button>;
  const entries=d.spaces.map(s=>({rootPath:s.path,status:'ready',workspace:{id:s.id,name:s.name,description:s.description}})) as any;
  const banner=started&&!done?<Alert className="lifecycle-catalog-banner" type={partial||d.stage.endsWith('error')?'warning':'info'} showIcon message={partial?`Buildr ${TARGET} 已安装，${d.pending.length} 个工作空间待完成`:d.stage.endsWith('error')?titles[d.stage]:titles[d.stage]} description={partial?'已完成的空间可正常使用。未完成的内容可以继续处理，无需重新安装软件。':d.active?'可以收起进度，继续使用已就绪的内容。':''} action={<Button onClick={openUpdate}>{partial?'完成更新':'查看进度'}</Button>}/>:null;
  return <div className="app-shell area-workspace lifecycle-demo">
    <AppShellHeader isGlobal={!opened} brandHref="/" workspaceName={opened?.name||'全部工作空间'} workspaceMenuItems={[{key:'all',label:'全部工作空间',onClick:()=>{d.setOpened(null);setPage('workspaces');}},...d.spaces.map(s=>({key:s.id,label:s.name,onClick:()=>openSpace(s)}))]} area="workspace" workbenchHref="#" workspaceDestination={{to:'#'}} actions={<>
      <Tooltip title="智能体已连接"><Button type="text" className="shell-agent-entry is-connected" icon={<RobotOutlined/>} onClick={()=>void message.info('已连接 Codex。添加目录不依赖连接状态。')}>Codex</Button></Tooltip>
      {!done&&<Tooltip title={partial?'完成更新':'更新 Buildr'}><Button data-prototype-position="update-entry" aria-label={partial?'完成更新':'更新 Buildr'} type="text" className="shell-update-entry" icon={d.active?<SyncOutlined spin/>:partial?<ExclamationCircleOutlined/>:<DownloadOutlined/>} onClick={openUpdate}/></Tooltip>}
      <Dropdown trigger={['click']} menu={{items:[{key:'update',label:partial?'完成更新':'检查更新…',icon:<ReloadOutlined/>,onClick:openUpdate},{key:'all',label:'全部工作空间',onClick:()=>{d.setOpened(null);setPage('workspaces');}}]}}><Button className="nav-more" type="text" aria-label="更多操作" icon={<EllipsisOutlined/>}/></Dropdown>
    </>}/>
    <AppShellFrame isGlobal={!opened} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={()=>setSidebarCollapsed(v=>!v)} navigation={<nav className="shell-navigation"><p className="shell-nav-caption">工作空间</p>{['总览','项目','服务','代码库','技能','文章'].map((label,index)=><button key={label} className={'shell-nav-item'+(index===0?' active':'')} onClick={()=>index!==0&&void message.info('本原型聚焦添加与更新流程。')}><HomeOutlined/><span>{label}</span></button>)}</nav>}>
      {opened?<><section className="resource-toolbar"><div><h1>{opened.name}</h1><p className="page-copy">{['ready','current'].includes(opened.status)?'所需内容已准备好，可以开始工作。':'这里还有内容待准备，Buildr 会保留已完成的结果。'}</p></div><Button onClick={()=>{d.setOpened(null);setPage('workspaces');}}>全部工作空间</Button></section>
        {opened.status!=='ready'&&opened.version!==d.installed&&banner}
        <section className="lifecycle-start-card" data-prototype-position="ready-workspace"><div className="lifecycle-start-icon">{['ready','current'].includes(opened.status)?<CheckCircleOutlined/>:<SyncOutlined spin={['running','waiting'].includes(opened.status)}/>}</div><div><h2>{['ready','current'].includes(opened.status)?'在这个目录开始工作':opened.status==='conflict'?'有修改需要确认':'正在补齐新版内容'}</h2><p>{['ready','current'].includes(opened.status)?'在智能体中选择下面的目录作为工作目录，新对话即可使用这里的工作内容。':'你仍可查看已有内容。新版内容准备完成后，这里会自动更新，无需重新添加。'}</p><div className="lifecycle-path-line"><code>{opened.path}</code><Button type="text" icon={<CopyOutlined/>} aria-label="复制工作目录" onClick={()=>copyPath(opened.path)}/></div></div><Tag color={['ready','current'].includes(opened.status)?'success':'processing'}>{['ready','current'].includes(opened.status)?`Buildr ${opened.version}`:statusText[opened.status]}</Tag></section>
        <WorkspaceComposition data={{projects:[],services:[],repositories:[]}} onOpen={()=>{}}/>
      </>:<><div data-prototype-position="catalog-banner">{banner}</div><div data-prototype-position="catalog"><WorkspacesCatalogView entries={entries} toolbar={<span data-prototype-position="add-entry"><Button type="primary" icon={<PlusOutlined/>} disabled={d.active} onClick={add}>添加工作空间</Button></span>} description="选择一个本机文件夹，开始和智能体一起工作。已有内容会保留，所需准备由 Buildr 自动完成。" emptyEyebrow={null} emptyDescription="选择一个文件夹，Buildr 会准备好开始工作所需的内容。" emptyActions={emptyAction} onOpen={entry=>{const s=d.spaces.find(s=>s.path===entry.rootPath);if(s)openSpace(s);}} onSettings={id=>setDetails(d.spaces.find(s=>s.id===id)||null)} onRemove={entry=>modal.confirm({title:'移除工作空间',content:'只从列表移除，目录和其中的内容都会保留。',okText:'移除',cancelText:'取消',onOk:()=>d.setSpaces(list=>list.filter(s=>s.path!==entry.rootPath))})}
          renderStatus={entry=>{const s=d.spaces.find(s=>s.path===entry.rootPath)!;return <Tag color={['ready','current'].includes(s.status)?'success':['running','waiting'].includes(s.status)?'processing':'warning'}>{statusText[s.status]}</Tag>;}}
          renderExtra={entry=>{const s=d.spaces.find(s=>s.path===entry.rootPath)!;return <div className="lifecycle-card-extra"><span>Buildr {s.version}{s.custom?' · 自定义方法':''}</span>{['failed','offline','conflict'].includes(s.status)&&<Button size="small" type="link" onClick={()=>{if(pendingAdd(s)){setPage('add');d.setAddOpen(true);}else if(s.status==='conflict')d.setConflict(s.id);else{openUpdate();}}}>继续处理</Button>}{s.status==='running'&&<Button size="small" type="link" onClick={()=>{if(pendingAdd(s)){setPage('add');d.setAddOpen(true);}else openUpdate();}}>查看进度</Button>}</div>;}}/></div></>}
    </AppShellFrame>
    <AddWorkspaceDialog open={d.addOpen} stage={d.addStage} selected={d.selected} name={d.name} step={d.addStep} onName={d.setName} onSelect={d.select} onConfirm={d.confirmAdd} onClose={()=>d.setAddOpen(false)} onRetry={()=>{if(d.selected)d.setSpace(d.selected.id,{status:'running'});d.setAddStage('preparing');}} onOpen={d.openAdded} onCopyPath={()=>copyPath(d.selected?.path||'')}/>
    <UpdateDialog statusTone={partial?'warning':undefined} demo open={d.updateOpen} view={view} busy={false} actionError="" disconnected={d.stage==='reconnect-error'} onClose={()=>d.setUpdateOpen(false)} onCheck={()=>{}} onTargetChange={()=>{}} onDownload={()=>d.beginUpdate()} onInstall={()=>d.beginUpdate()} onRecover={()=>d.retry()} onReconnect={()=>d.retry()} onCopy={()=>{}} onAgent={()=>{}} allowBackground scopeContent={d.stage==='available'?scope:<></>} progressContent={progress||<></>} footerContent={updateFooter}
      extraContent={<>{showResults&&spaceResults()}{!started&&<div className="lifecycle-target-note">本次更新本安装管理的全部已登记目录，包括最近未打开的空间。</div>}{done&&<Alert className="lifecycle-finish-note" type="success" showIcon message="已准备好，新对话可直接使用新版。" description="已有对话如仍使用旧内容，请新开对话。"/>}</>}/>
    <Modal open={Boolean(d.conflict)} centered title="确认你修改过的内容" width={650} onCancel={()=>d.setConflict(null)} footer={<Space><Button onClick={()=>d.setConflict(null)}>稍后处理</Button><Button onClick={()=>d.resolveConflict(true)}>保留我的修改</Button><Button type="primary" onClick={()=>d.resolveConflict(false)}>使用新版方法</Button></Space>}><div data-prototype-position="conflict-resolution"><p>“{d.spaces.find(s=>s.id===d.conflict)?.name}”中的一份工作方法有本地修改。请选择这个空间以后采用的内容。</p><code className="lifecycle-conflict-path">skills/buildr/task-finish/SKILL.md</code><div className="lifecycle-diff"><section><h3>你的修改</h3><p>交付前先按团队约定填写发布记录，再检查实际结果。</p></section><section><h3>Buildr 新版</h3><p>依据真实改动和已有授权完成交付，并分别报告结果。</p></section></div><Alert type="info" showIcon message="保留修改将继续采用你的自定义方法；使用新版前会保留现有内容副本。其他工作空间已完成的更新不受影响。"/></div></Modal>
    <Modal open={Boolean(details)} title="工作空间" centered onCancel={()=>setDetails(null)} footer={<Button onClick={()=>setDetails(null)}>关闭</Button>}><h3>{details?.name}</h3><p className="mono">{details?.path}</p><p>当前内容版本：Buildr {details?.version}</p><p>状态：{details?statusText[details.status]:''}</p></Modal>
  </div>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/?catalog=1']}><Preview/></MemoryRouter></App></ConfigProvider>);
