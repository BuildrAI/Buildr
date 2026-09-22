import { DrawerShell } from '../../../components/DrawerShell';
import type { FormEvent } from 'react';
import { Button, Input } from 'antd';

export function TaskAbandonModal({ open, reason, onClose, onSubmit, setReason }: { open: boolean; reason: string; onClose(): void; onSubmit(event: FormEvent): void; setReason(value: string): void }) {
  return <DrawerShell title="放弃任务" open={open} onClose={onClose} footer={null} width={520} rootClassName="task-action-drawer">
    <p className="section-copy">只更新顶层状态；不会清理任务环境、执行 Git 或其他专业动作。</p>
    <form id="task-abandon-form" onSubmit={onSubmit}><label>放弃原因<Input.TextArea id="task-abandon-reason" rows={3} required value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="actions"><Button danger htmlType="submit">确认放弃</Button></div></form>
  </DrawerShell>;
}
