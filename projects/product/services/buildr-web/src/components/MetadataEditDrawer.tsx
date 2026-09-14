import { useEffect, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { DrawerShell } from './DrawerShell';

type Props = {
  open: boolean;
  title: string;
  objectName: string;
  formId: string;
  saveButtonId: string;
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** 元数据编辑抽屉：统一抽屉壳 + 放弃修改保护；数据与保存行为留在各 feature。 */
export function MetadataEditDrawer({ open, title, objectName, formId, saveButtonId, dirty, saving, disabled, onClose, children }: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => { if (!open || !dirty) setConfirmDiscard(false); }, [open, dirty]);
  const requestClose = () => {
    if (saving) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onClose();
  };
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
      footer={confirmDiscard ? (
        <div className="metadata-edit-discard">
          <p role="alert">有未保存的修改，是否放弃？</p>
          <div className="metadata-edit-actions">
            <Button disabled={saving} onClick={() => setConfirmDiscard(false)}>继续编辑</Button>
            <Button danger disabled={saving} onClick={onClose}>放弃修改</Button>
          </div>
        </div>
      ) : (
        <div className="metadata-edit-actions">
          <Button autoInsertSpace={false} onClick={requestClose} disabled={saving}>取消</Button>
          <Button id={saveButtonId} type="primary" htmlType="submit" form={formId}
            disabled={disabled || saving} loading={saving}>保存修改</Button>
        </div>
      )}
    >
      {children}
    </DrawerShell>
  );
}
