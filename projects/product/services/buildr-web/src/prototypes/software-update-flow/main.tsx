import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App, Button, ConfigProvider, Dropdown, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { EllipsisOutlined, ExclamationCircleOutlined, ReloadOutlined, RobotOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { WorkspacesPage } from '../../features/workspace/pages/WorkspacesPage';
import { UpdateDialog } from '../../features/installation/components/UpdateDialog';
import { buildUpdateView } from '../../features/installation/lib/update-view';
import { softProductTheme } from '../../theme';
import { copyText } from '../../lib/copyText';
import { usePrototypeBridge } from '../prototype-bridge';
import { stepStatuses, PREVIOUS, TARGET, type Stage } from './flow-state';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';

function Preview(){
  const {message}=App.useApp();
  const [stage,setStage]=useState<Stage>('available'),[scene,setScene]=useState('update'),[headerState,setHeaderState]=useState('');
  const [open,setOpen]=useState(true),[connected,setConnected]=useState(true),[launcherNeedsRepair,setLauncherNeedsRepair]=useState(false);
  const current=useRef({page:'update',state:''});
  const bridge=usePrototypeBridge(scenes.pages,current,(page,state)=>{
    setScene(page);setHeaderState(page==='header'?state:'');setConnected(page!=='header'||!state.startsWith('offline'));
    setStage((page==='header'?(state.includes('no-update')?'latest':'available'):(state||'available')) as Stage);
    setOpen(page!=='header');setLauncherNeedsRepair(['launcher-error','launcher-repair-error','combined-error'].includes(state));
  });
  useEffect(()=>bridge.report(scene,scene==='header'?headerState:stage==='available'?'':stage),[scene,stage,headerState]);
  useEffect(()=>{
    const next:Partial<Record<Stage,Stage>>={checking:'available',downloading:'ready',installing:'launcher-updating','launcher-updating':'restarting',restarting:'verifying','launcher-repairing':'verifying',verifying:launcherNeedsRepair?'launcher-error':'completed'};
    if(!next[stage])return;
    const timer=setTimeout(()=>setStage(next[stage]!),stage==='downloading'?3000:1600);return()=>clearTimeout(timer);
  },[stage,launcherNeedsRepair]);
  const target=scene==='stable'?'0.1.0':TARGET,track=scene==='stable'?'stable':'candidate';
  const statuses=stepStatuses(stage,launcherNeedsRepair).map(value=>value==='active'?'running':value==='warning'?'failed':value==='waiting'?'pending':value);
  const phases:Record<string,string>={downloading:'download',ready:'ready',installing:'install','launcher-updating':'launcher','launcher-repairing':'launcher',restarting:'restart',verifying:'verify',completed:'completed','completed-no-launcher':'completed','download-error':'download','install-error':'install','launcher-error':'launcher','launcher-repair-error':'launcher','reconnect-error':'restart','combined-error':'restart','verification-error':'verify'};
  const installed=!['available','checking','latest','check-error','downloading','ready','installing','download-error','install-error'].includes(stage);
  const runningNew=['verifying','completed','completed-no-launcher','launcher-error','launcher-repairing','launcher-repair-error'].includes(stage);
  const job=!phases[stage]?null:{schemaVersion:'buildr.web-update-flow/v2',id:'preview',revision:1,version:target,track,currentVersion:runningNew?target:PREVIOUS,runningVersion:runningNew?target:PREVIOUS,installedVersion:installed?target:null,
    stage:phases[stage],status:stage==='downloading'?'preparing':stage==='ready'?'ready':stage.startsWith('completed')?'completed':stage.endsWith('error')?(installed?'partial':'failed'):'applying',
    steps:Object.fromEntries(['install','launcher','restart','verify'].map((key,index)=>[key,statuses[index]])),error:stage==='launcher-repair-error'?{code:'demo',message:'自动修复未完成，请重试或查看恢复方法。'}:null,launcherError:launcherNeedsRepair?{code:'demo',message:'桌面启动入口未更新。'}:null,simulated:false,updatedAt:null};
  const awareness={mode:'npm',current:{version:PREVIOUS},freshness:{status:'fresh'},tracks:{stable:{track:'stable',version:target,available:scene==='stable'&&stage!=='latest',installable:scene==='stable'&&stage!=='latest'},candidate:{track:'candidate',version:target,available:scene!=='stable'&&stage!=='latest',installable:scene!=='stable'&&stage!=='latest'}}};
  const view=buildUpdateView({awareness:awareness as any,job:job as any,checking:stage==='checking',checkError:stage==='check-error'?'暂时无法检查更新。':'',selectedTrack:track,connection:'connected'});
  const check=()=>{if(scene==='header')setScene('update');setStage('checking');setOpen(true);};
  const active=['downloading','installing','launcher-updating','launcher-repairing','restarting','verifying'].includes(stage);
  return <div className="app-shell area-workspace">
    <AppShellHeader isGlobal brandHref="/" workspaceName="全部工作空间" workspaceMenuItems={[{key:'all',label:'全部工作空间'}]} area="workspace" workbenchHref="/" workspaceDestination={{to:'/'}} actions={<>
      <Tooltip title={connected?'DSH 已连接':'DSH 未连接'}><Button data-prototype-position="agent" className={'shell-agent-entry'+(connected?' is-connected':' is-offline')} aria-label={connected?'智能体已连接':'智能体未连接'} type="text" icon={<RobotOutlined/>}>DSH</Button></Tooltip>
      {!['latest','checking','completed','completed-no-launcher','check-error'].includes(stage)&&<Tooltip title="软件更新"><Button data-prototype-position="entry" className="shell-update-entry" aria-label="软件更新" type="text" icon={active?<SyncOutlined spin/>:stage.endsWith('error')?<ExclamationCircleOutlined/>:<DownloadOutlined/>} onClick={()=>{if(scene==='header')setScene('update');setOpen(true);}}/></Tooltip>}
      <span data-prototype-position="menu"><Dropdown trigger={['click']} menu={{items:[{key:'check',label:'检查更新…',icon:<ReloadOutlined/>,onClick:check}]}}><Button className="nav-more" aria-label="更多操作" type="text" icon={<EllipsisOutlined/>}/></Dropdown></span>
    </>}/>
    <AppShellFrame isGlobal sidebarCollapsed={false} onToggleSidebar={()=>{}} navigation={null}><WorkspacesPage/></AppShellFrame>
    <UpdateDialog demo open={open} view={view} busy={false} actionError="" disconnected={['reconnect-error','combined-error'].includes(stage)} onClose={()=>setOpen(false)} onCheck={check} onTargetChange={()=>{}} onDownload={()=>setStage('downloading')} onInstall={()=>setStage('installing')}
      onRecover={action=>{if(action==='launcher'){setLauncherNeedsRepair(false);setStage('launcher-repairing');}else setStage(action==='install'?'installing':'restarting');}}
      onReconnect={()=>setStage('restarting')} onCopy={command=>void copyText(command).then(ok=>message.info(ok?'命令已复制；原型不会执行命令。':'请选中命令后复制。'))} onAgent={()=>void message.info('仅演示当前版本的更新指令，不发送真实任务。')}/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/?catalog=1']}><Preview/></MemoryRouter></App></ConfigProvider>);
