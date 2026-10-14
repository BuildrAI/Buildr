import { useContext, useEffect, useRef, useState, type ReactElement } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, CloudOutlined, FileTextFilled, FileUnknownOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import type { SourceControlWorktree } from '../source-control-model';
import { sourceControlWorktreeStatus } from '../source-control-worktree-status';
import './source-control-worktree-status.css';

type Props = { worktree?: SourceControlWorktree; name: string; visible: boolean; syncAction?:{pending:boolean;run():void}; trigger?:ReactElement; open?:boolean; onOpenChange?(open:boolean):void };

export function SourceControlWorktreeStatus({worktree, name, visible, syncAction, trigger, open:controlledOpen, onOpenChange}: Props) {
  const [localOpen, setLocalOpen] = useState(false), [syncTooltipOpen, setSyncTooltipOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next:boolean) => {setLocalOpen(next); onOpenChange?.(next);};
  const viewActive = useContext(WorkspaceViewActiveContext);
  const status = sourceControlWorktreeStatus(worktree);
  useEffect(() => { setOpen(false); setSyncTooltipOpen(false); }, [worktree?.worktreeId, worktree?.branch, worktree?.head, worktree?.upstream, status.remoteLabel, viewActive, visible, syncAction?.pending]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const outside = (event:PointerEvent) => {const target = event.target; if (trigger && target instanceof Element && !anchor.current?.contains(target) && !target.closest('.source-control-status-details')) setOpen(false);};
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', outside);
    return () => {window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside);};
  }, [open]);
  const content = <section className="source-control-status-details" aria-label={'状态详情 · ' + name}>
    <strong>{name}</strong>
    <dl><dt>远程记录</dt><dd>{status.remoteLabel}</dd><dt>当前文件</dt><dd>{status.fileLabel}</dd><dt>任务</dt><dd>{worktree?.taskTitle || worktree?.taskId || worktree?.taskDiagnostic || (worktree ? '未关联' : '关联未确认')}</dd></dl>
    {!!worktree?.diagnostics.length && <p>{worktree.diagnostics.join('；')}</p>}
    <p>本机已观察记录；查看详情不获取远程。</p>
  </section>;
  if (trigger) return <Popover trigger={[]} open={viewActive && visible && open} onOpenChange={setOpen} placement="rightTop" content={content} destroyOnHidden><span ref={anchor} className="source-control-menu-status-anchor">{trigger}</span></Popover>;
  const canSync = status.remoteState === 'changed' && Boolean(syncAction);
  const remoteCounts = status.counts.filter(count => count.kind !== 'files');
  const detailCounts = canSync ? status.counts.filter(count => count.kind === 'files') : status.counts;
  const showDetails = !canSync || status.fileState !== 'clean';
  const visibleGroupCount = status.counts.length + Number(status.remoteState === 'untracked' || status.remoteState === 'unknown') + Number(status.fileState === 'unknown');
  const syncLabel = `同步 · ${name} · 先拉取并变基，再推送到 ${worktree?.upstream || '当前上游'} · ${status.remoteLabel}`;
  const renderCounts = (counts:typeof status.counts) => counts.map(({kind, count}) => <span className="source-control-status-count" data-status-kind={kind} key={kind}>
    {kind === 'ahead' ? <ArrowUpOutlined /> : kind === 'behind' ? <ArrowDownOutlined /> : <FileTextFilled />}<span className="source-control-status-number">{count}</span>
  </span>);
  return <span className={'source-control-worktree-status' + (visibleGroupCount >= 2 ? ' has-many-counts' : '')} data-prototype-position="density-status"
    data-remote-state={status.remoteState} data-file-state={status.fileState} aria-label={status.remoteLabel + '；' + status.fileLabel}>
    {canSync && <Tooltip title={syncLabel} trigger={['hover', 'focus']} open={viewActive && visible && !syncAction?.pending && syncTooltipOpen} onOpenChange={next => setSyncTooltipOpen(Boolean(viewActive && visible && !syncAction?.pending && next))} classNames={{root:'source-control-sync-tooltip'}} destroyOnHidden><Button type="text" size="small" className="source-control-sync-button" loading={syncAction?.pending} disabled={syncAction?.pending}
      aria-label={syncLabel} title={syncLabel} onClick={event => {event.stopPropagation(); setSyncTooltipOpen(false); syncAction?.run();}}><span className="source-control-status-content">{renderCounts(remoteCounts)}</span></Button></Tooltip>}
    {showDetails && <Popover trigger="click" open={viewActive && visible && open} onOpenChange={setOpen} placement="rightTop" content={content} destroyOnHidden>
      <Button type="text" size="small" className={'source-control-status-button' + (status.clean ? ' is-clean' : '')}
        data-remote-state={status.remoteState} data-file-state={status.fileState}
        aria-label={'查看状态 · ' + name + ' · ' + status.remoteLabel + '；' + status.fileLabel} aria-expanded={open}
        title={status.remoteLabel + '；' + status.fileLabel} onClick={event => event.stopPropagation()}>
        {status.clean ? <CheckOutlined /> : status.remoteState === 'unavailable' ? <QuestionCircleOutlined /> : <span className="source-control-status-content">
          {status.remoteState === 'untracked' ? <CloudOutlined className="is-untracked" /> : status.remoteState === 'unknown' ? <span className="source-control-status-unknown"><CloudOutlined />?</span> : null}
          {renderCounts(detailCounts)}
          {status.fileState === 'unknown' && <FileUnknownOutlined />}
        </span>}
      </Button>
    </Popover>}
  </span>;
}
