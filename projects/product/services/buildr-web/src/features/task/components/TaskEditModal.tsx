import { DrawerShell } from '../../../components/DrawerShell';
import type { FormEvent } from 'react';
import { Alert, Button, Input, Select } from 'antd';

export function TaskEditModal(props: {
  message?: string; onReread(): void; latest?: { record: { title: string; intent: string } } | null;
  open: boolean; todo: boolean; editState: string; title: string; intent: string; projects: string; services: string; parentTaskId: string;
  parentOptions: Array<{ value: string; label: string }>; parentOptionsLoading: boolean; saving: boolean;
  onClose(): void; onSubmit(event: FormEvent): void; onOpenParents(): void;
  setTitle(value: string): void; setIntent(value: string): void; setProjects(value: string): void; setServices(value: string): void; setParentTaskId(value: string): void;
}) {
  return <DrawerShell title={props.todo ? '编辑待办意向' : '编辑进行中的任务'} open={props.open} onClose={props.onClose} closeDisabled={props.saving} maskClosable={!props.saving} keyboard={!props.saving} footer={null} width={720} rootClassName="task-action-drawer">
    <p className="section-copy">修改任务标题、目标与所属范围。</p>
    {props.message && <Alert type="warning" message={props.message} action={props.editState === '记录已变化' ? <Button id="task-edit-reread" onClick={props.onReread}>重新读取</Button> : undefined} />}
    {props.latest && <details open><summary>最新保存的任务</summary><p>{props.latest.record.title}</p><p>{props.latest.record.intent}</p></details>}
    <span hidden={props.editState === '可以修改'} id="task-edit-state" className="state">{props.editState}</span>
    <form id="task-edit-form" className="prompt-grid" onSubmit={props.onSubmit}>
      <label>标题<Input id="task-edit-title" required value={props.title} onChange={(event) => props.setTitle(event.target.value)} /></label>
      <label>所属组合<Select id="task-edit-parent" style={{ width: '100%' }} value={props.parentTaskId} loading={props.parentOptionsLoading} onDropdownVisibleChange={(open) => { if (open) props.onOpenParents(); }} onChange={(value) => props.setParentTaskId(value ?? '')} options={props.parentOptions} /></label>
      <label className="full">目标与说明<Input.TextArea id="task-edit-intent" rows={3} required value={props.intent} onChange={(event) => props.setIntent(event.target.value)} /><small className="context-help">支持 Markdown 链接；工作空间内的文档请使用相对路径，例如 projects/product/docs/example.md。</small></label>
      <label>项目范围<Input.TextArea id="task-edit-projects" rows={3} value={props.projects} onChange={(event) => props.setProjects(event.target.value)} /></label>
      <label>服务范围（项目编码/服务编码）<Input.TextArea id="task-edit-services" rows={3} value={props.services} onChange={(event) => props.setServices(event.target.value)} /></label>
      <div className="actions full"><Button id="task-edit-button" type="primary" htmlType="submit" loading={props.saving} disabled={props.editState === '记录已变化'}>保存任务记录</Button></div>
    </form>
  </DrawerShell>;
}
