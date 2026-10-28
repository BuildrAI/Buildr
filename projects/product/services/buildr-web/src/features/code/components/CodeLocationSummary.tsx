import { Button } from 'antd';
import { CloseOutlined, DownOutlined } from '@ant-design/icons';
import { CopyButton } from '../../../components/CopyButton';

type LocationProps = { repositoryName: string; repositoryTitle?: string; location: string; branch?: string | null; taskId?: string; commitHash?: string; area?: 'unstaged' | 'staged' | 'untracked' | 'working' | 'commit'; worktreeName?: string; kind?: 'default' | 'task' | 'worktree' | 'commit' };

/** Keep the reading identity visible; disclose location details only on request. */
export function CodeLocationSummary({ repositoryName, repositoryTitle, branch, taskId, commitHash, area, worktreeName, kind, expanded, detailsId, onToggle }: LocationProps & {expanded: boolean; detailsId: string; onToggle(): void}) {
  const taskLocation = kind === 'task' || !kind && Boolean(taskId);
  const label = commitHash ? '历史版本' : area === 'staged' ? '已暂存版本' : taskLocation ? '任务目录' : '本机目录';
  return <Button type="text" size="small" className="code-location-summary" title={repositoryTitle || repositoryName} aria-label={'查看位置信息 ' + (repositoryTitle || repositoryName)} aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle} onKeyDown={event => { if (expanded && event.key === 'Escape') onToggle(); }}>
    <span className="code-location-summary-content"><strong>{repositoryName}</strong><span>· {worktreeName || label}</span>{worktreeName && area === 'staged' && <span>· 已暂存</span>}<code>{commitHash ? commitHash.slice(0, 8) : branch || ''}</code><DownOutlined className="code-location-summary-caret" /></span>
  </Button>;
}

export function CodeLocationDetails({location, branch, commitHash, id, onClose}: LocationProps & {id: string; onClose(): void}) {
  const reference = commitHash || branch;
  return <section id={id} className="source-control-source-details" aria-label="位置信息" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <header><strong>查看位置</strong><Button type="text" size="small" icon={<CloseOutlined />} aria-label="收起位置信息" onClick={onClose} /></header>
    <dl>
      <dt>目录</dt><dd><code>{location || '当前没有可查看的目录'}</code><CopyButton type="text" text={location ?? ''} ariaLabel="复制路径" failureMessage="可以选中文字复制。" disabled={!location} /></dd>
      <dt>{commitHash ? '固定提交' : '分支'}</dt><dd><code>{reference || '—'}</code><CopyButton type="text" text={reference ?? ''} ariaLabel={commitHash ? '复制提交标识' : '复制分支'} failureMessage="可以选中文字复制。" disabled={!reference} /></dd>
    </dl>
  </section>;
}
