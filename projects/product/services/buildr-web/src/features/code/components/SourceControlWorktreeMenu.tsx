import { useContext, useEffect, useState } from 'react';
import { Button, Dropdown } from 'antd';
import { CloudDownloadOutlined, MoreOutlined, SyncOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';

type Props = {
  sourceKey?:string; open?:boolean; onOpenChange?(open:boolean):void;
  repositoryName: string; worktreeName: string; ready: boolean; fetching: boolean; syncing: boolean;
  onFetch(): void; onSync(): void;
};

export function SourceControlWorktreeMenu({sourceKey, open:controlledOpen, onOpenChange, repositoryName, worktreeName, ready, fetching, syncing, onFetch, onSync}: Props) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen, pending = fetching || syncing;
  const change = (next:boolean) => {setLocalOpen(next); onOpenChange?.(next);};
  useEffect(() => {change(false);}, [sourceKey, viewActive]);
  useEffect(() => {if (pending) change(false);}, [pending]);
  return <Dropdown trigger={['click']} placement="bottomRight" open={viewActive && open} onOpenChange={change} destroyOnHidden
    menu={{'aria-label':`操作菜单 · ${repositoryName} · ${worktreeName}`, items:[
      {key:'sync', icon:<SyncOutlined aria-hidden spin={syncing} />, label:syncing ? '正在同步…' : '同步（拉取后推送）', disabled:!ready || pending},
      {key:'fetch', icon:<CloudDownloadOutlined aria-hidden spin={fetching} />, label:fetching ? '正在获取远程…' : '获取远程', disabled:!ready || pending},
    ], onClick:({key, domEvent}) => {domEvent.stopPropagation(); change(false); if (key === 'sync') onSync(); else if (key === 'fetch') onFetch();}}}>
    <Button type="text" size="small" className="source-control-row-menu-button" icon={<MoreOutlined rotate={90} />} loading={pending} disabled={pending}
      aria-label={`操作菜单 · ${repositoryName} · ${worktreeName}`} title={`操作菜单 · ${repositoryName} · ${worktreeName}`} aria-expanded={open} aria-haspopup="menu" onClick={event => event.stopPropagation()} />
  </Dropdown>;
}
