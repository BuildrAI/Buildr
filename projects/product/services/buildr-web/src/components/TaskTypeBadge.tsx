import './task-type-badge.css';

/** The same task identity marker in overview rows, lists and detail headings. */
export function TaskTypeBadge({ isParent }: { isParent?: boolean }) {
  return isParent ? <span className="task-type-badge">组合任务</span> : null;
}
