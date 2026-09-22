import { Alert, Button, Input, Select } from 'antd';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import { DrawerShell } from '../../../components/DrawerShell';
import { formatDateTime } from '../../../lib/taskLabels';
import type { useTaskContextEditor } from '../hooks/useTaskContextEditor';
import { taskStageLabels, type TaskStage } from './taskWorkContent';

type Editor = ReturnType<typeof useTaskContextEditor>;
const attentionLabel = { decision: '等待你的决定', acceptance: '等待你确认', question: '需要补充信息' };
export function TaskWorkContextCard({ data, error, onRead, onRespond, onAcceptance, active }: {
  active: boolean; onAcceptance(): void; data: TaskWorkContextResponse | null; error: string | null; onRead(): void; onRespond(): void;
}) {
  const context = data?.context;
  const attention = context?.attention;
  if (!context && !error) return null;
  return <section id="task-work-context" className="task-situation">
    {error && <Alert type="warning" message={error} />}
    <div className="task-situation-row"><span>{active && context?.stage ? `当前 · ${taskStageLabels[context.stage].title}` : '最近进展'}</span><button type="button" className="task-situation-read" onClick={onRead}><span id="task-context-progress">{context?.progress || '尚未记录进展'}</span></button></div>
    {attention?.state === 'pending' && attention.kind !== 'acceptance' && <div id="task-attention" className="task-situation-attention"><div><span>{attentionLabel[attention.kind]}</span><p id="task-attention-reason">{attention.reason}</p></div><Button id="task-attention-respond" type="primary" onClick={onRespond}>{attention.kind === 'question' ? '回复问题' : '记录决定'}</Button></div>}
    {attention?.state === 'pending' && attention.kind === 'acceptance' && <Button className="task-acceptance-prompt" type="link" size="small" onClick={onAcceptance}>等待你确认成果 →</Button>}
    {attention?.response && attention.kind !== 'acceptance' && <button type="button" className="task-situation-response" onClick={onRead}>已记录你的意见 · {formatDateTime(attention.response.recordedAt)}</button>}
  </section>;
}

export function TaskContextDrawer({ editor, title }: { editor: Editor; title: string }) {
  const responseAvailable = editor.snapshot?.context?.attention?.state === 'pending';
  return <DrawerShell open={editor.mode !== null} title={editor.mode === 'respond' ? '记录你的意见' : '更新工作摘要'} sub={title} onClose={editor.close} closeDisabled={editor.saving} maskClosable={!editor.saving} keyboard={!editor.saving}
    footer={<div className="actions"><Button disabled={editor.saving} onClick={editor.close}>取消</Button><Button id="task-context-save" type="primary" loading={editor.saving} disabled={editor.conflict || (editor.mode === 'respond' && !responseAvailable)} onClick={() => void editor.save()}>保存</Button></div>}>
    {editor.message && <Alert id="task-context-message" type={editor.conflict ? 'warning' : 'info'} showIcon message={editor.message} action={editor.conflict ? <Button id="task-context-reread" onClick={() => void editor.reread()}>重新读取</Button> : undefined} />}
    {editor.mode === 'respond' ? <><p className="task-context-modal-reason">{editor.snapshot?.context?.attention?.reason || '这条事项已经不存在'}</p>{!responseAvailable && <Alert type="info" message="当前事项已处理或撤回，请关闭后查看最新内容。" />}<label className="task-context-field">你的意见与下一步<Input.TextArea id="task-attention-response-input" rows={6} value={editor.response} onChange={event => editor.setResponse(event.target.value)} /></label><p className="section-copy">保存意见供智能体（Agent）继续工作，任务状态保持不变。</p></> : <>
      <label className="task-context-field">当前节点<Select id="task-context-stage-input" value={editor.stage || ''} onChange={value => editor.setStage(value ? value as TaskStage : null)} options={[{ value: '', label: '未记录' }, ...Object.entries(taskStageLabels).map(([value, stage]) => ({ value, label: stage.title }))]} /></label>
      <label className="task-context-field">最近进展<Input.TextArea id="task-context-progress-input" rows={5} value={editor.progress} onChange={event => editor.setProgress(event.target.value)} /></label>
      <label className="task-context-field">下一步<Input.TextArea id="task-context-next-input" rows={3} value={editor.nextStep} onChange={event => editor.setNextStep(event.target.value)} /></label>
      {editor.message && editor.snapshot?.context && <details><summary>最新保存的内容</summary><p>{editor.snapshot.context.progress}</p><p>{editor.snapshot.context.nextStep}</p><p>{editor.snapshot.context.stage ? taskStageLabels[editor.snapshot.context.stage].title : '未记录当前节点'}</p></details>}
    </>}
  </DrawerShell>;
}
