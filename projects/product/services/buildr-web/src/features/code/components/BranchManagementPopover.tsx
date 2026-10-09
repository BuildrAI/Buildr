import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Button, Input, Popover, Spin } from 'antd';
import { BranchesOutlined, CheckOutlined, CloudOutlined, DownOutlined, RightOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import type { BranchSwitchFailure, BranchSwitchImpact, SourceControlBranch } from '../source-control-branches';
import type { SourceControlRepository, SourceControlWorktree } from '../source-control-model';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import './branch-management-popover.css';

export type BranchManagementPopoverProps = {
  repository: SourceControlRepository;
  worktree: SourceControlWorktree;
  entries: SourceControlBranch[];
  ready: boolean;
  remoteLoading: boolean;
  remoteUpdatedAt: string;
  remoteError: string;
  reading: boolean;
  readNote: string;
  pending: boolean;
  failure: BranchSwitchFailure | null;
  onOpenChange(open: boolean): void;
  onTargetChange(): void;
  onRefreshRemote(): void;
  inspect(entry: SourceControlBranch): BranchSwitchImpact;
  onUse(entry: SourceControlBranch, localName?: string): Promise<boolean>;
  onOpenPosition(worktreeId: string): void;
  onViewChanges(): void;
};

type BranchGroup = { key: string; title: string; entries: SourceControlBranch[] };

function groupsFor(entries: SourceControlBranch[]): BranchGroup[] {
  const remotes = Array.from(new Set(entries.filter(entry => entry.kind === 'remote').map(entry => entry.remote || 'origin')));
  const order = (remote: string) => remote === 'origin' ? 0 : remote === 'upstream' ? 1 : 2;
  remotes.sort((left, right) => order(left) - order(right) || left.localeCompare(right));
  return [
    { key: 'local', title: '本地', entries: entries.filter(entry => entry.kind === 'local') },
    ...remotes.map(remote => ({ key: remote, title: remote, entries: entries.filter(entry => entry.kind === 'remote' && (entry.remote || 'origin') === remote) })),
  ];
}

export function BranchManagementPopover({ repository, worktree, entries, ready, remoteLoading, remoteUpdatedAt, remoteError, reading, readNote, pending, failure, onOpenChange, onTargetChange, onRefreshRemote, inspect, onUse, onOpenPosition, onViewChanges }: BranchManagementPopoverProps) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const triggerRef = useRef<ComponentRef<typeof Button>>(null);
  const [open, setOpen] = useState(false);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [localName, setLocalName] = useState('');
  const [maxHeight, setMaxHeight] = useState(420);
  const worktreeName = worktree.isMain ? '主工作树' : worktree.name;
  const currentName = worktree.branch || (worktree.head ? `当前提交 ${worktree.head.slice(0, 8)}` : '尚无提交');
  const compactCurrentName = worktree.branch?.split('/').filter(Boolean).at(-1) || currentName;
  const measure = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.innerHeight;
    const available = Math.max(rect.top, viewport - rect.bottom) - 24;
    setMaxHeight(Math.min(420, Math.max(180, Math.min(viewport - 24, available))));
  }, []);
  const close = useCallback(() => { setOpen(false); setActiveRef(null); onOpenChange(false); }, [onOpenChange]);
  useEffect(() => { if (!viewActive) close(); }, [viewActive, close]);
  useEffect(() => {
    if (!open) return;
    measure();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (activeRef) setActiveRef(null); else close();
    };
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, activeRef, measure, close]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? entries.filter(entry => `${entry.name} ${entry.ref} ${entry.remote || ''}`.toLocaleLowerCase().includes(term)) : entries;
  }, [entries, query]);
  const groups = groupsFor(filtered);
  const beginAction = (entry: SourceControlBranch, nextOpen: boolean) => {
    if (!viewActive || !nextOpen) { setActiveRef(current => current === entry.ref ? null : current); return; }
    onTargetChange();
    setActiveRef(entry.ref);
    setLocalName(inspect(entry).localName);
  };
  const use = async (entry: SourceControlBranch, nextLocalName?: string) => {
    if (pending) return;
    if (await onUse(entry, nextLocalName)) close();
  };
  const actionPanel = (entry: SourceControlBranch) => {
    const impact = inspect(entry);
    const targetName = impact.needsLocalName ? localName.trim() : impact.localName;
    const affected = Boolean(failure?.affectedFiles.length);
    const actionLabel = impact.createTracking ? `检出并切换为 ${targetName || '此项'}` : `切换到 ${targetName || '此项'}`;
    return <section role="region" aria-label={`分支操作 · ${entry.name}`} className="branch-management-action" onClick={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} data-prototype-position="branch-switch-action">
      {failure && !affected && <p className="branch-management-warning" role="alert">{failure.message}</p>}
      {impact.same ? <Button type="text" block disabled>当前已在使用</Button> : impact.occupied ? <>
        <p title={impact.occupied.location}>已在 {impact.occupied.isMain ? '主工作树' : impact.occupied.name} 使用</p>
        <Button type="text" block className="branch-management-primary-action" onClick={() => { onOpenPosition(impact.occupied!.worktreeId); close(); }}>打开所在位置</Button>
      </> : affected ? <>
        <p className="branch-management-warning" role="alert">{failure?.message}</p>
        <ul className="branch-management-affected-files">{failure!.affectedFiles.map(path => <li key={path} title={path}>{path}</li>)}</ul>
        <Button type="text" block className="branch-management-primary-action" onClick={() => { onViewChanges(); close(); }}>查看现有改动</Button>
      </> : impact.blockedReason ? <p className="branch-management-warning">{impact.blockedReason}</p> : <>
        {impact.needsLocalName && <label className="branch-management-local-name">本地分支（Local Branch）名称<Input size="small" value={localName} onChange={event => { setLocalName(event.target.value); onTargetChange(); }} aria-label="切换使用的本地分支（Local Branch）名称" onPressEnter={() => { if (targetName) void use(entry, targetName); }} /></label>}
        <Button type="text" block className="branch-management-primary-action" disabled={!targetName || reading} loading={pending} title={actionLabel} onClick={() => void use(entry, impact.needsLocalName ? targetName : undefined)}>{actionLabel}</Button>
      </>}
    </section>;
  };
  const renderGroup = (group: BranchGroup) => <section className="branch-management-group" key={group.key} aria-label={group.title}>
    <h4>{group.title}</h4>
    {group.entries.length ? group.entries.map(entry => {
      const impact = inspect(entry);
      return <Popover key={entry.ref} open={viewActive && activeRef === entry.ref} onOpenChange={next => beginAction(entry, next)} trigger={['click', 'contextMenu']} placement="rightTop" autoAdjustOverflow content={actionPanel(entry)} overlayClassName="branch-management-action-popover" destroyOnHidden arrow={false}>
        <button type="button" disabled={pending} className={`branch-management-entry${impact.same ? ' is-current' : ''}${activeRef === entry.ref ? ' is-active' : ''}`} aria-label={`管理 ${entry.name}`} aria-expanded={activeRef === entry.ref} aria-haspopup="menu" onClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} title={entry.name}>
          <span className="branch-management-entry-icon">{entry.kind === 'remote' ? <CloudOutlined /> : <BranchesOutlined />}</span>
          <strong>{entry.name}</strong>
          {impact.same ? <span className="branch-management-entry-state">当前 <CheckOutlined /></span> : impact.occupied ? <span className="branch-management-entry-state">其他位置使用</span> : <RightOutlined className="branch-management-entry-more" />}
        </button>
      </Popover>;
    }) : <p className="branch-management-none">{query.trim() ? '没有匹配项' : '暂无本地记录'}</p>}
  </section>;
  const content = <section role="region" aria-label={`分支管理 · ${repository.name} · ${worktreeName}`} className="branch-management-panel" style={{ maxHeight }} onClick={event => event.stopPropagation()} data-prototype-position="work-position-branch-manager">
    <header className="branch-management-scope" title={worktree.location}>{repository.name} · {worktreeName}</header>
    <div className="branch-management-search"><Input size="small" value={query} allowClear onChange={event => { setQuery(event.target.value); setActiveRef(null); }} prefix={<SearchOutlined />} placeholder="搜索分支名称" aria-label="搜索可用分支（Branch）" /></div>
    <div className="branch-management-list">
      {reading && !entries.length && <p className="branch-management-none" role="status"><Spin size="small" /> 正在读取…</p>}
      {renderGroup(groups[0])}
      <div className="branch-management-remote-heading"><CloudOutlined /><span>远程</span></div>
      {groups.length > 1 ? groups.slice(1).map(renderGroup) : <p className="branch-management-none">{query.trim() ? '没有匹配项' : '暂无远程记录'}</p>}
    </div>
    <footer><span>{remoteLoading ? '正在更新远程记录…' : remoteUpdatedAt ? `上次更新 ${remoteUpdatedAt}` : '远程记录尚未更新'}</span><Button type="text" size="small" icon={<SyncOutlined spin={remoteLoading} />} disabled={remoteLoading} onClick={onRefreshRemote} aria-label="更新远程分支（Remote Branch）记录" title="更新远程记录" />{remoteError && <p role="alert">{remoteError}</p>}{readNote && <p>{readNote}</p>}</footer>
  </section>;
  return <Popover open={viewActive && open} onOpenChange={next => { if (next && viewActive) { measure(); setOpen(true); onOpenChange(true); } else close(); }} trigger="click" placement="rightTop" autoAdjustOverflow content={content} overlayClassName="branch-management-popover" destroyOnHidden>
    <Button ref={triggerRef} type="text" size="small" className="source-control-row-action-button" disabled={!ready || pending} title={`${currentName} · 管理分支`} aria-label={`管理分支 · ${repository.name} · ${worktreeName}`} aria-expanded={open} aria-haspopup="menu" onClick={event => event.stopPropagation()}><span className="source-control-row-branch-name">{compactCurrentName}</span><DownOutlined /></Button>
  </Popover>;
}
