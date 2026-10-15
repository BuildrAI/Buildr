import { App, Button } from 'antd';
import { CloseOutlined, CopyOutlined, DownOutlined } from '@ant-design/icons';
import { copyText } from '../../../lib/copyText';

type LocationProps = { repositoryName: string; location: string; branch?: string | null; taskId?: string; commitHash?: string; area?: 'unstaged' | 'staged' | 'untracked' | 'commit'; worktreeName?: string; kind?: 'default' | 'task' | 'worktree' | 'commit' };

/** Keep the reading identity visible; disclose location details only on request. */
export function CodeLocationSummary({ repositoryName, branch, taskId, commitHash, area, worktreeName, kind, expanded, detailsId, onToggle }: LocationProps & {expanded: boolean; detailsId: string; onToggle(): void}) {
  const taskLocation = kind === 'task' || !kind && Boolean(taskId);
  const label = commitHash ? '历史版本' : area === 'staged' ? '已暂存版本' : taskLocation ? '任务目录' : '本机目录';
  return <Button type="text" size="small" className="code-location-summary" aria-label={'查看位置信息 ' + repositoryName} aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle} onKeyDown={event => { if (expanded && event.key === 'Escape') onToggle(); }}>
    <span className="code-location-summary-content"><strong>{repositoryName}</strong><span>· {worktreeName || label}</span>{worktreeName && area === 'staged' && <span>· 已暂存</span>}<code>{commitHash ? commitHash.slice(0, 8) : branch || ''}</code><DownOutlined className="code-location-summary-caret" /></span>
  </Button>;
}

export function CodeLocationDetails({location, branch, commitHash, id, onClose}: LocationProps & {id: string; onClose(): void}) {
  const { message } = App.useApp();
  const reference = commitHash || branch;
  const copy = async (text: string) => {
    if (await copyText(text)) message.success('已复制');
    else message.info('可以选中文字复制。');
  };
  return <section id={id} className="source-control-source-details" aria-label="位置信息" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <header><strong>查看位置</strong><Button type="text" size="small" icon={<CloseOutlined />} aria-label="收起位置信息" onClick={onClose} /></header>
    <dl>
      <dt>目录</dt><dd><code>{location || '当前没有可查看的目录'}</code><Button type="text" size="small" aria-label="复制路径" title="复制路径" icon={<CopyOutlined />} disabled={!location} onClick={() => void copy(location)} /></dd>
      <dt>{commitHash ? '固定提交' : '分支'}</dt><dd><code>{reference || '—'}</code><Button type="text" size="small" aria-label={commitHash ? '复制提交标识' : '复制分支'} title={commitHash ? '复制提交标识' : '复制分支'} icon={<CopyOutlined />} disabled={!reference} onClick={() => reference && void copy(reference)} /></dd>
    </dl>
  </section>;
}
