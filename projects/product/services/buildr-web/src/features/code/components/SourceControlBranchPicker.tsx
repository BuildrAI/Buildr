import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Alert, Button, Empty, Input, Popover } from 'antd';
import { BranchesOutlined, CheckOutlined, CloudOutlined, DownOutlined, EnvironmentOutlined, RightOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import type { SourceControlBranch } from '../source-control-branches';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import './source-control-branch-picker.css';

export type SourceControlBranchPickerProps = {
  entries: SourceControlBranch[];
  value: string;
  currentBranch: string | null;
  currentHead?: string | null;
  remoteLoading: boolean;
  remoteUpdatedAt: string;
  remoteError: string;
  onChange(ref: string): void;
  onRefreshRemote(): void;
  label?: string;
  mode?: 'history' | 'switch';
  separateCurrentScope?: boolean;
};

type BranchGroup = { key: string; title: string; entries: SourceControlBranch[] };

function makeGroups(entries: SourceControlBranch[]): BranchGroup[] {
  const remotes = Array.from(new Set(entries.filter(entry => entry.kind === 'remote').map(entry => entry.remote || 'origin')));
  remotes.sort((left, right) => {
    const rank = (value: string) => value === 'origin' ? 0 : value === 'upstream' ? 1 : 2;
    return rank(left) - rank(right) || left.localeCompare(right);
  });
  return [
    { key: 'local', title: '本地分支（Local Branch）', entries: entries.filter(entry => entry.kind === 'local') },
    ...remotes.map(remote => ({ key: `remote:${remote}`, title: remote, entries: entries.filter(entry => entry.kind === 'remote' && (entry.remote || 'origin') === remote) })),
  ];
}

export function SourceControlBranchPicker({ entries, value, currentBranch, currentHead, remoteLoading, remoteUpdatedAt, remoteError, onChange, onRefreshRemote, label, mode = 'history', separateCurrentScope = false }: SourceControlBranchPickerProps) {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const triggerRef = useRef<ComponentRef<typeof Button>>(null);
  const [open, setOpen] = useState(false);
  const [panelMaxHeight, setPanelMaxHeight] = useState(300);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => { if (!viewActive) setOpen(false); }, [viewActive]);
  const measureAvailableHeight = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) { setPanelMaxHeight(300); return; }
    // Keep the arrow, border and viewport edge outside the scrollable content.
    const available = Math.max(rect.top, window.innerHeight - rect.bottom) - 24;
    setPanelMaxHeight(Math.max(180, available));
  }, []);
  useEffect(() => {
    if (!open) return;
    measureAvailableHeight();
    window.addEventListener('resize', measureAvailableHeight);
    window.addEventListener('scroll', measureAvailableHeight, true);
    return () => {
      window.removeEventListener('resize', measureAvailableHeight);
      window.removeEventListener('scroll', measureAvailableHeight, true);
    };
  }, [open, measureAvailableHeight]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? entries.filter(entry => [entry.name, entry.ref, entry.remote].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)) : entries;
  }, [entries, query]);
  const groups = makeGroups(filtered);
  const local = groups[0];
  const remotes = groups.slice(1);
  const selected = entries.find(entry => entry.ref === value);
  const currentListed = entries.some(entry => entry.kind === 'local' && entry.name === currentBranch);
  const currentName = currentBranch || (currentHead ? `当前提交 ${currentHead.slice(0, 8)}` : '当前位置');
  const viewedName = value === 'HEAD' ? currentName : selected?.name || value.replace(/^refs\/(heads|remotes)\//, '') || currentName;
  const triggerLabel = label || (mode === 'history' ? `查看：${viewedName}` : '选择目标');
  const select = (ref: string) => { onChange(ref); setOpen(false); };
  const toggle = (key: string) => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderGroup = (group: BranchGroup) => {
    const expanded = !collapsed.has(group.key) || Boolean(query.trim());
    return <section className="source-control-branch-picker-group" key={group.key} aria-label={group.title}>
      <button type="button" className="source-control-branch-picker-group-toggle" onClick={() => toggle(group.key)} aria-expanded={expanded} aria-label={`${expanded ? '折叠' : '展开'} ${group.title}`}>
        {expanded ? <DownOutlined /> : <RightOutlined />}<span>{group.title}</span><small>{group.entries.length}</small>
      </button>
      {expanded && <div className="source-control-branch-picker-options">
        {group.entries.length ? group.entries.map(entry => {
          const isCurrent = entry.kind === 'local' && entry.name === currentBranch;
          const isSelected = entry.ref === value || mode === 'history' && !separateCurrentScope && value === 'HEAD' && isCurrent;
          const occupied = entry.kind === 'local' && Boolean(entry.worktreeId) && !isCurrent;
          return <button key={entry.ref} type="button" className={`source-control-branch-picker-option${isSelected ? ' is-selected' : ''}`} onClick={event => { event.stopPropagation(); select(mode === 'history' && !separateCurrentScope && isCurrent ? 'HEAD' : entry.ref); }} aria-label={`${mode === 'history' ? '查看' : '选择'} ${entry.name}${isCurrent ? '，当前使用' : ''}${occupied ? '，其他位置使用' : ''}`} aria-pressed={isSelected} title={entry.name}>
            <span className="source-control-branch-picker-option-icon">{entry.kind === 'remote' ? <CloudOutlined /> : <BranchesOutlined />}</span>
            <span className="source-control-branch-picker-option-copy"><strong>{entry.name}</strong>{isCurrent ? <small className="is-current">当前使用</small> : occupied ? <small>其他位置使用</small> : null}</span>
            {isSelected && <CheckOutlined className="source-control-branch-picker-check" />}
          </button>;
        }) : <p className="source-control-branch-picker-none">{query.trim() ? '没有匹配项' : '暂无本地记录'}</p>}
      </div>}
    </section>;
  };

  const content = <section className="source-control-branch-picker" style={{ maxHeight: panelMaxHeight }} data-prototype-position="grouped-branch-picker" aria-label={mode === 'history' ? '历史查看范围' : '切换目标选择'}>
    <div className="source-control-branch-picker-search"><Input size="small" allowClear value={query} onChange={event => setQuery(event.target.value)} prefix={<SearchOutlined />} placeholder="搜索本地和远程名称" aria-label="搜索全部分支（Branch）" /></div>
    <div className="source-control-branch-picker-scroll">
      {mode === 'history' && !query.trim() && (separateCurrentScope || !currentListed) && <button type="button" className={`source-control-branch-picker-option source-control-branch-picker-current${value === 'HEAD' ? ' is-selected' : ''}`} onClick={() => select('HEAD')} aria-label={separateCurrentScope ? '查看当前工作分支历史' : '查看当前工作位置的历史'} aria-pressed={value === 'HEAD'}>
        <span className="source-control-branch-picker-option-icon"><EnvironmentOutlined /></span><span className="source-control-branch-picker-option-copy"><strong>{separateCurrentScope ? '当前分支' : '当前工作位置'}</strong><small>{currentName}</small></span>{value === 'HEAD' && <CheckOutlined className="source-control-branch-picker-check" />}
      </button>}
      {renderGroup(local)}
      <div className="source-control-branch-picker-remote-heading"><CloudOutlined /><span>远程分支（Remote Branch）</span><small>{filtered.filter(entry => entry.kind === 'remote').length}</small></div>
      {remotes.length ? remotes.map(renderGroup) : <p className="source-control-branch-picker-none">{query.trim() ? '没有匹配的远程记录' : '暂无远程记录'}</p>}
      {query.trim() && !filtered.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配名称" />}
    </div>
    <footer className="source-control-branch-picker-footer" data-prototype-position="remote-records">
      <div><span>{remoteLoading ? '正在更新远程记录…' : remoteUpdatedAt ? `上次更新 ${remoteUpdatedAt}` : '远程记录尚未更新'}</span><Button type="text" size="small" icon={<SyncOutlined spin={remoteLoading} />} loading={remoteLoading} onClick={onRefreshRemote} aria-label="更新远程记录" title="更新远程记录" /></div>
      {remoteError && <Alert showIcon type="warning" message={remoteError} />}
      {mode === 'history' && <small>选择只查看历史</small>}
    </footer>
  </section>;

  return <Popover open={viewActive && open} onOpenChange={nextOpen => { if (nextOpen) measureAvailableHeight(); setOpen(viewActive && nextOpen); }} trigger="click" placement="bottomLeft" content={content} overlayClassName="source-control-branch-picker-popover" destroyOnHidden>
    <Button ref={triggerRef} className="source-control-branch-picker-trigger" size="small" aria-label={mode === 'history' ? '选择历史查看范围' : '选择切换目标'} aria-expanded={open} aria-haspopup="dialog" data-prototype-position={mode === 'history' ? 'history-range-picker' : 'switch-target-picker'} title={triggerLabel}><span>{triggerLabel}</span><DownOutlined /></Button>
  </Popover>;
}
