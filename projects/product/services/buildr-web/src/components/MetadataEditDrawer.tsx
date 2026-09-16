import { type ReactNode } from 'react';
import { Button } from 'antd';
import { DrawerShell } from './DrawerShell';

type Props = {
  open: boolean;
  title: string;
  objectName: string;
  formId: string;
  saveButtonId: string;
  saving: boolean;
  disabled: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** 元数据编辑抽屉：统一抽屉壳；数据与保存行为留在各 feature。 */
export function MetadataEditDrawer({ open, title, objectName, formId, saveButtonId, saving, disabled, onClose, children }: Props) {
  const requestClose = () => { if (!saving) onClose(); };
  return (
    <DrawerShell
      open={open}
      width="min(560px, 100vw)"
      eyebrow={title}
      title={objectName || title}
      onClose={requestClose}
      maskClosable={!saving}
      keyboard={!saving}
      closeAriaLabel="关闭编辑"
      closeDisabled={saving}
      rootClassName="metadata-edit-drawer"
      footer={
        <div className="metadata-edit-actions">
          <Button autoInsertSpace={false} onClick={requestClose} disabled={saving}>取消</Button>
          <Button id={saveButtonId} type="primary" htmlType="submit" form={formId}
            disabled={disabled || saving} loading={saving}>保存修改</Button>
        </div>
      }
    >
      {children}
    </DrawerShell>
  );
}
