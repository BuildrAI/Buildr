import type { ReactNode } from 'react';
import { Button } from 'antd';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { TaskWorkContext } from '../../../../build/generated/workbench-dto';
import { taskPathNodes, taskStageLabels, type TaskNodeStage } from './taskWorkContent';

export function TaskWorkPath({ record, context, selected, onSelect, actions }: {
  actions?: ReactNode; record: TaskRecord; context?: TaskWorkContext | null; selected: TaskNodeStage; onSelect(stage: TaskNodeStage): void;
}) {
  const nodes = taskPathNodes(record, context);
  return <nav id="task-work-path" className="task-work-path" aria-label="工作路径"><div className="task-path-track" role="tablist" aria-label="任务内容">
    {nodes.map(({ stage, current }) => <Button key={stage} type="text" size="small" role="tab" className={`task-work-tab${selected === stage ? ' selected' : ''}`} data-task-node={stage} aria-selected={selected === stage} aria-pressed={selected === stage} aria-current={current ? 'step' : undefined} onClick={() => onSelect(stage)}>{taskStageLabels[stage].title}{current && <i className="task-current-dot" title="当前节点" />}</Button>)}
  </div>{actions && <div className="task-path-actions">{actions}</div>}</nav>;
}
