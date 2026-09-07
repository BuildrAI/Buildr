import type { FormEvent } from 'react';
import { Button, Input, Modal, Select } from 'antd';

export function TaskEditModal(props: {
  open: boolean; todo: boolean; editState: string; title: string; intent: string; projects: string; services: string; parentTaskId: string;
  parentOptions: Array<{ value: string; label: string }>; parentOptionsLoading: boolean; saving: boolean;
  onClose(): void; onSubmit(event: FormEvent): void; onOpenParents(): void;
  setTitle(value: string): void; setIntent(value: string): void; setProjects(value: string): void; setServices(value: string): void; setParentTaskId(value: string): void;
}) {
  return <Modal title={props.todo ? '编辑待办意向' : '编辑进行中的任务'} open={props.open} onCancel={props.onClose} footer={null} destroyOnClose width={720} className="task-action-modal">
    <p className="section-copy">保存时只提交明确的设置与增删操作；Change 由 Agent 在任务过程中维护，页面只读展示。修改 Parent 不会自动处置任何关联 Task。</p>
    <span id="task-edit-state" className="state">{props.editState}</span>
    <form id="task-edit-form" className="prompt-grid" onSubmit={props.onSubmit}>
      <label>标题<Input id="task-edit-title" required value={props.title} onChange={(event) => props.setTitle(event.target.value)} /></label>
      <label>Parent Task<Select id="task-edit-parent" style={{ width: '100%' }} value={props.parentTaskId} loading={props.parentOptionsLoading} onDropdownVisibleChange={(open) => { if (open) props.onOpenParents(); }} onChange={(value) => props.setParentTaskId(value ?? '')} options={props.parentOptions} /></label>
      <label className="full">意图<Input.TextArea id="task-edit-intent" rows={3} required value={props.intent} onChange={(event) => props.setIntent(event.target.value)} /><small className="context-help">支持 Markdown 链接；Workspace 内文档请使用相对路径，例如 projects/product/docs/example.md。</small></label>
      <label>项目范围<Input.TextArea id="task-edit-projects" rows={3} value={props.projects} onChange={(event) => props.setProjects(event.target.value)} /></label>
      <label>服务范围（project/service）<Input.TextArea id="task-edit-services" rows={3} value={props.services} onChange={(event) => props.setServices(event.target.value)} /></label>
      <div className="actions full"><Button id="task-edit-button" type="primary" htmlType="submit" loading={props.saving}>保存任务记录</Button></div>
    </form>
  </Modal>;
}
