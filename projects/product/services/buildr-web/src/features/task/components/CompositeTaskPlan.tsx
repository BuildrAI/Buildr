import type { ReactNode } from 'react';
import { taskDocumentLabel, taskDocumentTarget, type TaskDocumentItem, type TaskReadTarget } from './taskWorkContent';
import type { TaskMaterialsState } from '../task-materials';
import { Alert, Select } from 'antd';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { TaskChangeState } from '../hooks/useTaskArtifacts';

export function CompositeTaskPlan({ record, changes, documents, materials, selected = 'record:brief', onSelect, renderContent }: { record: TaskRecord; changes: TaskChangeState[]; documents: TaskDocumentItem[]; materials: TaskMaterialsState; selected?: string; onSelect?(key: string): void; renderContent(target: TaskReadTarget): ReactNode }) {
  const entries = documents.filter(item => item.stage === 'design');
  const options = [{ key: 'record:brief', label: '任务说明', target: { kind: 'brief', title: '任务说明' } as TaskReadTarget }, ...entries.map(item => ({ key: item.key, label: taskDocumentLabel(item, entries), target: taskDocumentTarget(item) }))];
  const active = options.find(item => item.key === selected) || options[0];
  const readingBrief = active.target.kind === 'brief';
  return <section id="task-node-content" aria-label="任务说明与方案" data-task-id={record.taskId}>
    <h2>任务说明与方案</h2>
    {options.length > 1 && <Select aria-label="选择任务说明或方案" value={active.key} options={options.map(({ key, label }) => ({ value: key, label }))} onChange={onSelect} />}
    {!readingBrief && <>
      {materials.loading && active.target.kind !== 'material' && <Alert type="info" message="材料关联正在重新核对，当前显示上次读取的内容。" />}
      {materials.error && active.target.kind !== 'material' && <Alert type="warning" message={`任务材料读取失败：${materials.error}`} description="材料关联的新版本尚未确认。请刷新任务后重试。" />}
      {changes.map(item => item.kind === 'missing' ? <Alert key={item.key} type="warning" message={item.message} /> : null)}
      {materials.data?.diagnostics.map((item, index) => <Alert key={index} type="warning" message={item.message} />)}
    </>}
    {renderContent(active.target)}
  </section>;
}
