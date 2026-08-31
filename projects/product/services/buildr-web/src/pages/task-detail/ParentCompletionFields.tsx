import { taskStatusLabel } from '../../lib/taskLabels';
import { Alert, Checkbox, Input } from 'antd';
import type { ParentCompletionDraft, ParentCoordinationResult } from './parentCoordination';

type Props = { snapshot: ParentCoordinationResult; value: ParentCompletionDraft; onChange: (value: ParentCompletionDraft) => void };

export function ParentCompletionFields({ snapshot, value, onChange }: Props) {
  return <section className="parent-completion-fields" id="parent-completion-evidence">
    <Alert type="warning" message="这是完成整个父任务的授权，不会自动完成或放弃子任务。请核对下面显示的当前目标与成果。" showIcon />
    <p>{snapshot.objective}</p>
    <label>总体验收：整体目标、依据及遗留处置<Input.TextArea id="parent-acceptance-summary" required rows={3} value={value.summary} onChange={(event) => onChange({ ...value, summary: event.target.value, confirmed: false })} /></label>
    {(snapshot.children || []).map((child) => <label key={child.taskId}>
      {child.title} · {taskStatusLabel(child.status)}<p>{child.result?.summary || '尚未记录结果'}</p>
      <Input.TextArea required rows={2} data-parent-child-disposition={child.taskId} placeholder="说明成果覆盖或放弃、替代范围的处置" value={value.children[child.taskId] || ''} onChange={(event) => onChange({ ...value, children: { ...value.children, [child.taskId]: event.target.value }, confirmed: false })} />
    </label>)}
    {Boolean(snapshot.completion?.openChildTaskIds.length) && <Alert type="error" message="仍有未结束子任务，暂不能完成父任务。" />}
    <Checkbox id="parent-completion-authorized" checked={value.confirmed} onChange={(event) => onChange({ ...value, confirmed: event.target.checked })}>我已核对整体目标与上述结果，明确授权完成这个父任务。</Checkbox>
  </section>;
}
