import { useContext, useEffect, useId, useState } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { CloudDownloadOutlined, MoreOutlined, SyncOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';

type Props = {
  sourceKey?:string; open?:boolean; onOpenChange?(open:boolean):void;
  repositoryName: string; worktreeName: string; ready: boolean; fetching: boolean; syncing: boolean;
  unavailableReason?: string;
  onFetch(): void; onSync(): void;
};

export function SourceControlWorktreeMenu({sourceKey, open:controlledOpen, onOpenChange, repositoryName, worktreeName, ready, fetching, syncing, unavailableReason, onFetch, onSync}: Props) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const reasonId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen, pending = fetching || syncing;
  const disabled = !ready || pending || Boolean(unavailableReason);
  const reason = unavailableReason || (!ready ? '当前来源尚未就绪，请刷新后重试' : undefined);
  const label = (text: string, description?: string) => reason || !description
    ? <span className="source-control-row-menu-label">{text}</span>
    : <Tooltip title={description} placement="right" classNames={{root:'source-control-row-menu-tooltip'}}><span className="source-control-row-menu-label">{text}</span></Tooltip>;
  const change = (next:boolean) => {setLocalOpen(next); onOpenChange?.(next);};
  useEffect(() => {change(false);}, [sourceKey, viewActive]);
  useEffect(() => {if (pending) change(false);}, [pending]);
  return <Dropdown trigger={['click']} placement="bottomRight" open={viewActive && open} onOpenChange={change} destroyOnHidden
    popupRender={menu => <div className="source-control-worktree-menu-panel">{menu}{reason && <p id={reasonId} className="source-control-worktree-menu-note" role="note">{reason.replace(/^当前分支/, '')}</p>}</div>}
    menu={{'aria-label':`操作菜单 · ${repositoryName} · ${worktreeName}`, 'aria-describedby':reason ? reasonId : undefined, items:[
      {key:'sync', icon:<SyncOutlined aria-hidden spin={syncing} />, label:label(syncing ? '正在同步…' : '同步', '先拉取并变基，再推送到当前远端跟踪分支'), disabled},
      {key:'fetch', icon:<CloudDownloadOutlined aria-hidden spin={fetching} />, label:label(fetching ? '正在获取远程…' : '获取远程'), disabled},
    ], onClick:({key, domEvent}) => {domEvent.stopPropagation(); if (disabled) return; change(false); if (key === 'sync') onSync(); else if (key === 'fetch') onFetch();}}}>
    <Button type="text" size="small" className="source-control-row-menu-button" icon={<MoreOutlined rotate={90} />} loading={pending} disabled={pending}
      aria-label={`操作菜单 · ${repositoryName} · ${worktreeName}`} title={`操作菜单 · ${repositoryName} · ${worktreeName}`} aria-expanded={open} aria-haspopup="menu" onClick={event => event.stopPropagation()} />
  </Dropdown>;
}
