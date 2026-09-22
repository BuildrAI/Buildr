import { Popover } from 'antd';
import { MarkdownHost } from '../../../components/MarkdownHost';

/** Same goal as task detail; compact rows disclose the full Markdown on hover or focus. */
export function TaskGoalSummary({ goal }: { goal: string }) {
  const compact = goal.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim();
  return <Popover trigger={['hover', 'focus']} placement="rightTop" mouseEnterDelay={0.35} content={<div className="task-goal-preview"><MarkdownHost markdown={goal} /></div>}>
    <p className="task-row-summary task-goal-summary" tabIndex={0} aria-label="预览完整目标">{compact}</p>
  </Popover>;
}
