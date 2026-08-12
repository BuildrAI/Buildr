import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Form, Input, Modal, Space } from 'antd';
import { api } from '../api';

type ServiceEditPayload = {
  revision: string;
  migrationRequired?: boolean;
  nextActions?: string[];
  service: {
    code: string;
    name: string;
    description?: string;
    type: string;
  };
};

export type ServiceEditSaved = {
  code: string;
  name: string;
  description: string;
  type: string;
  revision: string;
};

type Props = {
  open: boolean;
  projectCode: string | null;
  serviceCode: string | null;
  onClose: () => void;
  onSaved?: (service: ServiceEditSaved) => void;
};

export function ServiceEditModal({ open, projectCode, serviceCode, onClose, onSaved }: Props) {
  const [current, setCurrent] = useState<ServiceEditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editAlert, setEditAlert] = useState('');

  useEffect(() => {
    if (!open || !projectCode || !serviceCode) {
      setCurrent(null);
      setLoadError('');
      setSaveError('');
      setEditAlert('');
      setLoading(false);
      setSaving(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');
    void (async () => {
      try {
        const data = await api(
          `/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}`,
        ) as ServiceEditPayload;
        if (cancelled) return;
        setCurrent(data);
        setEditAlert(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '无法读取服务');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectCode, serviceCode]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || !projectCode || !serviceCode) return;
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const descriptionInput = form.elements.namedItem('description') as HTMLTextAreaElement;
    const typeInput = form.elements.namedItem('type') as HTMLInputElement;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api(
        `/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            revision: current.revision,
            name: nameInput.value,
            description: descriptionInput.value,
            type: typeInput.value,
          }),
        },
      ) as ServiceEditPayload;
      setCurrent(updated);
      setEditAlert(updated.migrationRequired ? (updated.nextActions || []).join(' ') : '');
      onSaved?.({
        code: updated.service.code,
        name: updated.service.name,
        description: updated.service.description || '',
        type: updated.service.type,
        revision: updated.revision,
      });
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setSaveError(code === 'service_revision_conflict' ? 'registry 已变化，请刷新' : (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = Boolean(current?.migrationRequired);

  return (
    <Modal
      title="编辑服务"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={560}
      className="service-edit-modal"
    >
      {loading ? (
        <p className="page-copy">正在读取…</p>
      ) : loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : current ? (
        <>
          <p className="page-copy">仅修改稳定元数据；来源和 Git 观察状态保持只读。</p>
          <div id="service-edit-alert" className={editAlert || saveError ? '' : 'hidden'} role="status">
            {editAlert ? <Alert type="warning" showIcon message={editAlert} style={{ marginBottom: 16 }} /> : null}
            {saveError ? <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} /> : null}
          </div>
          <form
            id="service-edit-form"
            key={current.revision}
            onSubmit={(event) => void onSubmit(event)}
          >
            <Form layout="vertical" component={false}>
              <Form.Item label="名称" required>
                <Input
                  id="service-name"
                  name="name"
                  autoComplete="off"
                  required
                  disabled={readOnly || saving}
                  defaultValue={current.service.name}
                />
              </Form.Item>
              <Form.Item label="说明" required>
                <Input.TextArea
                  id="service-description"
                  name="description"
                  rows={6}
                  required
                  disabled={readOnly || saving}
                  defaultValue={current.service.description || ''}
                />
              </Form.Item>
              <Form.Item label="类型" required>
                <Input
                  id="service-type"
                  name="type"
                  autoComplete="off"
                  required
                  disabled={readOnly || saving}
                  defaultValue={current.service.type}
                />
              </Form.Item>
              <Space>
                <Button onClick={onClose} disabled={saving}>取消</Button>
                <Button id="service-save-button" type="primary" htmlType="submit" disabled={readOnly || saving} loading={saving}>
                  保存修改
                </Button>
              </Space>
            </Form>
          </form>
        </>
      ) : null}
    </Modal>
  );
}
