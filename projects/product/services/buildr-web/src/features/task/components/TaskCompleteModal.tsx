import { DrawerShell } from '../../../components/DrawerShell';
import type { FormEvent } from 'react';
import { Button, Input } from 'antd';
import { ParentCompletionFields } from './ParentCompletionFields';
import type { ParentCoordinationResult, ParentCompletionDraft } from './parentCoordination';

export function TaskCompleteModal(props: { open: boolean; snapshot: ParentCoordinationResult | null; draft: ParentCompletionDraft; summary: string; onClose(): void; onSubmit(event: FormEvent): void; setDraft(value: ParentCompletionDraft): void; setSummary(value: string): void }) {
  return <DrawerShell title={props.snapshot?.isParent ? '登记父任务完成' : '登记完成'} open={props.open} onClose={props.onClose} footer={null} width={520} rootClassName="task-action-drawer">
    <p className="section-copy">登记已完成的工作与交付结果，并更新任务状态。</p>
    <form id="task-complete-form" onSubmit={props.onSubmit}>
      <label>完成摘要<Input.TextArea id="task-complete-summary" rows={3} required value={props.summary} onChange={(event) => props.setSummary(event.target.value)} /></label>
      {props.snapshot?.isParent && <ParentCompletionFields snapshot={props.snapshot} value={props.draft} onChange={props.setDraft} />}
      <div className="actions"><Button type="default" htmlType="submit" disabled={Boolean(props.snapshot?.isParent && (!props.draft.confirmed || props.snapshot.completion?.openChildTaskIds.length))}>确认完成</Button></div>
    </form>
  </DrawerShell>;
}
