import { useState, type ReactNode } from 'react';
import { Alert, Button, Modal, Select, Spin, Tag } from 'antd';
import { ArrowUpOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, MinusCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { CopyButton } from '../../../components/CopyButton';
import type { UpdateView } from '../lib/update-view';
import './update-flow.css';

export type UpdateDialogProps = {
  demo?:boolean;
  open:boolean;
  view:UpdateView;
  busy:boolean;
  actionError:string;
  disconnected:boolean;
  onClose():void;
  onCheck():void;
  onTargetChange(track:string):void;
  onDownload():void;
  onInstall():void;
  onRecover(action:'install'|'launcher'|'restart'|'workspaces'):void;
  onReconnect():void;
  onAgent():void;
  scopeContent?:ReactNode;
  progressContent?:ReactNode;
  extraContent?:ReactNode;
  footerContent?:ReactNode;
  allowBackground?:boolean;
  statusTone?:'warning';
};
export function UpdateDialog({demo=false,open,view,busy,actionError,disconnected,onClose,onCheck,onTargetChange,onDownload,onInstall,onRecover,onReconnect,scopeContent,progressContent,extraContent,footerContent,allowBackground=false,statusTone}:UpdateDialogProps) {
  const [advanced,setAdvanced]=useState(false);
  const {phase,target}=view;
  const active=['installing','launcher-updating','restarting','verifying','workspaces-updating'].includes(phase);
  const failed=phase.endsWith('error')||statusTone==='warning';
  const currentLabel=view.installedVersion&&view.currentVersion!==target?.version?'已安装版本':'当前运行版本';
  const steps=view.steps?{...view.steps}:null;
  if(steps&&phase==='restarting')steps.restart='running';
  if(steps&&['reconnect-error','combined-error'].includes(phase))steps.restart='failed';
  const showSteps=steps&&!['downloading','download-error','ready'].includes(phase);
  const showOther=phase==='available';
  return <Modal open={open} centered width={extraContent?620:500} title={null} footer={null} onCancel={onClose} closable={!active||allowBackground} maskClosable={!active||allowBackground} keyboard={!active||allowBackground} className="buildr-update-modal" afterClose={()=>setAdvanced(false)}>
    <section data-prototype-position={demo?"flow":undefined} id="update-details-modal" className="buildr-update-flow" data-update-status={phase}>
      <div className="buildr-update-heading"><div className={'buildr-update-hero-icon'+(statusTone==='warning'?' is-warning':failed?' is-error':'')}>{active||phase==='checking'?<SyncOutlined spin/>:failed?<ExclamationCircleOutlined/>:['ready','completed','latest'].includes(phase)?<CheckCircleOutlined/>:<ArrowUpOutlined/>}</div><div><div className="buildr-update-eyebrow">Buildr 软件更新</div><h1>{view.title}</h1></div></div>
      <p className="buildr-update-description">{view.description}</p>
      {view.currentVersion&&phase!=='checking'&&<div className="buildr-update-version-card">
        {target&&['available','downloading','ready','download-error'].includes(phase)?<><div><span>当前版本</span><div className="buildr-update-version-line">{view.currentVersion}</div></div><span className="buildr-update-version-arrow">→</span><div><span>可更新至 {phase==='available'&&view.targets.length>1?<Select size="small" variant="borderless" aria-label="更新版本通道" value={target.track} onChange={onTargetChange} options={view.targets.map(item=>({value:item.track,label:item.label+' '+item.version}))}/>:<Tag>{target.label}</Tag>}</span><div className="buildr-update-version-line"><strong>{target.version}</strong></div></div></>:<div><span>{currentLabel}</span><div className="buildr-update-version-line"><strong>{view.installedVersion||view.currentVersion}</strong></div>{view.installedVersion&&view.currentVersion!==target?.version&&<small className="buildr-update-runtime-note">实际运行版本 {view.currentVersion}</small>}</div>}
      </div>}
      {scopeContent ?? (phase==='available'&&<div className="buildr-update-release-note"><h2>更新范围</h2><ul><li>安装所选 Buildr 版本</li><li>更新已有桌面启动入口</li><li>自动更新全部已登记工作空间并检查可用性</li></ul></div>)}
      {phase==='downloading'&&<div id="update-downloading" className="buildr-update-download" role="status"><Spin size="small"/><span>正在下载并校验 {target?.version} 更新包</span></div>}
      {scopeContent===undefined&&phase==='ready'&&<><div className="buildr-update-confirm-scope">安装 Buildr → 更新已有启动入口 → 重启并核验</div><Alert type="info" showIcon message="安装并重启前，请保存正在编辑的内容。"/></>}
      {progressContent ?? (showSteps&&<div className="buildr-update-stage-list" aria-label="安装与恢复进度">{(['install','launcher','restart','verify'] as const).map((key,index)=>{const status=steps[key];return <div key={key} className={'buildr-update-stage-row is-'+status}>{status==='done'?<CheckCircleOutlined/>:status==='running'?<SyncOutlined spin/>:status==='failed'?<ExclamationCircleOutlined/>:status==='skipped'?<MinusCircleOutlined/>:<ClockCircleOutlined/>}<span>{['安装 Buildr','更新桌面启动入口','重新连接网页','核验运行版本'][index]}</span><small>{status==='done'?'已完成':status==='running'?'进行中':status==='failed'?'需要恢复':status==='skipped'?(key==='verify'&&view.simulated?'模拟，不改变版本':'无需执行'):'等待中'}</small></div>;})}</div>)}
      {extraContent}
      {(view.error||view.launcherError)&&failed&&<Alert className="buildr-update-error" type="warning" showIcon message={view.error||view.launcherError} description={view.error&&view.launcherError?view.launcherError:undefined}/>}
      {failed&&view.errorDetails&&<details><summary>查看详情</summary><pre className="workspace-preparation-details">{view.errorDetails}</pre></details>}
      {actionError&&<Alert id="update-action-error" type="error" showIcon message={actionError}/>}

      {footerContent ?? <div className="buildr-update-flow-actions">
        {phase==='checking'?<Button onClick={onClose}>关闭</Button>:null}
        {showOther&&<><span className="buildr-update-footer-spacer"/><Button onClick={onClose}>稍后</Button><Button type="primary" id={`update-prepare-${view.simulated?'simulated':target?.track}`} loading={busy} disabled={!target} onClick={onDownload}>{view.simulated?'模拟更新':`更新到 ${target?.version || ''}`}</Button></>}
        {phase==='downloading'&&<Button onClick={onClose}>后台下载</Button>}
        {phase==='ready'&&<><Button onClick={onClose}>稍后安装</Button><Button id="update-apply" type="primary" loading={busy} onClick={onInstall}>{view.simulated?'模拟安装并重启':'安装并重启'}</Button></>}
        {phase==='download-error'&&<><Button onClick={onClose}>稍后</Button><Button id="update-retry" type="primary" loading={busy} onClick={onDownload}>重新下载</Button></>}
        {phase==='workspaces-updating'&&<Button onClick={onClose}>收起</Button>}
        {phase==='workspaces-error'&&<><Button onClick={onClose}>稍后处理</Button><Button type="primary" loading={busy} onClick={()=>onRecover('workspaces')}>重试未完成</Button></>}
        {phase==='install-error'&&<><Button onClick={onClose}>稍后</Button><Button type="primary" loading={busy} onClick={()=>onRecover('install')}>重试安装</Button></>}
        {phase==='launcher-error'&&<><Button onClick={onClose}>稍后修复</Button><Button id="update-repair-launcher" type="primary" loading={busy} onClick={()=>onRecover('launcher')}>修复启动入口</Button></>}
        {phase==='reconnect-error'&&<><Button onClick={()=>setAdvanced(!advanced)}>恢复方法</Button><Button type="primary" loading={busy} onClick={disconnected?onReconnect:()=>onRecover('restart')}>{disconnected?'继续等待':'重新启动新版'}</Button></>}
        {phase==='combined-error'&&<><Button onClick={()=>setAdvanced(!advanced)}>查看恢复方法</Button><Button type="primary" loading={busy} onClick={disconnected?onReconnect:()=>onRecover('restart')}>{disconnected?'继续等待':'恢复网页'}</Button></>}
        {phase==='verification-error'&&<Button type="primary" loading={busy} onClick={()=>onRecover('restart')}>重新启动新版</Button>}
        {phase==='unavailable'&&<><Button onClick={onClose}>关闭</Button><Button id="update-check-now" type="primary" loading={busy} onClick={onCheck}>重新检查</Button></>}
        {['latest','completed'].includes(phase)&&<Button type="primary" onClick={onClose}>{phase==='completed'?'继续工作':'知道了'}</Button>}
      </div>}
      {['launcher-error','verification-error'].includes(phase)&&<div className="buildr-update-secondary"><Button type="link" size="small" onClick={()=>setAdvanced(!advanced)}>{advanced?'收起恢复方法':'查看恢复方法'}</Button></div>}
      {advanced&&failed&&!showOther&&<div className="buildr-update-recovery-help"><strong>手动恢复</strong><p>{disconnected?'当前页面无法直接执行恢复。请在终端运行以下命令，再回到此页刷新。':'自动恢复不可用时，可在终端运行以下命令。'}</p><pre>{view.recoveryCommand}</pre><CopyButton text={view.recoveryCommand} failureMessage="复制失败，请选择命令手动复制。">复制恢复命令</CopyButton><small>请核对终端输出，返回页面后确认实际运行版本。</small></div>}
      {demo?<div className="buildr-update-bottom-caption">交互演示 · 不会修改本机安装</div>:view.simulated?<div className="buildr-update-bottom-caption">开发模拟 · 不下载真实软件包、不修改安装或启动入口；确认后本实例会重启。</div>:null}
    </section>
  </Modal>;
}
