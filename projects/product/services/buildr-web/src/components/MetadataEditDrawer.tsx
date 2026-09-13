import { useEffect, useState, type ReactNode } from 'react';
import { Button, Drawer } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

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

/** Shared presentation and discard protection; data and save behavior stay in each feature. */
export function MetadataEditDrawer({ open, title, objectName, formId, saveButtonId, dirty, saving, disabled, onClose, children }: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => { if (!open || !dirty) setConfirmDiscard(false); }, [open, dirty]);
  const requestClose = () => {
    if (saving) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onClose();
  };
  return (
    <Drawer open={open} placement="right" width="min(520px, 100vw)" rootClassName="metadata-edit-drawer"
      title={<div className="metadata-edit-heading"><span>{title}</span><small>{objectName}</small></div>}
      onClose={requestClose} maskClosable={!saving} keyboard={!saving} closable={false} destroyOnClose
      extra={<Button type="text" aria-label="关闭编辑" icon={<CloseOutlined />} disabled={saving} onClick={requestClose} />}
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
      )}>
      {children}
    </Drawer>
  );
}
