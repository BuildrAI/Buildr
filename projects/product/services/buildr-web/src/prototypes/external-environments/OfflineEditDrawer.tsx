import type { ReactNode } from 'react';
import { Button } from 'antd';
import { DrawerShell } from '../../components/DrawerShell';
type Props = { open: boolean; title: string; objectName: string; disabled?: boolean; onClose(): void; onSave(): void; children: ReactNode };
/** The prototype reader disallows native form submission. Keep the product drawer shell and invoke only the local mock save action. */
export function OfflineEditDrawer({ open, title, objectName, disabled = false, onClose, onSave, children }: Props) {
  return <DrawerShell open={open} width="min(560px, 100vw)" eyebrow={title} title={objectName || title} onClose={onClose} closeAriaLabel="关闭编辑" rootClassName="metadata-edit-drawer" footer={<div className="metadata-edit-actions"><Button autoInsertSpace={false} onClick={onClose}>取消</Button><Button type="primary" disabled={disabled} onClick={onSave}>保存修改</Button></div>}>{children}</DrawerShell>;
}
