import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Form, Input, Modal, Space } from 'antd';
import { api } from '../api';

type ProjectEditPayload = {
  revision: string;
  migrationRequired?: boolean;
  nextActions?: string[];
  project: {
    code: string;
    name: string;
    description?: string;
  };
};

export type ProjectEditSaved = {
  code: string;
  name: string;
  description: string;
  revision: string;
};

type Props = {
  open: boolean;
  projectCode: string | null;
  onClose: () => void;
  onSaved?: (project: ProjectEditSaved) => void;
};

export function ProjectEditModal({ open, projectCode, onClose, onSaved }: Props) {
  const [current, setCurrent] = useState<ProjectEditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editAlert, setEditAlert] = useState('');

  useEffect(() => {
    if (!open || !projectCode) {
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
        const data = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as ProjectEditPayload;
        if (cancelled) return;
        setCurrent(data);
        setEditAlert(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '无法读取项目');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectCode]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || !projectCode) return;
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const descriptionInput = form.elements.namedItem('description') as HTMLTextAreaElement;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}`, {
        method: 'PUT',
        body: JSON.stringify({
          revision: current.revision,
          name: nameInput.value,
          description: descriptionInput.value,
        }),
      }) as ProjectEditPayload;
      setCurrent(updated);
      setEditAlert(updated.migrationRequired ? (updated.nextActions || []).join(' ') : '');
      onSaved?.({
        code: updated.project.code,
        name: updated.project.name,
        description: updated.project.description || '',
        revision: updated.revision,
      });
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setSaveError(code === 'project_revision_conflict' ? 'registry 已变化，请刷新' : (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = Boolean(current?.migrationRequired);

  return (
    <Modal
      title="编辑项目"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={560}
      className="project-edit-modal"
    >
      {loading ? (
        <p className="page-copy">正在读取…</p>
      ) : loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : current ? (
        <>
          <p className="page-copy">仅修改稳定元数据；身份、来源和 Git 观察状态保持只读。</p>
          <div id="project-edit-alert" className={editAlert || saveError ? '' : 'hidden'} role="status">
            {editAlert ? <Alert type="warning" showIcon message={editAlert} style={{ marginBottom: 16 }} /> : null}
            {saveError ? <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} /> : null}
          </div>
          <form
            id="project-edit-form"
            key={current.revision}
            onSubmit={(event) => void onSubmit(event)}
          >
            <Form layout="vertical" component={false}>
              <Form.Item label="名称" required>
                <Input
                  id="project-name"
                  name="name"
                  autoComplete="off"
                  required
                  disabled={readOnly || saving}
                  defaultValue={current.project.name}
                />
              </Form.Item>
              <Form.Item label="说明" required>
                <Input.TextArea
                  id="project-description"
                  name="description"
                  rows={6}
                  required
                  disabled={readOnly || saving}
                  defaultValue={current.project.description || ''}
                />
              </Form.Item>
              <Space>
                <Button onClick={onClose} disabled={saving}>取消</Button>
                <Button id="project-save-button" type="primary" htmlType="submit" disabled={readOnly || saving} loading={saving}>
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
