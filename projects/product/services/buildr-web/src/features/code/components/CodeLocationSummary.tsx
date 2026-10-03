import { Button } from 'antd';
import { SelectableHoverCard } from '../../../components/SelectableHoverCard';

type Props = { repositoryName: string; location: string; branch?: string | null; taskId?: string; commitHash?: string; area?: 'unstaged' | 'staged' | 'untracked' | 'commit'; observedRevision?: string; worktreeName?: string; kind?: 'default' | 'task' | 'worktree' | 'commit' };

/** One compact source identity, with the actual path and full version available on hover. */
export function CodeLocationSummary({ repositoryName, location, branch, taskId, commitHash, area, observedRevision, worktreeName, kind }: Props) {
  const taskLocation = kind === 'task' || !kind && Boolean(taskId);
  const label = commitHash ? '历史版本' : area === 'staged' ? '已暂存版本' : taskLocation ? '任务目录' : '本机目录';
  return <SelectableHoverCard title="文件来源" placement="bottomLeft" content={<div aria-label="文件来源信息">
    <p><strong>{repositoryName}</strong> · {worktreeName || label}</p><p><code>{location || '当前没有可查看的目录'}</code></p>
    {commitHash ? <p>固定提交：<code>{commitHash}</code></p> : <p>分支：<code>{branch || '—'}</code></p>}
    {taskId && <p>关联任务：<code>{taskId}</code></p>}
    {observedRevision && <p>观察版本：<code>{observedRevision}</code></p>}
    <p>{commitHash ? '读取这次提交保存的内容。' : area === 'staged' ? '读取已观察的索引内容。' : taskLocation ? '读取任务实际使用的目录，不合并其他工作树。' : kind === 'worktree' || worktreeName ? '读取已枚举的所选工作树目录，不合并其他工作树。' : taskId ? '当前任务使用代码库登记的本机目录。' : '读取代码库登记的本机目录。'}</p>
  </div>}><Button type="text" size="small" className="code-location-summary" aria-label={'查看文件来源 ' + repositoryName}>
    <span className="code-location-summary-content"><strong>{repositoryName}</strong><span>· {worktreeName || label}</span>{worktreeName && area === 'staged' && <span>· 已暂存</span>}<code>{commitHash ? commitHash.slice(0, 8) : branch || ''}</code></span>
  </Button></SelectableHoverCard>;
}
