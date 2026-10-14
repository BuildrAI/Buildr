import { useContext, useEffect, useId, useState } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { BranchesOutlined, CloudDownloadOutlined, InfoCircleOutlined, LoadingOutlined, MoreOutlined, ProjectOutlined, SyncOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import type { SourceControlWorktree } from '../source-control-model';
import { SourceControlWorktreeStatus } from './SourceControlWorktreeStatus';

type Props = {
  sourceKey?:string; open?:boolean; onOpenChange?(open:boolean):void;
  repositoryName: string; worktreeName: string; ready: boolean; fetching: boolean; syncing: boolean;
  unavailableReason?: string;
  onFetch(): void; onSync(): void;
  worktree?:SourceControlWorktree; onManageBranch?():void; onOpenTask?(taskId:string):void;
  visible?:boolean;
};

export function SourceControlWorktreeMenu({sourceKey, open:controlledOpen, onOpenChange, repositoryName, worktreeName, ready, fetching, syncing, unavailableReason, onFetch, onSync, worktree, onManageBranch, onOpenTask, visible=true}: Props) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const reasonId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const open = controlledOpen ?? localOpen, pending = fetching || syncing;
  const disabled = !ready || pending || Boolean(unavailableReason);
  const reason = unavailableReason || (!ready ? '当前来源尚未就绪，请刷新后重试' : undefined);
  const label = (text: string, description?: string) => reason || !description
    ? <span className="source-control-row-menu-label">{text}</span>
    : <Tooltip title={description} placement="right" classNames={{root:'source-control-row-menu-tooltip'}}><span className="source-control-row-menu-label">{text}</span></Tooltip>;
  const change = (next:boolean) => {setLocalOpen(next); onOpenChange?.(next); if (next) setStatusOpen(false);};
  useEffect(() => {change(false); setStatusOpen(false);}, [sourceKey, viewActive, visible]);
  useEffect(() => {if (pending) change(false);}, [pending]);
  const menu = <Dropdown trigger={['click']} placement="bottomRight" open={viewActive && visible && open} onOpenChange={change} destroyOnHidden
    popupRender={menu => <div className="source-control-worktree-menu-panel">{menu}{reason && <p id={reasonId} className="source-control-worktree-menu-note" role="note">{reason.replace(/^当前分支/, '')}</p>}</div>}
    menu={{'aria-label':`操作菜单 · ${repositoryName} · ${worktreeName}`, 'aria-describedby':reason ? reasonId : undefined, items:[
      ...(onManageBranch ? [{key:'branch', icon:<BranchesOutlined aria-hidden />, label:'管理分支', disabled:!ready || pending}] : []),
      ...(worktree ? [{key:'status', icon:<InfoCircleOutlined aria-hidden />, label:'查看状态'}, {key:'task', icon:<ProjectOutlined aria-hidden />, label:worktree.taskId ? '打开关联任务' : '查看任务关联'}, {type:'divider' as const}] : []),
      {key:'sync', icon:<SyncOutlined aria-hidden spin={syncing} />, label:label(syncing ? '正在同步…' : '同步', '先拉取并变基，再推送到当前远端跟踪分支'), disabled},
      {key:'fetch', icon:<CloudDownloadOutlined aria-hidden spin={fetching} />, label:label(fetching ? '正在获取远程…' : '获取远程'), disabled},
    ], onClick:({key, domEvent}) => {domEvent.stopPropagation(); change(false); if (key === 'status' || key === 'task' && !worktree?.taskId) setStatusOpen(true); else if (key === 'task' && worktree?.taskId) onOpenTask?.(worktree.taskId); else if (key === 'branch' && ready && !pending) onManageBranch?.(); else if (key === 'sync' && !disabled) onSync(); else if (key === 'fetch' && !disabled) onFetch();}}}>
    <Button type="text" size="small" className="source-control-row-menu-button" icon={pending ? <LoadingOutlined aria-hidden spin /> : <MoreOutlined rotate={90} />} aria-busy={pending}
      aria-label={`操作菜单 · ${repositoryName} · ${worktreeName}`} title={`操作菜单 · ${repositoryName} · ${worktreeName}`} aria-expanded={open} aria-haspopup="menu" onClick={event => event.stopPropagation()} />
  </Dropdown>;
  return worktree ? <SourceControlWorktreeStatus worktree={worktree} name={worktree.isMain ? repositoryName : worktreeName} visible={viewActive && visible} trigger={menu} open={statusOpen} onOpenChange={setStatusOpen} /> : menu;
}
