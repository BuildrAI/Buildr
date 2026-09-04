import type { FormEvent } from 'react';
import { Button, Input, Modal } from 'antd';
import { ParentCompletionFields } from './ParentCompletionFields';
import type { ParentCoordinationResult, ParentCompletionDraft } from './parentCoordination';

export function TaskCompleteModal(props: { open: boolean; snapshot: ParentCoordinationResult | null; draft: ParentCompletionDraft; summary: string; onClose(): void; onSubmit(event: FormEvent): void; setDraft(value: ParentCompletionDraft): void; setSummary(value: string): void }) {
  return <Modal title={props.snapshot?.isParent ? '完成父任务' : '结束任务'} open={props.open} onCancel={props.onClose} footer={null} destroyOnClose width={520} className="task-action-modal">
    <p className="section-copy">只更新顶层状态；不会执行任务收尾（Task Finish）、Git、任务验证、任务环境清理或其他专业动作。</p>
    <form id="task-complete-form" onSubmit={props.onSubmit}>
      <label>完成摘要<Input.TextArea id="task-complete-summary" rows={3} required value={props.summary} onChange={(event) => props.setSummary(event.target.value)} /></label>
      {props.snapshot?.isParent && <ParentCompletionFields snapshot={props.snapshot} value={props.draft} onChange={props.setDraft} />}
      <div className="actions"><Button type="default" htmlType="submit" disabled={Boolean(props.snapshot?.isParent && (!props.draft.confirmed || props.snapshot.completion?.openChildTaskIds.length))}>确认完成</Button></div>
    </form>
  </Modal>;
}
