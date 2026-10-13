import { useContext, useEffect, useState } from 'react';
import { Button, Popover } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, CloudOutlined, FileTextFilled, FileUnknownOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import type { SourceControlWorktree } from '../source-control-model';
import { sourceControlWorktreeStatus } from '../source-control-worktree-status';
import './source-control-worktree-status.css';

type Props = { worktree?: SourceControlWorktree; name: string; visible: boolean };

export function SourceControlWorktreeStatus({worktree, name, visible}: Props) {
  const [open, setOpen] = useState(false);
  const viewActive = useContext(WorkspaceViewActiveContext);
  const status = sourceControlWorktreeStatus(worktree);
  useEffect(() => { setOpen(false); }, [worktree?.worktreeId, viewActive, visible]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const content = <section className="source-control-status-details" aria-label={'状态详情 · ' + name}>
    <strong>{name}</strong>
    <dl><dt>远程记录</dt><dd>{status.remoteLabel}</dd><dt>当前文件</dt><dd>{status.fileLabel}</dd><dt>任务</dt><dd>{worktree?.taskTitle || worktree?.taskId || worktree?.taskDiagnostic || (worktree ? '未关联' : '关联未确认')}</dd></dl>
    {!!worktree?.diagnostics.length && <p>{worktree.diagnostics.join('；')}</p>}
    <p>本机已观察记录；查看详情不获取远程。</p>
  </section>;
  return <span className={'source-control-worktree-status' + (status.counts.length >= 3 ? ' has-many-counts' : '')} data-prototype-position="density-status">
    <Popover trigger="click" open={viewActive && visible && open} onOpenChange={setOpen} placement="rightTop" content={content} destroyOnHidden>
      <Button type="text" size="small" className={'source-control-status-button' + (status.clean ? ' is-clean' : '')}
        data-remote-state={status.remoteState} data-file-state={status.fileState}
        aria-label={'查看状态 · ' + name + ' · ' + status.remoteLabel + '；' + status.fileLabel} aria-expanded={open}
        title={status.remoteLabel + '；' + status.fileLabel} onClick={event => event.stopPropagation()}>
        {status.clean ? <CheckOutlined /> : status.remoteState === 'unavailable' ? <QuestionCircleOutlined /> : <>
          {status.remoteState === 'untracked' ? <CloudOutlined className="is-untracked" /> : status.remoteState === 'unknown' ? <span className="source-control-status-unknown"><CloudOutlined />?</span> : null}
          {status.counts.map(({kind, count}) => <span className="source-control-status-count" data-status-kind={kind} key={kind}>
            {kind === 'ahead' ? <ArrowUpOutlined /> : kind === 'behind' ? <ArrowDownOutlined /> : <FileTextFilled />}<span className="source-control-status-number">{count}</span>
          </span>)}
          {status.fileState === 'unknown' && <FileUnknownOutlined />}
        </>}
      </Button>
    </Popover>
  </span>;
}
