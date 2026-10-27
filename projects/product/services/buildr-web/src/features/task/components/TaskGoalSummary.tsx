import { MarkdownHost } from '../../../components/MarkdownHost';
import { SelectableHoverCard } from '../../../components/SelectableHoverCard';

export function compactGoal(goal: string) {
  return goal.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim();
}

/** Same goal as task detail; the shared hover card discloses the full Markdown on hover or focus. */
export function TaskGoalSummary({ goal }: { goal: string }) {
  return <SelectableHoverCard placement="bottomLeft" closeOnTriggerClick content={<MarkdownHost markdown={goal} />}>
    <span className="task-row-summary task-goal-summary" tabIndex={0} aria-label="预览完整目标">{compactGoal(goal)}</span>
  </SelectableHoverCard>;
}

/** Whole task cell shares one goal preview; clicking anywhere in the row still opens the task. */
export function TaskGoalPreview({ goal, children }: { goal: string; children: React.ReactNode }) {
  return <SelectableHoverCard placement="bottomLeft" closeOnTriggerClick content={<MarkdownHost markdown={goal} />}>
    <div className="task-compact-copy task-goal-preview-host" tabIndex={0} aria-label="预览完整目标">{children}</div>
  </SelectableHoverCard>;
}
